using DasEngage.Domain;
using DasEngage.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace DasEngage.Api.Erp;

/// <summary>Revenue from ERP invoices and the cost of samples given out. Both respect the manager's team scope.</summary>
public static class ErpReports
{
    public static void Map(RouteGroupBuilder api)
    {
        // Revenue by month (or day for short periods), top customers, products and territories, against the previous period.
        api.MapGet("/dashboards/revenue", async (AppDbContext db, TeamScope team, DateTime from, DateTime to, Guid? productId) =>
        {
            var currency = (await db.ErpConnections.AsNoTracking().Select(c => c.Currency).FirstOrDefaultAsync()) ?? "GHS";
            var start = DateOnly.FromDateTime(from); var end = DateOnly.FromDateTime(to);
            if (end < start || end.DayNumber - start.DayNumber > 800) return Results.BadRequest("Choose a period of at most 800 days.");
            var spanDays = end.DayNumber - start.DayNumber + 1;
            var prevStart = start.AddDays(-spanDays); var prevEnd = start.AddDays(-1);

            var terrs = await team.VisibleTerritoryIds();
            IQueryable<SalesFact> Scoped(DateOnly a, DateOnly b)
            {
                var q = db.SalesFacts.AsNoTracking().Where(s => s.SaleDate >= a && s.SaleDate <= b && s.Currency == currency);
                if (productId != null) q = q.Where(s => s.ProductId == productId);
                if (terrs != null) q = q.Where(s => s.CustomerId != null && db.Customers.Any(c => c.Id == s.CustomerId && c.TerritoryId != null && terrs.Contains(c.TerritoryId.Value)));
                return q;
            }

            var rows = await Scoped(start, end).ToListAsync();
            var previous = await Scoped(prevStart, prevEnd).SumAsync(s => (decimal?)s.NetAmount) ?? 0;
            var total = rows.Sum(s => s.NetAmount);
            var daily = spanDays <= 62;
            var trend = rows.GroupBy(s => daily ? s.SaleDate.ToString("yyyy-MM-dd") : s.SaleDate.ToString("yyyy-MM")).OrderBy(g => g.Key)
                .Select(g => new { period = g.Key, amount = g.Sum(s => s.NetAmount), units = g.Sum(s => s.Quantity) }).ToList();

            var custIds = rows.Where(r => r.CustomerId != null).Select(r => r.CustomerId!.Value).Distinct().ToList();
            var customers = await db.Customers.AsNoTracking().Where(c => custIds.Contains(c.Id)).ToDictionaryAsync(c => c.Id);
            var products = await db.Products.AsNoTracking().ToDictionaryAsync(p => p.Id, p => p.Name);
            var territories = await db.Territories.AsNoTracking().ToDictionaryAsync(t => t.Id, t => t.Name);

            return Results.Ok(new
            {
                currency, total, previousTotal = previous, growthPct = previous == 0 ? (double?)null : Math.Round((double)((total - previous) / previous * 100), 1),
                units = rows.Sum(s => s.Quantity), customersBuying = custIds.Count,
                unlinkedAmount = rows.Where(r => r.CustomerId == null).Sum(r => r.NetAmount), // invoices whose account is not linked to a DAS customer yet
                granularity = daily ? "day" : "month", trend,
                topCustomers = rows.Where(r => r.CustomerId != null).GroupBy(r => r.CustomerId!.Value).Select(g => new { customerId = g.Key, name = customers.GetValueOrDefault(g.Key)?.Name ?? "", amount = g.Sum(r => r.NetAmount) })
                    .OrderByDescending(x => x.amount).Take(10).ToList(),
                byProduct = rows.GroupBy(r => r.ProductId).Select(g => new { productId = g.Key, name = g.Key is { } id ? products.GetValueOrDefault(id, "Unknown") : "Unlinked items", amount = g.Sum(r => r.NetAmount) })
                    .OrderByDescending(x => x.amount).Take(15).ToList(),
                byTerritory = rows.Where(r => r.CustomerId != null).GroupBy(r => customers.GetValueOrDefault(r.CustomerId!.Value)?.TerritoryId)
                    .Select(g => new { territoryId = g.Key, name = g.Key is { } id ? territories.GetValueOrDefault(id, "—") : "No territory", amount = g.Sum(r => r.NetAmount) })
                    .OrderByDescending(x => x.amount).ToList(),
            });
        });

        // What the samples handed out cost, at the ERP's standard cost.
        api.MapGet("/samples/reports/spend", async (AppDbContext db, TeamScope team, DateTime from, DateTime to) =>
        {
            var ids = await team.VisibleUserIds();
            var q = db.SampleDistributions.AsNoTracking().Where(d => d.DistributedAt >= from && d.DistributedAt <= to);
            if (ids != null) q = q.Where(d => ids.Contains(d.RepId));
            var dist = await q.ToListAsync();
            var products = await db.Products.AsNoTracking().ToDictionaryAsync(p => p.Id);
            decimal Cost(Guid pid, int qty) => (products.GetValueOrDefault(pid)?.StandardCost ?? 0) * qty;

            var missing = dist.Select(d => d.ProductId).Distinct().Where(id => products.GetValueOrDefault(id)?.StandardCost == null)
                .Select(id => new { productId = id, name = products.GetValueOrDefault(id)?.Name ?? "Unknown" }).ToList();
            return Results.Ok(new
            {
                currency = (await db.ErpConnections.AsNoTracking().Select(c => c.Currency).FirstOrDefaultAsync()) ?? "GHS",
                totalUnits = dist.Sum(d => d.Quantity), totalCost = dist.Sum(d => Cost(d.ProductId, d.Quantity)),
                byProduct = dist.GroupBy(d => d.ProductId).Select(g => new { productId = g.Key, name = products.GetValueOrDefault(g.Key)?.Name, units = g.Sum(d => d.Quantity), cost = g.Sum(d => Cost(d.ProductId, d.Quantity)) }).OrderByDescending(x => x.cost).ToList(),
                byRep = dist.GroupBy(d => d.RepId).Select(g => new { repId = g.Key, units = g.Sum(d => d.Quantity), cost = g.Sum(d => Cost(d.ProductId, d.Quantity)) }).OrderByDescending(x => x.cost).ToList(),
                productsWithoutCost = missing,
            });
        }).RequireAuthorization(p => p.RequireRole(Roles.Managers));
    }
}
