using System.Net.Http.Json;
using System.Text.Json;
using DasEngage.Domain;

namespace DasEngage.Tests;

public class CoverageTests : IClassFixture<ErpFactory>
{
    private readonly ErpFactory _f;
    public CoverageTests(ErpFactory f) => _f = f;

    private static async Task<JsonElement> Json(HttpResponseMessage r) { r.EnsureSuccessStatusCode(); return await r.Content.ReadFromJsonAsync<JsonElement>(); }

    /// <summary>Accra: A = target 4/month, visited 3 times in the last 30 days (last 2 days ago); B = target 2, visited once 40 days ago; C = target 1, never visited.
    /// Kumasi: D = target 4, visited 4 times. E has no target, so it is not part of coverage.</summary>
    private async Task<(HttpClient Admin, HttpClient Accra, Guid[] Ids)> Setup()
    {
        var tenant = Guid.NewGuid(); var accra = Guid.NewGuid(); var kumasi = Guid.NewGuid();
        var ids = Enumerable.Range(0, 5).Select(_ => Guid.NewGuid()).ToArray();
        await using (var db = _f.Db(tenant))
        {
            db.Tenants.Add(new Tenant { Id = tenant, Name = "T" + tenant });
            db.Territories.AddRange(new Territory { Id = accra, Name = "Accra Central", Region = "Greater Accra" }, new Territory { Id = kumasi, Name = "Kumasi", Region = "Ashanti" });
            db.Customers.AddRange(
                new Customer { Id = ids[0], Name = "A Pharmacy", Type = CustomerType.Pharmacy, Segment = Segment.A, TerritoryId = accra, TargetVisitsPerMonth = 4 },
                new Customer { Id = ids[1], Name = "B Clinic", Type = CustomerType.Clinic, Segment = Segment.B, TerritoryId = accra, TargetVisitsPerMonth = 2 },
                new Customer { Id = ids[2], Name = "C Pharmacy", Type = CustomerType.Pharmacy, Segment = Segment.C, TerritoryId = accra, TargetVisitsPerMonth = 1 },
                new Customer { Id = ids[3], Name = "D Hospital", Type = CustomerType.Hospital, Segment = Segment.A, TerritoryId = kumasi, TargetVisitsPerMonth = 4 },
                new Customer { Id = ids[4], Name = "E Shop", Type = CustomerType.Pharmacy, TerritoryId = accra, TargetVisitsPerMonth = 0 });
            var rep = Guid.NewGuid();
            Visit V(Guid c, int daysAgo, VisitStatus s = VisitStatus.Completed) => new() { RepId = rep, CustomerId = c, CheckInAt = DateTime.UtcNow.AddDays(-daysAgo), Status = s };
            db.Visits.AddRange(V(ids[0], 2), V(ids[0], 10), V(ids[0], 20), V(ids[0], 3, VisitStatus.Missed), V(ids[1], 40),
                V(ids[3], 1), V(ids[3], 8), V(ids[3], 15), V(ids[3], 22));
            await db.SaveChangesAsync();
        }
        return (_f.ClientFor(tenant, Guid.NewGuid(), "Admin"), _f.ClientFor(tenant, Guid.NewGuid(), "Rep", accra), ids);
    }

    [Fact]
    public async Task Compares_completed_visits_with_the_target_and_lists_who_is_overdue_or_never_visited()
    {
        var (admin, _, ids) = await Setup();
        var r = await Json(await admin.GetAsync("/api/v1/dashboards/coverage?days=30"));
        Assert.Equal(4, r.GetProperty("customers").GetInt32());                 // E has no target
        Assert.Equal(11.0, r.GetProperty("expectedVisits").GetDouble());        // 4 + 2 + 1 + 4
        Assert.Equal(7, r.GetProperty("completedVisits").GetInt32());           // 3 + 0 (B's visit was 40 days ago) + 0 + 4; the missed one does not count
        Assert.Equal(63.6, r.GetProperty("attainmentPct").GetDouble());         // 7 of 11
        Assert.Equal(2, r.GetProperty("overdue").GetInt32());                   // B (40 days, wanted every 15) and C (never)
        Assert.Equal(1, r.GetProperty("neverVisited").GetInt32());
        var worst = r.GetProperty("worst").EnumerateArray().ToList();
        Assert.Equal("C Pharmacy", worst[0].GetProperty("name").GetString());    // never visited comes first
        Assert.Equal(JsonValueKind.Null, worst[0].GetProperty("daysSince").ValueKind);
        Assert.Equal("B Clinic", worst[1].GetProperty("name").GetString());
        Assert.InRange(worst[1].GetProperty("daysSince").GetInt32(), 39, 41);
        Assert.DoesNotContain(worst, w => w.GetProperty("customerId").GetGuid() == ids[0]); // A is on track
    }

    [Fact]
    public async Task Reports_by_territory_with_the_weakest_first_and_one_over_visited_customer_does_not_hide_the_others()
    {
        var (admin, _, _) = await Setup();
        var t = (await Json(await admin.GetAsync("/api/v1/dashboards/coverage?days=30"))).GetProperty("territories").EnumerateArray().ToList();
        Assert.Equal("Accra Central", t[0].GetProperty("territory").GetString());
        Assert.Equal("Greater Accra", t[0].GetProperty("region").GetString());
        Assert.Equal(3, t[0].GetProperty("customers").GetInt32());
        Assert.Equal(3.0, t[0].GetProperty("completed").GetInt32());
        Assert.Equal(42.9, t[0].GetProperty("attainmentPct").GetDouble());       // 3 of 7
        Assert.Equal(100.0, t[1].GetProperty("attainmentPct").GetDouble());      // Kumasi: 4 of 4
    }

    [Fact]
    public async Task A_longer_period_expects_more_visits_and_the_period_is_limited()
    {
        var (admin, _, _) = await Setup();
        var r = await Json(await admin.GetAsync("/api/v1/dashboards/coverage?days=60"));
        Assert.Equal(22.0, r.GetProperty("expectedVisits").GetDouble());
        Assert.Equal(90, (await Json(await admin.GetAsync("/api/v1/dashboards/coverage?days=900"))).GetProperty("days").GetInt32());
    }

    [Fact]
    public async Task Is_for_managers_only()
    {
        var (_, rep, _) = await Setup();
        Assert.Equal(System.Net.HttpStatusCode.Forbidden, (await rep.GetAsync("/api/v1/dashboards/coverage")).StatusCode);
    }
}
