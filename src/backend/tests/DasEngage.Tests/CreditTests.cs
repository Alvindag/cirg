using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using DasEngage.Api;
using DasEngage.Domain;

namespace DasEngage.Tests;

public class CreditTests : IClassFixture<ErpFactory>
{
    private readonly ErpFactory _f;
    public CreditTests(ErpFactory f) => _f = f;

    private record Ctx(Guid Territory, Guid Customer, Guid Product, HttpClient Rep, HttpClient Admin, HttpClient Nsm, HttpClient Area);

    private static async Task<JsonElement> Json(HttpResponseMessage r) { r.EnsureSuccessStatusCode(); return await r.Content.ReadFromJsonAsync<JsonElement>(); }

    private async Task<Ctx> Setup()
    {
        var tenant = Guid.NewGuid(); var terr = Guid.NewGuid(); var customer = Guid.NewGuid(); var product = Guid.NewGuid(); var areaUser = Guid.NewGuid(); var repUser = Guid.NewGuid();
        await using (var db = _f.Db(tenant))
        {
            db.Tenants.Add(new Tenant { Id = tenant, Name = "T" + tenant });
            db.Territories.Add(new Territory { Id = terr, Name = "Accra Central", Region = "Greater Accra" });
            db.Customers.Add(new Customer { Id = customer, Name = "Korle Pharmacy", Type = CustomerType.Pharmacy, TerritoryId = terr, ErpAccountCode = "C001" });
            db.Products.Add(new Product { Id = product, Name = "Amoxil 500", Code = "AMX", ListPrice = 10m });
            db.Users.Add(new AppUser { Id = areaUser, ExternalId = "area", FullName = "Area", Email = "a@x.com", Role = UserRole.AreaManager, TerritoryId = terr });
            db.Users.Add(new AppUser { Id = repUser, ExternalId = "rep", FullName = "Rep", Email = "r@x.com", Role = UserRole.Rep, TerritoryId = terr, ManagerId = areaUser });
            await db.SaveChangesAsync();
        }
        return new Ctx(terr, customer, product, _f.ClientFor(tenant, repUser, "Rep", terr), _f.ClientFor(tenant, Guid.NewGuid(), "Admin"),
            _f.ClientFor(tenant, Guid.NewGuid(), "NationalSalesManager"), _f.ClientFor(tenant, areaUser, "AreaManager", terr));
    }

    private static Task<HttpResponseMessage> Balances(HttpClient c, string csv) => c.PostAsync("/api/v1/erp/import/balances", new StringContent(csv, Encoding.UTF8, "text/csv"));
    private static OrderDto Order(Guid customer, Guid product, int qty) => new(Guid.NewGuid(), customer, new() { new(product, qty) }, null, null);
    private static async Task<JsonElement> OrderOf(HttpClient c, Guid id) => (await Json(await c.GetAsync("/api/v1/orders"))).EnumerateArray().First(o => o.GetProperty("id").GetGuid() == id);

    [Fact]
    public async Task Balances_come_in_by_account_code_and_unknown_accounts_are_refused()
    {
        var c = await Setup();
        var r = await Json(await Balances(c.Admin, "account_code,credit_limit,outstanding,overdue\nC001,1000,400,50\nZZZ,1,1,1\nC001,5,5,5\n"));
        Assert.Equal(1, r.GetProperty("created").GetInt32());
        Assert.Equal(1, r.GetProperty("errors").GetInt32());       // ZZZ matches no customer
        var o = await Json(await c.Admin.GetAsync("/api/v1/credit/overview"));
        Assert.Equal(400m, o.GetProperty("watch")[0].GetProperty("outstanding").GetDecimal());   // the repeated C001 row was ignored
        Assert.Equal(1000m, o.GetProperty("watch")[0].GetProperty("creditLimit").GetDecimal());
    }

    [Fact]
    public async Task Bad_balances_are_refused_and_a_value_left_out_keeps_what_is_stored()
    {
        var c = await Setup();
        await Balances(c.Admin, "account_code,credit_limit,outstanding,overdue\nC001,1000,400,50\n");
        var bad = await Json(await Balances(c.Admin, "account_code,outstanding,overdue\nC001,100,200\n"));   // more overdue than outstanding
        Assert.Equal(1, bad.GetProperty("errors").GetInt32());
        var neg = await Json(await Balances(c.Admin, "account_code,outstanding\nC001,-5\n"));
        Assert.Equal(1, neg.GetProperty("errors").GetInt32());
        await Balances(c.Admin, "account_code,outstanding,overdue\nC001,300,0\n");                          // no limit column: the limit stays
        var o = await Json(await c.Admin.GetAsync("/api/v1/credit/overview"));
        Assert.Equal(1, o.GetProperty("withLimit").GetInt32());                                            // the limit of 1000 was kept
        Assert.Equal(300m, o.GetProperty("outstandingTotal").GetDecimal());
    }

    [Fact]
    public async Task An_order_within_the_limit_is_not_held()
    {
        var c = await Setup();
        await Balances(c.Admin, "account_code,credit_limit,outstanding,overdue\nC001,1000,400,0\n");
        var o = Order(c.Customer, c.Product, 10);   // 100: 400 + 100 is inside 1000
        await c.Rep.PostAsJsonAsync("/api/v1/orders", o);
        Assert.False((await OrderOf(c.Rep, o.Id!.Value)).GetProperty("creditHold").GetBoolean());
    }

    [Fact]
    public async Task An_order_over_the_limit_is_taken_but_held_and_open_orders_count_toward_the_limit()
    {
        var c = await Setup();
        await Balances(c.Admin, "account_code,credit_limit,outstanding,overdue\nC001,1000,800,0\n");
        var first = Order(c.Customer, c.Product, 15);    // 150: 800 + 150 = 950, fine
        var second = Order(c.Customer, c.Product, 10);   // 100: 800 + 150 open + 100 = 1050, over
        await c.Rep.PostAsJsonAsync("/api/v1/orders", first);
        await c.Rep.PostAsJsonAsync("/api/v1/orders", second);
        Assert.False((await OrderOf(c.Rep, first.Id!.Value)).GetProperty("creditHold").GetBoolean());
        var held = await OrderOf(c.Rep, second.Id!.Value);
        Assert.True(held.GetProperty("creditHold").GetBoolean());
        Assert.Contains("limit of GHS 1,000.00", held.GetProperty("creditHoldReason").GetString());
        Assert.Equal("Placed", held.GetProperty("status").GetString());       // taken, not lost
    }

    [Fact]
    public async Task Overdue_invoices_hold_an_order_even_without_a_limit_and_customers_with_no_credit_record_are_never_held()
    {
        var c = await Setup();
        var clean = Order(c.Customer, c.Product, 1);
        await c.Rep.PostAsJsonAsync("/api/v1/orders", clean);
        Assert.False((await OrderOf(c.Rep, clean.Id!.Value)).GetProperty("creditHold").GetBoolean());   // nothing known about the customer
        await Balances(c.Admin, "account_code,outstanding,overdue\nC001,500,120\n");
        var late = Order(c.Customer, c.Product, 1);
        await c.Rep.PostAsJsonAsync("/api/v1/orders", late);
        var o = await OrderOf(c.Rep, late.Id!.Value);
        Assert.True(o.GetProperty("creditHold").GetBoolean());
        Assert.Contains("GHS 120.00 overdue", o.GetProperty("creditHoldReason").GetString());
    }

    [Fact]
    public async Task Only_a_national_sales_manager_or_admin_can_release_a_held_order_and_must_say_why()
    {
        var c = await Setup();
        await Balances(c.Admin, "account_code,credit_limit,outstanding,overdue\nC001,100,90,0\n");
        var o = Order(c.Customer, c.Product, 5);
        await c.Rep.PostAsJsonAsync("/api/v1/orders", o);
        var url = $"/api/v1/orders/{o.Id}/confirm";
        Assert.Equal(HttpStatusCode.Forbidden, (await c.Area.PostAsJsonAsync(url, new OrderNoteDto("fine"))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await c.Nsm.PostAsync(url, null)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await c.Nsm.PostAsJsonAsync(url, new OrderNoteDto("  "))).StatusCode);
        var done = await Json(await c.Nsm.PostAsJsonAsync(url, new OrderNoteDto("Paid in full this morning")));
        Assert.Equal("Confirmed", done.GetProperty("status").GetString());
        Assert.Equal("Paid in full this morning", done.GetProperty("creditReleaseNote").GetString());
    }

    [Fact]
    public async Task A_normal_order_still_confirms_without_a_body()
    {
        var c = await Setup();
        var o = Order(c.Customer, c.Product, 1);
        await c.Rep.PostAsJsonAsync("/api/v1/orders", o);
        Assert.Equal(HttpStatusCode.OK, (await c.Area.PostAsync($"/api/v1/orders/{o.Id}/confirm", null)).StatusCode);
    }

    [Fact]
    public async Task The_overview_lists_who_to_watch_and_a_limit_can_be_set_by_hand_by_senior_roles()
    {
        var c = await Setup();
        Assert.Equal(HttpStatusCode.Forbidden, (await c.Area.PutAsJsonAsync($"/api/v1/credit/{c.Customer}", new CreditLimitDto(500))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await c.Nsm.PutAsJsonAsync($"/api/v1/credit/{c.Customer}", new CreditLimitDto(-1))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await c.Nsm.PutAsJsonAsync($"/api/v1/credit/{Guid.NewGuid()}", new CreditLimitDto(5))).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await c.Nsm.PutAsJsonAsync($"/api/v1/credit/{c.Customer}", new CreditLimitDto(50))).StatusCode);
        var big = Order(c.Customer, c.Product, 10);      // 100 against a limit of 50
        await c.Rep.PostAsJsonAsync("/api/v1/orders", big);
        Assert.True((await OrderOf(c.Rep, big.Id!.Value)).GetProperty("creditHold").GetBoolean());
        var o = await Json(await c.Admin.GetAsync("/api/v1/credit/overview"));
        Assert.Equal(1, o.GetProperty("overLimit").GetInt32());
        Assert.Equal(1, o.GetProperty("heldOrders").GetInt32());
        Assert.Equal("Korle Pharmacy", o.GetProperty("watch")[0].GetProperty("name").GetString());
        Assert.Equal(100m, o.GetProperty("watch")[0].GetProperty("openOrders").GetDecimal());
        await c.Nsm.PutAsJsonAsync($"/api/v1/credit/{c.Customer}", new CreditLimitDto(0));          // 0 removes the limit
        Assert.Equal(0, (await Json(await c.Admin.GetAsync("/api/v1/credit/overview"))).GetProperty("withLimit").GetInt32());
    }
}
