using DasEngage.Domain;
using DasEngage.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace DasEngage.Api;

public record RtmTagDto(SalesChannel Channel, OutletClass OutletClass);
public record UniverseRow(string? Region, OutletClass OutletClass, int Outlets, string? Source);

/// <summary>
/// Route to market: how outlets are served (channel), what kind they are, and how much of the market DAS has mapped and reaches.
/// It reports on channels, outlet kinds and regions, never on individual sales people.
/// </summary>
public static class RtmEndpoints
{
    /// <summary>Outlets are the places product is sold or used; doctors and pharmacists are people at them.</summary>
    private static readonly CustomerType[] OutletTypes = { CustomerType.Hospital, CustomerType.Clinic, CustomerType.Pharmacy, CustomerType.GovernmentInstitution, CustomerType.Distributor };
    private static readonly string[] UniverseEditors = { "NationalSalesManager", "Executive", "Admin" };

    public static void Map(RouteGroupBuilder api)
    {
        var g = api.MapGroup("/rtm");

        g.MapGet("/universe", async (AppDbContext db) =>
            (await db.MarketUniverse.AsNoTracking().OrderBy(u => u.OutletClass).ThenBy(u => u.Region)
                .Select(u => new UniverseRow(u.Region, u.OutletClass, u.Outlets, u.Source)).ToListAsync()))
            .RequireAuthorization(p => p.RequireRole(Roles.Managers));

        // Replaces the whole list: rows sent are saved, rows left out are removed.
        g.MapPut("/universe", async (List<UniverseRow> rows, AppDbContext db) =>
        {
            if (rows.Count > 500) return Results.BadRequest("At most 500 rows.");
            var keys = new HashSet<string>();
            foreach (var r in rows)
            {
                if (!Enum.IsDefined(r.OutletClass) || r.OutletClass == OutletClass.Unclassified) return Results.BadRequest("Choose the kind of outlet for every row.");
                if (r.Outlets is < 0 or > 1_000_000) return Results.BadRequest("The number of outlets must be between 0 and 1,000,000.");
                if ((r.Region?.Length ?? 0) > 100 || (r.Source?.Length ?? 0) > 200) return Results.BadRequest("Region or source is too long.");
                if (!keys.Add($"{Region(r.Region)}|{r.OutletClass}")) return Results.BadRequest("Each region and kind of outlet may appear once.");
            }
            var existing = await db.MarketUniverse.ToListAsync();
            foreach (var e in existing.Where(e => !keys.Contains($"{Region(e.Region)}|{e.OutletClass}"))) e.DeletedAt = DateTime.UtcNow;
            foreach (var r in rows)
            {
                var row = existing.FirstOrDefault(e => Region(e.Region) == Region(r.Region) && e.OutletClass == r.OutletClass);
                if (row is null) db.MarketUniverse.Add(row = new MarketUniverse { OutletClass = r.OutletClass });
                row.Region = string.IsNullOrWhiteSpace(r.Region) ? null : r.Region.Trim();
                row.Outlets = r.Outlets;
                row.Source = string.IsNullOrWhiteSpace(r.Source) ? null : r.Source.Trim();
            }
            await db.SaveChangesAsync();
            return Results.NoContent();
        }).RequireAuthorization(p => p.RequireRole(UniverseEditors));

        // Outlets still waiting to be tagged, so the review can be run on complete data.
        g.MapGet("/untagged", async (AppDbContext db, TeamScope team, int? take) =>
        {
            var terrs = await team.VisibleTerritoryIds();
            var q = db.Customers.AsNoTracking().Where(c => OutletTypes.Contains(c.Type) && (c.Channel == SalesChannel.Unassigned || c.OutletClass == OutletClass.Unclassified));
            if (terrs != null) q = q.Where(c => c.TerritoryId != null && terrs.Contains(c.TerritoryId.Value));
            var total = await q.CountAsync();
            var items = await q.OrderBy(c => c.Name).Take(Math.Clamp(take ?? 25, 1, 100))
                .Select(c => new { c.Id, c.Name, type = c.Type, c.City, c.Channel, c.OutletClass }).ToListAsync();
            return Results.Ok(new { total, items });
        }).RequireAuthorization(p => p.RequireRole(Roles.ImportAllowed));

        g.MapPut("/customers/{id:guid}", async (Guid id, RtmTagDto d, AppDbContext db, TeamScope team) =>
        {
            if (!Enum.IsDefined(d.Channel) || !Enum.IsDefined(d.OutletClass)) return Results.BadRequest("Unknown channel or kind of outlet.");
            var c = await db.Customers.FirstOrDefaultAsync(x => x.Id == id);
            if (c is null) return Results.NotFound();
            var terrs = await team.VisibleTerritoryIds();
            if (terrs != null && (c.TerritoryId is null || !terrs.Contains(c.TerritoryId.Value))) return Results.NotFound(); // outside this person's area
            c.Channel = d.Channel; c.OutletClass = d.OutletClass;
            await db.SaveChangesAsync();
            return Results.NoContent();
        }).RequireAuthorization(p => p.RequireRole(Roles.ImportAllowed));

        api.MapGet("/dashboards/rtm", async (AppDbContext db, TeamScope team, DateTime from, DateTime to) =>
        {
            from = AsUtc(from); to = AsUtc(to); // a date without a time zone means UTC; PostgreSQL refuses anything else
            var start = DateOnly.FromDateTime(from); var end = DateOnly.FromDateTime(to);
            if (end < start || end.DayNumber - start.DayNumber > 800) return Results.BadRequest("Choose a period of at most 800 days.");
            var currency = (await db.ErpConnections.AsNoTracking().Select(c => c.Currency).FirstOrDefaultAsync()) ?? "GHS";
            var terrs = await team.VisibleTerritoryIds();

            var q = db.Customers.AsNoTracking().Where(c => OutletTypes.Contains(c.Type));
            if (terrs != null) q = q.Where(c => c.TerritoryId != null && terrs.Contains(c.TerritoryId.Value));
            var customers = await q.Select(c => new { c.Id, c.Channel, c.OutletClass, c.TerritoryId }).ToListAsync();
            var ids = customers.Select(c => c.Id).ToHashSet();

            var visited = (await db.Visits.AsNoTracking().Where(v => v.CheckInAt >= from && v.CheckInAt <= to).Select(v => v.CustomerId).Distinct().ToListAsync()).Where(ids.Contains).ToHashSet();
            var revenue = (await db.SalesFacts.AsNoTracking().Where(s => s.SaleDate >= start && s.SaleDate <= end && s.CustomerId != null && s.Currency == currency)
                .GroupBy(s => s.CustomerId!.Value).Select(x => new { id = x.Key, amount = x.Sum(s => s.NetAmount) }).ToListAsync())
                .Where(r => ids.Contains(r.id)).ToDictionary(r => r.id, r => r.amount);
            // Outlets a distributor sold to in the period that DAS neither visited nor invoiced itself: reached, but only through the distributor.
            var viaDistributor = (await db.SecondarySales.AsNoTracking().Where(s => s.OutletId != null && s.SaleDate >= start && s.SaleDate <= end).Select(s => s.OutletId!.Value).Distinct().ToListAsync())
                .Where(id => ids.Contains(id) && !visited.Contains(id) && !revenue.ContainsKey(id)).ToHashSet();
            bool Reached(Guid id) => visited.Contains(id) || revenue.ContainsKey(id);
            decimal Rev(Guid id) => revenue.GetValueOrDefault(id);

            var regionOf = await db.Territories.AsNoTracking().ToDictionaryAsync(t => t.Id, t => string.IsNullOrWhiteSpace(t.Region) ? "No region" : t.Region!.Trim());
            string RegionName(Guid? t) => t is { } id ? regionOf.GetValueOrDefault(id, "No region") : "No region";

            // The market size is national, so it only makes sense to compare it with what the whole company reaches.
            var universe = terrs != null ? new List<MarketUniverse>() : await db.MarketUniverse.AsNoTracking().ToListAsync();
            var hasUniverse = universe.Count > 0;

            var classes = customers.GroupBy(c => c.OutletClass).Select(x => x.Key).Union(universe.Select(u => u.OutletClass)).Distinct().OrderBy(k => k).Select(k =>
            {
                var mine = customers.Where(c => c.OutletClass == k).ToList();
                return new
                {
                    outletClass = k, universe = universe.Any(u => u.OutletClass == k) ? universe.Where(u => u.OutletClass == k).Sum(u => u.Outlets) : (int?)null,
                    mapped = mine.Count, reached = mine.Count(c => Reached(c.Id)), revenue = mine.Sum(c => Rev(c.Id)),
                };
            }).ToList();

            var channels = customers.GroupBy(c => c.Channel).OrderBy(x => x.Key)
                .Select(x => new { channel = x.Key, customers = x.Count(), reached = x.Count(c => Reached(c.Id)), revenue = x.Sum(c => Rev(c.Id)) }).ToList();

            var regions = customers.GroupBy(c => RegionName(c.TerritoryId)).Select(x => x.Key).Union(universe.Where(u => !string.IsNullOrWhiteSpace(u.Region)).Select(u => u.Region!.Trim())).Distinct()
                .OrderBy(r => r).Select(r =>
                {
                    var mine = customers.Where(c => RegionName(c.TerritoryId) == r).ToList();
                    var theirs = universe.Where(x => string.Equals(x.Region?.Trim(), r, StringComparison.OrdinalIgnoreCase)).ToList();
                    int? u = theirs.Count > 0 ? theirs.Sum(x => x.Outlets) : null;
                    return new { region = r, universe = u, mapped = mine.Count, reached = mine.Count(c => Reached(c.Id)), revenue = mine.Sum(c => Rev(c.Id)) };
                }).ToList();

            var sorted = revenue.Values.OrderByDescending(v => v).ToList();
            var top = (int)Math.Ceiling(sorted.Count * 0.2);
            decimal total = sorted.Sum();
            double? top20 = sorted.Count >= 5 && total > 0 ? Math.Round((double)(sorted.Take(top).Sum() / total * 100), 1) : null;

            int? universeTotal = hasUniverse ? universe.Sum(u => u.Outlets) : null;
            var reachedAll = customers.Count(c => Reached(c.Id));
            return Results.Ok(new
            {
                currency, hasUniverse, universeScoped = terrs != null, universeTotal,
                mapped = customers.Count, reached = reachedAll,
                mappedPct = universeTotal is > 0 ? Math.Round(customers.Count * 100.0 / universeTotal.Value, 1) : (double?)null,
                reachedPct = universeTotal is > 0 ? Math.Round(reachedAll * 100.0 / universeTotal.Value, 1) : (double?)null,
                revenue = total, top20Share = top20,
                viaDistributors = viaDistributor.Count,
                viaDistributorsPct = universeTotal is > 0 ? Math.Round(viaDistributor.Count * 100.0 / universeTotal.Value, 1) : (double?)null,
                classes, channels, regions,
                tagging = new { total = customers.Count, noChannel = customers.Count(c => c.Channel == SalesChannel.Unassigned), noClass = customers.Count(c => c.OutletClass == OutletClass.Unclassified), noRegion = customers.Count(c => RegionName(c.TerritoryId) == "No region") },
            });
        }).RequireAuthorization(p => p.RequireRole(Roles.Managers));
    }

    private static DateTime AsUtc(DateTime d) => d.Kind == DateTimeKind.Unspecified ? DateTime.SpecifyKind(d, DateTimeKind.Utc) : d.ToUniversalTime();

    private static string Region(string? r) => (r ?? "").Trim().ToLowerInvariant();
}
