using DasEngage.Domain;
using DasEngage.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace DasEngage.Api;

/// <summary>
/// Visit coverage against each customer's target visits per month: what share of the planned calls were made, which customers are overdue
/// and which have never been visited. Reported by territory, never by individual rep.
/// </summary>
public static class CoverageEndpoints
{
    public static void Map(RouteGroupBuilder api)
    {
        api.MapGet("/dashboards/coverage", async (AppDbContext db, TeamScope team, int? days) =>
        {
            var d = Math.Clamp(days ?? 30, 7, 90);
            var now = DateTime.UtcNow;
            var from = now.AddDays(-d);
            var terrs = await team.VisibleTerritoryIds();

            var q = db.Customers.AsNoTracking().Where(c => c.TargetVisitsPerMonth > 0);
            if (terrs != null) q = q.Where(c => c.TerritoryId != null && terrs.Contains(c.TerritoryId.Value));
            var customers = await q.Select(c => new { c.Id, c.Name, c.Type, c.Segment, c.TerritoryId, c.TargetVisitsPerMonth }).ToListAsync();
            var ids = customers.Select(c => c.Id).ToList();

            var done = (await db.Visits.AsNoTracking().Where(v => v.Status == VisitStatus.Completed && v.CheckInAt >= from && v.CheckInAt <= now && ids.Contains(v.CustomerId))
                .GroupBy(v => v.CustomerId).Select(g => new { id = g.Key, n = g.Count() }).ToListAsync()).ToDictionary(x => x.id, x => x.n);
            var last = (await db.Visits.AsNoTracking().Where(v => v.Status == VisitStatus.Completed && ids.Contains(v.CustomerId))
                .GroupBy(v => v.CustomerId).Select(g => new { id = g.Key, at = g.Max(v => v.CheckInAt) }).ToListAsync()).ToDictionary(x => x.id, x => x.at);
            var territoryOf = await db.Territories.AsNoTracking().ToDictionaryAsync(t => t.Id, t => new { t.Name, t.Region });

            var rows = customers.Select(c =>
            {
                var expected = c.TargetVisitsPerMonth * d / 30.0;
                var made = done.GetValueOrDefault(c.Id);
                DateTime? lastAt = last.TryGetValue(c.Id, out var at) ? at : null;
                var interval = 30.0 / c.TargetVisitsPerMonth; // days between visits that the target asks for
                var since = lastAt is null ? (int?)null : (int)Math.Floor((now - lastAt.Value).TotalDays);
                var overdueRatio = since is null ? double.PositiveInfinity : since.Value / interval;
                return new { c, expected, counted = Math.Min(made, expected), lastAt, since, overdueRatio, never = lastAt is null, overdue = overdueRatio > 1 };
            }).ToList();

            string TerritoryName(Guid? t) => t is { } id && territoryOf.TryGetValue(id, out var x) ? x.Name : "No territory";
            string? RegionName(Guid? t) => t is { } id && territoryOf.TryGetValue(id, out var x) ? x.Region : null;
            static double? Pct(double part, double whole) => whole > 0 ? Math.Round(part * 100 / whole, 1) : null;

            var territories = rows.GroupBy(r => r.c.TerritoryId).Select(g => new
            {
                territoryId = g.Key, territory = TerritoryName(g.Key), region = RegionName(g.Key), customers = g.Count(),
                expected = Math.Round(g.Sum(r => r.expected), 1), completed = g.Sum(r => done.GetValueOrDefault(r.c.Id)),
                attainmentPct = Pct(g.Sum(r => r.counted), g.Sum(r => r.expected)),
                overdue = g.Count(r => r.overdue), neverVisited = g.Count(r => r.never),
            }).OrderBy(t => t.attainmentPct ?? 0).ThenBy(t => t.territory).ToList();

            var worst = rows.Where(r => r.overdue)
                .OrderByDescending(r => r.never).ThenBy(r => r.c.Segment).ThenByDescending(r => r.overdueRatio).ThenBy(r => r.c.Name)
                .Take(25).Select(r => new
                {
                    customerId = r.c.Id, name = r.c.Name, type = r.c.Type, segment = r.c.Segment, territory = TerritoryName(r.c.TerritoryId),
                    targetPerMonth = r.c.TargetVisitsPerMonth, lastVisitAt = r.lastAt, daysSince = r.since,
                }).ToList();

            return Results.Ok(new
            {
                days = d, customers = rows.Count,
                expectedVisits = Math.Round(rows.Sum(r => r.expected), 1), completedVisits = rows.Sum(r => done.GetValueOrDefault(r.c.Id)),
                attainmentPct = Pct(rows.Sum(r => r.counted), rows.Sum(r => r.expected)),
                overdue = rows.Count(r => r.overdue), neverVisited = rows.Count(r => r.never),
                territories, worst,
            });
        }).RequireAuthorization(p => p.RequireRole(Roles.Managers));
    }
}
