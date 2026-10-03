using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using DasEngage.Api;
using DasEngage.Domain;

namespace DasEngage.Tests;

public class DeliveryTests : IClassFixture<ErpFactory>
{
    private readonly ErpFactory _f;
    public DeliveryTests(ErpFactory f) => _f = f;

    private static async Task<JsonElement> Json(HttpResponseMessage r) { r.EnsureSuccessStatusCode(); return await r.Content.ReadFromJsonAsync<JsonElement>(); }

    private async Task<(HttpClient Rep, HttpClient Admin, Guid Customer, Guid Product, Guid Tenant)> Setup()
    {
        var tenant = Guid.NewGuid(); var terr = Guid.NewGuid(); var north = Guid.NewGuid(); var customer = Guid.NewGuid(); var product = Guid.NewGuid();
        await using (var db = _f.Db(tenant))
        {
            db.Tenants.Add(new Tenant { Id = tenant, Name = "T" + tenant });
            db.Territories.AddRange(new Territory { Id = terr, Name = "Accra Central", Region = "Greater Accra" }, new Territory { Id = north, Name = "Tamale", Region = "Northern" });
            db.Customers.Add(new Customer { Id = customer, Name = "Korle Pharmacy", Type = CustomerType.Pharmacy, TerritoryId = terr });
            db.Products.Add(new Product { Id = product, Name = "Amoxil", Code = "AMX", ListPrice = 10m });
            await db.SaveChangesAsync();
        }
        return (_f.ClientFor(tenant, Guid.NewGuid(), "Rep", terr), _f.ClientFor(tenant, Guid.NewGuid(), "Admin"), customer, product, tenant);
    }

    private static OrderDto Order(Guid customer, Guid product) => new(Guid.NewGuid(), customer, new() { new(product, 2) }, null, null);

    [Fact]
    public async Task Confirming_promises_delivery_two_days_on_by_default_or_on_the_date_given_and_not_in_the_past()
    {
        var (rep, admin, cust, prod, _) = await Setup();
        var a = Order(cust, prod); var b = Order(cust, prod); var c = Order(cust, prod);
        foreach (var o in new[] { a, b, c }) await rep.PostAsJsonAsync("/api/v1/orders", o);
        var confirmedA = await Json(await admin.PostAsync($"/api/v1/orders/{a.Id}/confirm", null));
        var promised = confirmedA.GetProperty("promisedAt").GetDateTime();
        Assert.InRange((promised - DateTime.UtcNow).TotalHours, 47, 49);
        var day = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(5));
        var confirmedB = await Json(await admin.PostAsJsonAsync($"/api/v1/orders/{b.Id}/confirm", new ConfirmDto(null, day)));
        Assert.Equal(day, DateOnly.FromDateTime(confirmedB.GetProperty("promisedAt").GetDateTime()));
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsJsonAsync($"/api/v1/orders/{c.Id}/confirm", new ConfirmDto(null, DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-2))))).StatusCode);
    }

    [Fact]
    public async Task A_short_delivery_needs_a_note_and_is_recorded_as_not_in_full()
    {
        var (rep, admin, cust, prod, _) = await Setup();
        var o = Order(cust, prod);
        await rep.PostAsJsonAsync("/api/v1/orders", o);
        await admin.PostAsync($"/api/v1/orders/{o.Id}/confirm", null);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsJsonAsync($"/api/v1/orders/{o.Id}/deliver", new DeliverDto(false, " "))).StatusCode);
        var done = await Json(await admin.PostAsJsonAsync($"/api/v1/orders/{o.Id}/deliver", new DeliverDto(false, "Only 1 carton, 1 backordered")));
        Assert.False(done.GetProperty("deliveredInFull").GetBoolean());
        Assert.Equal("Only 1 carton, 1 backordered", done.GetProperty("shortfallNote").GetString());
    }

    [Fact]
    public async Task Delivering_with_no_details_counts_as_in_full()
    {
        var (rep, admin, cust, prod, _) = await Setup();
        var o = Order(cust, prod);
        await rep.PostAsJsonAsync("/api/v1/orders", o);
        await admin.PostAsync($"/api/v1/orders/{o.Id}/confirm", null);
        var done = await Json(await admin.PostAsync($"/api/v1/orders/{o.Id}/deliver", null));
        Assert.True(done.GetProperty("deliveredInFull").GetBoolean());
    }

    [Fact]
    public async Task The_summary_reports_on_time_in_full_and_both_for_delivered_orders_and_by_region_and_counts_late_open_orders()
    {
        var (_, admin, cust, prod, tenant) = await Setup();
        var north = Guid.NewGuid(); var tamale = Guid.NewGuid();
        await using (var db = _f.Db(tenant))
        {
            db.Territories.Add(new Territory { Id = north, Name = "Tamale North", Region = "Northern" });
            db.Customers.Add(new Customer { Id = tamale, Name = "Tamale Clinic", Type = CustomerType.Clinic, TerritoryId = north });
            var now = DateTime.UtcNow; var rep = Guid.NewGuid(); var n = 0;
            SalesOrder O(Guid customer, OrderStatus status, DateTime promised, DateTime? delivered, bool? full) => new()
            {
                Number = $"ORD-T-{++n}", RepId = rep, CustomerId = customer, CustomerName = "x", Status = status, Total = 10, PlacedAt = now.AddDays(-5),
                ConfirmedAt = now.AddDays(-4), PromisedAt = promised, DeliveredAt = delivered, DeliveredInFull = full,
            };
            db.Orders.AddRange(
                O(cust, OrderStatus.Delivered, now.AddDays(-2), now.AddDays(-3), true),     // on time, in full
                O(cust, OrderStatus.Delivered, now.AddDays(-2), now.AddDays(-1), true),     // late, in full
                O(tamale, OrderStatus.Delivered, now.AddDays(-2), now.AddDays(-3), false),  // on time, short
                O(tamale, OrderStatus.Delivered, now.AddDays(-2), now.AddDays(-1), false),  // late and short
                O(cust, OrderStatus.Confirmed, now.AddDays(-1), null, null),                // promised yesterday, still not delivered
                O(cust, OrderStatus.Confirmed, now.AddDays(1), null, null));                // not late yet
            await db.SaveChangesAsync();
        }
        var s = await Json(await admin.GetAsync("/api/v1/orders/summary?days=30"));
        var svc = s.GetProperty("service");
        Assert.Equal(4, svc.GetProperty("judged").GetInt32());
        Assert.Equal(50.0, svc.GetProperty("onTimePct").GetDouble());
        Assert.Equal(50.0, svc.GetProperty("inFullPct").GetDouble());
        Assert.Equal(25.0, svc.GetProperty("otifPct").GetDouble());                         // only the first order was both
        Assert.Equal(1, s.GetProperty("lateOpen").GetInt32());
        var regions = s.GetProperty("regions").EnumerateArray().ToDictionary(r => r.GetProperty("region").GetString()!);
        Assert.Equal(50.0, regions["Greater Accra"].GetProperty("otifPct").GetDouble());    // one of two
        Assert.Equal(0.0, regions["Northern"].GetProperty("otifPct").GetDouble());
    }

    [Fact]
    public async Task Without_delivered_orders_there_are_no_percentages_not_zeros()
    {
        var (_, admin, _, _, _) = await Setup();
        var s = await Json(await admin.GetAsync("/api/v1/orders/summary"));
        Assert.Equal(JsonValueKind.Null, s.GetProperty("service").GetProperty("otifPct").ValueKind);
        Assert.Equal(0, s.GetProperty("regions").GetArrayLength());
    }
}
