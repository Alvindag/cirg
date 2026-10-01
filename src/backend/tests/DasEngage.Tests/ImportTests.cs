using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using DasEngage.Api;
using DasEngage.Domain;

namespace DasEngage.Tests;

public class ImportTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _f;
    public ImportTests(ApiFactory f) => _f = f;

    private static StringContent Body(string csv) => new(csv, Encoding.UTF8, "text/csv");

    private static async Task<JsonElement> Import(HttpClient c, string csv, string query = "dryRun=false")
    {
        var r = await c.PostAsync($"/api/v1/customers/import?{query}", Body(csv));
        Assert.True(r.IsSuccessStatusCode, $"{(int)r.StatusCode} {await r.Content.ReadAsStringAsync()}");
        return await r.Content.ReadFromJsonAsync<JsonElement>();
    }

    private static string[] Statuses(JsonElement res) =>
        res.GetProperty("rows").EnumerateArray().Select(r => r.GetProperty("status").GetString()!).ToArray();

    private static async Task<int> CustomerCount(HttpClient c) =>
        (await c.GetFromJsonAsync<JsonElement>("/api/v1/customers?pageSize=200")).GetProperty("total").GetInt32();

    private HttpClient Admin(out Guid tenant) { tenant = Guid.NewGuid(); return _f.ClientFor(tenant, Guid.NewGuid(), "Admin"); }

    private const string Header = "type,name,specialty,segment,territory,parent,phone,email,city,latitude,longitude\n";

    [Fact]
    public void Csv_parser_handles_quotes_newlines_bom_and_semicolons()
    {
        var rows = Csv.Parse("﻿a,b\r\n\"x, y\",\"he said \"\"hi\"\"\"\r\n\"multi\nline\",z\r\n\r\n");
        Assert.Equal(3, rows.Count);
        Assert.Equal("x, y", rows[1][0]);
        Assert.Equal("he said \"hi\"", rows[1][1]);
        Assert.Equal("multi\nline", rows[2][0]);
        Assert.Equal(new[] { "a", "b", "c" }, Csv.Parse("a;b;c\n1;2;3")[0]);
        Assert.Throws<FormatException>(() => Csv.Parse("a,\"unterminated"));
    }

    [Fact]
    public void Normalization_matches_variants()
    {
        Assert.Equal(Normalize.Name("Dr. Kofi  Mensah"), Normalize.Name("kofi mensah"));
        Assert.Equal(Normalize.Name("Café Pharmacy"), Normalize.Name("CAFE pharmacy"));
        Assert.Equal(Normalize.Phone("024 123 4567"), Normalize.Phone("+233241234567"));
        Assert.Equal("", Normalize.Phone("123"));
    }

    [Fact]
    public async Task Dry_run_by_default_persists_nothing()
    {
        var c = Admin(out _);
        var csv = Header + "Doctor,Dr Ama Boateng,Cardiology,A,,,0241234567,ama@x.test,Accra,5.6,-0.2\n";
        var res = await Import(c, csv, "");
        Assert.True(res.GetProperty("dryRun").GetBoolean());
        Assert.Equal(1, res.GetProperty("created").GetInt32());
        Assert.Equal(0, await CustomerCount(c));
    }

    [Fact]
    public async Task Import_creates_then_reimport_is_all_duplicates()
    {
        var c = Admin(out _);
        var csv = Header +
            "Hospital,Korle Bu Teaching Hospital,,A,,,0302123456,,Accra,5.5365,-0.2271\n" +
            "Doctor,Dr Kofi Mensah,Cardiology,A,,Korle Bu Teaching Hospital,0244000111,kofi@x.test,Accra,,\n" +
            "Pharmacy,Ernest Chemists Osu,,B,,,0200000222,,Accra,,\n";
        var first = await Import(c, csv);
        Assert.Equal(3, first.GetProperty("created").GetInt32());
        Assert.Equal(3, await CustomerCount(c));

        // parent link was resolved from an earlier row in the same file
        var doctor = (await c.GetFromJsonAsync<JsonElement>("/api/v1/customers?type=Doctor")).GetProperty("items")[0];
        Assert.NotEqual(JsonValueKind.Null, doctor.GetProperty("parentCustomerId").ValueKind);
        Assert.Equal(4, doctor.GetProperty("targetVisitsPerMonth").GetInt32());

        var second = await Import(c, csv);
        Assert.Equal(0, second.GetProperty("created").GetInt32());
        Assert.Equal(3, second.GetProperty("skipped").GetInt32());
        Assert.Equal(3, await CustomerCount(c));
    }

    [Fact]
    public async Task Duplicates_are_detected_by_name_phone_and_email_and_within_the_file()
    {
        var c = Admin(out _);
        await Import(c, Header + "Doctor,Dr Kwame Asante,Surgery,B,,,0551112233,kwame@x.test,Kumasi,,\n");
        var csv = Header +
            "Doctor,KWAME ASANTE,,,,,,,Kumasi,,\n" +                                  // same name+city
            "Doctor,Someone Else,,,,,+233 55 111 2233,,Takoradi,,\n" +                // same phone (different format)
            "Pharmacist,Other Person,,,,,,KWAME@X.TEST,Accra,,\n" +                   // same email
            "Clinic,Grace Clinic,,,,,,,Tema,,\n" +
            "Clinic,grace clinic,,,,,,,tema,,\n";                                     // duplicate of row above, in file
        var res = await Import(c, csv);
        Assert.Equal(new[] { "duplicate", "duplicate", "duplicate", "created", "duplicate" }, Statuses(res));
        Assert.Contains("row 5", res.GetProperty("rows")[4].GetProperty("message").GetString());
        Assert.Equal(2, await CustomerCount(c));
    }

    [Fact]
    public async Task Near_matches_are_flagged_unless_explicitly_allowed()
    {
        var c = Admin(out _);
        await Import(c, Header + "Hospital,Komfo Anokye Teaching Hospital,,A,,,,,Kumasi,,\n");
        var typo = Header + "Hospital,Komfo Anokye Teaching Hospitl,,A,,,,,Kumasi,,\n";
        Assert.Equal(new[] { "possible_duplicate" }, Statuses(await Import(c, typo)));
        Assert.Equal(1, await CustomerCount(c));
        Assert.Equal(new[] { "created" }, Statuses(await Import(c, typo, "dryRun=false&allowPossibleDuplicates=true")));
        Assert.Equal(2, await CustomerCount(c));
        // different city is not a near-match
        Assert.Equal(new[] { "created" }, Statuses(await Import(c, Header + "Hospital,Komfo Anokye Teaching Hospitl,,A,,,,,Accra,,\n")));
    }

    [Fact]
    public async Task Update_mode_fills_non_empty_fields_on_existing_customers()
    {
        var c = Admin(out _);
        await Import(c, Header + "Doctor,Dr Yaw Owusu,,C,,,,,Accra,,\n");
        var res = await Import(c, Header + "Doctor,Dr Yaw Owusu,Paediatrics,A,,,0277000111,,Accra,,\n", "dryRun=false&onDuplicate=update");
        Assert.Equal(1, res.GetProperty("updated").GetInt32());
        var item = (await c.GetFromJsonAsync<JsonElement>("/api/v1/customers?type=Doctor")).GetProperty("items")[0];
        Assert.Equal("Paediatrics", item.GetProperty("specialty").GetString());
        Assert.Equal("0277000111", item.GetProperty("phone").GetString());
        Assert.Equal("Accra", item.GetProperty("city").GetString()); // untouched
        Assert.Equal(1, await CustomerCount(c));
    }

    [Fact]
    public async Task Bad_rows_are_reported_and_good_rows_still_import()
    {
        var c = Admin(out _);
        var csv = Header +
            "Wizard,Gandalf,,,,,,,,,\n" +
            "Doctor,,,,,,,,,,\n" +
            "Doctor,Dr Bad Segment,,Z,,,,,,,\n" +
            "Doctor,Dr Bad Territory,,A,Atlantis,,,,,,\n" +
            "Doctor,Dr Bad Coords,,A,,,,,,95,10\n" +
            "Doctor,Dr No Parent,,A,,Missing Hospital,,,,,\n" +
            "Doctor,Dr Good Row,Dermatology,B,,,,,Accra,,\n";
        var res = await Import(c, csv);
        Assert.Equal(new[] { "error", "error", "error", "error", "error", "error", "created" }, Statuses(res));
        Assert.Equal(6, res.GetProperty("errors").GetInt32());
        Assert.Equal(1, await CustomerCount(c));
    }

    [Fact]
    public async Task Structural_problems_return_400()
    {
        var c = Admin(out _);
        foreach (var bad in new[] { "", "name\nx\n", "type,name,bogus\nDoctor,A,b\n", "type,name\nDoctor,\"oops\n" })
            Assert.Equal(HttpStatusCode.BadRequest, (await c.PostAsync("/api/v1/customers/import", Body(bad))).StatusCode);
    }

    [Fact]
    public async Task Territory_names_resolve_and_scope_is_enforced_for_area_managers()
    {
        var c = Admin(out var tenant);
        async Task<Guid> Terr(string n) => (await (await c.PostAsJsonAsync("/api/v1/admin/territories", new TerritoryDto(null, n, null, null)))
            .Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        var mine = await Terr("Accra Central");
        var other = await Terr("Kumasi");
        var nsm = Guid.NewGuid(); var area = Guid.NewGuid();
        (await c.PostAsJsonAsync("/api/v1/admin/users", new UserDto(nsm, "n", "N", "n@x.test", UserRole.NationalSalesManager, null, null))).EnsureSuccessStatusCode();
        (await c.PostAsJsonAsync("/api/v1/admin/users", new UserDto(area, "a", "A", "a@x.test", UserRole.AreaManager, nsm, mine))).EnsureSuccessStatusCode();

        var mgr = _f.ClientFor(tenant, area, "AreaManager", mine);
        var csv = Header +
            "Pharmacy,In Scope Pharmacy,,B,accra central,,,,Accra,,\n" +
            "Pharmacy,Out Of Scope Pharmacy,,B,Kumasi,,,,Kumasi,,\n" +
            "Pharmacy,No Territory Pharmacy,,B,,,,,Accra,,\n";
        var res = await Import(mgr, csv);
        Assert.Equal(new[] { "created", "error", "error" }, Statuses(res));
        var created = res.GetProperty("rows")[0].GetProperty("customerId").GetGuid();
        var got = await c.GetFromJsonAsync<JsonElement>($"/api/v1/customers/{created}");
        Assert.Equal(mine, got.GetProperty("customer").GetProperty("territoryId").GetGuid());
        _ = other;
    }

    [Fact]
    public async Task Reps_cannot_import()
    {
        var rep = _f.ClientFor(Guid.NewGuid(), Guid.NewGuid(), "Rep", Guid.NewGuid());
        Assert.Equal(HttpStatusCode.Forbidden, (await rep.PostAsync("/api/v1/customers/import", Body(Header))).StatusCode);
    }
}
