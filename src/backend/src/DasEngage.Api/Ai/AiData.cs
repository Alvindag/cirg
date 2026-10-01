using DasEngage.Domain;
using DasEngage.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace DasEngage.Api.Ai;

/// <summary>Gathers the facts the scoring rules work on, for the customers a caller is allowed to see.</summary>
public static class AiData
{
    public const int MaxCustomers = 2000;

    public static async Task<List<CustomerFacts>> LoadFacts(AppDbContext db, Guid[]? territoryScope, Guid? onlyTerritory, DateTime now, Guid? onlyCustomer = null)
    {
        var q = db.Customers.AsNoTracking().AsQueryable();
        if (onlyCustomer != null) q = q.Where(c => c.Id == onlyCustomer);
        if (territoryScope != null) q = q.Where(c => c.TerritoryId != null && territoryScope.Contains(c.TerritoryId.Value));
        if (onlyTerritory != null) q = q.Where(c => c.TerritoryId == onlyTerritory);
        var customers = await q.OrderBy(c => c.Name).Take(MaxCustomers).ToListAsync();
        var ids = customers.Select(c => c.Id).ToList();
        var since90 = now.AddDays(-90);

        var visits = (await db.Visits.AsNoTracking().Where(v => ids.Contains(v.CustomerId) && v.Status == VisitStatus.Completed && v.CheckInAt >= since90)
            .Select(v => new { v.CustomerId, v.CheckInAt }).ToListAsync()).GroupBy(v => v.CustomerId).ToDictionary(g => g.Key, g => (Count: g.Count(), Last: g.Max(v => v.CheckInAt)));
        // a customer last visited more than 90 days ago still has a last-visit date
        var lastEver = (await db.Visits.AsNoTracking().Where(v => ids.Contains(v.CustomerId) && v.Status == VisitStatus.Completed)
            .GroupBy(v => v.CustomerId).Select(g => new { Id = g.Key, Last = g.Max(v => v.CheckInAt) }).ToListAsync()).ToDictionary(x => x.Id, x => x.Last);
        var outcomes = (await db.CallReports.AsNoTracking().Where(r => ids.Contains(r.CustomerId) && r.CreatedAt >= now.AddDays(-180))
            .OrderByDescending(r => r.CreatedAt).Select(r => new { r.CustomerId, r.Outcome }).ToListAsync())
            .GroupBy(r => r.CustomerId).ToDictionary(g => g.Key, g => (IReadOnlyList<string?>)g.Take(5).Select(r => r.Outcome).ToList());
        var samples = (await db.SampleDistributions.AsNoTracking().Where(d => ids.Contains(d.CustomerId) && d.DistributedAt >= since90)
            .GroupBy(d => d.CustomerId).Select(g => new { Id = g.Key, Units = g.Sum(d => d.Quantity) }).ToListAsync()).ToDictionary(x => x.Id, x => x.Units);
        var tasks = (await db.Tasks.AsNoTracking().Where(t => t.CustomerId != null && ids.Contains(t.CustomerId.Value) && t.Status == FollowUpStatus.Open)
            .GroupBy(t => t.CustomerId!.Value).Select(g => new { Id = g.Key, N = g.Count() }).ToListAsync()).ToDictionary(x => x.Id, x => x.N);
        var interests = (await db.CustomerProductInterests.AsNoTracking().Where(i => ids.Contains(i.CustomerId))
            .GroupBy(i => i.CustomerId).Select(g => new { Id = g.Key, N = g.Count() }).ToListAsync()).ToDictionary(x => x.Id, x => x.N);

        var hasSales = await db.SalesFacts.AnyAsync();
        var revenue = hasSales
            ? (await db.SalesFacts.AsNoTracking().Where(x => x.CustomerId != null && ids.Contains(x.CustomerId.Value) && x.SaleDate >= DateOnly.FromDateTime(since90))
                .GroupBy(x => x.CustomerId!.Value).Select(g => new { Id = g.Key, Amount = g.Sum(x => x.NetAmount) }).ToListAsync()).ToDictionary(x => x.Id, x => x.Amount)
            : new Dictionary<Guid, decimal>();

        return customers.Select(c => new CustomerFacts(c.Id, c.Name, c.Type, c.Segment, c.TargetVisitsPerMonth, interests.GetValueOrDefault(c.Id),
            c.Latitude, c.Longitude, c.TerritoryId, visits.TryGetValue(c.Id, out var v) ? v.Count : 0,
            lastEver.TryGetValue(c.Id, out var last) ? last : null, outcomes.GetValueOrDefault(c.Id) ?? Array.Empty<string?>(),
            samples.GetValueOrDefault(c.Id), tasks.GetValueOrDefault(c.Id), hasSales ? revenue.GetValueOrDefault(c.Id) : null)).ToList();
    }

    public static async Task<Dictionary<Guid, ProductFacts>> LoadProductFacts(AppDbContext db, Guid productId, IReadOnlyCollection<Guid> customerIds, DateTime now)
    {
        var since = now.AddDays(-180);
        var mentions = (await db.CallReports.AsNoTracking().Where(r => customerIds.Contains(r.CustomerId) && r.CreatedAt >= since && r.Products.Any(p => p.ProductId == productId))
            .Select(r => new { r.CustomerId, r.Outcome }).ToListAsync()).GroupBy(r => r.CustomerId)
            .ToDictionary(g => g.Key, g => (Total: g.Count(), Positive: g.Count(r => string.Equals(r.Outcome, "Positive", StringComparison.OrdinalIgnoreCase))));
        var interested = (await db.CustomerProductInterests.AsNoTracking().Where(i => i.ProductId == productId && customerIds.Contains(i.CustomerId)).Select(i => i.CustomerId).ToListAsync()).ToHashSet();
        var samples = (await db.SampleDistributions.AsNoTracking().Where(d => d.ProductId == productId && customerIds.Contains(d.CustomerId) && d.DistributedAt >= since)
            .GroupBy(d => d.CustomerId).Select(g => new { Id = g.Key, Units = g.Sum(d => d.Quantity) }).ToListAsync()).ToDictionary(x => x.Id, x => x.Units);
        var hasSales = await db.SalesFacts.AnyAsync();
        var bought = hasSales
            ? (await db.SalesFacts.AsNoTracking().Where(x => x.ProductId == productId && x.CustomerId != null && customerIds.Contains(x.CustomerId.Value) && x.SaleDate >= DateOnly.FromDateTime(since))
                .GroupBy(x => x.CustomerId!.Value).Select(g => new { Id = g.Key, N = g.Count() }).ToListAsync()).ToDictionary(x => x.Id, x => x.N)
            : new Dictionary<Guid, int>();
        return customerIds.ToDictionary(id => id, id => new ProductFacts(productId, mentions.TryGetValue(id, out var m) ? m.Total : 0,
            mentions.TryGetValue(id, out var m2) ? m2.Positive : 0, interested.Contains(id), samples.GetValueOrDefault(id), hasSales ? bought.GetValueOrDefault(id) : null));
    }

    public static async Task<List<HeldStock>> Holdings(AppDbContext db, Guid holderId)
    {
        var rows = await db.StockMovements.AsNoTracking().Where(m => m.HolderId == holderId).GroupBy(m => m.BatchId)
            .Select(g => new { BatchId = g.Key, Qty = g.Sum(m => m.Delta) }).Where(x => x.Qty > 0).ToListAsync();
        var batchIds = rows.Select(r => r.BatchId).ToList();
        var batches = await db.SampleBatches.AsNoTracking().Where(b => batchIds.Contains(b.Id)).ToListAsync();
        var products = await db.Products.AsNoTracking().ToDictionaryAsync(p => p.Id, p => p.Name);
        return rows.Join(batches, r => r.BatchId, b => b.Id, (r, b) => new HeldStock(products.GetValueOrDefault(b.ProductId, "Product"), b.ProductId, b.BatchNumber, b.ExpiryDate, r.Qty)).ToList();
    }
}
