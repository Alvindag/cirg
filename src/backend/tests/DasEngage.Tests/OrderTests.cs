using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using DasEngage.Api;
using DasEngage.Domain;

namespace DasEngage.Tests;

public class OrderTests : IClassFixture<ErpFactory>
{
    private readonly ErpFactory _f;
    public OrderTests(ErpFactory f) => _f = f;

    private record Ctx(Guid Tenant, Guid Territory, Guid Customer, Guid Other, Guid Amoxil, Guid Unpriced, HttpClient Rep, HttpClient Rep2, HttpClient Admin);

    private async Task<Ctx> Setup()
    {
        var tenant = Guid.NewGuid(); var terr = Guid.NewGuid(); var terr2 = Guid.NewGuid();
        var customer = Guid.NewGuid(); var other = Guid.NewGuid(); var amoxil = Guid.NewGuid(); var unpriced = Guid.NewGuid();
        await using (var db = _f.Db(tenant))
        {
            db.Tenants.Add(new Tenant { Id = tenant, Name = "T" + tenant });
            db.Territories.AddRange(new Territory { Id = terr, Name = "Accra Central" }, new Territory { Id = terr2, Name = "Kumasi" });
            db.Customers.AddRange(new Customer { Id = customer, Name = "Korle Pharmacy", Type = CustomerType.Pharmacy, TerritoryId = terr },
                new Customer { Id = other, Name = "Kumasi Pharmacy", Type = CustomerType.Pharmacy, TerritoryId = terr2 });
            db.Products.AddRange(new Product { Id = amoxil, Name = "Amoxil 500", Code = "AMX", ListPrice = 2.50m }, new Product { Id = unpriced, Name = "New Syrup", Code = "NS" });
            await db.SaveChangesAsync();
        }
        return new Ctx(tenant, terr, customer, other, amoxil, unpriced,
            _f.ClientFor(tenant, Guid.NewGuid(), "Rep", terr), _f.ClientFor(tenant, Guid.NewGuid(), "Rep", terr2), _f.ClientFor(tenant, Guid.NewGuid(), "Admin"));
    }

    private static async Task<JsonElement> Json(HttpResponseMessage r) { r.EnsureSuccessStatusCode(); return await r.Content.ReadFromJsonAsync<JsonElement>(); }
    private static OrderDto Order(Guid customer, params (Guid p, int q)[] lines) =>
        new(Guid.NewGuid(), customer, lines.Select(l => new OrderLineDto(l.p, l.q)).ToList(), null, null);

    [Fact]
    public async Task The_server_prices_the_order_merges_repeated_products_and_numbers_it()
    {
        var c = await Setup();
        var o = Order(c.Customer, (c.Amoxil, 10), (c.Amoxil, 5));
        Assert.Equal("accepted", (await Json(await c.Rep.PostAsJsonAsync("/api/v1/orders", o))).GetProperty("status").GetString());
        var list = await Json(await c.Rep.GetAsync("/api/v1/orders"));
        Assert.Equal(1, list.GetArrayLength());
        var saved = list[0];
        Assert.Equal(37.50m, saved.GetProperty("total").GetDecimal());           // 15 x 2.50, the phone never sets a price
        Assert.Equal(1, saved.GetProperty("lines").GetArrayLength());            // merged
        Assert.Equal(15, saved.GetProperty("lines")[0].GetProperty("quantity").GetInt32());
        Assert.StartsWith("ORD-", saved.GetProperty("number").GetString());
        Assert.Equal("Placed", saved.GetProperty("status").GetString());
        Assert.Equal("Korle Pharmacy", saved.GetProperty("customerName").GetString());
    }

    [Fact]
    public async Task A_retry_never_saves_the_order_twice()
    {
        var c = await Setup();
        var o = Order(c.Customer, (c.Amoxil, 3));
        await c.Rep.PostAsJsonAsync("/api/v1/orders", o);
        var again = await Json(await c.Rep.PostAsJsonAsync("/api/v1/orders", o));
        Assert.Equal("duplicate", again.GetProperty("status").GetString());
        Assert.Equal(1, (await Json(await c.Rep.GetAsync("/api/v1/orders"))).GetArrayLength());
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-4)]
    [InlineData(1001)]
    public async Task Quantities_must_be_whole_numbers_from_1_to_1000(int qty)
    {
        var c = await Setup();
        var r = await c.Rep.PostAsJsonAsync("/api/v1/orders", Order(c.Customer, (c.Amoxil, qty)));
        Assert.Equal(HttpStatusCode.BadRequest, r.StatusCode);
    }

    [Fact]
    public async Task Repeated_lines_cannot_add_up_past_the_limit()
    {
        var c = await Setup();
        var r = await c.Rep.PostAsJsonAsync("/api/v1/orders", Order(c.Customer, (c.Amoxil, 600), (c.Amoxil, 600)));
        Assert.Equal(HttpStatusCode.BadRequest, r.StatusCode);
    }

    [Fact]
    public async Task A_product_without_a_price_cannot_be_ordered()
    {
        var c = await Setup();
        var r = await c.Rep.PostAsJsonAsync("/api/v1/orders", Order(c.Customer, (c.Unpriced, 2)));
        Assert.Equal(HttpStatusCode.BadRequest, r.StatusCode);
        Assert.Contains("no price", await r.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task A_rep_can_only_order_for_customers_in_their_own_territory()
    {
        var c = await Setup();
        Assert.Equal(HttpStatusCode.BadRequest, (await c.Rep.PostAsJsonAsync("/api/v1/orders", Order(c.Other, (c.Amoxil, 1)))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await c.Rep2.PostAsJsonAsync("/api/v1/orders", Order(c.Other, (c.Amoxil, 1)))).StatusCode);
    }

    [Fact]
    public async Task Reps_see_only_their_own_orders_and_managers_see_all()
    {
        var c = await Setup();
        await c.Rep.PostAsJsonAsync("/api/v1/orders", Order(c.Customer, (c.Amoxil, 1)));
        await c.Rep2.PostAsJsonAsync("/api/v1/orders", Order(c.Other, (c.Amoxil, 2)));
        Assert.Equal(1, (await Json(await c.Rep.GetAsync("/api/v1/orders"))).GetArrayLength());
        Assert.Equal(2, (await Json(await c.Admin.GetAsync("/api/v1/orders"))).GetArrayLength());
    }

    [Fact]
    public async Task An_order_moves_from_placed_to_confirmed_to_delivered_and_the_summary_counts_it()
    {
        var c = await Setup();
        var o = Order(c.Customer, (c.Amoxil, 4));
        await c.Rep.PostAsJsonAsync("/api/v1/orders", o);
        Assert.Equal(HttpStatusCode.BadRequest, (await c.Admin.PostAsync($"/api/v1/orders/{o.Id}/deliver", null)).StatusCode); // not confirmed yet
        Assert.Equal("Confirmed", (await Json(await c.Admin.PostAsync($"/api/v1/orders/{o.Id}/confirm", null))).GetProperty("status").GetString());
        Assert.Equal("Delivered", (await Json(await c.Admin.PostAsync($"/api/v1/orders/{o.Id}/deliver", null))).GetProperty("status").GetString());
        var s = await Json(await c.Admin.GetAsync("/api/v1/orders/summary?days=30"));
        Assert.Equal(1, s.GetProperty("orders").GetInt32());
        Assert.Equal(1, s.GetProperty("delivered").GetInt32());
        Assert.Equal(10m, s.GetProperty("value").GetDecimal());
        Assert.NotEqual(JsonValueKind.Null, s.GetProperty("avgHoursToDeliver").ValueKind);
        Assert.Equal("Amoxil 500", s.GetProperty("topProducts")[0].GetProperty("name").GetString());
    }

    [Fact]
    public async Task Only_managers_confirm_and_a_rep_may_withdraw_their_own_order_until_it_is_confirmed()
    {
        var c = await Setup();
        var o = Order(c.Customer, (c.Amoxil, 1)); var o2 = Order(c.Customer, (c.Amoxil, 1));
        await c.Rep.PostAsJsonAsync("/api/v1/orders", o); await c.Rep.PostAsJsonAsync("/api/v1/orders", o2);
        Assert.Equal(HttpStatusCode.Forbidden, (await c.Rep.PostAsync($"/api/v1/orders/{o.Id}/confirm", null)).StatusCode);
        Assert.Equal("Cancelled", (await Json(await c.Rep.PostAsJsonAsync($"/api/v1/orders/{o.Id}/cancel", new OrderNoteDto("changed my mind")))).GetProperty("status").GetString());
        await c.Admin.PostAsync($"/api/v1/orders/{o2.Id}/confirm", null);
        Assert.Equal(HttpStatusCode.BadRequest, (await c.Rep.PostAsJsonAsync($"/api/v1/orders/{o2.Id}/cancel", new OrderNoteDto(null))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await c.Rep2.PostAsJsonAsync($"/api/v1/orders/{o2.Id}/cancel", new OrderNoteDto(null))).StatusCode); // another rep cannot even see it
    }

    [Fact]
    public async Task A_manager_must_give_a_reason_to_cancel_someone_elses_order_and_delivered_orders_stay()
    {
        var c = await Setup();
        var o = Order(c.Customer, (c.Amoxil, 1));
        await c.Rep.PostAsJsonAsync("/api/v1/orders", o);
        Assert.Equal(HttpStatusCode.BadRequest, (await c.Admin.PostAsJsonAsync($"/api/v1/orders/{o.Id}/cancel", new OrderNoteDto(null))).StatusCode);
        await c.Admin.PostAsync($"/api/v1/orders/{o.Id}/confirm", null);
        await c.Admin.PostAsync($"/api/v1/orders/{o.Id}/deliver", null);
        Assert.Equal(HttpStatusCode.BadRequest, (await c.Admin.PostAsJsonAsync($"/api/v1/orders/{o.Id}/cancel", new OrderNoteDto("late"))).StatusCode);
    }

    [Fact]
    public async Task Orders_arrive_through_the_phone_sync_and_come_back_on_the_next_pull_with_a_result_per_order()
    {
        var c = await Setup();
        var good = Order(c.Customer, (c.Amoxil, 6)); var bad = Order(c.Customer, (c.Unpriced, 6));
        var push = await Json(await c.Rep.PostAsJsonAsync("/api/v1/sync/push", new SyncPushRequest(null, null, null, null, Orders: new() { good, bad })));
        var results = push.GetProperty("orders");
        Assert.Equal("accepted", results[0].GetProperty("status").GetString());
        Assert.Equal("rejected", results[1].GetProperty("status").GetString());
        var pull = await Json(await c.Rep.GetAsync("/api/v1/sync/pull?since=0"));
        Assert.Equal(1, pull.GetProperty("orders").GetArrayLength());
        Assert.Equal(15m, pull.GetProperty("orders")[0].GetProperty("total").GetDecimal());
        Assert.Equal(2.5m, pull.GetProperty("products").EnumerateArray().First(p => p.GetProperty("name").GetString() == "Amoxil 500").GetProperty("listPrice").GetDecimal());
    }

    [Fact]
    public async Task An_old_or_future_device_time_is_kept_sensible()
    {
        var c = await Setup();
        var future = new OrderDto(Guid.NewGuid(), c.Customer, new() { new(c.Amoxil, 1) }, null, DateTime.UtcNow.AddDays(3));
        var offline = new OrderDto(Guid.NewGuid(), c.Customer, new() { new(c.Amoxil, 1) }, null, DateTime.UtcNow.AddHours(-5));
        await c.Rep.PostAsJsonAsync("/api/v1/orders", future); await c.Rep.PostAsJsonAsync("/api/v1/orders", offline);
        var list = (await Json(await c.Rep.GetAsync("/api/v1/orders"))).EnumerateArray().ToList();
        Assert.All(list, o => Assert.True(o.GetProperty("placedAt").GetDateTime() <= DateTime.UtcNow.AddMinutes(1)));
        Assert.Contains(list, o => o.GetProperty("placedAt").GetDateTime() < DateTime.UtcNow.AddHours(-4)); // the offline order keeps its real time
    }

    [Fact]
    public async Task Only_senior_roles_set_prices_and_an_empty_price_takes_a_product_off_sale()
    {
        var c = await Setup();
        Assert.Equal(HttpStatusCode.Forbidden, (await c.Rep.PutAsJsonAsync("/api/v1/orders/prices", new[] { new PriceDto(c.Unpriced, 4m) })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await c.Admin.PutAsJsonAsync("/api/v1/orders/prices", new[] { new PriceDto(c.Unpriced, 4.255m) })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await c.Rep.PostAsJsonAsync("/api/v1/orders", Order(c.Customer, (c.Unpriced, 2)))).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await c.Admin.PutAsJsonAsync("/api/v1/orders/prices", new[] { new PriceDto(c.Unpriced, null) })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await c.Rep.PostAsJsonAsync("/api/v1/orders", Order(c.Customer, (c.Unpriced, 2)))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await c.Admin.PutAsJsonAsync("/api/v1/orders/prices", new[] { new PriceDto(Guid.NewGuid(), 1m) })).StatusCode);
    }
}
