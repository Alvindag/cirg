using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using DasEngage.Domain;

namespace DasEngage.Tests;

public class DistributorTests : IClassFixture<ErpFactory>
{
    private readonly ErpFactory _f;
    public DistributorTests(ErpFactory f) => _f = f;

    private record Ctx(HttpClient Admin, HttpClient Rep, HttpClient Area, Guid Distributor, Guid Korle, Guid Quiet, Guid Tenant);

    private static async Task<JsonElement> Json(HttpResponseMessage r) { r.EnsureSuccessStatusCode(); return await r.Content.ReadFromJsonAsync<JsonElement>(); }
    private static string Range => $"from={DateTime.UtcNow.AddDays(-60):yyyy-MM-dd}&to={DateTime.UtcNow.AddDays(1):yyyy-MM-dd}";
    private static string Day(int ago) => DateTime.UtcNow.AddDays(-ago).ToString("yyyy-MM-dd");
    private static Task<HttpResponseMessage> Import(HttpClient c, string csv, bool apply = false) =>
        c.PostAsync($"/api/v1/distributors/sell-out/import?dryRun={(!apply).ToString().ToLower()}", new StringContent(csv, Encoding.UTF8, "text/csv"));

    /// <summary>Distributor "Medipharm Wholesale" (account D1); outlets: Korle Pharmacy (code K1, Accra), Quiet Pharmacy (Accra, nobody visits), and Kumasi Clinic (Ashanti).</summary>
    private async Task<Ctx> Setup()
    {
        var tenant = Guid.NewGuid(); var accra = Guid.NewGuid(); var kumasi = Guid.NewGuid();
        var dist = Guid.NewGuid(); var korle = Guid.NewGuid(); var quiet = Guid.NewGuid(); var clinic = Guid.NewGuid(); var areaUser = Guid.NewGuid();
        await using (var db = _f.Db(tenant))
        {
            db.Tenants.Add(new Tenant { Id = tenant, Name = "T" + tenant });
            db.Territories.AddRange(new Territory { Id = accra, Name = "Accra Central", Region = "Greater Accra" }, new Territory { Id = kumasi, Name = "Kumasi", Region = "Ashanti" });
            db.Customers.AddRange(
                new Customer { Id = dist, Name = "Medipharm Wholesale", Type = CustomerType.Distributor, ErpAccountCode = "D1", TerritoryId = accra },
                new Customer { Id = korle, Name = "Korle Pharmacy", Type = CustomerType.Pharmacy, TerritoryId = accra, ErpAccountCode = "K1" },
                new Customer { Id = quiet, Name = "Quiet Pharmacy", Type = CustomerType.Pharmacy, TerritoryId = accra },
                new Customer { Id = clinic, Name = "Kumasi Clinic", Type = CustomerType.Clinic, TerritoryId = kumasi });
            db.Products.Add(new Product { Name = "Amoxil", Code = "AMX" });
            db.Users.Add(new AppUser { Id = areaUser, ExternalId = "area", FullName = "Area", Email = "a@x.com", Role = UserRole.AreaManager, TerritoryId = accra });
            await db.SaveChangesAsync();
        }
        return new Ctx(_f.ClientFor(tenant, Guid.NewGuid(), "Admin"), _f.ClientFor(tenant, Guid.NewGuid(), "Rep", accra), _f.ClientFor(tenant, areaUser, "AreaManager", accra), dist, korle, quiet, tenant);
    }

    private static string File(params string[] rows) => "distributor,outlet,outlet_code,date,item_code,quantity,net_amount\n" + string.Join("\n", rows) + "\n";

    [Fact]
    public async Task A_file_is_checked_first_and_nothing_is_saved_until_it_is_loaded()
    {
        var c = await Setup();
        var csv = File($"Medipharm Wholesale,Korle Pharmacy,,{Day(5)},AMX,10,100");
        var check = await Json(await Import(c.Admin, csv));
        Assert.True(check.GetProperty("dryRun").GetBoolean());
        Assert.Equal(1, check.GetProperty("created").GetInt32());
        Assert.Equal(0, (await Json(await c.Admin.GetAsync($"/api/v1/dashboards/distributors?{Range}"))).GetProperty("lines").GetInt32());
        await Import(c.Admin, csv, apply: true);
        Assert.Equal(1, (await Json(await c.Admin.GetAsync($"/api/v1/dashboards/distributors?{Range}"))).GetProperty("lines").GetInt32());
    }

    [Fact]
    public async Task Outlets_are_matched_by_code_or_by_name_whatever_the_capitals_and_punctuation_and_the_rest_are_flagged()
    {
        var c = await Setup();
        var r = await Json(await Import(c.Admin, File(
            $"D1,Somebody Else,K1,{Day(5)},AMX,1,10",                     // by distributor account code and outlet code
            $"medipharm wholesale,KORLE  pharmacy!,,{Day(4)},AMX,2,20",   // by name
            $"Medipharm Wholesale,Unknown Chemist,,{Day(3)},AMX,3,30"), apply: true));
        Assert.Equal(3, r.GetProperty("created").GetInt32());
        Assert.Equal(1, r.GetProperty("unmatchedOutlets").GetInt32());
        var d = await Json(await c.Admin.GetAsync($"/api/v1/dashboards/distributors?{Range}"));
        Assert.Equal(60m, d.GetProperty("value").GetDecimal());
        Assert.Equal(1, d.GetProperty("outletsMatched").GetInt32());       // both Korle rows are the same outlet
        Assert.Equal(1, d.GetProperty("outletsUnmatched").GetInt32());
        Assert.Equal("Unknown Chemist", d.GetProperty("unmatched")[0].GetProperty("outlet").GetString());
        Assert.Equal("Medipharm Wholesale", d.GetProperty("distributors")[0].GetProperty("name").GetString());
        Assert.Equal(2, d.GetProperty("distributors")[0].GetProperty("outlets").GetInt32());
    }

    [Fact]
    public async Task Loading_the_same_file_again_changes_nothing_and_a_repeated_row_is_used_once()
    {
        var c = await Setup();
        var csv = File($"Medipharm Wholesale,Korle Pharmacy,,{Day(5)},AMX,10,100", $"Medipharm Wholesale,Korle Pharmacy,,{Day(5)},AMX,10,100");
        var first = await Json(await Import(c.Admin, csv, apply: true));
        Assert.Equal(1, first.GetProperty("created").GetInt32());
        Assert.Equal("duplicate", first.GetProperty("rows")[1].GetProperty("status").GetString());
        var again = await Json(await Import(c.Admin, csv, apply: true));
        Assert.Equal(0, again.GetProperty("created").GetInt32());
        Assert.Equal(1, again.GetProperty("unchanged").GetInt32());
        Assert.Equal(1, (await Json(await c.Admin.GetAsync($"/api/v1/dashboards/distributors?{Range}"))).GetProperty("lines").GetInt32());
    }

    [Fact]
    public async Task A_reference_lets_the_distributor_correct_a_line_later()
    {
        var c = await Setup();
        string Csv(int qty) => "distributor,outlet,date,quantity,net_amount,reference\n" + $"Medipharm Wholesale,Korle Pharmacy,{Day(5)},{qty},{qty * 10},INV-77\n";
        await Import(c.Admin, Csv(10), apply: true);
        var fix = await Json(await Import(c.Admin, Csv(12), apply: true));
        Assert.Equal(1, fix.GetProperty("updated").GetInt32());
        var d = await Json(await c.Admin.GetAsync($"/api/v1/dashboards/distributors?{Range}"));
        Assert.Equal(1, d.GetProperty("lines").GetInt32());
        Assert.Equal(120m, d.GetProperty("value").GetDecimal());
    }

    [Fact]
    public async Task Bad_rows_are_reported_with_their_line_and_good_rows_still_load()
    {
        var c = await Setup();
        var r = await Json(await Import(c.Admin, File(
            $"Nobody Ltd,Korle Pharmacy,,{Day(5)},AMX,1,10",
            $"Medipharm Wholesale,Korle Pharmacy,,not-a-date,AMX,1,10",
            $"Medipharm Wholesale,Korle Pharmacy,,{Day(5)},AMX,many,10",
            $"Medipharm Wholesale,Korle Pharmacy,,{DateTime.UtcNow.AddDays(30):yyyy-MM-dd},AMX,1,10",
            $"Medipharm Wholesale,,,{Day(5)},AMX,1,10",
            $"Medipharm Wholesale,Quiet Pharmacy,,{Day(5)},AMX,1,10"), apply: true));
        Assert.Equal(5, r.GetProperty("errors").GetInt32());
        Assert.Equal(1, r.GetProperty("created").GetInt32());
        Assert.Contains("Unknown distributor", r.GetProperty("rows")[0].GetProperty("message").GetString());
        Assert.Equal(2, r.GetProperty("rows")[0].GetProperty("row").GetInt32());   // line 2 of the file
    }

    [Fact]
    public async Task A_file_with_missing_or_unknown_columns_is_refused()
    {
        var c = await Setup();
        Assert.Equal(HttpStatusCode.BadRequest, (await Import(c.Admin, "distributor,outlet\nA,B\n")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Import(c.Admin, "distributor,outlet,date,quantity,net_amount,colour\nA,B,2026-01-01,1,1,red\n")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Import(c.Admin, "")).StatusCode);
    }

    [Fact]
    public async Task Only_managers_who_may_import_can_load_a_file_and_reps_cannot_see_the_dashboard()
    {
        var c = await Setup();
        Assert.Equal(HttpStatusCode.Forbidden, (await Import(c.Rep, File($"D1,Korle Pharmacy,,{Day(5)},AMX,1,10"))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await c.Rep.GetAsync($"/api/v1/dashboards/distributors?{Range}")).StatusCode);
    }

    [Fact]
    public async Task Shows_which_outlets_are_reached_only_through_a_distributor_and_the_route_to_market_page_counts_them()
    {
        var c = await Setup();
        await using (var db = _f.Db(c.Tenant))
        {
            db.Visits.Add(new Visit { RepId = Guid.NewGuid(), CustomerId = c.Korle, CheckInAt = DateTime.UtcNow.AddDays(-3) });   // DAS visits Korle itself
            await db.SaveChangesAsync();
        }
        await Import(c.Admin, File($"D1,Korle Pharmacy,,{Day(5)},AMX,1,10", $"D1,Quiet Pharmacy,,{Day(5)},AMX,1,10", $"D1,Kumasi Clinic,,{Day(5)},AMX,1,10"), apply: true);
        var d = await Json(await c.Admin.GetAsync($"/api/v1/dashboards/distributors?{Range}"));
        Assert.Equal(3, d.GetProperty("outletsMatched").GetInt32());
        Assert.Equal(2, d.GetProperty("outletsOnlyViaDistributors").GetInt32());     // Quiet and Kumasi Clinic, not Korle
        var rtm = await Json(await c.Admin.GetAsync($"/api/v1/dashboards/rtm?{Range}"));
        Assert.Equal(2, rtm.GetProperty("viaDistributors").GetInt32());
        Assert.Equal(1, rtm.GetProperty("reached").GetInt32());                      // "reached" is unchanged: only Korle, by a visit
    }

    [Fact]
    public async Task A_manager_with_a_limited_area_sees_only_the_outlets_in_that_area()
    {
        var c = await Setup();
        await Import(c.Admin, File($"D1,Korle Pharmacy,,{Day(5)},AMX,1,10", $"D1,Kumasi Clinic,,{Day(5)},AMX,1,50", $"D1,Unknown Chemist,,{Day(5)},AMX,1,70"), apply: true);
        var d = await Json(await c.Area.GetAsync($"/api/v1/dashboards/distributors?{Range}"));
        Assert.True(d.GetProperty("scoped").GetBoolean());
        Assert.Equal(10m, d.GetProperty("value").GetDecimal());                      // Korle only; Kumasi is outside the area and unmatched outlets cannot be placed
        Assert.Equal(0, d.GetProperty("unmatched").GetArrayLength());
    }
}
