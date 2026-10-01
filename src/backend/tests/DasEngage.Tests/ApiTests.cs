using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using DasEngage.Api;
using DasEngage.Domain;
using DasEngage.Infrastructure;
using Microsoft.Extensions.DependencyInjection;

namespace DasEngage.Tests;

public class ApiTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _f;
    private static readonly Guid T1 = Guid.NewGuid(), T2 = Guid.NewGuid();
    private static readonly Guid Rep1 = Guid.NewGuid(), Rep2 = Guid.NewGuid(), Terr1 = Guid.NewGuid(), Terr2 = Guid.NewGuid();

    public ApiTests(ApiFactory f) => _f = f;

    private static CustomerDto Cust(string name, Guid? terr, double? lat = null, double? lng = null) =>
        new(null, CustomerType.Doctor, name, "Cardiology", Segment.A, terr, null, null, null, null, "Accra", lat, lng, 2, null);

    private async Task<Guid> CreateCustomer(HttpClient c, CustomerDto d)
    {
        var r = await c.PostAsJsonAsync("/api/v1/customers", d);
        r.EnsureSuccessStatusCode();
        return (await r.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
    }

    [Fact]
    public async Task Unauthenticated_requests_are_rejected()
    {
        var r = await _f.CreateClient().GetAsync("/api/v1/customers");
        Assert.Equal(HttpStatusCode.Unauthorized, r.StatusCode);
    }

    [Fact]
    public async Task Health_is_anonymous()
        => Assert.Equal(HttpStatusCode.OK, (await _f.CreateClient().GetAsync("/health")).StatusCode);

    [Fact]
    public async Task Tenants_cannot_see_each_others_customers()
    {
        var a = _f.ClientFor(T1, Guid.NewGuid(), "AreaManager");
        var b = _f.ClientFor(T2, Guid.NewGuid(), "AreaManager");
        var id = await CreateCustomer(a, Cust("Dr Tenant One", null));
        Assert.Equal(HttpStatusCode.NotFound, (await b.GetAsync($"/api/v1/customers/{id}")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await a.GetAsync($"/api/v1/customers/{id}")).StatusCode);
    }

    [Fact]
    public async Task Reps_only_see_customers_in_their_territory()
    {
        var mgr = _f.ClientFor(T1, Guid.NewGuid(), "AreaManager");
        var mine = await CreateCustomer(mgr, Cust("In territory", Terr1));
        var other = await CreateCustomer(mgr, Cust("Elsewhere", Terr2));
        var rep = _f.ClientFor(T1, Rep1, "Rep", Terr1);
        Assert.Equal(HttpStatusCode.OK, (await rep.GetAsync($"/api/v1/customers/{mine}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await rep.GetAsync($"/api/v1/customers/{other}")).StatusCode);
    }

    [Fact]
    public async Task Reps_cannot_delete_customers()
    {
        var mgr = _f.ClientFor(T1, Guid.NewGuid(), "AreaManager");
        var id = await CreateCustomer(mgr, Cust("Keep me", Terr1));
        var rep = _f.ClientFor(T1, Rep1, "Rep", Terr1);
        Assert.Equal(HttpStatusCode.Forbidden, (await rep.DeleteAsync($"/api/v1/customers/{id}")).StatusCode);
    }

    [Fact]
    public async Task CheckIn_flags_geofence_and_is_idempotent()
    {
        var mgr = _f.ClientFor(T1, Guid.NewGuid(), "AreaManager");
        var cust = await CreateCustomer(mgr, Cust("Korle Bu", Terr1, 5.5365, -0.2271));
        var rep = _f.ClientFor(T1, Rep1, "Rep", Terr1);
        var visitId = Guid.NewGuid();

        var near = new CheckInDto(visitId, cust, null, null, 5.5366, -0.2272, 10);
        var r1 = await (await rep.PostAsJsonAsync("/api/v1/visits/check-in", near)).Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(r1.GetProperty("geofenceOk").GetBoolean());

        // retry with the same VisitId returns the same row
        var r2 = await (await rep.PostAsJsonAsync("/api/v1/visits/check-in", near)).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(visitId, r2.GetProperty("id").GetGuid());

        var far = new CheckInDto(null, cust, null, null, 5.7, -0.4, 10);
        var r3 = await (await rep.PostAsJsonAsync("/api/v1/visits/check-in", far)).Content.ReadFromJsonAsync<JsonElement>();
        Assert.False(r3.GetProperty("geofenceOk").GetBoolean());
    }

    [Fact]
    public async Task Full_visit_flow_via_sync_push_and_pull()
    {
        var mgr = _f.ClientFor(T1, Guid.NewGuid(), "AreaManager");
        var cust = await CreateCustomer(mgr, Cust("Sync Clinic", Terr1));
        var rep = _f.ClientFor(T1, Rep1, "Rep", Terr1);

        var visitId = Guid.NewGuid();
        var push = new SyncPushRequest(
            new() { new CheckInOp(visitId, new CheckInDto(null, cust, null, DateTime.UtcNow.AddMinutes(-20), null, null, null), new CheckOutDto(DateTime.UtcNow, null, null)) },
            new() { new CallReportOp(new CallReportDto(Guid.NewGuid(), visitId, "Discussed product", "Positive", "Send samples", null, null)) },
            new() { new TaskDto(null, null, cust, null, "Follow up in 2 weeks", DateOnly.FromDateTime(DateTime.UtcNow.AddDays(14))) },
            new() { new GpsPingDto(null, DateTime.UtcNow, 5.6, -0.2, 12) });
        for (var i = 0; i < 2; i++) // retry must not duplicate
        {
            var res = await rep.PostAsJsonAsync("/api/v1/sync/push", push);
            res.EnsureSuccessStatusCode();
            Assert.True((await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("ok").GetBoolean());
        }

        var reports = await rep.GetFromJsonAsync<JsonElement>("/api/v1/call-reports");
        Assert.Single(reports.EnumerateArray().Where(r => r.GetProperty("visitId").GetGuid() == visitId));

        var pull = await rep.GetFromJsonAsync<JsonElement>("/api/v1/sync/pull?since=0");
        Assert.Contains(pull.GetProperty("customers").EnumerateArray(), c => c.GetProperty("id").GetGuid() == cust);

        var from = Uri.EscapeDataString(DateTime.UtcNow.AddDays(-1).ToString("O"));
        var to = Uri.EscapeDataString(DateTime.UtcNow.AddDays(1).ToString("O"));
        var dash = await rep.GetFromJsonAsync<JsonElement>($"/api/v1/dashboards/sales?from={from}&to={to}");
        Assert.Equal(1, dash.GetProperty("callsCompleted").GetInt32());
    }

    [Fact]
    public async Task Audit_log_is_hash_chained()
    {
        var mgr = _f.ClientFor(T2, Guid.NewGuid(), "Admin");
        await CreateCustomer(mgr, Cust("Audit A", null));
        await CreateCustomer(mgr, Cust("Audit B", null));
        var logs = (await mgr.GetFromJsonAsync<JsonElement>("/api/v1/admin/audit-logs")).EnumerateArray()
            .OrderBy(l => l.GetProperty("id").GetInt64()).ToList();
        Assert.True(logs.Count >= 2);
        for (var i = 1; i < logs.Count; i++)
            Assert.Equal(logs[i - 1].GetProperty("hash").GetString(), logs[i].GetProperty("prevHash").GetString());
    }

    [Fact]
    public void Haversine_is_reasonable()
    {
        // Accra to Kumasi is roughly 200 km.
        var d = Geo.DistanceMeters(5.6037, -0.1870, 6.6885, -1.6244);
        Assert.InRange(d, 190_000, 210_000);
        Assert.Equal(0, Geo.DistanceMeters(5, 5, 5, 5), 3);
    }
}
