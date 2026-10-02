using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using DasEngage.Api;
using DasEngage.Domain;

namespace DasEngage.Tests;

public class RtmTests : IClassFixture<ErpFactory>
{
    private readonly ErpFactory _f;
    public RtmTests(ErpFactory f) => _f = f;

    private record Ctx(Guid Tenant, HttpClient Admin, Guid Accra, Guid Ashanti, Guid[] Customers);

    private static string Range => $"from={DateTime.UtcNow.AddDays(-30):yyyy-MM-dd}&to={DateTime.UtcNow.AddDays(1):yyyy-MM-dd}";
    private static async Task<JsonElement> Json(HttpResponseMessage r) { r.EnsureSuccessStatusCode(); return await r.Content.ReadFromJsonAsync<JsonElement>(); }

    /// <summary>Five outlets: three in Greater Accra (one visited, one bought, one neither), two in Ashanti; plus a doctor, who is not an outlet.</summary>
    private async Task<Ctx> Setup()
    {
        var tenant = Guid.NewGuid(); var accra = Guid.NewGuid(); var ashanti = Guid.NewGuid();
        var ids = Enumerable.Range(0, 6).Select(_ => Guid.NewGuid()).ToArray();
        await using (var db = _f.Db(tenant))
        {
            db.Tenants.Add(new Tenant { Id = tenant, Name = "T" + tenant });
            db.Territories.AddRange(new Territory { Id = accra, Name = "Accra Central", Region = "Greater Accra" }, new Territory { Id = ashanti, Name = "Kumasi", Region = "Ashanti" });
            db.Customers.AddRange(
                new Customer { Id = ids[0], Name = "Ernest Chemists", Type = CustomerType.Pharmacy, TerritoryId = accra, Channel = SalesChannel.VanSales, OutletClass = OutletClass.IndependentPharmacy },
                new Customer { Id = ids[1], Name = "Korle Bu", Type = CustomerType.Hospital, TerritoryId = accra, Channel = SalesChannel.MedicalSales, OutletClass = OutletClass.TeachingHospital },
                new Customer { Id = ids[2], Name = "Quiet Pharmacy", Type = CustomerType.Pharmacy, TerritoryId = accra },
                new Customer { Id = ids[3], Name = "Kumasi Wholesale", Type = CustomerType.Pharmacy, TerritoryId = ashanti, Channel = SalesChannel.Distributor, OutletClass = OutletClass.PharmacyChain },
                new Customer { Id = ids[4], Name = "No Area Shop", Type = CustomerType.Pharmacy },
                new Customer { Id = ids[5], Name = "Dr Ama", Type = CustomerType.Doctor, TerritoryId = accra });
            db.Visits.Add(new Visit { RepId = Guid.NewGuid(), CustomerId = ids[0], CheckInAt = DateTime.UtcNow.AddDays(-2) });
            db.Visits.Add(new Visit { RepId = Guid.NewGuid(), CustomerId = ids[5], CheckInAt = DateTime.UtcNow.AddDays(-2) }); // a doctor: not an outlet
            db.SalesFacts.Add(new SalesFact { ExternalId = "S1", DocumentNumber = "INV1", SaleDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-3)), AccountCode = "A", CustomerId = ids[1], ItemCode = "X", NetAmount = 900 });
            db.SalesFacts.Add(new SalesFact { ExternalId = "S2", DocumentNumber = "INV2", SaleDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-3)), AccountCode = "B", CustomerId = ids[3], ItemCode = "X", NetAmount = 100 });
            await db.SaveChangesAsync();
        }
        return new Ctx(tenant, _f.ClientFor(tenant, Guid.NewGuid(), "Admin"), accra, ashanti, ids);
    }

    private static Task<HttpResponseMessage> PutUniverse(HttpClient c, params UniverseRow[] rows) => c.PutAsJsonAsync("/api/v1/rtm/universe", rows);

    [Fact]
    public async Task Without_a_market_size_it_still_shows_what_is_mapped_and_reached_but_no_percentages()
    {
        var c = await Setup();
        var r = await Json(await c.Admin.GetAsync($"/api/v1/dashboards/rtm?{Range}"));
        Assert.False(r.GetProperty("hasUniverse").GetBoolean());
        Assert.Equal(JsonValueKind.Null, r.GetProperty("mappedPct").ValueKind);
        Assert.Equal(5, r.GetProperty("mapped").GetInt32());   // five outlets; the doctor does not count
        Assert.Equal(3, r.GetProperty("reached").GetInt32());  // one visited (Ernest) + two bought (Korle Bu, Kumasi Wholesale)
        Assert.Equal(1000m, r.GetProperty("revenue").GetDecimal());
    }

    [Fact]
    public async Task Compares_what_is_reached_with_the_size_of_the_market_by_kind_of_outlet_and_region()
    {
        var c = await Setup();
        (await PutUniverse(c.Admin,
            new UniverseRow(null, OutletClass.IndependentPharmacy, 20, "Sales estimate"),
            new UniverseRow("Greater Accra", OutletClass.TeachingHospital, 2, null),
            new UniverseRow(null, OutletClass.PharmacyChain, 5, null))).EnsureSuccessStatusCode();

        var r = await Json(await c.Admin.GetAsync($"/api/v1/dashboards/rtm?{Range}"));
        Assert.True(r.GetProperty("hasUniverse").GetBoolean());
        Assert.Equal(27, r.GetProperty("universeTotal").GetInt32());
        Assert.Equal(18.5, r.GetProperty("mappedPct").GetDouble());  // 5 of 27
        Assert.Equal(11.1, r.GetProperty("reachedPct").GetDouble()); // 3 of 27

        var classes = r.GetProperty("classes").EnumerateArray().ToDictionary(x => x.GetProperty("outletClass").GetString()!);
        var indep = classes["IndependentPharmacy"];
        Assert.Equal(20, indep.GetProperty("universe").GetInt32());
        Assert.Equal(1, indep.GetProperty("mapped").GetInt32());
        Assert.Equal(1, indep.GetProperty("reached").GetInt32());
        Assert.Equal(2, classes["Unclassified"].GetProperty("mapped").GetInt32()); // the two outlets nobody has classified yet
        Assert.Equal(JsonValueKind.Null, classes["Unclassified"].GetProperty("universe").ValueKind); // no estimate for them, which is not the same as zero

        var channels = r.GetProperty("channels").EnumerateArray().ToDictionary(x => x.GetProperty("channel").GetString()!);
        Assert.Equal(900m, channels["MedicalSales"].GetProperty("revenue").GetDecimal());
        Assert.Equal(2, channels["Unassigned"].GetProperty("customers").GetInt32());

        var regions = r.GetProperty("regions").EnumerateArray().ToDictionary(x => x.GetProperty("region").GetString()!);
        Assert.Equal(2, regions["Greater Accra"].GetProperty("universe").GetInt32());
        Assert.Equal(3, regions["Greater Accra"].GetProperty("mapped").GetInt32());
        Assert.Equal(1, regions["Ashanti"].GetProperty("mapped").GetInt32());
        Assert.Equal(1, regions["No region"].GetProperty("mapped").GetInt32());

        var tagging = r.GetProperty("tagging");
        Assert.Equal(2, tagging.GetProperty("noChannel").GetInt32());
        Assert.Equal(2, tagging.GetProperty("noClass").GetInt32());
        Assert.Equal(1, tagging.GetProperty("noRegion").GetInt32());
    }

    [Fact]
    public async Task Revenue_concentration_needs_enough_buyers_to_mean_anything()
    {
        var c = await Setup();
        Assert.Equal(JsonValueKind.Null, (await Json(await c.Admin.GetAsync($"/api/v1/dashboards/rtm?{Range}"))).GetProperty("top20Share").ValueKind); // two buyers only

        await using (var db = _f.Db(c.Tenant))
        {
            var extra = Enumerable.Range(0, 8).Select(i => new Customer { Name = "Buyer " + i, Type = CustomerType.Pharmacy }).ToList();
            db.Customers.AddRange(extra);
            foreach (var (cu, i) in extra.Select((x, i) => (x, i)))
                db.SalesFacts.Add(new SalesFact { ExternalId = "E" + i, DocumentNumber = "I" + i, SaleDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-1)), AccountCode = "Z" + i, CustomerId = cu.Id, ItemCode = "X", NetAmount = 10 });
            await db.SaveChangesAsync();
        }
        // ten buyers: 900 + 100 + 8 x 10 = 1,080; the top two (20%) bought 1,000, which is 92.6%
        Assert.Equal(92.6, (await Json(await c.Admin.GetAsync($"/api/v1/dashboards/rtm?{Range}"))).GetProperty("top20Share").GetDouble());
    }

    [Fact]
    public async Task Only_national_leaders_set_the_market_size_and_bad_rows_are_refused()
    {
        var c = await Setup();
        Assert.Equal(HttpStatusCode.Forbidden, (await PutUniverse(_f.ClientFor(c.Tenant, Guid.NewGuid(), "AreaManager", c.Accra), new UniverseRow(null, OutletClass.OtcShop, 5, null))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await PutUniverse(_f.ClientFor(c.Tenant, Guid.NewGuid(), "Rep", c.Accra), new UniverseRow(null, OutletClass.OtcShop, 5, null))).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await PutUniverse(_f.ClientFor(c.Tenant, Guid.NewGuid(), "NationalSalesManager"), new UniverseRow(null, OutletClass.OtcShop, 5, null))).StatusCode);

        Assert.Equal(HttpStatusCode.BadRequest, (await PutUniverse(c.Admin, new UniverseRow(null, OutletClass.Unclassified, 5, null))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await PutUniverse(c.Admin, new UniverseRow(null, OutletClass.OtcShop, -1, null))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await PutUniverse(c.Admin, new UniverseRow(" ghana ", OutletClass.OtcShop, 1, null), new UniverseRow("GHANA", OutletClass.OtcShop, 2, null))).StatusCode);
    }

    [Fact]
    public async Task Saving_the_market_size_replaces_the_list_and_keeps_the_region_as_typed()
    {
        var c = await Setup();
        (await PutUniverse(c.Admin, new UniverseRow("Greater Accra", OutletClass.OtcShop, 100, "Estimate"), new UniverseRow(null, OutletClass.PharmacyChain, 8, null))).EnsureSuccessStatusCode();
        (await PutUniverse(c.Admin, new UniverseRow(" greater accra ", OutletClass.OtcShop, 120, null))).EnsureSuccessStatusCode(); // same row, edited; the chain row is left out so it goes

        var rows = await c.Admin.GetFromJsonAsync<JsonElement>("/api/v1/rtm/universe");
        var only = Assert.Single(rows.EnumerateArray());
        Assert.Equal("greater accra", only.GetProperty("region").GetString());
        Assert.Equal(120, only.GetProperty("outlets").GetInt32());
    }

    [Fact]
    public async Task A_manager_sees_only_their_own_area_and_no_national_comparison()
    {
        var c = await Setup();
        (await PutUniverse(c.Admin, new UniverseRow(null, OutletClass.IndependentPharmacy, 20, null))).EnsureSuccessStatusCode();
        var am = _f.ClientFor(c.Tenant, Guid.NewGuid(), "AreaManager", c.Accra);

        var r = await Json(await am.GetAsync($"/api/v1/dashboards/rtm?{Range}"));
        Assert.Equal(3, r.GetProperty("mapped").GetInt32()); // the three Accra outlets only
        Assert.True(r.GetProperty("universeScoped").GetBoolean());
        Assert.Equal(JsonValueKind.Null, r.GetProperty("universeTotal").ValueKind);
        Assert.Equal(JsonValueKind.Null, r.GetProperty("reachedPct").ValueKind);
    }

    [Fact]
    public async Task Outlets_are_tagged_one_by_one_inside_the_persons_area_and_drop_off_the_to_do_list()
    {
        var c = await Setup();
        var todo = await Json(await c.Admin.GetAsync("/api/v1/rtm/untagged"));
        Assert.Equal(2, todo.GetProperty("total").GetInt32()); // Quiet Pharmacy and No Area Shop

        var am = _f.ClientFor(c.Tenant, Guid.NewGuid(), "AreaManager", c.Accra);
        Assert.Equal(1, (await Json(await am.GetAsync("/api/v1/rtm/untagged"))).GetProperty("total").GetInt32()); // not the outlet with no area
        Assert.Equal(HttpStatusCode.NotFound, (await am.PutAsJsonAsync($"/api/v1/rtm/customers/{c.Customers[3]}", new RtmTagDto(SalesChannel.VanSales, OutletClass.OtcShop))).StatusCode); // Ashanti
        Assert.Equal(HttpStatusCode.BadRequest, (await c.Admin.PutAsJsonAsync($"/api/v1/rtm/customers/{c.Customers[2]}", new { channel = "Nonsense", outletClass = "OtcShop" })).StatusCode);

        Assert.Equal(HttpStatusCode.NoContent, (await am.PutAsJsonAsync($"/api/v1/rtm/customers/{c.Customers[2]}", new RtmTagDto(SalesChannel.VanSales, OutletClass.OtcShop))).StatusCode);
        Assert.Equal(1, (await Json(await c.Admin.GetAsync("/api/v1/rtm/untagged"))).GetProperty("total").GetInt32());

        Assert.Equal(HttpStatusCode.Forbidden, (await _f.ClientFor(c.Tenant, Guid.NewGuid(), "Rep", c.Accra).PutAsJsonAsync($"/api/v1/rtm/customers/{c.Customers[2]}", new RtmTagDto(SalesChannel.WalkIn, OutletClass.OtcShop))).StatusCode);
    }

    [Fact]
    public async Task Another_company_never_sees_this_ones_outlets_or_market_size()
    {
        var c = await Setup();
        (await PutUniverse(c.Admin, new UniverseRow(null, OutletClass.OtcShop, 50, null))).EnsureSuccessStatusCode();
        var otherTenant = Guid.NewGuid();
        await using (var db = _f.Db(otherTenant)) { db.Tenants.Add(new Tenant { Id = otherTenant, Name = "Other" }); await db.SaveChangesAsync(); }
        var other = _f.ClientFor(otherTenant, Guid.NewGuid(), "Admin");
        var r = await Json(await other.GetAsync($"/api/v1/dashboards/rtm?{Range}"));
        Assert.Equal(0, r.GetProperty("mapped").GetInt32());
        Assert.False(r.GetProperty("hasUniverse").GetBoolean());
    }
}
