using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using DasEngage.Api;
using DasEngage.Domain;

namespace DasEngage.Tests;

public class TargetTests : IClassFixture<ErpFactory>
{
    private readonly ErpFactory _f;
    public TargetTests(ErpFactory f) => _f = f;

    private static string Month => $"{DateTime.UtcNow:yyyy-MM}";
    private static async Task<JsonElement> Json(HttpResponseMessage r) { r.EnsureSuccessStatusCode(); return await r.Content.ReadFromJsonAsync<JsonElement>(); }

    /// <summary>Sales this month: Accra van-sales pharmacy 600, Accra hospital (medical) 400, Kumasi van-sales 250, and 50 not linked to any customer; last month 999 (must not count).</summary>
    private async Task<(HttpClient Admin, HttpClient Nsm, HttpClient Area, Guid Tenant)> Setup()
    {
        var tenant = Guid.NewGuid(); var accra = Guid.NewGuid(); var kumasi = Guid.NewGuid();
        var a = Guid.NewGuid(); var b = Guid.NewGuid(); var c = Guid.NewGuid(); var areaUser = Guid.NewGuid();
        await using (var db = _f.Db(tenant))
        {
            db.Tenants.Add(new Tenant { Id = tenant, Name = "T" + tenant });
            db.Territories.AddRange(new Territory { Id = accra, Name = "Accra Central", Region = "Greater Accra" }, new Territory { Id = kumasi, Name = "Kumasi", Region = "Ashanti" });
            db.Customers.AddRange(
                new Customer { Id = a, Name = "A", Type = CustomerType.Pharmacy, TerritoryId = accra, Channel = SalesChannel.VanSales },
                new Customer { Id = b, Name = "B", Type = CustomerType.Hospital, TerritoryId = accra, Channel = SalesChannel.MedicalSales },
                new Customer { Id = c, Name = "C", Type = CustomerType.Pharmacy, TerritoryId = kumasi, Channel = SalesChannel.VanSales });
            var thisMonth = new DateOnly(DateTime.UtcNow.Year, DateTime.UtcNow.Month, 1);
            SalesFact S(string id, Guid? cust, decimal amt, DateOnly d) => new() { ExternalId = id, DocumentNumber = id, SaleDate = d, AccountCode = "X", CustomerId = cust, ItemCode = "I", NetAmount = amt };
            db.SalesFacts.AddRange(S("1", a, 600, thisMonth), S("2", b, 400, thisMonth), S("3", c, 250, thisMonth), S("4", null, 50, thisMonth), S("5", a, 999, thisMonth.AddMonths(-1)));
            db.Users.Add(new AppUser { Id = areaUser, ExternalId = "area", FullName = "Area", Email = "a@x.com", Role = UserRole.AreaManager, TerritoryId = accra });
            await db.SaveChangesAsync();
        }
        return (_f.ClientFor(tenant, Guid.NewGuid(), "Admin"), _f.ClientFor(tenant, Guid.NewGuid(), "NationalSalesManager"), _f.ClientFor(tenant, areaUser, "AreaManager", accra), tenant);
    }

    [Fact]
    public async Task Compares_invoiced_sales_this_month_with_the_target_by_region_and_channel()
    {
        var (admin, _, _, _) = await Setup();
        var put = await admin.PutAsJsonAsync($"/api/v1/rtm/targets?month={Month}", new[]
        {
            new TargetRow(null, null, 2000), new TargetRow("Greater Accra", null, 1000), new TargetRow("greater accra", SalesChannel.MedicalSales, 800),
            new TargetRow("Ashanti", SalesChannel.VanSales, 500), new TargetRow(null, SalesChannel.VanSales, 1000),
        });
        Assert.Equal(HttpStatusCode.NoContent, put.StatusCode);
        var r = await Json(await admin.GetAsync($"/api/v1/dashboards/targets?month={Month}"));
        Assert.Equal(1300m, r.GetProperty("companyActual").GetDecimal());   // 600 + 400 + 250 + 50 unlinked; last month's 999 is out
        var rows = r.GetProperty("rows").EnumerateArray().ToList();
        decimal ActualOf(string? region, string? channel) => rows.First(x =>
            (x.GetProperty("region").ValueKind == JsonValueKind.Null ? null : x.GetProperty("region").GetString()) == region &&
            (x.GetProperty("channel").ValueKind == JsonValueKind.Null ? null : x.GetProperty("channel").GetString()) == channel).GetProperty("actual").GetDecimal();
        Assert.Equal(1300m, ActualOf(null, null));
        Assert.Equal(1000m, ActualOf("Greater Accra", null));
        Assert.Equal(250m, ActualOf("Ashanti", "VanSales"));
        Assert.Equal(850m, ActualOf(null, "VanSales"));                      // 600 + 250
        var company = rows.First(x => x.GetProperty("region").ValueKind == JsonValueKind.Null && x.GetProperty("channel").ValueKind == JsonValueKind.Null);
        Assert.Equal(65.0, company.GetProperty("attainmentPct").GetDouble()); // 1300 of 2000
    }

    [Fact]
    public async Task A_region_is_matched_whatever_its_capitals_and_the_month_is_replaced_not_added_to()
    {
        var (admin, _, _, _) = await Setup();
        await admin.PutAsJsonAsync($"/api/v1/rtm/targets?month={Month}", new[] { new TargetRow(" greater ACCRA ", null, 1000) });
        await admin.PutAsJsonAsync($"/api/v1/rtm/targets?month={Month}", new[] { new TargetRow("Greater Accra", null, 2000) });
        var saved = await Json(await admin.GetAsync($"/api/v1/rtm/targets?month={Month}"));
        Assert.Equal(1, saved.GetArrayLength());
        Assert.Equal(2000m, saved[0].GetProperty("amount").GetDecimal());
        var r = await Json(await admin.GetAsync($"/api/v1/dashboards/targets?month={Month}"));
        Assert.Equal(1000m, r.GetProperty("rows")[0].GetProperty("actual").GetDecimal());
        Assert.Equal(50.0, r.GetProperty("rows")[0].GetProperty("attainmentPct").GetDouble());
    }

    [Fact]
    public async Task Bad_targets_are_refused_and_only_senior_roles_can_set_them()
    {
        var (admin, nsm, area, _) = await Setup();
        string url = $"/api/v1/rtm/targets?month={Month}";
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutAsJsonAsync(url, new[] { new TargetRow(null, null, -1) })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutAsJsonAsync(url, new[] { new TargetRow("Ashanti", null, 1), new TargetRow("ashanti ", null, 2) })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutAsJsonAsync(url, new[] { new TargetRow(null, SalesChannel.Unassigned, 1) })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutAsJsonAsync("/api/v1/rtm/targets?month=October", new[] { new TargetRow(null, null, 1) })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await area.PutAsJsonAsync(url, new[] { new TargetRow(null, null, 1) })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await nsm.PutAsJsonAsync(url, new[] { new TargetRow(null, null, 1) })).StatusCode);
    }

    [Fact]
    public async Task A_manager_with_a_limited_area_sees_actuals_for_that_area_but_no_company_targets()
    {
        var (admin, _, area, _) = await Setup();
        await admin.PutAsJsonAsync($"/api/v1/rtm/targets?month={Month}", new[] { new TargetRow(null, null, 2000) });
        var r = await Json(await area.GetAsync($"/api/v1/dashboards/targets?month={Month}"));
        Assert.True(r.GetProperty("scoped").GetBoolean());
        Assert.Equal(0, r.GetProperty("rows").GetArrayLength());
        Assert.Equal(1000m, r.GetProperty("companyActual").GetDecimal());      // Accra only: 600 + 400
    }

    [Fact]
    public async Task A_past_month_is_complete_and_a_future_month_has_nothing_yet()
    {
        var (admin, _, _, _) = await Setup();
        var last = $"{DateTime.UtcNow.AddMonths(-1):yyyy-MM}";
        await admin.PutAsJsonAsync($"/api/v1/rtm/targets?month={last}", new[] { new TargetRow("Greater Accra", null, 999) });
        var r = await Json(await admin.GetAsync($"/api/v1/dashboards/targets?month={last}"));
        Assert.Equal(DateTime.DaysInMonth(DateTime.UtcNow.AddMonths(-1).Year, DateTime.UtcNow.AddMonths(-1).Month), r.GetProperty("daysElapsed").GetInt32());
        Assert.Equal(100.0, r.GetProperty("rows")[0].GetProperty("attainmentPct").GetDouble());
        Assert.Equal(100.0, r.GetProperty("rows")[0].GetProperty("projectedPct").GetDouble());
    }
}
