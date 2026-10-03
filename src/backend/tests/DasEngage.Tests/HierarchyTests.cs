using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using DasEngage.Api;
using DasEngage.Domain;

namespace DasEngage.Tests;

public class HierarchyTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _f;
    public HierarchyTests(ApiFactory f) => _f = f;

    private record Org(Guid Tenant, HttpClient Admin, Guid Nsm, Guid Regional, Guid AreaA, Guid AreaB, Guid RepA1, Guid RepA2, Guid RepB1,
        Guid TerrA, Guid TerrB);

    private async Task<Guid> NewUser(HttpClient admin, string name, UserRole role, Guid? manager, Guid? terr = null)
    {
        var id = Guid.NewGuid();
        var r = await admin.PostAsJsonAsync("/api/v1/admin/users", new UserDto(id, "ext-" + id, name, $"{name}@das.test", role, manager, terr));
        Assert.True(r.IsSuccessStatusCode, $"{name}: {r.StatusCode} {await r.Content.ReadAsStringAsync()}");
        return id;
    }

    private async Task<Guid> NewTerritory(HttpClient admin, string name)
    {
        var r = await admin.PostAsJsonAsync("/api/v1/admin/territories", new TerritoryDto(null, name, "Greater Accra", name));
        r.EnsureSuccessStatusCode();
        return (await r.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
    }

    //   Nsm -> Regional -> AreaA -> RepA1, RepA2
    //                   -> AreaB -> RepB1
    private async Task<Org> BuildOrg()
    {
        var tenant = Guid.NewGuid();
        var admin = _f.ClientFor(tenant, Guid.NewGuid(), "Admin");
        var tA = await NewTerritory(admin, "Accra Central");
        var tB = await NewTerritory(admin, "Kumasi");
        var nsm = await NewUser(admin, "Nsm", UserRole.NationalSalesManager, null);
        var reg = await NewUser(admin, "Regional", UserRole.RegionalManager, nsm);
        var aa = await NewUser(admin, "AreaA", UserRole.AreaManager, reg, tA);
        var ab = await NewUser(admin, "AreaB", UserRole.AreaManager, reg, tB);
        var a1 = await NewUser(admin, "RepA1", UserRole.Rep, aa, tA);
        var a2 = await NewUser(admin, "RepA2", UserRole.Rep, aa, tA);
        var b1 = await NewUser(admin, "RepB1", UserRole.Rep, ab, tB);
        return new Org(tenant, admin, nsm, reg, aa, ab, a1, a2, b1, tA, tB);
    }

    private static async Task<List<Guid>> Ids(HttpResponseMessage r)
    {
        r.EnsureSuccessStatusCode();
        return (await r.Content.ReadFromJsonAsync<JsonElement>()).EnumerateArray().Select(x => x.GetProperty("id").GetGuid()).ToList();
    }

    [Fact]
    public async Task Users_listing_is_scoped_to_the_callers_subtree()
    {
        var o = await BuildOrg();
        var area = _f.ClientFor(o.Tenant, o.AreaA, "AreaManager", o.TerrA);
        var seen = await Ids(await area.GetAsync("/api/v1/admin/users"));
        Assert.Equal(new[] { o.AreaA, o.RepA1, o.RepA2 }.OrderBy(x => x), seen.OrderBy(x => x));

        var regional = _f.ClientFor(o.Tenant, o.Regional, "RegionalManager");
        Assert.Equal(6, (await Ids(await regional.GetAsync("/api/v1/admin/users"))).Count);

        var nsm = _f.ClientFor(o.Tenant, o.Nsm, "NationalSalesManager");
        Assert.Equal(7, (await Ids(await nsm.GetAsync("/api/v1/admin/users"))).Count);

        Assert.Equal(HttpStatusCode.NotFound, (await area.GetAsync($"/api/v1/admin/users/{o.RepB1}")).StatusCode);
        var team = await Ids(await regional.GetAsync($"/api/v1/admin/users/{o.Regional}/team"));
        Assert.Equal(5, team.Count);
    }

    [Fact]
    public async Task Manager_sees_team_visits_but_not_other_teams()
    {
        var o = await BuildOrg();
        var cust = await (await o.Admin.PostAsJsonAsync("/api/v1/customers",
            new CustomerDto(null, CustomerType.Hospital, "Hospital", null, Segment.A, o.TerrA, null, null, null, null, null, null, null, 1, null)))
            .Content.ReadFromJsonAsync<JsonElement>();
        var custId = cust.GetProperty("id").GetGuid();
        foreach (var (rep, terr) in new[] { (o.RepA1, o.TerrA), (o.RepB1, o.TerrB) })
        {
            var c = _f.ClientFor(o.Tenant, rep, "Rep", terr);
            var vid = Guid.NewGuid();
            // Rep B1 is outside the customer's territory, but check-in only needs the customer to exist for the tenant.
            (await c.PostAsJsonAsync("/api/v1/visits/check-in", new CheckInDto(vid, custId, null, null, null, null, null))).EnsureSuccessStatusCode();
        }

        var from = Uri.EscapeDataString(DateTime.UtcNow.AddDays(-1).ToString("O"));
        var to = Uri.EscapeDataString(DateTime.UtcNow.AddDays(1).ToString("O"));
        async Task<int> Count(HttpClient c, string extra = "") =>
            (await c.GetFromJsonAsync<JsonElement>($"/api/v1/visits?from={from}&to={to}{extra}")).GetArrayLength();

        var areaA = _f.ClientFor(o.Tenant, o.AreaA, "AreaManager", o.TerrA);
        var areaB = _f.ClientFor(o.Tenant, o.AreaB, "AreaManager", o.TerrB);
        var regional = _f.ClientFor(o.Tenant, o.Regional, "RegionalManager");
        Assert.Equal(1, await Count(areaA));
        Assert.Equal(1, await Count(areaB));
        Assert.Equal(2, await Count(regional));
        // asking for someone outside the subtree yields nothing rather than leaking data
        Assert.Equal(0, await Count(areaA, $"&repId={o.RepB1}"));
    }

    [Fact]
    public async Task Hierarchy_validation_rejects_bad_structures()
    {
        var o = await BuildOrg();
        var post = (UserDto d) => o.Admin.PostAsJsonAsync("/api/v1/admin/users", d);
        UserDto U(string n, UserRole r, Guid? m) => new(null, "ext-" + Guid.NewGuid(), n, n + "@x.test", r, m, null);

        Assert.Equal(HttpStatusCode.BadRequest, (await post(U("orphan", UserRole.Rep, null))).StatusCode);          // rep needs manager
        Assert.Equal(HttpStatusCode.BadRequest, (await post(U("peer", UserRole.AreaManager, o.AreaA))).StatusCode); // same rank
        Assert.Equal(HttpStatusCode.BadRequest, (await post(U("badmgr", UserRole.Rep, o.RepA1))).StatusCode);      // rep can't manage

        // cycle: make Nsm report to a user in its own subtree
        var nsm = await (await o.Admin.GetAsync($"/api/v1/admin/users/{o.Nsm}")).Content.ReadFromJsonAsync<JsonElement>();
        var cyc = new UserDto(o.Nsm, nsm.GetProperty("externalId").GetString()!, "Nsm", "n@x.test", UserRole.NationalSalesManager, o.Regional, null);
        Assert.Equal(HttpStatusCode.BadRequest, (await o.Admin.PutAsJsonAsync($"/api/v1/admin/users/{o.Nsm}", cyc)).StatusCode);

        // self-manager and duplicate external id
        var self = cyc with { ManagerId = o.Nsm };
        Assert.Equal(HttpStatusCode.BadRequest, (await o.Admin.PutAsJsonAsync($"/api/v1/admin/users/{o.Nsm}", self)).StatusCode);
        var dup = U("dup", UserRole.AreaManager, o.Regional) with { ExternalId = cyc.ExternalId };
        Assert.Equal(HttpStatusCode.Conflict, (await post(dup)).StatusCode);
    }

    [Fact]
    public async Task Only_admins_can_write_users_and_territories()
    {
        var o = await BuildOrg();
        var area = _f.ClientFor(o.Tenant, o.AreaA, "AreaManager", o.TerrA);
        var u = new UserDto(null, "x", "X", "x@x.test", UserRole.Rep, o.AreaA, null);
        Assert.Equal(HttpStatusCode.Forbidden, (await area.PostAsJsonAsync("/api/v1/admin/users", u)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await area.PostAsJsonAsync("/api/v1/admin/territories", new TerritoryDto(null, "T", null, null))).StatusCode);
        var rep = _f.ClientFor(o.Tenant, o.RepA1, "Rep", o.TerrA);
        Assert.Equal(HttpStatusCode.Forbidden, (await rep.GetAsync("/api/v1/admin/users")).StatusCode);
    }

    [Fact]
    public async Task Deactivating_a_manager_requires_reassigning_reports()
    {
        var o = await BuildOrg();
        Assert.Equal(HttpStatusCode.Conflict, (await o.Admin.PostAsync($"/api/v1/admin/users/{o.AreaA}/deactivate", null)).StatusCode);
        // cannot hand Area A's reps to a rep, or to someone in their own team
        Assert.Equal(HttpStatusCode.BadRequest, (await o.Admin.PostAsync($"/api/v1/admin/users/{o.AreaA}/deactivate?reassignTo={o.RepB1}", null)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await o.Admin.PostAsync($"/api/v1/admin/users/{o.AreaA}/deactivate?reassignTo={o.AreaB}", null)).StatusCode);

        var areaB = _f.ClientFor(o.Tenant, o.AreaB, "AreaManager", o.TerrB);
        Assert.Equal(4, (await Ids(await areaB.GetAsync("/api/v1/admin/users"))).Count); // AreaB + 3 reps
    }

    [Fact]
    public async Task Territory_in_use_cannot_be_deleted()
    {
        var o = await BuildOrg();
        Assert.Equal(HttpStatusCode.Conflict, (await o.Admin.DeleteAsync($"/api/v1/admin/territories/{o.TerrA}")).StatusCode);
        var empty = await NewTerritory(o.Admin, "Unused");
        Assert.Equal(HttpStatusCode.NoContent, (await o.Admin.DeleteAsync($"/api/v1/admin/territories/{empty}")).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,
            (await o.Admin.PostAsJsonAsync("/api/v1/admin/territories", new TerritoryDto(null, "Kumasi", null, null))).StatusCode);
    }

    [Fact]
    public async Task Customers_are_scoped_to_managers_territories()
    {
        var o = await BuildOrg();
        async Task<Guid> Make(Guid terr) => (await (await o.Admin.PostAsJsonAsync("/api/v1/customers",
            new CustomerDto(null, CustomerType.Pharmacy, "P" + terr, null, Segment.B, terr, null, null, null, null, null, null, null, 1, null)))
            .Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        var inA = await Make(o.TerrA);
        var inB = await Make(o.TerrB);

        var areaA = _f.ClientFor(o.Tenant, o.AreaA, "AreaManager", o.TerrA);
        Assert.Equal(HttpStatusCode.OK, (await areaA.GetAsync($"/api/v1/customers/{inA}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await areaA.GetAsync($"/api/v1/customers/{inB}")).StatusCode);

        var regional = _f.ClientFor(o.Tenant, o.Regional, "RegionalManager");
        Assert.Equal(HttpStatusCode.OK, (await regional.GetAsync($"/api/v1/customers/{inB}")).StatusCode);

        // a rep cannot edit a customer outside their territory
        var rep = _f.ClientFor(o.Tenant, o.RepA1, "Rep", o.TerrA);
        var edit = new CustomerDto(null, CustomerType.Pharmacy, "Hijack", null, Segment.A, o.TerrA, null, null, null, null, null, null, null, 1, null);
        Assert.Equal(HttpStatusCode.NotFound, (await rep.PutAsJsonAsync($"/api/v1/customers/{inB}", edit)).StatusCode);
    }
}
