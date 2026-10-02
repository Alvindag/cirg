using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using DasEngage.Api.Erp;
using DasEngage.Domain;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace DasEngage.Tests;

/// <summary>Answers Business Central and Entra requests from a script and records what was asked.</summary>
public class FakeBc : HttpMessageHandler
{
    public readonly List<(HttpMethod Method, Uri Uri, string Body, string? Auth)> Calls = new();
    public Func<HttpRequestMessage, string, HttpResponseMessage?>? Respond;
    public int TokenRequests => Calls.Count(c => c.Uri.Host == "login.microsoftonline.com");

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage req, CancellationToken ct)
    {
        var body = req.Content is null ? "" : await req.Content.ReadAsStringAsync(ct);
        Calls.Add((req.Method, req.RequestUri!, body, req.Headers.Authorization?.ToString()));
        if (req.RequestUri!.Host == "login.microsoftonline.com")
            return Json("""{ "access_token": "tok-1", "expires_in": 3599 }""");
        return Respond?.Invoke(req, body) ?? new HttpResponseMessage(HttpStatusCode.NotFound);
    }

    public static HttpResponseMessage Json(string json, HttpStatusCode code = HttpStatusCode.OK) =>
        new(code) { Content = new StringContent(json, System.Text.Encoding.UTF8, "application/json") };
}

public class BusinessCentralTests
{
    private const string Company = "11111111-2222-3333-4444-555555555555";
    private static string Root(string tenant = "t-1") => $"https://api.businesscentral.dynamics.com/v2.0/{tenant}/Production/api/v2.0/companies({Company})";
    private class Secrets : ISecretProvider { public string? Get(string name) => name == "BC_SECRET" ? "s3cret" : null; }

    private static (BusinessCentralConnector Bc, FakeBc Fake, ErpConnection Conn) Make(string tenant = "t-1", string? vendor = "V0001", string? clientId = "client-1")
    {
        var cfg = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Erp:BusinessCentral:ClientId"] = clientId, ["Erp:BusinessCentral:DefaultVendorNumber"] = vendor,
        }).Build();
        var fake = new FakeBc();
        var now = new DateTime(2026, 10, 2, 8, 0, 0, DateTimeKind.Utc);
        return (new BusinessCentralConnector(new HttpClient(fake), new Secrets(), cfg, () => now), fake,
            new ErpConnection { Provider = "businesscentral", BaseUrl = Root(tenant), SecretName = "BC_SECRET", Enabled = true });
    }

    [Theory]
    [InlineData("https://api.businesscentral.dynamics.com/v2.0/t-1/Production/api/v2.0/companies(11111111-2222-3333-4444-555555555555)", true)]
    [InlineData("https://api.businesscentral.dynamics.com/v2.0/contoso.onmicrosoft.com/Sandbox/api/v2.0/companies(11111111-2222-3333-4444-555555555555)/", true)]
    [InlineData("http://api.businesscentral.dynamics.com/v2.0/t-1/Production/api/v2.0/companies(11111111-2222-3333-4444-555555555555)", false)]
    [InlineData("https://evil.example.com/v2.0/t-1/Production/api/v2.0/companies(11111111-2222-3333-4444-555555555555)", false)]
    [InlineData("https://api.businesscentral.dynamics.com.evil.example.com/v2.0/t-1/Production/api/v2.0/companies(11111111-2222-3333-4444-555555555555)", false)]
    [InlineData("https://api.businesscentral.dynamics.com/v2.0/t-1/Production/api/v2.0/companies(not-a-guid)", false)]
    [InlineData("https://api.businesscentral.dynamics.com/v2.0/t-1/Production/api/v2.0/companies(11111111-2222-3333-4444-555555555555)?x=1", false)]
    [InlineData("https://user:pw@api.businesscentral.dynamics.com/v2.0/t-1/Production/api/v2.0/companies(11111111-2222-3333-4444-555555555555)", false)]
    [InlineData("", false)]
    public void Only_a_company_api_root_is_accepted(string url, bool ok) => Assert.Equal(ok, BusinessCentralConnector.ValidateBaseUrl(url) is null);

    [Fact]
    public async Task Signing_in_uses_client_credentials_and_the_token_is_reused()
    {
        var (bc, fake, conn) = Make("tenant-reuse");
        fake.Respond = (_, _) => FakeBc.Json("{}");
        Assert.Null(await bc.PingAsync(conn));
        Assert.Null(await bc.PingAsync(conn));
        Assert.Equal(1, fake.TokenRequests);
        var token = fake.Calls.First(c => c.Uri.Host == "login.microsoftonline.com");
        Assert.Equal("https://login.microsoftonline.com/tenant-reuse/oauth2/v2.0/token", token.Uri.ToString());
        Assert.Contains("grant_type=client_credentials", token.Body);
        Assert.Contains("scope=https%3A%2F%2Fapi.businesscentral.dynamics.com%2F.default", token.Body);
        Assert.Equal("Bearer tok-1", fake.Calls.Last().Auth);
    }

    [Fact]
    public async Task Sign_in_problems_are_reported_without_calling_business_central()
    {
        var (bc, fake, conn) = Make("tenant-nosecret");
        conn.SecretName = "MISSING";
        Assert.Contains("client secret was not found", await bc.PingAsync(conn));
        var (noClient, _, c2) = Make("tenant-noclient", clientId: null);
        Assert.Contains("not configured", await noClient.PingAsync(c2));
        Assert.Empty(fake.Calls);
    }

    [Theory]
    [InlineData(HttpStatusCode.Forbidden, "refused access")]
    [InlineData(HttpStatusCode.NotFound, "did not find that environment")]
    public async Task Ping_explains_the_usual_failures(HttpStatusCode code, string text)
    {
        var (bc, fake, conn) = Make("tenant-ping");
        fake.Respond = (_, _) => new HttpResponseMessage(code);
        Assert.Contains(text, await bc.PingAsync(conn));
    }

    [Fact]
    public async Task Products_are_pulled_modified_since_the_cursor_and_mapped()
    {
        var (bc, fake, conn) = Make("tenant-products");
        fake.Respond = (_, _) => FakeBc.Json("""
            { "value": [
              { "number": "AMX500", "displayName": " Amoxil 500mg ", "itemCategoryCode": "ANTIINF", "unitCost": 1.25, "lastModifiedDateTime": "2026-10-01T08:00:00.123Z" },
              { "number": "", "displayName": "No code", "lastModifiedDateTime": "2026-10-01T08:00:00.123Z" },
              { "number": "CRD10", "displayName": "Cardiostat", "unitCost": 2, "lastModifiedDateTime": "2026-10-01T09:00:00Z" } ] }
            """);
        var r = await bc.PullAsync<ErpProduct>(conn, "products", "2026-09-30T00:00:00Z~2");
        Assert.Null(r.Error);
        Assert.Equal(new[] { "AMX500", "CRD10" }, r.Items.Select(i => i.ItemCode));
        Assert.Equal(new ErpProduct("AMX500", "Amoxil 500mg", "ANTIINF", 1.25m, null), r.Items[0]);
        Assert.Equal("2026-10-01T09:00:00Z~1", r.NextCursor);
        var q = Uri.UnescapeDataString(fake.Calls.Last().Uri.Query);
        Assert.Contains("type eq 'Inventory' and lastModifiedDateTime ge 2026-09-30T00:00:00Z", q);
        Assert.Contains("$skip=2", q);
        Assert.Contains("$orderby=lastModifiedDateTime", q);
    }

    [Fact]
    public void The_cursor_survives_many_records_with_the_same_timestamp()
    {
        const string T0 = "2026-10-01T08:00:00Z", T1 = "2026-10-01T09:00:00Z", T2 = "2026-10-01T10:00:00Z";
        // a page ended in the middle of records sharing a timestamp: the next read skips the ones already seen
        Assert.Equal($"{T1}~3", BusinessCentralConnector.NextCursor(null, new() { T0, T1, T1, T1 }));
        Assert.Equal($"{T1}~5", BusinessCentralConnector.NextCursor($"{T1}~3", new() { T1, T1 }));
        Assert.Equal($"{T2}~1", BusinessCentralConnector.NextCursor($"{T1}~5", new() { T1, T2 }));
        Assert.Null(BusinessCentralConnector.NextCursor($"{T1}~5", new()));
    }

    [Fact]
    public void A_cursor_that_is_not_a_timestamp_is_never_put_in_a_filter()
    {
        Assert.Equal((null, 0), BusinessCentralConnector.ParseCursor("2026-01-01T00:00:00Z' or 1 eq 1"));
        Assert.Equal(("2026-01-01T00:00:00Z", 4), BusinessCentralConnector.ParseCursor("2026-01-01T00:00:00Z~4"));
    }

    [Fact]
    public async Task Customers_are_mapped_and_their_type_is_left_for_DAS_to_decide()
    {
        var (bc, fake, conn) = Make("tenant-customers");
        fake.Respond = (_, _) => FakeBc.Json("""
            { "value": [ { "number": "C001", "displayName": "Ernest Chemists Osu", "type": "Company", "city": "Accra", "phoneNumber": "", "email": "a@b.gh", "lastModifiedDateTime": "2026-10-01T08:00:00Z" } ] }
            """);
        var r = await bc.PullAsync<ErpCustomer>(conn, "customers", null);
        Assert.Equal(new ErpCustomer("C001", "Ernest Chemists Osu", null, "Accra", null, "a@b.gh"), Assert.Single(r.Items));
    }

    [Fact]
    public async Task Sales_come_from_invoices_and_credit_memos_with_credit_memos_negative()
    {
        var (bc, fake, conn) = Make("tenant-sales");
        fake.Respond = (req, _) =>
        {
            var path = req.RequestUri!.AbsolutePath;
            if (path.EndsWith("/salesInvoices")) return FakeBc.Json("""
                { "value": [ { "number": "INV-1001", "invoiceDate": "2026-09-30", "customerNumber": "C001", "currencyCode": "", "status": "Open", "lastModifiedDateTime": "2026-09-30T10:00:00Z",
                  "salesInvoiceLines": [
                    { "sequence": 10000, "lineType": "Item", "lineObjectNumber": "AMX500", "quantity": 10, "netAmount": 250.00 },
                    { "sequence": 20000, "lineType": "Comment", "lineObjectNumber": "", "quantity": 0, "netAmount": 0 },
                    { "sequence": 30000, "lineType": "Item", "lineObjectNumber": "CRD10", "quantity": 2, "netAmount": 40.5 } ] } ] }
                """);
            if (path.EndsWith("/salesCreditMemos")) return FakeBc.Json("""
                { "value": [ { "number": "CM-7", "creditMemoDate": "2026-10-01", "customerNumber": "C001", "currencyCode": "USD", "status": "Open", "lastModifiedDateTime": "2026-10-01T10:00:00Z",
                  "salesCreditMemoLines": [ { "sequence": 10000, "lineType": "Item", "lineObjectNumber": "AMX500", "quantity": 1, "netAmount": 25.00 } ] } ] }
                """);
            return null;
        };
        var r = await bc.PullAsync<ErpSale>(conn, "sales", null);
        Assert.Null(r.Error);
        Assert.Equal(3, r.Items.Count);
        Assert.Equal(new ErpSale("INV:INV-1001/10000", "INV-1001", new DateOnly(2026, 9, 30), "C001", "AMX500", 10, 250m, null), r.Items[0]);
        Assert.Equal(new ErpSale("CM:CM-7/10000", "CM-7", new DateOnly(2026, 10, 1), "C001", "AMX500", -1, -25m, "USD"), r.Items[2]);
        Assert.Equal("I=2026-09-30T10:00:00Z~1;C=2026-10-01T10:00:00Z~1", r.NextCursor);
        Assert.All(fake.Calls.Where(c => c.Uri.Host != "login.microsoftonline.com"), c => Assert.Contains("status ne 'Draft'", Uri.UnescapeDataString(c.Uri.Query)));

        // the next call continues each source from its own position
        fake.Calls.Clear();
        await bc.PullAsync<ErpSale>(conn, "sales", r.NextCursor);
        var queries = fake.Calls.Where(c => c.Uri.Host != "login.microsoftonline.com").Select(c => Uri.UnescapeDataString(c.Uri.Query)).ToList();
        Assert.Contains(queries, q => q.Contains("lastModifiedDateTime ge 2026-09-30T10:00:00Z") && q.Contains("$skip=1"));
        Assert.Contains(queries, q => q.Contains("lastModifiedDateTime ge 2026-10-01T10:00:00Z") && q.Contains("$skip=1"));
    }

    [Fact]
    public async Task Nothing_new_in_sales_leaves_the_cursor_alone()
    {
        var (bc, fake, conn) = Make("tenant-sales-idle");
        fake.Respond = (_, _) => FakeBc.Json("""{ "value": [] }""");
        var r = await bc.PullAsync<ErpSale>(conn, "sales", "I=2026-09-30T10:00:00Z~1");
        Assert.Empty(r.Items);
        Assert.Null(r.NextCursor);
    }

    [Fact]
    public async Task Stock_is_a_full_snapshot_that_resets_its_cursor_at_the_end()
    {
        var (bc, fake, conn) = Make("tenant-stock");
        fake.Respond = (_, _) => FakeBc.Json("""{ "value": [ { "number": "AMX500", "inventory": 480.5 }, { "number": "CRD10", "inventory": 0 }, { "number": "X", "inventory": null } ] }""");
        var r = await bc.PullAsync<ErpStockLevel>(conn, "stock-levels", null);
        Assert.Equal(2, r.Items.Count);
        Assert.Equal(new ErpStockLevel("AMX500", null, 480.5m, new DateTime(2026, 10, 2, 8, 0, 0, DateTimeKind.Utc)), r.Items[0]);
        Assert.Equal(PullCursor.Reset, r.NextCursor); // a short page is the last page

        var full = string.Join(",", Enumerable.Range(0, BusinessCentralConnector.PageSize).Select(i => $"{{ \"number\": \"I{i}\", \"inventory\": 1 }}"));
        fake.Respond = (_, _) => FakeBc.Json($"{{ \"value\": [ {full} ] }}");
        var page = await bc.PullAsync<ErpStockLevel>(conn, "stock-levels", "1000");
        Assert.Equal("2000", page.NextCursor);
        Assert.Contains("$skip=1000", fake.Calls.Last().Uri.Query);
    }

    [Fact]
    public async Task Goods_receipts_are_not_pulled_because_the_standard_api_has_no_batches()
    {
        var (bc, fake, conn) = Make("tenant-gr");
        var r = await bc.PullAsync<ErpGoodsReceipt>(conn, "goods-receipts", null);
        Assert.Empty(r.Items); Assert.Null(r.Error); Assert.Empty(fake.Calls);
    }

    [Fact]
    public async Task A_failed_read_reports_the_entity_and_keeps_the_cursor()
    {
        var (bc, fake, conn) = Make("tenant-fail");
        fake.Respond = (_, _) => new HttpResponseMessage(HttpStatusCode.ServiceUnavailable);
        var r = await bc.PullAsync<ErpProduct>(conn, "products", "2026-01-01T00:00:00Z~1");
        Assert.Contains("503", r.Error); Assert.Contains("items", r.Error); Assert.Null(r.NextCursor);
        fake.Respond = (_, _) => FakeBc.Json("""{ "unexpected": true }""");
        Assert.Contains("unexpected shape", (await bc.PullAsync<ErpProduct>(conn, "products", null)).Error);
    }

    private static OutboxMessage Msg(string type, object payload) =>
        new() { Id = Guid.NewGuid(), Type = type, CreatedAt = DateTime.UtcNow, Payload = JsonSerializer.Serialize(payload, ErpJson.Options) };

    [Fact]
    public async Task A_requisition_becomes_a_draft_purchase_order_and_returns_its_number()
    {
        var (bc, fake, conn) = Make("tenant-po");
        fake.Respond = (req, _) => req.RequestUri!.AbsolutePath.EndsWith("/purchaseOrders")
            ? FakeBc.Json("""{ "id": "po-guid", "number": "PO-0042" }""", HttpStatusCode.Created)
            : FakeBc.Json("{}", HttpStatusCode.Created);
        var r = await bc.SendAsync(conn, Msg("purchase.requisition", new { requisitionId = Guid.NewGuid(), itemCode = "AMX500", quantity = 300, neededBy = "2026-11-01" }));
        Assert.True(r.Success); Assert.Equal("PO-0042", r.Reference);
        var calls = fake.Calls.Where(c => c.Uri.Host != "login.microsoftonline.com").ToList();
        Assert.Contains("\"vendorNumber\":\"V0001\"", calls[0].Body);
        Assert.EndsWith("purchaseOrders(po-guid)/purchaseOrderLines", calls[1].Uri.AbsolutePath);
        Assert.Contains("\"lineObjectNumber\":\"AMX500\"", calls[1].Body);
        Assert.Contains("\"expectedReceiptDate\":\"2026-11-01\"", calls[1].Body);
    }

    [Fact]
    public async Task A_requisition_whose_line_is_refused_leaves_no_empty_order_behind()
    {
        var (bc, fake, conn) = Make("tenant-po-fail");
        fake.Respond = (req, _) =>
            req.Method == HttpMethod.Delete ? FakeBc.Json("{}", HttpStatusCode.NoContent)
            : req.RequestUri!.AbsolutePath.EndsWith("/purchaseOrders") ? FakeBc.Json("""{ "id": "po-guid", "number": "PO-0042" }""", HttpStatusCode.Created)
            : FakeBc.Json("""{ "error": { "message": "Item AMX500 is blocked" } }""", HttpStatusCode.BadRequest);
        var r = await bc.SendAsync(conn, Msg("purchase.requisition", new { itemCode = "AMX500", quantity = 5 }));
        Assert.False(r.Success); Assert.True(r.Permanent); Assert.Contains("blocked", r.Error);
        Assert.Contains(fake.Calls, c => c.Method == HttpMethod.Delete && c.Uri.AbsolutePath.EndsWith("purchaseOrders(po-guid)"));
    }

    [Fact]
    public async Task A_requisition_needs_a_vendor_and_an_item()
    {
        var (noVendor, _, c1) = Make("tenant-po-v", vendor: "");
        Assert.Contains("default vendor", (await noVendor.SendAsync(c1, Msg("purchase.requisition", new { itemCode = "A", quantity = 1 }))).Error);
        var (bc, _, c2) = Make("tenant-po-i");
        var r = await bc.SendAsync(c2, Msg("purchase.requisition", new { quantity = 1 }));
        Assert.True(r.Permanent);
    }

    [Fact]
    public async Task Sample_movements_go_to_the_custom_api_and_a_repeat_counts_as_delivered()
    {
        var (bc, fake, conn) = Make("tenant-samples");
        var m = Msg("sample.issue", new { requestId = Guid.NewGuid(), lines = new[] { new { itemCode = "AMX500", batchNumber = "B1", quantity = 5 } } });
        fake.Respond = (_, _) => FakeBc.Json("""{ "number": "TO-9" }""", HttpStatusCode.Created);
        var r = await bc.SendAsync(conn, m);
        Assert.True(r.Success); Assert.Equal("TO-9", r.Reference);
        var call = fake.Calls.Last();
        Assert.Equal($"/v2.0/tenant-samples/Production/api/das/engage/v1.0/companies({Company})/sampleMovements", call.Uri.AbsolutePath);
        Assert.Contains(m.Id.ToString(), call.Body);
        Assert.Contains("sample.issue", call.Body);

        fake.Respond = (_, _) => new HttpResponseMessage(HttpStatusCode.Conflict);
        Assert.True((await bc.SendAsync(conn, m)).Success);
    }

    [Theory]
    [InlineData(HttpStatusCode.BadRequest, true)]
    [InlineData(HttpStatusCode.NotFound, true)]
    [InlineData(HttpStatusCode.TooManyRequests, false)]
    [InlineData(HttpStatusCode.ServiceUnavailable, false)]
    [InlineData(HttpStatusCode.Unauthorized, false)]
    public async Task Only_errors_that_will_never_succeed_are_permanent(HttpStatusCode code, bool permanent)
    {
        var (bc, fake, conn) = Make("tenant-codes");
        fake.Respond = (_, _) => FakeBc.Json("""{ "error": { "message": "no" } }""", code);
        var r = await bc.SendAsync(conn, Msg("sample.return", new { quantity = 1 }));
        Assert.False(r.Success); Assert.Equal(permanent, r.Permanent);
    }

    [Fact]
    public async Task The_router_picks_the_connector_by_provider()
    {
        var (bc, _, conn) = Make("tenant-router");
        var rest = new RestErpConnector(new HttpClient(new FakeBc()), new Secrets(), new ConfigurationBuilder().Build());
        var router = new ErpConnectorRouter(rest, bc);
        conn.Provider = "none";
        Assert.Contains("No ERP gateway", await router.PingAsync(conn));
        conn.Provider = "businesscentral"; conn.BaseUrl = "https://example.com";
        Assert.Contains("api.businesscentral.dynamics.com", await router.PingAsync(conn)); // handled by the Business Central connector
    }
}
