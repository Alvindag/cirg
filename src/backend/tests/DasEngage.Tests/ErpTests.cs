using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using DasEngage.Api;
using DasEngage.Api.Erp;
using DasEngage.Domain;
using DasEngage.Infrastructure;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace DasEngage.Tests;

public class FakeConnector : IErpConnector
{
    public Func<OutboxMessage, SendResult> OnSend = _ => new(true, false, null, null);
    public string? PingError;
    public readonly List<OutboxMessage> Sent = new();
    public readonly List<(string Entity, string? Cursor)> PullCalls = new();
    /// <summary>entity -> function(cursor) -> (items as List&lt;T&gt;, next cursor, error)</summary>
    public readonly Dictionary<string, Func<string?, (object? Items, string? Next, string? Error)>> Pages = new();

    public Task<SendResult> SendAsync(ErpConnection c, OutboxMessage m, CancellationToken ct = default)
    {
        Sent.Add(new OutboxMessage { Id = m.Id, Type = m.Type, Payload = m.Payload });
        return Task.FromResult(OnSend(m));
    }

    public Task<PullResult<T>> PullAsync<T>(ErpConnection c, string entity, string? cursor, CancellationToken ct = default)
    {
        PullCalls.Add((entity, cursor));
        if (!Pages.TryGetValue(entity, out var f)) return Task.FromResult(new PullResult<T>(new(), null, null));
        var (items, next, err) = f(cursor);
        return Task.FromResult(new PullResult<T>(items as List<T> ?? new(), next, err));
    }

    public Task<string?> PingAsync(ErpConnection c, CancellationToken ct = default) => Task.FromResult(PingError);
}

public class ErpFactory : ApiFactory
{
    public FakeConnector Connector { get; } = new();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        base.ConfigureWebHost(builder);
        builder.ConfigureAppConfiguration((_, c) => c.AddInMemoryCollection(new Dictionary<string, string?> { ["Erp:Worker:Enabled"] = "false" }));
        builder.ConfigureServices(s => { s.RemoveAll<IErpConnector>(); s.AddSingleton<IErpConnector>(Connector); });
    }

    public AppDbContext Db(Guid tenant)
    {
        var scope = Services.CreateScope();
        return new AppDbContext(scope.ServiceProvider.GetRequiredService<DbContextOptions<AppDbContext>>(), new WorkerTenant(tenant));
    }
}

public class ErpTests : IClassFixture<ErpFactory>
{
    private readonly ErpFactory _f;
    public ErpTests(ErpFactory f) => _f = f;

    private record Ctx(Guid Tenant, HttpClient Admin, Guid AdminId);

    private async Task<Ctx> Setup()
    {
        var tenant = Guid.NewGuid(); var adminId = Guid.NewGuid();
        await using (var db = _f.Db(tenant)) { db.Tenants.Add(new Tenant { Id = tenant, Name = "T" + tenant }); await db.SaveChangesAsync(); }
        return new Ctx(tenant, _f.ClientFor(tenant, adminId, "Admin"), adminId);
    }

    private static async Task<JsonElement> Json(HttpResponseMessage r) { r.EnsureSuccessStatusCode(); return await r.Content.ReadFromJsonAsync<JsonElement>(); }
    private static StringContent Csv(string text) => new(text, Encoding.UTF8, "text/csv");
    private static string Day(int offset) => DateTime.UtcNow.AddDays(offset).ToString("yyyy-MM-dd");
    private static DateOnly D(int offset) => DateOnly.FromDateTime(DateTime.UtcNow.AddDays(offset));

    private static async Task<Guid> Product(Ctx c, string code, string name, decimal? cost = 2.5m, int? reorder = null)
    {
        (await c.Admin.PostAsJsonAsync("/api/v1/erp/import/products", new[] { new ErpProduct(code, name, null, cost, reorder) }, ErpJson.Options)).EnsureSuccessStatusCode();
        var all = await c.Admin.GetFromJsonAsync<JsonElement>("/api/v1/admin/products");
        return all.EnumerateArray().First(p => p.GetProperty("code").GetString() == code).GetProperty("id").GetGuid();
    }

    private static async Task<Guid> Customer(Ctx c, string name, string? city = "Accra", Guid? terr = null, string? account = null)
    {
        var r = await c.Admin.PostAsJsonAsync("/api/v1/customers", new CustomerDto(null, CustomerType.Pharmacy, name, null, Segment.B, terr, null, null, null, null, city, null, null, 2, null));
        var id = (await Json(r)).GetProperty("id").GetGuid();
        if (account != null) (await c.Admin.PostAsJsonAsync("/api/v1/erp/customers/link", new LinkRequest(id, account))).EnsureSuccessStatusCode();
        return id;
    }

    private static async Task<JsonElement> ImportJson(HttpClient c, string entity, object body, string query = "") =>
        await Json(await c.PostAsJsonAsync($"/api/v1/erp/import/{entity}{query}", body, ErpJson.Options));

    // ---------- pure pieces ----------

    [Theory]
    [InlineData("https://erp-gateway.dasplc.com", null)]
    [InlineData("https://erp.example.com:8443/base", null)]
    [InlineData("http://erp.example.com", "https")]
    [InlineData("https://localhost/x", "not allowed")]
    [InlineData("https://sap.internal", "not allowed")]
    [InlineData("https://10.0.0.5", "not allowed")]
    [InlineData("https://192.168.1.10", "not allowed")]
    [InlineData("https://172.20.0.1", "not allowed")]
    [InlineData("https://169.254.169.254/latest/meta-data", "not allowed")]
    [InlineData("https://127.0.0.1", "not allowed")]
    [InlineData("https://[::1]", "not allowed")]
    [InlineData("https://[fd00::1]", "not allowed")]
    [InlineData("https://user:pass@erp.example.com", "username")]
    [InlineData("ftp://erp.example.com", "https")]
    [InlineData("not a url", "full web address")]
    [InlineData("", "full web address")]
    public void The_gateway_address_cannot_point_at_internal_services(string url, string? expectedFragment)
    {
        var r = UrlGuard.Validate(url);
        if (expectedFragment is null) Assert.Null(r); else Assert.Contains(expectedFragment, r);
    }

    [Fact]
    public void An_allow_list_restricts_hosts_and_insecure_http_must_be_enabled_explicitly()
    {
        Assert.Contains("approved", UrlGuard.Validate("https://other.example.com", false, new[] { "erp.example.com" }));
        Assert.Null(UrlGuard.Validate("https://erp.example.com", false, new[] { "ERP.example.com" }));
        Assert.Null(UrlGuard.Validate("http://erp.example.com", true));
    }

    [Fact]
    public void Integration_keys_are_random_hashed_and_parse_back()
    {
        var (key, prefix, hash) = ApiKeyAuth.Generate();
        var (key2, _, _) = ApiKeyAuth.Generate();
        Assert.NotEqual(key, key2);
        Assert.True(ApiKeyAuth.TryParse(key, out var p, out var secret));
        Assert.Equal(prefix, p);
        Assert.Equal(hash, ApiKeyAuth.Hash(secret));
        Assert.DoesNotContain(secret, hash);
        foreach (var bad in new[] { "", "dek_short_x", "xyz_12345678_" + new string('a', 30), "dek_12345678_short", new string('a', 200) })
            Assert.False(ApiKeyAuth.TryParse(bad, out _, out _));
    }

    [Fact]
    public void Csv_exports_are_read_with_per_row_errors()
    {
        var sales = CsvMapper.Sales("External Id,Date,Account Code,Item Code,Quantity,Net Amount,Document Number\nS1,2026-09-30,A1,I1,\"1,200\",\"12,500.50\",INV-1\nS2,31/09/2026,A1,I1,1,1,INV-2\nS3,01/10/2026,A2,I2,x,5,INV-3\n");
        Assert.Single(sales.Items);
        Assert.Equal(1200m, sales.Items[0].Quantity);
        Assert.Equal(12500.50m, sales.Items[0].NetAmount);
        Assert.Equal(2, sales.Errors.Count);
        Assert.Contains("not a date", sales.Errors[0].Message);
        Assert.Throws<FormatException>(() => CsvMapper.Sales("date,account_code\n1,2"));
        Assert.Throws<FormatException>(() => CsvMapper.Products(""));
    }

    // ---------- products, customers, sales ----------

    [Fact]
    public async Task Products_are_created_updated_and_linked_to_hand_made_ones()
    {
        var c = await Setup();
        (await c.Admin.PostAsJsonAsync("/api/v1/admin/products", new Product { Name = "Amoxil 500" })).EnsureSuccessStatusCode(); // added by hand, no code
        var first = await ImportJson(c.Admin, "products", new[] { new ErpProduct("AMX500", "AMOXIL 500", null, 1.25m, 100), new ErpProduct("CRD10", "Cardiostat", "Cardiology", 3m, null) });
        Assert.Equal(1, first.GetProperty("updated").GetInt32()); // linked by name, not duplicated
        Assert.Equal(1, first.GetProperty("created").GetInt32());
        var again = await ImportJson(c.Admin, "products", new[] { new ErpProduct("AMX500", "AMOXIL 500", null, 1.25m, 100), new ErpProduct("CRD10", "Cardiostat", "Cardiology", 3m, null) });
        Assert.Equal(0, again.GetProperty("created").GetInt32() + again.GetProperty("updated").GetInt32());
        Assert.Equal(2, (await c.Admin.GetFromJsonAsync<JsonElement>("/api/v1/admin/products")).GetArrayLength());

        var bad = await ImportJson(c.Admin, "products", new[] { new ErpProduct("", "x", null, null, null), new ErpProduct("X1", "", null, null, null), new ErpProduct("X2", "ok", null, -1m, null) });
        Assert.Equal(3, bad.GetProperty("errors").GetInt32());
        var runs = await c.Admin.GetFromJsonAsync<JsonElement>("/api/v1/erp/runs");
        Assert.Contains(runs.EnumerateArray(), r => r.GetProperty("entity").GetString() == "products" && r.GetProperty("source").GetString() == "csv");
    }

    [Fact]
    public async Task Only_erp_administrators_can_import()
    {
        var c = await Setup();
        var body = new[] { new ErpProduct("A", "A", null, null, null) };
        foreach (var role in new[] { "Rep", "AreaManager", "RegionalManager", "Executive", "Marketing" })
            Assert.Equal(HttpStatusCode.Forbidden, (await _f.ClientFor(c.Tenant, Guid.NewGuid(), role).PostAsJsonAsync("/api/v1/erp/import/products", body, ErpJson.Options)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await _f.ClientFor(c.Tenant, Guid.NewGuid(), "NationalSalesManager").PostAsJsonAsync("/api/v1/erp/import/products", body, ErpJson.Options)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await c.Admin.PostAsJsonAsync("/api/v1/erp/import/payroll", body)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await c.Admin.PostAsJsonAsync("/api/v1/erp/import/products", new { not = "an array" })).StatusCode);
    }

    [Fact]
    public async Task Customer_accounts_are_linked_by_code_then_by_name_and_city_and_ambiguity_is_left_for_a_person()
    {
        var c = await Setup();
        var osu = await Customer(c, "Ernest Chemists Osu", "Accra");
        await Customer(c, "Twin Pharmacy", "Tema"); await Customer(c, "TWIN pharmacy", "Tema");
        var r = await ImportJson(c.Admin, "customers", new[]
        {
            new ErpCustomer("C001", "Ernest Chemists, Osu", null, "Accra", null, null),   // same name and city after tidying
            new ErpCustomer("C002", "Twin Pharmacy", null, "Tema", null, null),          // two candidates
            new ErpCustomer("C003", "Brand New Clinic", "Clinic", "Kumasi", "0200000000", null),
        });
        var by = r.GetProperty("items").EnumerateArray().ToDictionary(i => i.GetProperty("key").GetString()!, i => i.GetProperty("status").GetString()!);
        Assert.Equal(("updated", "unmatched", "unmatched"), (by["C001"], by["C002"], by["C003"]));
        Assert.Contains("link it by hand", r.GetProperty("items").EnumerateArray().First(i => i.GetProperty("key").GetString() == "C002").GetProperty("message").GetString());

        var created = await ImportJson(c.Admin, "customers", new[] { new ErpCustomer("C003", "Brand New Clinic", "Clinic", "Kumasi", "0200000000", null) }, "?createMissing=true");
        Assert.Equal(1, created.GetProperty("created").GetInt32());
        var again = await ImportJson(c.Admin, "customers", new[] { new ErpCustomer("C001", "Ernest Chemists Osu", null, "Accra", null, null) });
        Assert.Equal("unchanged", again.GetProperty("items")[0].GetProperty("status").GetString());

        // linking by hand: conflicts are explained
        Assert.Equal(HttpStatusCode.BadRequest, (await c.Admin.PostAsJsonAsync("/api/v1/erp/customers/link", new LinkRequest(await Customer(c, "Other"), "C001"))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await c.Admin.PostAsJsonAsync("/api/v1/erp/customers/link", new LinkRequest(Guid.NewGuid(), "C9"))).StatusCode);
        Assert.NotEqual(Guid.Empty, osu);
    }

    [Fact]
    public async Task Invoice_lines_wait_for_their_customer_and_attach_when_it_is_linked()
    {
        var c = await Setup();
        await Product(c, "AMX500", "Amoxil 500");
        var lines = new[]
        {
            new ErpSale("S1", "INV-1", D(-5), "ACC-7", "AMX500", 10, 250m, null),
            new ErpSale("S2", "INV-1", D(-5), "ACC-7", "AMX500", 4, 100m, "GHS"),
            new ErpSale("S3", "INV-2", D(-3), "ACC-7", "UNKNOWN-ITEM", 1, 10m, null),
        };
        var r = await ImportJson(c.Admin, "sales", lines);
        Assert.Equal(3, r.GetProperty("created").GetInt32());
        var unmatched = await c.Admin.GetFromJsonAsync<JsonElement>("/api/v1/erp/unmatched");
        Assert.Equal("ACC-7", unmatched.GetProperty("customers")[0].GetProperty("accountCode").GetString());
        Assert.Equal(360m, unmatched.GetProperty("customers")[0].GetProperty("amount").GetDecimal());
        Assert.Equal("UNKNOWN-ITEM", unmatched.GetProperty("items")[0].GetProperty("itemCode").GetString());

        await Customer(c, "Osu Pharmacy", account: "ACC-7"); // linking attaches the waiting lines
        Assert.Equal(0, (await c.Admin.GetFromJsonAsync<JsonElement>("/api/v1/erp/unmatched")).GetProperty("customers").GetArrayLength());

        var again = await ImportJson(c.Admin, "sales", lines);
        Assert.Equal(0, again.GetProperty("created").GetInt32());
        var corrected = await ImportJson(c.Admin, "sales", new[] { lines[0] with { NetAmount = 275m } });
        Assert.Equal(1, corrected.GetProperty("updated").GetInt32()); // the ERP corrected the invoice line
    }

    [Fact]
    public async Task Bad_invoice_lines_are_refused_one_by_one()
    {
        var c = await Setup();
        var r = await ImportJson(c.Admin, "sales", new[]
        {
            new ErpSale("", "d", D(-1), "A", "I", 1, 1m, null),
            new ErpSale("ok", "d", D(-1), "A", "I", 1, 1m, null),
            new ErpSale("ok", "d", D(-1), "A", "I", 2, 2m, null),                  // repeated id in one batch
            new ErpSale("fut", "d", D(30), "A", "I", 1, 1m, null),
            new ErpSale("cur", "d", D(-1), "A", "I", 1, 1m, "CEDIS"),
            new ErpSale("big", "d", D(-1), "A", "I", 1, 5_000_000_000m, null),
            new ErpSale("nocode", "d", D(-1), "", "I", 1, 1m, null),
        });
        Assert.Equal(1, r.GetProperty("created").GetInt32());
        Assert.Equal(5, r.GetProperty("errors").GetInt32());
        var tooMany = Enumerable.Range(0, ErpImporter.MaxBatch + 1).Select(i => new ErpSale($"x{i}", "d", D(-1), "A", "I", 1, 1m, null)).ToList();
        Assert.Equal(HttpStatusCode.BadRequest, (await c.Admin.PostAsJsonAsync("/api/v1/erp/import/sales", tooMany, ErpJson.Options)).StatusCode);
    }

    [Fact]
    public async Task Csv_files_import_with_their_own_errors_reported()
    {
        var c = await Setup();
        var products = await c.Admin.PostAsync("/api/v1/erp/import/products", Csv("item_code,name,standard_cost,reorder_level\nAMX,Amoxil,1.50,100\nBAD,Bad,abc,1\n"));
        var p = await Json(products);
        Assert.Equal(1, p.GetProperty("created").GetInt32());
        Assert.Equal(1, p.GetProperty("errors").GetInt32());
        Assert.Contains("not a number", p.GetProperty("items")[0].GetProperty("message").GetString());
        Assert.Equal(HttpStatusCode.BadRequest, (await c.Admin.PostAsync("/api/v1/erp/import/sales", Csv("date,net_amount\n2026-01-01,5"))).StatusCode);
        var sales = await Json(await c.Admin.PostAsync("/api/v1/erp/import/sales", Csv($"external_id,date,account_code,item_code,quantity,net_amount\nS1,{Day(-2)},A1,AMX,3,45.00\n")));
        Assert.Equal(1, sales.GetProperty("created").GetInt32());
    }

    // ---------- revenue ----------

    [Fact]
    public async Task Revenue_compares_with_the_previous_period_and_respects_the_team_scope()
    {
        var c = await Setup();
        await Product(c, "AMX500", "Amoxil"); await Product(c, "CRD10", "Cardiostat");
        var terrA = (await Json(await c.Admin.PostAsJsonAsync("/api/v1/admin/territories", new TerritoryDto(null, "A" + c.Tenant, null, null)))).GetProperty("id").GetGuid();
        var terrB = (await Json(await c.Admin.PostAsJsonAsync("/api/v1/admin/territories", new TerritoryDto(null, "B" + c.Tenant, null, null)))).GetProperty("id").GetGuid();
        await Customer(c, "In A", terr: terrA, account: "A1"); await Customer(c, "In B", terr: terrB, account: "B1");
        await ImportJson(c.Admin, "sales", new[]
        {
            new ErpSale("1", "i", D(-3), "A1", "AMX500", 10, 1000m, null), new ErpSale("2", "i", D(-4), "A1", "CRD10", 5, 500m, null),
            new ErpSale("3", "i", D(-2), "B1", "AMX500", 1, 200m, null), new ErpSale("4", "i", D(-3), "ZZ", "AMX500", 1, 50m, null),   // account not linked
            new ErpSale("5", "i", D(-10), "A1", "AMX500", 1, 800m, null),                                                              // previous period
            new ErpSale("6", "i", D(-3), "A1", "AMX500", 1, 99m, "USD"),                                                              // other currency: not mixed in
        });
        string Q(int days) => $"from={Uri.EscapeDataString(DateTime.UtcNow.AddDays(-days).ToString("O"))}&to={Uri.EscapeDataString(DateTime.UtcNow.AddDays(1).ToString("O"))}";

        var all = await c.Admin.GetFromJsonAsync<JsonElement>($"/api/v1/dashboards/revenue?{Q(7)}");
        Assert.Equal(1750m, all.GetProperty("total").GetDecimal());
        Assert.Equal(50m, all.GetProperty("unlinkedAmount").GetDecimal());
        Assert.Equal("GHS", all.GetProperty("currency").GetString());
        Assert.Equal(2, all.GetProperty("customersBuying").GetInt32());
        Assert.Equal("day", all.GetProperty("granularity").GetString());
        Assert.Equal("In A", all.GetProperty("topCustomers")[0].GetProperty("name").GetString());
        Assert.Equal("Amoxil", all.GetProperty("byProduct")[0].GetProperty("name").GetString());

        // a manager responsible for territory A sees A only, and none of the unlinked invoices
        var mgrId = Guid.NewGuid();
        await c.Admin.PostAsJsonAsync("/api/v1/admin/users", new UserDto(mgrId, "m" + mgrId, "Mgr A", "m@x.test", UserRole.AreaManager, null, terrA));
        var mgr = _f.ClientFor(c.Tenant, mgrId, "AreaManager", terrA);
        var scoped = await mgr.GetFromJsonAsync<JsonElement>($"/api/v1/dashboards/revenue?{Q(7)}");
        Assert.Equal(1500m, scoped.GetProperty("total").GetDecimal());
        Assert.Equal(0m, scoped.GetProperty("unlinkedAmount").GetDecimal());

        var filtered = await c.Admin.GetFromJsonAsync<JsonElement>($"/api/v1/dashboards/revenue?{Q(7)}&productId={all.GetProperty("byProduct")[0].GetProperty("productId").GetGuid()}");
        Assert.Equal(1250m, filtered.GetProperty("total").GetDecimal());

        var growth = await c.Admin.GetFromJsonAsync<JsonElement>($"/api/v1/dashboards/revenue?from={Uri.EscapeDataString(DateTime.UtcNow.AddDays(-6).ToString("O"))}&to={Uri.EscapeDataString(DateTime.UtcNow.AddDays(1).ToString("O"))}");
        Assert.Equal(800m, growth.GetProperty("previousTotal").GetDecimal()); // the 7 days before
        Assert.Equal(118.8, growth.GetProperty("growthPct").GetDouble());       // (1750-800)/800
        Assert.Equal(HttpStatusCode.BadRequest, (await c.Admin.GetAsync($"/api/v1/dashboards/revenue?from=2020-01-01&to=2026-12-31")).StatusCode);
        var monthly = await c.Admin.GetFromJsonAsync<JsonElement>($"/api/v1/dashboards/revenue?{Q(120)}");
        Assert.Equal("month", monthly.GetProperty("granularity").GetString());
    }
}
