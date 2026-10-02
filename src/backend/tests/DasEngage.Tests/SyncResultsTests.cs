using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using DasEngage.Api;
using DasEngage.Domain;

namespace DasEngage.Tests;

/// <summary>What a phone can push (customers, planned visits, notice reads), per-item results, and remote wipe.</summary>
public class SyncResultsTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _f;
    public SyncResultsTests(ApiFactory f) => _f = f;

    private record Org(Guid Tenant, HttpClient Admin, Guid Terr, Guid OtherTerr, Guid RepId, HttpClient Rep);

    private async Task<Org> Build()
    {
        var tenant = Guid.NewGuid();
        var admin = _f.ClientFor(tenant, Guid.NewGuid(), "Admin");
        async Task<Guid> Territory(string n) => (await (await admin.PostAsJsonAsync("/api/v1/admin/territories", new TerritoryDto(null, n + tenant, null, null))).Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        var terr = await Territory("A"); var other = await Territory("B");
        var areaId = Guid.NewGuid(); var repId = Guid.NewGuid();
        (await admin.PostAsJsonAsync("/api/v1/admin/users", new UserDto(areaId, "e-" + areaId, "Area", "a@x.test", UserRole.AreaManager, null, terr))).EnsureSuccessStatusCode();
        (await admin.PostAsJsonAsync("/api/v1/admin/users", new UserDto(repId, "e-" + repId, "Rep", "r@x.test", UserRole.Rep, areaId, terr))).EnsureSuccessStatusCode();
        return new Org(tenant, admin, terr, other, repId, _f.ClientFor(tenant, repId, "Rep", terr));
    }

    private static CustomerDto Cust(Guid id, string name, Guid? terr, int visits = 2) =>
        new(id, CustomerType.Pharmacy, name, null, Segment.Unclassified, terr, null, "0240000000", null, "1 Main St", "Accra", 5.6, -0.2, visits, null);

    private static async Task<JsonElement> Push(HttpClient c, SyncPushRequest req)
    {
        var r = await c.PostAsJsonAsync("/api/v1/sync/push", req);
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<JsonElement>();
    }

    private static SyncPushRequest Only(List<CustomerDto>? customers = null, List<PlannedVisitOp>? planned = null, List<CheckInOp>? checkIns = null,
        List<CallReportOp>? reports = null, List<TaskDto>? tasks = null, List<Guid>? reads = null) =>
        new(checkIns, reports, tasks, null, null, null, customers, planned, reads);

    private static JsonElement Result(JsonElement res, string list, Guid id) => res.GetProperty(list).EnumerateArray().Single(x => x.GetProperty("id").GetGuid() == id);
    private static string Status(JsonElement res, string list, Guid id) => Result(res, list, id).GetProperty("status").GetString()!;

    [Fact]
    public async Task One_refused_item_never_blocks_the_rest_and_each_item_gets_its_own_result()
    {
        var o = await Build();
        var good = (await (await o.Admin.PostAsJsonAsync("/api/v1/customers", Cust(Guid.NewGuid(), "Real", o.Terr))).Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        var goodVisit = Guid.NewGuid(); var badVisit = Guid.NewGuid(); var orphanReport = Guid.NewGuid();

        var res = await Push(o.Rep, Only(
            checkIns: new()
            {
                new CheckInOp(badVisit, new CheckInDto(null, Guid.NewGuid(), null, null, null, null, null), null),   // customer does not exist
                new CheckInOp(goodVisit, new CheckInDto(null, good, null, null, null, null, null), null),
            },
            reports: new() { new CallReportOp(new CallReportDto(orphanReport, Guid.NewGuid(), "x", null, null, null, null)) },
            tasks: new() { new TaskDto(Guid.NewGuid(), null, good, null, "Follow up", null) }));

        Assert.Equal("rejected", Status(res, "checkIns", badVisit));
        Assert.Contains("not available", Result(res, "checkIns", badVisit).GetProperty("reason").GetString());
        Assert.Equal("accepted", Status(res, "checkIns", goodVisit));
        Assert.Equal("rejected", Status(res, "callReports", orphanReport));
        Assert.Equal("accepted", res.GetProperty("tasks").EnumerateArray().Single().GetProperty("status").GetString());
        Assert.False(res.GetProperty("ok").GetBoolean()); // older clients still see the batch had a problem
    }

    [Fact]
    public async Task A_rep_can_add_and_edit_customers_in_their_own_territory_and_the_phone_can_resend_safely()
    {
        var o = await Build();
        var id = Guid.NewGuid();
        var created = await Push(o.Rep, Only(customers: new() { Cust(id, "New Pharmacy", o.OtherTerr) })); // territory is forced to the rep's own
        Assert.Equal("accepted", Status(created, "customers", id));
        await Push(o.Rep, Only(customers: new() { Cust(id, "New Pharmacy", o.OtherTerr) })); // resend: no duplicate

        var all = await o.Rep.GetFromJsonAsync<JsonElement>("/api/v1/sync/pull?since=0");
        var c = Assert.Single(all.GetProperty("customers").EnumerateArray().Where(x => x.GetProperty("id").GetGuid() == id).ToList()); // once, not twice
        Assert.Equal(o.Terr, c.GetProperty("territoryId").GetGuid());

        var move = await Push(o.Rep, Only(customers: new() { Cust(id, "New Pharmacy Ltd", o.OtherTerr, visits: 6) })); // asks to move it to another territory
        Assert.Equal("rejected", Status(move, "customers", id));
        var edited = await Push(o.Rep, Only(customers: new() { Cust(id, "New Pharmacy Ltd", o.Terr, visits: 6) }));
        Assert.Equal("accepted", Status(edited, "customers", id));
        var again = (await o.Admin.GetFromJsonAsync<JsonElement>($"/api/v1/customers/{id}")).GetProperty("customer");
        Assert.Equal("New Pharmacy Ltd", again.GetProperty("name").GetString());
        Assert.Equal(6, again.GetProperty("targetVisitsPerMonth").GetInt32());
        Assert.Equal(o.Terr, again.GetProperty("territoryId").GetGuid());
    }

    [Fact]
    public async Task A_rep_cannot_change_a_customer_in_another_territory_and_bad_customers_are_refused()
    {
        var o = await Build();
        var theirs = (await (await o.Admin.PostAsJsonAsync("/api/v1/customers", Cust(Guid.NewGuid(), "Elsewhere", o.OtherTerr))).Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        var res = await Push(o.Rep, Only(customers: new()
        {
            Cust(theirs, "Hijacked", o.Terr),
            Cust(Guid.NewGuid(), " ", o.Terr),
            Cust(Guid.NewGuid(), "Too busy", o.Terr, visits: 99),
            Cust(Guid.Empty, "No id", o.Terr) with { Id = null },
        }));
        var results = res.GetProperty("customers").EnumerateArray().ToList();
        Assert.Equal(4, results.Count);
        Assert.All(results, r => Assert.Equal("rejected", r.GetProperty("status").GetString()));
        Assert.Contains("not in your territory", results[0].GetProperty("reason").GetString());
        Assert.Equal("Elsewhere", (await o.Admin.GetFromJsonAsync<JsonElement>($"/api/v1/customers/{theirs}")).GetProperty("customer").GetProperty("name").GetString());
    }

    [Fact]
    public async Task A_new_customer_a_planned_visit_and_the_visit_itself_can_arrive_in_one_push()
    {
        var o = await Build();
        var cust = Guid.NewGuid(); var plan = Guid.NewGuid(); var visit = Guid.NewGuid();
        var day = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(1));
        var res = await Push(o.Rep, Only(
            customers: new() { Cust(cust, "Offline Clinic", o.Terr) },
            planned: new() { new PlannedVisitOp(plan, cust, day, 1, "Introduce range") },
            checkIns: new() { new CheckInOp(visit, new CheckInDto(null, cust, plan, null, null, null, null), null) }));
        Assert.Equal("accepted", Status(res, "customers", cust));
        Assert.Equal("accepted", Status(res, "plannedVisits", plan));
        Assert.Equal("accepted", Status(res, "checkIns", visit));

        var pull = await o.Rep.GetFromJsonAsync<JsonElement>("/api/v1/sync/pull?since=0");
        var pv = pull.GetProperty("plannedVisits").EnumerateArray().Single(p => p.GetProperty("id").GetGuid() == plan);
        Assert.Equal("InProgress", pv.GetProperty("status").GetString());
        Assert.Equal("Introduce range", pv.GetProperty("objective").GetString());
    }

    [Fact]
    public async Task Planned_visits_are_idempotent_can_be_cancelled_and_refuse_unknown_customers_or_other_reps_plans()
    {
        var o = await Build();
        var cust = (await (await o.Admin.PostAsJsonAsync("/api/v1/customers", Cust(Guid.NewGuid(), "C", o.Terr))).Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        var plan = Guid.NewGuid();
        var day = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(2));
        await Push(o.Rep, Only(planned: new() { new PlannedVisitOp(plan, cust, day, 1, null) }));
        await Push(o.Rep, Only(planned: new() { new PlannedVisitOp(plan, cust, day, 1, null) }));
        var from = day.ToString("yyyy-MM-dd");
        var rows = await o.Rep.GetFromJsonAsync<JsonElement>($"/api/v1/planned-visits?from={from}&to={from}");
        Assert.Single(rows.EnumerateArray().ToList());

        await Push(o.Rep, Only(planned: new() { new PlannedVisitOp(plan, cust, day, 1, null, Cancelled: true) }));
        var pull = await o.Rep.GetFromJsonAsync<JsonElement>("/api/v1/sync/pull?since=0");
        Assert.Equal("Cancelled", pull.GetProperty("plannedVisits").EnumerateArray().Single(p => p.GetProperty("id").GetGuid() == plan).GetProperty("status").GetString());

        var unknown = Guid.NewGuid();
        var res = await Push(o.Rep, Only(planned: new() { new PlannedVisitOp(unknown, Guid.NewGuid(), day, 1, null) }));
        Assert.Equal("rejected", Status(res, "plannedVisits", unknown));

        // someone else's plan cannot be touched
        var other = _f.ClientFor(o.Tenant, Guid.NewGuid(), "Rep", o.Terr);
        var theft = await Push(other, Only(planned: new() { new PlannedVisitOp(plan, cust, day, 1, null, Cancelled: true) }));
        Assert.Equal("rejected", Status(theft, "plannedVisits", plan));
    }

    [Fact]
    public async Task Notices_read_on_the_phone_are_marked_read_on_the_server()
    {
        var o = await Build();
        var product = (await (await o.Admin.PostAsJsonAsync("/api/v1/admin/products", new Product { Name = "Amoxil" })).Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        var batch = (await (await o.Admin.PostAsJsonAsync("/api/v1/samples/batches", new BatchDto(null, product, "B1", DateOnly.FromDateTime(DateTime.UtcNow.AddDays(200))))).Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        (await o.Admin.PostAsJsonAsync("/api/v1/samples/receipts", new ReceiptDto(batch, 50, null))).EnsureSuccessStatusCode();
        var req = Guid.NewGuid();
        (await o.Rep.PostAsJsonAsync("/api/v1/samples/requests", new RequestDto(req, product, 10, null))).EnsureSuccessStatusCode();
        (await o.Admin.PostAsJsonAsync($"/api/v1/samples/requests/{req}/approve", new DecisionDto(null, null))).EnsureSuccessStatusCode();
        (await o.Admin.PostAsJsonAsync($"/api/v1/samples/requests/{req}/fulfil", new FulfilDto(null))).EnsureSuccessStatusCode();
        (await o.Admin.PostAsJsonAsync($"/api/v1/samples/batches/{batch}/status", new BatchStatusDto("Recalled", "Defect"))).EnsureSuccessStatusCode();

        var pull = await o.Rep.GetFromJsonAsync<JsonElement>("/api/v1/sync/pull?since=0");
        var id = Assert.Single(pull.GetProperty("notifications").EnumerateArray().ToList()).GetProperty("id").GetGuid();
        await Push(o.Rep, Only(reads: new() { id, Guid.NewGuid() })); // an unknown id is ignored
        Assert.Empty((await o.Rep.GetFromJsonAsync<JsonElement>("/api/v1/sync/pull?since=0")).GetProperty("notifications").EnumerateArray());
    }

    [Fact]
    public async Task A_remote_wipe_reaches_the_device_once_and_stops_when_it_confirms()
    {
        var o = await Build();
        Assert.False((await o.Rep.GetFromJsonAsync<JsonElement>("/api/v1/sync/pull?since=0")).GetProperty("wipe").GetBoolean());

        Assert.Equal(HttpStatusCode.Forbidden, (await o.Rep.PostAsync($"/api/v1/admin/users/{o.RepId}/wipe-device", null)).StatusCode); // only administrators
        Assert.Equal(HttpStatusCode.NotFound, (await o.Admin.PostAsync($"/api/v1/admin/users/{Guid.NewGuid()}/wipe-device", null)).StatusCode);
        (await o.Admin.PostAsync($"/api/v1/admin/users/{o.RepId}/wipe-device", null)).EnsureSuccessStatusCode();
        Assert.True((await o.Rep.GetFromJsonAsync<JsonElement>("/api/v1/sync/pull?since=0")).GetProperty("wipe").GetBoolean());

        Assert.Equal(HttpStatusCode.NoContent, (await o.Rep.PostAsync("/api/v1/sync/wiped", null)).StatusCode);
        Assert.False((await o.Rep.GetFromJsonAsync<JsonElement>("/api/v1/sync/pull?since=0")).GetProperty("wipe").GetBoolean());

        // a request can be withdrawn before the phone syncs
        (await o.Admin.PostAsync($"/api/v1/admin/users/{o.RepId}/wipe-device", null)).EnsureSuccessStatusCode();
        (await o.Admin.PostAsync($"/api/v1/admin/users/{o.RepId}/wipe-device?wipe=false", null)).EnsureSuccessStatusCode();
        Assert.False((await o.Rep.GetFromJsonAsync<JsonElement>("/api/v1/sync/pull?since=0")).GetProperty("wipe").GetBoolean());
    }
}
