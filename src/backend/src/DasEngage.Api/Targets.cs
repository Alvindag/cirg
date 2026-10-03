using System.Globalization;
using DasEngage.Domain;
using DasEngage.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace DasEngage.Api;

public record TargetRow(string? Region, SalesChannel? Channel, decimal Amount);

/// <summary>Monthly sales targets by region and channel, and how invoiced sales compare with them.</summary>
public static class TargetEndpoints
{
    private static readonly string[] Editors = { "NationalSalesManager", "Executive", "Admin" };

    private static bool TryMonth(string? text, out DateOnly month)
    {
        month = default;
        if (string.IsNullOrWhiteSpace(text)) { var t = DateTime.UtcNow; month = new DateOnly(t.Year, t.Month, 1); return true; }
        if (!DateTime.TryParseExact(text.Trim(), "yyyy-MM", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d)) return false;
        month = new DateOnly(d.Year, d.Month, 1);
        return month.Year is >= 2020 and <= 2100;
    }

    private static string Norm(string? r) => (r ?? "").Trim();

    public static void Map(RouteGroupBuilder api)
    {
        api.MapGet("/rtm/targets", async (AppDbContext db, string? month) =>
        {
            if (!TryMonth(month, out var m)) return Results.BadRequest("Month must look like 2026-10.");
            var rows = await db.SalesTargets.AsNoTracking().Where(t => t.Month == m).OrderBy(t => t.Region).ThenBy(t => t.Channel)
                .Select(t => new TargetRow(t.Region == "" ? null : t.Region, t.Channel, t.Amount)).ToListAsync();
            return Results.Ok(rows);
        }).RequireAuthorization(p => p.RequireRole(Roles.Managers));

        // Replaces the month's targets with the rows sent.
        api.MapPut("/rtm/targets", async (List<TargetRow> rows, AppDbContext db, string? month) =>
        {
            if (!TryMonth(month, out var m)) return Results.BadRequest("Month must look like 2026-10.");
            if (rows.Count > 200) return Results.BadRequest("At most 200 targets.");
            var seen = new HashSet<string>();
            foreach (var r in rows)
            {
                if (r.Amount is < 0 or > 1_000_000_000_000m) return Results.BadRequest("A target must be between 0 and 1,000,000,000,000.");
                if (r.Channel is { } c && (!Enum.IsDefined(c) || c == SalesChannel.Unassigned)) return Results.BadRequest("Choose a real channel, or leave it empty for all channels.");
                if (Norm(r.Region).Length > 100) return Results.BadRequest("Region is too long.");
                if (!seen.Add($"{Norm(r.Region).ToLowerInvariant()}|{r.Channel}")) return Results.BadRequest("Each region and channel may appear once.");
            }
            foreach (var old in await db.SalesTargets.Where(t => t.Month == m).ToListAsync()) { old.DeletedAt = DateTime.UtcNow; }
            await db.SaveChangesAsync();
            foreach (var r in rows) db.SalesTargets.Add(new SalesTarget { Month = m, Region = Norm(r.Region), Channel = r.Channel, Amount = Math.Round(r.Amount, 2) });
            await db.SaveChangesAsync();
            return Results.NoContent();
        }).RequireAuthorization(p => p.RequireRole(Editors));

        api.MapGet("/dashboards/targets", async (AppDbContext db, TeamScope team, string? month) =>
        {
            if (!TryMonth(month, out var m)) return Results.BadRequest("Month must look like 2026-10.");
            var next = m.AddMonths(1);
            var today = DateOnly.FromDateTime(DateTime.UtcNow);
            var currency = (await db.ErpConnections.AsNoTracking().Select(c => c.Currency).FirstOrDefaultAsync()) ?? "GHS";
            var terrs = await team.VisibleTerritoryIds();

            var targets = terrs != null ? new List<SalesTarget>() : await db.SalesTargets.AsNoTracking().Where(t => t.Month == m).ToListAsync();
            var byCustomer = (await db.SalesFacts.AsNoTracking().Where(s => s.SaleDate >= m && s.SaleDate < next && s.Currency == currency)
                .GroupBy(s => s.CustomerId).Select(g => new { id = g.Key, amount = g.Sum(s => s.NetAmount) }).ToListAsync());
            var regionOf = await db.Territories.AsNoTracking().ToDictionaryAsync(t => t.Id, t => Norm(t.Region));
            var customers = await db.Customers.AsNoTracking().Select(c => new { c.Id, c.TerritoryId, c.Channel }).ToDictionaryAsync(c => c.Id);

            string RegionOf(Guid? customerId) => customerId is { } id && customers.TryGetValue(id, out var c) && c.TerritoryId is { } t && regionOf.TryGetValue(t, out var r) ? r : "";
            SalesChannel? ChannelOf(Guid? customerId) => customerId is { } id && customers.TryGetValue(id, out var c) ? c.Channel : null;
            bool InScope(Guid? customerId) => terrs == null || (customerId is { } id && customers.TryGetValue(id, out var c) && c.TerritoryId is { } t && terrs.Contains(t));

            var facts = byCustomer.Where(f => InScope(f.id)).ToList();
            decimal Actual(string region, SalesChannel? channel) => facts
                .Where(f => (region == "" || string.Equals(RegionOf(f.id), region, StringComparison.OrdinalIgnoreCase)) && (channel == null || ChannelOf(f.id) == channel))
                .Sum(f => f.amount);

            var daysInMonth = DateTime.DaysInMonth(m.Year, m.Month);
            var elapsed = today < m ? 0 : today >= next ? daysInMonth : today.Day;
            double? Project(decimal actual) => elapsed is > 0 and < 31 && elapsed < daysInMonth ? Math.Round((double)actual / elapsed * daysInMonth, 2) : elapsed >= daysInMonth ? (double)actual : null;

            var rows = targets.OrderBy(t => t.Region).ThenBy(t => t.Channel).Select(t =>
            {
                var actual = Actual(t.Region, t.Channel);
                return new
                {
                    region = t.Region == "" ? null : t.Region, channel = t.Channel, target = (decimal?)t.Amount, actual,
                    attainmentPct = t.Amount > 0 ? Math.Round((double)(actual / t.Amount * 100), 1) : (double?)null,
                    projected = Project(actual),
                    projectedPct = t.Amount > 0 && Project(actual) is { } p ? Math.Round(p / (double)t.Amount * 100, 1) : (double?)null,
                };
            }).ToList();

            return Results.Ok(new
            {
                month = $"{m:yyyy-MM}", currency, scoped = terrs != null, daysInMonth, daysElapsed = elapsed,
                paceNote = elapsed > 0 && elapsed < daysInMonth ? $"{elapsed} of {daysInMonth} days of the month have passed." : null,
                companyActual = facts.Sum(f => f.amount),
                rows,
            });
        }).RequireAuthorization(p => p.RequireRole(Roles.Managers));
    }
}
