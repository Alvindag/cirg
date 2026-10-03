using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using DasEngage.Domain;
using DasEngage.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace DasEngage.Api;

public record SellOutRow(int Row, string Status, string? Message);
public record SellOutResult(bool DryRun, int Total, int Created, int Updated, int Unchanged, int Errors, int UnmatchedOutlets, List<SellOutRow> Rows);

/// <summary>
/// Distributor sell-out: what each distributor sold to which outlet. Without it, an outlet DAS reaches only through a distributor looks unreached.
/// The distributor sends a CSV (distributor, outlet, date, quantity, net_amount; optionally outlet_code, item_code, reference).
/// </summary>
public class SellOutImporter
{
    public const int MaxRows = 5000;
    private readonly AppDbContext _db;
    public SellOutImporter(AppDbContext db) => _db = db;

    private static string Key(string distributor, string outlet, DateOnly date, string item, decimal qty, decimal amount) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"{Normalize.Name(distributor)}|{Normalize.Name(outlet)}|{date:yyyy-MM-dd}|{item.Trim().ToLowerInvariant()}|{qty}|{amount}")))[..32];

    public async Task<SellOutResult> Run(string csv, bool dryRun)
    {
        var table = Csv.Parse(csv);
        if (table.Count == 0) throw new FormatException("The file is empty.");
        var headers = table[0].Select(h => h.Trim().ToLowerInvariant().Replace(' ', '_')).ToList();
        foreach (var required in new[] { "distributor", "outlet", "date", "quantity", "net_amount" })
            if (!headers.Contains(required)) throw new FormatException($"Missing required column '{required}'.");
        var known = new HashSet<string> { "distributor", "outlet", "date", "quantity", "net_amount", "outlet_code", "item_code", "reference" };
        var unknown = headers.Where(h => !known.Contains(h)).ToList();
        if (unknown.Count > 0) throw new FormatException($"Unknown column(s): {string.Join(", ", unknown)}.");
        if (table.Count - 1 > MaxRows) throw new FormatException($"Too many rows (max {MaxRows}).");

        var customers = await _db.Customers.AsNoTracking().Select(c => new { c.Id, c.Name, c.Type, c.ErpAccountCode }).ToListAsync();
        var distributors = customers.Where(c => c.Type == CustomerType.Distributor).ToList();
        var outlets = customers.Where(c => c.Type != CustomerType.Doctor && c.Type != CustomerType.Pharmacist).ToList();
        var outletsByCode = outlets.Where(c => c.ErpAccountCode != null).GroupBy(c => c.ErpAccountCode!.ToLowerInvariant()).ToDictionary(g => g.Key, g => g.ToList());
        var outletsByName = outlets.GroupBy(c => Normalize.Name(c.Name)).ToDictionary(g => g.Key, g => g.ToList());
        var products = (await _db.Products.AsNoTracking().Where(p => p.Code != null).Select(p => new { p.Id, p.Code }).ToListAsync())
            .GroupBy(p => p.Code!.ToLowerInvariant()).ToDictionary(g => g.Key, g => g.First().Id);
        var existing = (await _db.SecondarySales.ToListAsync()).ToDictionary(s => s.ExternalId);

        string Cell(List<string> row, string col) { var i = headers.IndexOf(col); return i >= 0 && i < row.Count ? row[i].Trim() : ""; }
        var rows = new List<SellOutRow>(); var seen = new HashSet<string>(); var unmatched = new HashSet<string>();
        int created = 0, updated = 0, unchanged = 0, errors = 0;

        for (var i = 1; i < table.Count; i++)
        {
            var r = table[i]; var line = i + 1;
            if (r.All(string.IsNullOrWhiteSpace)) continue;
            string? Fail(string m) { errors++; rows.Add(new(line, "error", m)); return null; }
            var dName = Cell(r, "distributor"); var oName = Cell(r, "outlet");
            if (dName.Length == 0 || oName.Length == 0) { Fail("Distributor and outlet are required."); continue; }
            if (!DateOnly.TryParseExact(Cell(r, "date"), new[] { "yyyy-MM-dd", "dd/MM/yyyy", "d/M/yyyy" }, CultureInfo.InvariantCulture, DateTimeStyles.None, out var date)) { Fail($"'{Cell(r, "date")}' is not a date (use yyyy-MM-dd or dd/MM/yyyy)."); continue; }
            if (date > DateOnly.FromDateTime(DateTime.UtcNow.AddDays(1))) { Fail("The date is in the future."); continue; }
            if (!decimal.TryParse(Cell(r, "quantity").Replace(",", ""), NumberStyles.Number | NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture, out var qty)
                || !decimal.TryParse(Cell(r, "net_amount").Replace(",", ""), NumberStyles.Number | NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture, out var amount)) { Fail("Quantity and net_amount must be numbers."); continue; }
            if (Math.Abs(qty) > 100_000_000m || Math.Abs(amount) > 1_000_000_000m) { Fail("An amount or quantity is out of range."); continue; }

            var dist = distributors.Where(d => (d.ErpAccountCode != null && string.Equals(d.ErpAccountCode, dName, StringComparison.OrdinalIgnoreCase)) || Normalize.Name(d.Name) == Normalize.Name(dName)).ToList();
            if (dist.Count != 1) { Fail(dist.Count == 0 ? $"Unknown distributor '{dName}'. Add it as a customer of type Distributor first." : $"More than one distributor matches '{dName}'."); continue; }

            Guid? outletId = null;
            var code = Cell(r, "outlet_code");
            if (code.Length > 0 && outletsByCode.TryGetValue(code.ToLowerInvariant(), out var byCode) && byCode.Count == 1) outletId = byCode[0].Id;
            else if (outletsByName.TryGetValue(Normalize.Name(oName), out var byName) && byName.Count == 1) outletId = byName[0].Id;   // two customers with the same name are not guessed between
            var item = Cell(r, "item_code");
            Guid? productId = item.Length > 0 && products.TryGetValue(item.ToLowerInvariant(), out var pid) ? pid : null;

            var reference = Cell(r, "reference");
            var key = reference.Length > 0 ? $"{dist[0].Id:N}:{reference}" : Key(dName, oName, date, item, qty, amount);
            if (key.Length > 100) { Fail("The reference is too long (max 60 characters)."); continue; }
            if (!seen.Add(key)) { rows.Add(new(line, "duplicate", "Repeated in this file; the first one was used.")); continue; }
            if (outletId is null) unmatched.Add(Normalize.Name(oName));

            if (existing.TryGetValue(key, out var row))
            {
                var changed = row.OutletId != outletId || row.SaleDate != date || row.Quantity != qty || row.NetAmount != amount || row.ItemCode != item || row.ProductId != productId || row.OutletName != oName;
                if (changed && !dryRun) { row.OutletId = outletId; row.SaleDate = date; row.Quantity = qty; row.NetAmount = amount; row.ItemCode = item; row.ProductId = productId; row.OutletName = oName; }
                if (changed) updated++; else unchanged++;
                rows.Add(new(line, changed ? "updated" : "unchanged", null));
                continue;
            }
            created++;
            rows.Add(new(line, "created", outletId is null ? $"Outlet '{oName}' is not matched to a DAS customer yet." : null));
            if (!dryRun) _db.SecondarySales.Add(new SecondarySale { ExternalId = key, DistributorId = dist[0].Id, OutletId = outletId, OutletName = oName, SaleDate = date, ItemCode = item, ProductId = productId, Quantity = qty, NetAmount = amount });
        }
        if (!dryRun) await _db.SaveChangesAsync();
        return new SellOutResult(dryRun, rows.Count, created, updated, unchanged, errors, unmatched.Count, rows);
    }
}

public static class DistributorEndpoints
{
    private static readonly CustomerType[] OutletTypes = { CustomerType.Hospital, CustomerType.Clinic, CustomerType.Pharmacy, CustomerType.GovernmentInstitution, CustomerType.Distributor };
    private static DateTime AsUtc(DateTime d) => d.Kind == DateTimeKind.Unspecified ? DateTime.SpecifyKind(d, DateTimeKind.Utc) : d.ToUniversalTime();

    public static void Map(RouteGroupBuilder api)
    {
        // Check a file first (dry run is the default), then load it with dryRun=false.
        api.MapPost("/distributors/sell-out/import", async (HttpRequest req, SellOutImporter importer, bool? dryRun) =>
        {
            using var reader = new StreamReader(req.Body, Encoding.UTF8, true, 1024, true);
            var csv = await reader.ReadToEndAsync();
            if (csv.Length > 5_000_000) return Results.StatusCode(StatusCodes.Status413PayloadTooLarge);
            try { return Results.Ok(await importer.Run(csv, dryRun ?? true)); }
            catch (FormatException e) { return Results.BadRequest(e.Message); }
        }).RequireAuthorization(p => p.RequireRole(Roles.ImportAllowed)).Accepts<string>("text/csv").WithMetadata(new Microsoft.AspNetCore.Mvc.RequestSizeLimitAttribute(6_000_000));

        api.MapGet("/dashboards/distributors", async (AppDbContext db, TeamScope team, DateTime from, DateTime to) =>
        {
            from = AsUtc(from); to = AsUtc(to);
            var start = DateOnly.FromDateTime(from); var end = DateOnly.FromDateTime(to);
            if (end < start || end.DayNumber - start.DayNumber > 800) return Results.BadRequest("Choose a period of at most 800 days.");
            var terrs = await team.VisibleTerritoryIds();

            var sales = await db.SecondarySales.AsNoTracking().Where(s => s.SaleDate >= start && s.SaleDate <= end).ToListAsync();
            var outletTerritory = await db.Customers.AsNoTracking().Where(c => OutletTypes.Contains(c.Type)).Select(c => new { c.Id, c.TerritoryId }).ToDictionaryAsync(c => c.Id, c => c.TerritoryId);
            if (terrs != null) sales = sales.Where(s => s.OutletId is { } o && outletTerritory.TryGetValue(o, out var t) && t is { } tid && terrs.Contains(tid)).ToList();

            var names = await db.Customers.AsNoTracking().Where(c => c.Type == CustomerType.Distributor).ToDictionaryAsync(c => c.Id, c => c.Name);
            var rows = sales.GroupBy(s => s.DistributorId).Select(g => new
            {
                distributorId = g.Key, name = names.GetValueOrDefault(g.Key, "Unknown"),
                value = g.Sum(s => s.NetAmount), quantity = g.Sum(s => s.Quantity),
                outlets = g.Select(s => s.OutletId?.ToString() ?? "n:" + Normalize.Name(s.OutletName)).Distinct().Count(),
                matchedOutlets = g.Where(s => s.OutletId != null).Select(s => s.OutletId).Distinct().Count(),
                lastSale = g.Max(s => s.SaleDate),
            }).OrderByDescending(r => r.value).ToList();

            var matched = sales.Where(s => s.OutletId != null).Select(s => s.OutletId!.Value).Distinct().ToList();
            var visited = (await db.Visits.AsNoTracking().Where(v => v.CheckInAt >= from && v.CheckInAt <= to && matched.Contains(v.CustomerId)).Select(v => v.CustomerId).Distinct().ToListAsync()).ToHashSet();
            var invoiced = (await db.SalesFacts.AsNoTracking().Where(s => s.SaleDate >= start && s.SaleDate <= end && s.CustomerId != null && matched.Contains(s.CustomerId.Value)).Select(s => s.CustomerId!.Value).Distinct().ToListAsync()).ToHashSet();
            var onlyViaDistributors = matched.Count(id => !visited.Contains(id) && !invoiced.Contains(id));

            var unmatched = sales.Where(s => s.OutletId == null).GroupBy(s => Normalize.Name(s.OutletName))
                .Select(g => new { outlet = g.First().OutletName, distributor = names.GetValueOrDefault(g.First().DistributorId, "Unknown"), value = g.Sum(s => s.NetAmount) })
                .OrderByDescending(x => x.value).Take(25).ToList();

            return Results.Ok(new
            {
                scoped = terrs != null,
                value = sales.Sum(s => s.NetAmount), lines = sales.Count,
                outletsMatched = matched.Count, outletsUnmatched = sales.Where(s => s.OutletId == null).Select(s => Normalize.Name(s.OutletName)).Distinct().Count(),
                outletsOnlyViaDistributors = onlyViaDistributors,
                distributors = rows, unmatched,
            });
        }).RequireAuthorization(p => p.RequireRole(Roles.Managers));
    }
}
