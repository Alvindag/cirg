using DasEngage.Domain;
using DasEngage.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace DasEngage.Api;

public record CreditLimitDto(decimal? CreditLimit);

/// <summary>Credit limits and balances: who is over their limit or overdue, and setting a limit by hand. Balances arrive from the ERP (`balances` import).</summary>
public static class CreditEndpoints
{
    private static readonly string[] Editors = { "NationalSalesManager", "Executive", "Admin" };

    public static void Map(RouteGroupBuilder api)
    {
        var g = api.MapGroup("/credit");

        g.MapPut("/{customerId:guid}", async (Guid customerId, CreditLimitDto d, AppDbContext db) =>
        {
            if (d.CreditLimit is < 0 or > 1_000_000_000_000m) return Results.BadRequest("A limit must be between 0 and 1,000,000,000,000.");
            if (!await db.Customers.AnyAsync(c => c.Id == customerId)) return Results.NotFound();
            var row = await db.CustomerCredits.FirstOrDefaultAsync(c => c.CustomerId == customerId);
            if (row is null) db.CustomerCredits.Add(row = new CustomerCredit { CustomerId = customerId });
            row.CreditLimit = d.CreditLimit is > 0 ? Math.Round(d.CreditLimit.Value, 2) : null; // 0 or empty removes the limit
            await db.SaveChangesAsync();
            return Results.NoContent();
        }).RequireAuthorization(p => p.RequireRole(Editors));

        g.MapGet("/overview", async (AppDbContext db, TeamScope team) =>
        {
            var terrs = await team.VisibleTerritoryIds();
            var q = from cr in db.CustomerCredits.AsNoTracking()
                    join c in db.Customers.AsNoTracking() on cr.CustomerId equals c.Id
                    select new { cr, c.Name, c.TerritoryId };
            if (terrs != null) q = q.Where(x => x.TerritoryId != null && terrs.Contains(x.TerritoryId.Value));
            var all = await q.ToListAsync();
            var ids = all.Select(x => x.cr.CustomerId).ToList();
            var open = (await db.Orders.AsNoTracking().Where(o => ids.Contains(o.CustomerId) && (o.Status == OrderStatus.Placed || o.Status == OrderStatus.Confirmed))
                .GroupBy(o => o.CustomerId).Select(x => new { id = x.Key, total = x.Sum(o => o.Total) }).ToListAsync()).ToDictionary(x => x.id, x => x.total);
            var territoryName = await db.Territories.AsNoTracking().ToDictionaryAsync(t => t.Id, t => t.Name);

            var rows = all.Select(x =>
            {
                var o = open.GetValueOrDefault(x.cr.CustomerId);
                var exposure = x.cr.Outstanding + o;
                return new
                {
                    customerId = x.cr.CustomerId, name = x.Name, territory = x.TerritoryId is { } t && territoryName.TryGetValue(t, out var n) ? n : null,
                    creditLimit = x.cr.CreditLimit, outstanding = x.cr.Outstanding, overdue = x.cr.Overdue, openOrders = o, asOf = x.cr.AsOf,
                    overLimit = x.cr.CreditLimit is > 0 && exposure > x.cr.CreditLimit,
                };
            }).ToList();

            var held = await db.Orders.AsNoTracking().CountAsync(o => o.CreditHold && o.Status == OrderStatus.Placed);
            return Results.Ok(new
            {
                customers = rows.Count,
                withLimit = rows.Count(r => r.creditLimit != null),
                overdueTotal = rows.Sum(r => r.overdue), outstandingTotal = rows.Sum(r => r.outstanding),
                overLimit = rows.Count(r => r.overLimit), withOverdue = rows.Count(r => r.overdue > 0), heldOrders = held,
                watch = rows.Where(r => r.overLimit || r.overdue > 0).OrderByDescending(r => r.overdue).ThenByDescending(r => r.outstanding).Take(50).ToList(),
            });
        }).RequireAuthorization(p => p.RequireRole(Roles.Managers));
    }
}
