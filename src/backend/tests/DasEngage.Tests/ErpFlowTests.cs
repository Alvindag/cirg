using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using DasEngage.Api;
using DasEngage.Api.Erp;
using DasEngage.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using DasEngage.Infrastructure;
using Microsoft.Extensions.DependencyInjection;

namespace DasEngage.Tests;

public class ErpFlowTests : IClassFixture<ErpFactory>
{
    private readonly ErpFactory _f;
    public ErpFlowTests(ErpFactory f) => _f = f;

    private record Ctx(Guid Tenant, HttpClient Admin, Guid AdminId, HttpClient Other);

    private async Task<Ctx> Setup(bool connect = false)
    {
        var tenant = Guid.NewGuid(); var adminId = Guid.NewGuid();
        await using (var db = _f.Db(tenant)) { db.Tenants.Add(new Tenant { Id = tenant, Name = "T" + tenant }); await db.SaveChangesAsync(); }
        var c = new Ctx(tenant, _f.ClientFor(tenant, adminId, "Admin"), adminId, _f.ClientFor(tenant, Guid.NewGuid(), "NationalSalesManager"));
        if (connect) await Connect(c);
        return c;
    }

    private static async Task Connect(Ctx c, bool outbound = true, bool pull = false) =>
        (await c.Admin.PutAsJsonAsync("/api/v1/erp/connection", new ConnectionDto("rest", "https://erp-gateway.example.com", "ERP_TOKEN", true, outbound, pull, 60, "GHS"))).EnsureSuccessStatusCode();

    private static async Task<JsonElement> Json(HttpResponseMessage r) { r.EnsureSuccessStatusCode(); return await r.Content.ReadFromJsonAsync<JsonElement>(); }
    private static DateOnly D(int offset) => DateOnly.FromDateTime(DateTime.UtcNow.AddDays(offset));

    private static async Task<Guid> Product(Ctx c, string code, string name, decimal? cost = 2.5m, int? reorder = null)
    {
        (await c.Admin.PostAsJsonAsync("/api/v1/erp/import/products", new[] { new ErpProduct(code, name, null, cost, reorder) }, ErpJson.Options)).EnsureSuccessStatusCode();
        return (await c.Admin.GetFromJsonAsync<JsonElement>("/api/v1/admin/products")).EnumerateArray().First(p => p.GetProperty("code").GetString() == code).GetProperty("id").GetGuid();
    }

    private static Task<HttpResponseMessage> Receive(Ctx c, string id, string item, string batch, int expiryDays, int qty, string? requisition = null) =>
        c.Admin.PostAsJsonAsync("/api/v1/erp/import/goods-receipts", new[] { new ErpGoodsReceipt(id, item, batch, D(expiryDays), qty, requisition, null) }, ErpJson.Options);

    private static async Task<int> CentralBalance(Ctx c, Guid batchId)
    {
        var ledger = await c.Admin.GetFromJsonAsync<JsonElement>($"/api/v1/samples/reports/ledger?batchId={batchId}");
        return ledger.EnumerateArray().Where(m => m.GetProperty("holderId").ValueKind == JsonValueKind.Null).Sum(m => m.GetProperty("delta").GetInt32());
    }

    // ---------- goods receipts and stock reconciliation ----------

    [Fact]
    public async Task A_goods_receipt_creates_the_batch_and_warehouse_stock_once()
    {
        var c = await Setup();
        await Product(c, "AMX500", "Amoxil");
        var r = await Json(await Receive(c, "GR-1", "AMX500", "B-2611", 400, 500));
        Assert.Equal(1, r.GetProperty("created").GetInt32());
        var batches = await c.Admin.GetFromJsonAsync<JsonElement>("/api/v1/samples/batches");
        var batch = batches.EnumerateArray().Single(b => b.GetProperty("batchNumber").GetString() == "B-2611");
        Assert.Equal(500, await CentralBalance(c, batch.GetProperty("id").GetGuid()));

        var again = await Json(await Receive(c, "GR-1", "AMX500", "B-2611", 400, 500));
        Assert.Equal("duplicate", again.GetProperty("items")[0].GetProperty("status").GetString());
        Assert.Equal(500, await CentralBalance(c, batch.GetProperty("id").GetGuid())); // not received twice

        var second = await Json(await Receive(c, "GR-2", "AMX500", "B-2611", 400, 100)); // same batch, more stock
        Assert.Equal(1, second.GetProperty("created").GetInt32());
        Assert.Equal(600, await CentralBalance(c, batch.GetProperty("id").GetGuid()));
        Assert.Equal(1, (await c.Admin.GetFromJsonAsync<JsonElement>("/api/v1/samples/batches")).GetArrayLength());
    }

    [Fact]
    public async Task Receipts_that_do_not_make_sense_are_refused()
    {
        var c = await Setup();
        await Product(c, "AMX500", "Amoxil");
        await Receive(c, "GR-1", "AMX500", "B-1", 300, 50);
        async Task<(string Status, string? Message)> One(Task<HttpResponseMessage> t) { var i = (await Json(await t)).GetProperty("items")[0]; return (i.GetProperty("status").GetString()!, i.GetProperty("message").GetString()); }

        Assert.Contains("Unknown item", (await One(Receive(c, "GR-2", "NOPE", "B-2", 300, 5))).Message);
        Assert.Contains("already expired", (await One(Receive(c, "GR-3", "AMX500", "B-3", -1, 5))).Message);
        Assert.Contains("exists with expiry", (await One(Receive(c, "GR-4", "AMX500", "B-1", 100, 5))).Message); // same batch, different expiry
        Assert.Contains("between 1 and", (await One(Receive(c, "GR-5", "AMX500", "B-4", 300, 0))).Message);
        Assert.Contains("BatchNumber", (await One(Receive(c, "GR-6", "AMX500", " ", 300, 5))).Message);

        var batchId = (await c.Admin.GetFromJsonAsync<JsonElement>("/api/v1/samples/batches")).EnumerateArray().Single().GetProperty("id").GetGuid();
        (await c.Admin.PostAsJsonAsync($"/api/v1/samples/batches/{batchId}/status", new BatchStatusDto("Recalled", "Defect"))).EnsureSuccessStatusCode();
        Assert.Contains("Recalled", (await One(Receive(c, "GR-7", "AMX500", "B-1", 300, 5))).Message);
    }

    [Fact]
    public async Task Stock_levels_are_reconciled_against_the_ledger()
    {
        var c = await Setup();
        await Product(c, "AMX500", "Amoxil"); await Product(c, "CRD10", "Cardiostat");
        await Receive(c, "GR-1", "AMX500", "B-1", 300, 500);
        await Receive(c, "GR-2", "AMX500", "B-2", 300, 200);
        await Receive(c, "GR-3", "CRD10", "C-1", 300, 80);
        await c.Admin.PostAsJsonAsync("/api/v1/erp/import/stock-levels", new[]
        {
            new ErpStockLevel("AMX500", "B-1", 500, null),     // match
            new ErpStockLevel("AMX500", "B-2", 190, null),     // ten missing
            new ErpStockLevel("AMX500", "B-9", 40, null),      // ERP has a batch we do not
        }, ErpJson.Options);                                    // C-1 is not reported at all

        var rec = await c.Admin.GetFromJsonAsync<JsonElement>("/api/v1/erp/reconciliation/stock");
        Assert.False(rec.GetProperty("balanced").GetBoolean());
        var rows = rec.GetProperty("rows").EnumerateArray().ToDictionary(r => r.GetProperty("batchNumber").GetString()!, r => r);
        Assert.Equal("Match", rows["B-1"].GetProperty("status").GetString());
        Assert.Equal("Differs", rows["B-2"].GetProperty("status").GetString());
        Assert.Equal(-10, rows["B-2"].GetProperty("difference").GetDecimal());
        Assert.Equal("Missing in DAS", rows["B-9"].GetProperty("status").GetString());
        Assert.Equal("Missing in ERP", rows["C-1"].GetProperty("status").GetString());
        Assert.Equal("Match", rows.Values.Last().GetProperty("status").GetString()); // problems are listed first

        // a corrected, newer snapshot fixes the difference; an older one is ignored
        await c.Admin.PostAsJsonAsync("/api/v1/erp/import/stock-levels", new[] { new ErpStockLevel("AMX500", "B-2", 200, DateTime.UtcNow.AddMinutes(1)) }, ErpJson.Options);
        await c.Admin.PostAsJsonAsync("/api/v1/erp/import/stock-levels", new[] { new ErpStockLevel("AMX500", "B-2", 1, DateTime.UtcNow.AddHours(-5)) }, ErpJson.Options);
        var after = await c.Admin.GetFromJsonAsync<JsonElement>("/api/v1/erp/reconciliation/stock");
        Assert.Equal("Match", after.GetProperty("rows").EnumerateArray().First(r => r.GetProperty("batchNumber").GetString() == "B-2").GetProperty("status").GetString());
    }

    [Fact]
    public async Task Item_totals_without_batches_are_compared_per_product()
    {
        var c = await Setup();
        await Product(c, "AMX500", "Amoxil");
        await Receive(c, "GR-1", "AMX500", "B-1", 300, 500); await Receive(c, "GR-2", "AMX500", "B-2", 300, 100);
        await c.Admin.PostAsJsonAsync("/api/v1/erp/import/stock-levels", new[] { new ErpStockLevel("AMX500", null, 600, null) }, ErpJson.Options);
        var rec = await c.Admin.GetFromJsonAsync<JsonElement>("/api/v1/erp/reconciliation/stock");
        Assert.True(rec.GetProperty("balanced").GetBoolean());
        Assert.Equal(1, rec.GetProperty("rows").GetArrayLength());
    }

    // ---------- connection and integration keys ----------

    [Fact]
    public async Task The_connection_is_validated_and_only_administrators_change_it()
    {
        var c = await Setup();
        Assert.Equal("none", (await c.Admin.GetFromJsonAsync<JsonElement>("/api/v1/erp/connection")).GetProperty("provider").GetString());
        async Task<HttpStatusCode> Put(string provider, string? url, bool enabled = true, bool outbound = true, int interval = 60, string? currency = "GHS") =>
            (await c.Admin.PutAsJsonAsync("/api/v1/erp/connection", new ConnectionDto(provider, url, "S", enabled, outbound, false, interval, currency))).StatusCode;

        Assert.Equal(HttpStatusCode.BadRequest, await Put("sap", "https://erp.example.com"));
        Assert.Equal(HttpStatusCode.BadRequest, await Put("rest", "https://169.254.169.254"));           // internal addresses are refused
        Assert.Equal(HttpStatusCode.BadRequest, await Put("rest", "https://localhost"));
        Assert.Equal(HttpStatusCode.BadRequest, await Put("rest", "http://erp.example.com"));
        Assert.Equal(HttpStatusCode.BadRequest, await Put("rest", "https://erp.example.com", interval: 1));
        Assert.Equal(HttpStatusCode.BadRequest, await Put("rest", "https://erp.example.com", currency: "CEDIS"));
        Assert.Equal(HttpStatusCode.BadRequest, await Put("none", null, enabled: true, outbound: true));
        Assert.Equal(HttpStatusCode.OK, await Put("rest", "https://erp.example.com"));
        var saved = await c.Admin.GetFromJsonAsync<JsonElement>("/api/v1/erp/connection");
        Assert.Equal("https://erp.example.com", saved.GetProperty("baseUrl").GetString());

        Assert.Equal(HttpStatusCode.Forbidden, (await _f.ClientFor(c.Tenant, Guid.NewGuid(), "Executive").PutAsJsonAsync("/api/v1/erp/connection", new ConnectionDto("none", null, null, false, false, false, 60, "GHS"))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await _f.ClientFor(c.Tenant, Guid.NewGuid(), "Executive").GetAsync("/api/v1/erp/connection")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await _f.ClientFor(c.Tenant, Guid.NewGuid(), "AreaManager").GetAsync("/api/v1/erp/connection")).StatusCode);

        _f.Connector.PingError = null;
        Assert.True((await Json(await c.Admin.PostAsync("/api/v1/erp/connection/test", null))).GetProperty("ok").GetBoolean());
        _f.Connector.PingError = "The ERP gateway answered 502.";
        Assert.Contains("502", (await Json(await c.Admin.PostAsync("/api/v1/erp/connection/test", null))).GetProperty("error").GetString());
        _f.Connector.PingError = null;
    }

    [Fact]
    public async Task Middleware_pushes_data_with_an_integration_key_that_is_shown_once_and_stored_hashed()
    {
        var c = await Setup();
        var created = await Json(await c.Admin.PostAsJsonAsync("/api/v1/erp/keys", new KeyRequest("SAP gateway")));
        var key = created.GetProperty("key").GetString()!;
        Assert.StartsWith("dek_", key);

        var list = (await c.Admin.GetFromJsonAsync<JsonElement>("/api/v1/erp/keys")).GetRawText();
        Assert.DoesNotContain(key, list);
        Assert.DoesNotContain("keyHash", list);
        await using (var db = _f.Db(c.Tenant))
        {
            var stored = await db.IntegrationKeys.AsNoTracking().SingleAsync();
            Assert.DoesNotContain(key.Split('_', 3)[2], stored.KeyHash); // only a hash is kept
        }

        var http = _f.CreateClient();
        HttpRequestMessage Req(string path, object? body, string? k) { var r = new HttpRequestMessage(HttpMethod.Post, path) { Content = JsonContent.Create(body, options: ErpJson.Options) }; if (k != null) r.Headers.Add("X-Integration-Key", k); return r; }
        var ok = await http.SendAsync(Req("/integration/v1/products", new[] { new ErpProduct("AMX500", "Amoxil", null, 1m, null) }, key));
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
        Assert.Equal(1, (await Json(ok)).GetProperty("created").GetInt32());
        Assert.Equal(1, (await c.Admin.GetFromJsonAsync<JsonElement>("/api/v1/admin/products")).GetArrayLength());
        var runs = await c.Admin.GetFromJsonAsync<JsonElement>("/api/v1/erp/runs");
        Assert.Contains(runs.EnumerateArray(), r => r.GetProperty("source").GetString() == "push");

        var withUse = (await c.Admin.GetFromJsonAsync<JsonElement>("/api/v1/erp/keys"))[0];
        Assert.NotEqual(JsonValueKind.Null, withUse.GetProperty("lastUsedAt").ValueKind);
        var audit = await c.Admin.GetFromJsonAsync<JsonElement>("/api/v1/admin/audit-logs?take=500");
        Assert.DoesNotContain(audit.EnumerateArray(), a => a.GetProperty("entityType").GetString() == "IntegrationKey" && a.GetProperty("action").GetString() == "update"); // using a key is not audited
        Assert.Contains(audit.EnumerateArray(), a => a.GetProperty("entityType").GetString() == "IntegrationKey" && a.GetProperty("action").GetString() == "create");
    }

    [Fact]
    public async Task Keys_that_are_wrong_revoked_or_used_in_the_wrong_place_are_refused()
    {
        var c = await Setup();
        var other = await Setup();
        var key = (await Json(await c.Admin.PostAsJsonAsync("/api/v1/erp/keys", new KeyRequest("k")))).GetProperty("key").GetString()!;
        var created = (await c.Admin.GetFromJsonAsync<JsonElement>("/api/v1/erp/keys"))[0].GetProperty("id").GetGuid();
        var http = _f.CreateClient();
        async Task<HttpStatusCode> Push(string? k, HttpClient? client = null)
        {
            var r = new HttpRequestMessage(HttpMethod.Post, "/integration/v1/products") { Content = JsonContent.Create(new[] { new ErpProduct("A", "A", null, null, null) }, options: ErpJson.Options) };
            if (k != null) r.Headers.Add("X-Integration-Key", k);
            return (await (client ?? http).SendAsync(r)).StatusCode;
        }

        Assert.Equal(HttpStatusCode.Unauthorized, await Push(null));
        Assert.Equal(HttpStatusCode.Unauthorized, await Push("dek_00000000_" + new string('a', 43)));
        Assert.Equal(HttpStatusCode.Unauthorized, await Push(key[..^1] + (key[^1] == 'a' ? 'b' : 'a')));
        Assert.Equal(HttpStatusCode.Unauthorized, await Push("garbage"));
        Assert.Equal(HttpStatusCode.Unauthorized, await Push(null, c.Admin)); // a signed-in user is not an integration
        Assert.Equal(HttpStatusCode.OK, await Push(key));

        // the key does not open the normal API
        var r2 = new HttpRequestMessage(HttpMethod.Get, "/api/v1/admin/users"); r2.Headers.Add("X-Integration-Key", key);
        Assert.Equal(HttpStatusCode.Unauthorized, (await http.SendAsync(r2)).StatusCode);

        // it writes into its own tenant only
        Assert.Equal(0, (await other.Admin.GetFromJsonAsync<JsonElement>("/api/v1/admin/products")).GetArrayLength());

        Assert.Equal(HttpStatusCode.NoContent, (await c.Admin.DeleteAsync($"/api/v1/erp/keys/{created}")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, await Push(key));
        Assert.Equal(HttpStatusCode.Forbidden, (await _f.ClientFor(c.Tenant, Guid.NewGuid(), "AreaManager").PostAsJsonAsync("/api/v1/erp/keys", new KeyRequest("x"))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await c.Admin.PostAsJsonAsync("/api/v1/erp/keys", new KeyRequest(" "))).StatusCode);
    }

    // ---------- outbox ----------

    private async Task<(Guid Product, Guid Batch, Guid Rep, HttpClient RepClient, Guid Customer)> StockedRep(Ctx c)
    {
        var product = await Product(c, "AMX500", "Amoxil");
        await Receive(c, "GR-1", "AMX500", "B-2611", 400, 500);
        var batch = (await c.Admin.GetFromJsonAsync<JsonElement>("/api/v1/samples/batches")).EnumerateArray().Single().GetProperty("id").GetGuid();
        var terr = (await Json(await c.Admin.PostAsJsonAsync("/api/v1/admin/territories", new TerritoryDto(null, "T" + c.Tenant, null, null)))).GetProperty("id").GetGuid();
        var mgr = Guid.NewGuid(); var rep = Guid.NewGuid();
        await c.Admin.PostAsJsonAsync("/api/v1/admin/users", new UserDto(mgr, "m" + mgr, "Area Mgr", "m@x.test", UserRole.AreaManager, null, terr));
        await c.Admin.PostAsJsonAsync("/api/v1/admin/users", new UserDto(rep, "r" + rep, "Kofi Rep", "r@x.test", UserRole.Rep, mgr, terr));
        var customer = (await Json(await c.Admin.PostAsJsonAsync("/api/v1/customers", new CustomerDto(null, CustomerType.Pharmacy, "Osu Pharmacy", null, Segment.B, terr, null, null, null, null, "Accra", null, null, 2, null)))).GetProperty("id").GetGuid();
        await c.Admin.PostAsJsonAsync("/api/v1/erp/customers/link", new LinkRequest(customer, "ACC-7"));
        return (product, batch, rep, _f.ClientFor(c.Tenant, rep, "Rep", terr), customer);
    }

    private static async Task Issue(Ctx c, Guid rep, Guid product, int qty, HttpClient repClient)
    {
        var id = Guid.NewGuid();
        (await repClient.PostAsJsonAsync("/api/v1/samples/requests", new RequestDto(id, product, qty, null))).EnsureSuccessStatusCode();
        var terr = (await c.Admin.GetFromJsonAsync<JsonElement>("/api/v1/admin/users")).EnumerateArray().First(u => u.GetProperty("role").GetString() == "AreaManager");
        var mgr = _f2(c, terr.GetProperty("id").GetGuid(), terr.GetProperty("territoryId").GetGuid());
        (await mgr.PostAsJsonAsync($"/api/v1/samples/requests/{id}/approve", new DecisionDto(null, null))).EnsureSuccessStatusCode();
        (await c.Admin.PostAsJsonAsync($"/api/v1/samples/requests/{id}/fulfil", new FulfilDto(null))).EnsureSuccessStatusCode();
    }
    private static Func<Ctx, Guid, Guid, HttpClient> _f2 = null!;

    private async Task<List<OutboxMessage>> Outbox(Ctx c)
    {
        await using var db = _f.Db(c.Tenant);
        return await db.OutboxMessages.AsNoTracking().OrderBy(m => m.CreatedAt).ToListAsync();
    }

    [Fact]
    public async Task Stock_movements_queue_messages_for_the_erp_only_when_the_connection_is_on()
    {
        _f2 = (c, id, terr) => _f.ClientFor(c.Tenant, id, "AreaManager", terr);
        var off = await Setup(connect: false);
        var a = await StockedRep(off);
        await Issue(off, a.Rep, a.Product, 20, a.RepClient);
        Assert.Empty(await Outbox(off)); // nothing is queued without an ERP connection

        var c = await Setup(connect: true);
        var s = await StockedRep(c);
        await Issue(c, s.Rep, s.Product, 30, s.RepClient);
        (await s.RepClient.PostAsJsonAsync("/api/v1/samples/distributions", new DistributionDto(Guid.NewGuid(), null, s.Customer, s.Product, s.Batch, 5, null, Guid.NewGuid(), null))).EnsureSuccessStatusCode();
        (await c.Admin.PostAsJsonAsync("/api/v1/samples/adjustments", new AdjustmentDto(s.Batch, null, -10, "Damaged in transit", null))).EnsureSuccessStatusCode();
        (await c.Admin.PostAsJsonAsync("/api/v1/samples/returns", new ReturnDto(s.Rep, s.Batch, 3, "unused"))).EnsureSuccessStatusCode();

        var msgs = await Outbox(c);
        Assert.Equal(new[] { "sample.issue", "sample.distribution", "sample.adjustment", "sample.return" }, msgs.Select(m => m.Type).ToArray());
        Assert.All(msgs, m => Assert.Equal(OutboxStatus.Pending, m.Status));

        var issue = JsonDocument.Parse(msgs[0].Payload).RootElement;
        Assert.Equal("Kofi Rep", issue.GetProperty("repName").GetString());
        Assert.Equal("AMX500", issue.GetProperty("lines")[0].GetProperty("itemCode").GetString());
        Assert.Equal("B-2611", issue.GetProperty("lines")[0].GetProperty("batchNumber").GetString());
        Assert.Equal(30, issue.GetProperty("lines")[0].GetProperty("quantity").GetInt32());
        var dist = JsonDocument.Parse(msgs[1].Payload).RootElement;
        Assert.Equal("ACC-7", dist.GetProperty("customerAccountCode").GetString());
        Assert.True(dist.GetProperty("signed").GetBoolean());
        Assert.Equal("writeoff", JsonDocument.Parse(msgs[2].Payload).RootElement.GetProperty("kind").GetString());

        // a refused change leaves no message behind
        var before = (await Outbox(c)).Count;
        Assert.Equal(HttpStatusCode.BadRequest, (await s.RepClient.PostAsJsonAsync("/api/v1/samples/distributions", new DistributionDto(Guid.NewGuid(), null, s.Customer, s.Product, s.Batch, 9999, null, null, null))).StatusCode);
        Assert.Equal(before, (await Outbox(c)).Count);
    }

    [Fact]
    public async Task Delivery_marks_messages_sent_retries_with_backoff_and_gives_up_on_permanent_errors()
    {
        _f2 = (c, id, terr) => _f.ClientFor(c.Tenant, id, "AreaManager", terr);
        var c = await Setup(connect: true);
        var s = await StockedRep(c);
        await Issue(c, s.Rep, s.Product, 10, s.RepClient);
        await c.Admin.PostAsJsonAsync("/api/v1/samples/adjustments", new AdjustmentDto(s.Batch, null, -1, "damaged", null));
        await c.Admin.PostAsJsonAsync("/api/v1/samples/adjustments", new AdjustmentDto(s.Batch, null, -1, "lost", null));

        _f.Connector.Sent.Clear();
        _f.Connector.OnSend = m => m.Type switch
        {
            "sample.issue" => new(true, false, "STO-991", null),
            "sample.adjustment" when m.Payload.Contains("damaged") => new(false, false, null, "ERP answered 503: busy"),
            _ => new(false, true, null, "ERP answered 400: unknown item"),
        };
        var r = await Json(await c.Admin.PostAsync("/api/v1/erp/outbox/dispatch", null));
        Assert.Equal((1, 1, 1), (r.GetProperty("sent").GetInt32(), r.GetProperty("retrying").GetInt32(), r.GetProperty("deadLettered").GetInt32()));

        var msgs = (await Outbox(c)).ToDictionary(m => m.Payload.Contains("damaged") ? "retry" : m.Type == "sample.issue" ? "sent" : "dead");
        Assert.Equal(OutboxStatus.Sent, msgs["sent"].Status);
        Assert.Equal("STO-991", msgs["sent"].ExternalRef);
        Assert.Equal(OutboxStatus.Pending, msgs["retry"].Status);
        Assert.Equal(1, msgs["retry"].Attempts);
        Assert.True(msgs["retry"].NextAttemptAt > DateTime.UtcNow.AddSeconds(30)); // waits before trying again
        Assert.Equal(OutboxStatus.DeadLetter, msgs["dead"].Status);
        Assert.Contains("unknown item", msgs["dead"].LastError);

        // nothing is due yet, so nothing is sent again, and the accepted message is never resent
        _f.Connector.Sent.Clear();
        var second = await Json(await c.Admin.PostAsync("/api/v1/erp/outbox/dispatch", null));
        Assert.Equal(0, second.GetProperty("sent").GetInt32() + second.GetProperty("retrying").GetInt32());
        Assert.Empty(_f.Connector.Sent);

        // a person can send a failed message again once the ERP side is fixed
        var counts = await c.Admin.GetFromJsonAsync<JsonElement>("/api/v1/erp/outbox?status=DeadLetter");
        var deadId = counts.GetProperty("items")[0].GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.Conflict, (await c.Admin.PostAsync($"/api/v1/erp/outbox/{msgs["sent"].Id}/retry", null)).StatusCode);
        _f.Connector.OnSend = _ => new(true, false, null, null);
        Assert.Equal(HttpStatusCode.OK, (await c.Admin.PostAsync($"/api/v1/erp/outbox/{deadId}/retry", null)).StatusCode);
        await c.Admin.PostAsync("/api/v1/erp/outbox/dispatch", null);
        Assert.Equal(OutboxStatus.Sent, (await Outbox(c)).Single(m => m.Id == deadId).Status);
    }

    [Fact]
    public async Task A_message_that_keeps_failing_is_dead_lettered_after_the_attempt_limit()
    {
        _f2 = (c, id, terr) => _f.ClientFor(c.Tenant, id, "AreaManager", terr);
        var c = await Setup(connect: true);
        var s = await StockedRep(c);
        await c.Admin.PostAsJsonAsync("/api/v1/samples/adjustments", new AdjustmentDto(s.Batch, null, -1, "damaged", null));
        _f.Connector.OnSend = _ => new(false, false, null, "The ERP gateway could not be reached.");
        for (var i = 0; i < ErpSync.MaxAttempts; i++)
        {
            await using (var db = _f.Db(c.Tenant)) { foreach (var m in await db.OutboxMessages.ToListAsync()) m.NextAttemptAt = DateTime.UtcNow.AddMinutes(-1); await db.SaveChangesAsync(); }
            await c.Admin.PostAsync("/api/v1/erp/outbox/dispatch", null);
        }
        var m1 = (await Outbox(c)).Single();
        Assert.Equal(OutboxStatus.DeadLetter, m1.Status);
        Assert.Equal(ErpSync.MaxAttempts, m1.Attempts);
        Assert.Equal(new[] { 1, 5, 30, 120, 720 }, ErpSync.Backoff.Select(b => (int)b.TotalMinutes).ToArray());
    }

    // ---------- scheduled pull ----------

    [Fact]
    public async Task A_scheduled_pull_applies_pages_and_resumes_from_its_cursor()
    {
        var c = await Setup();
        await Connect(c, outbound: false, pull: true);
        var fake = _f.Connector;
        fake.PullCalls.Clear(); fake.Pages.Clear();
        fake.Pages["products"] = cursor => cursor switch
        {
            null => (new List<ErpProduct> { new("AMX500", "Amoxil", null, 1m, null) }, "p1", null),
            "p1" => (new List<ErpProduct> { new("CRD10", "Cardiostat", null, 2m, null) }, "p2", null),
            _ => (new List<ErpProduct>(), "p2", null),
        };
        fake.Pages["sales"] = _ => (new List<ErpSale> { new("S1", "INV", D(-1), "A1", "AMX500", 1, 10m, null) }, "s1", null);

        var r = await Json(await c.Admin.PostAsync("/api/v1/erp/pull", null));
        Assert.True(r.GetArrayLength() >= 3); // two product pages and one sales page
        Assert.Equal(2, (await c.Admin.GetFromJsonAsync<JsonElement>("/api/v1/admin/products")).GetArrayLength());
        Assert.Contains(fake.PullCalls, x => x.Entity == "products" && x.Cursor == "p1");
        var conn = await c.Admin.GetFromJsonAsync<JsonElement>("/api/v1/erp/connection");
        Assert.NotEqual(JsonValueKind.Null, conn.GetProperty("lastPullAt").ValueKind);
        Assert.Equal(JsonValueKind.Null, conn.GetProperty("lastError").ValueKind);

        fake.PullCalls.Clear();
        await c.Admin.PostAsync("/api/v1/erp/pull", null);
        Assert.Equal("p2", fake.PullCalls.First(x => x.Entity == "products").Cursor); // continues, does not start again
        Assert.Equal(2, (await c.Admin.GetFromJsonAsync<JsonElement>("/api/v1/admin/products")).GetArrayLength());
    }

    [Fact]
    public async Task A_snapshot_entity_starts_again_from_the_top_on_the_next_pull()
    {
        var c = await Setup();
        await Connect(c, outbound: false, pull: true);
        var fake = _f.Connector;
        fake.PullCalls.Clear(); fake.Pages.Clear();
        fake.Pages["stock-levels"] = cursor => (new List<ErpStockLevel>(), cursor is null ? "1000" : PullCursor.Reset, null);
        fake.Pages["products"] = cursor => (new List<ErpProduct> { new("AMX500", "Amoxil", null, 1m, null) }, cursor is null ? PullCursor.Reset : "unexpected", null);

        await c.Admin.PostAsync("/api/v1/erp/pull", null);
        Assert.Equal(new string?[] { null }, fake.PullCalls.Where(x => x.Entity == "products").Select(x => x.Cursor));
        fake.PullCalls.Clear();
        await c.Admin.PostAsync("/api/v1/erp/pull", null);
        Assert.Null(fake.PullCalls.First(x => x.Entity == "products").Cursor); // the reset cleared it
    }

    [Fact]
    public async Task The_Business_Central_provider_needs_a_company_address_and_a_secret_name()
    {
        var c = await Setup();
        var good = "https://api.businesscentral.dynamics.com/v2.0/t/Production/api/v2.0/companies(11111111-2222-3333-4444-555555555555)";
        Assert.Equal(System.Net.HttpStatusCode.BadRequest, (await c.Admin.PutAsJsonAsync("/api/v1/erp/connection", new ConnectionDto("businesscentral", "https://erp-gateway.example.com", "BC", true, false, true, 60, "GHS"))).StatusCode);
        Assert.Equal(System.Net.HttpStatusCode.BadRequest, (await c.Admin.PutAsJsonAsync("/api/v1/erp/connection", new ConnectionDto("businesscentral", good, "", true, false, true, 60, "GHS"))).StatusCode);
        (await c.Admin.PutAsJsonAsync("/api/v1/erp/connection", new ConnectionDto("businesscentral", good, "BC_SECRET", true, true, true, 60, "GHS"))).EnsureSuccessStatusCode();
        var saved = await c.Admin.GetFromJsonAsync<JsonElement>("/api/v1/erp/connection");
        Assert.Equal("businesscentral", saved.GetProperty("provider").GetString());
        Assert.Equal(good, saved.GetProperty("baseUrl").GetString());
    }

    [Fact]
    public async Task A_failed_pull_is_reported_and_does_not_move_the_cursor()
    {
        var c = await Setup();
        await Connect(c, outbound: false, pull: true);
        var fake = _f.Connector;
        fake.Pages.Clear(); fake.PullCalls.Clear();
        fake.Pages["products"] = _ => (null, null, "The ERP gateway answered 502 for products.");
        await c.Admin.PostAsync("/api/v1/erp/pull", null);
        var conn = await c.Admin.GetFromJsonAsync<JsonElement>("/api/v1/erp/connection");
        Assert.Contains("502", conn.GetProperty("lastError").GetString());
        Assert.DoesNotContain(fake.PullCalls, x => x.Entity == "customers"); // stops at the first failure

        fake.Pages["products"] = cursor => (new List<ErpProduct> { new("AMX500", "Amoxil", null, 1m, null) }, "after", null);
        fake.PullCalls.Clear();
        await c.Admin.PostAsync("/api/v1/erp/pull", null);
        Assert.Null(fake.PullCalls.First(x => x.Entity == "products").Cursor);                       // started from the beginning again
        Assert.Equal(JsonValueKind.Null, (await c.Admin.GetFromJsonAsync<JsonElement>("/api/v1/erp/connection")).GetProperty("lastError").ValueKind);
    }

    // ---------- procurement ----------

    [Fact]
    public async Task Low_stock_produces_a_suggestion_that_accounts_for_what_is_already_on_order()
    {
        var c = await Setup(connect: true);
        var amox = await Product(c, "AMX500", "Amoxil", reorder: 300);
        await Product(c, "CRD10", "Cardiostat", reorder: 50);
        await Receive(c, "GR-1", "AMX500", "B-1", 300, 100);   // 100 usable
        await Receive(c, "GR-2", "CRD10", "C-1", 300, 500);    // plenty
        var batches = (await c.Admin.GetFromJsonAsync<JsonElement>("/api/v1/samples/batches")).EnumerateArray();
        var expired = Guid.NewGuid();
        await using (var db = _f.Db(c.Tenant))
        {
            var b = new SampleBatch { ProductId = amox, BatchNumber = "OLD", ExpiryDate = D(-5) };
            db.SampleBatches.Add(b);
            db.StockMovements.Add(new StockMovement { BatchId = b.Id, Delta = 400, Type = MovementType.Receipt, OccurredAt = DateTime.UtcNow }); // expired stock does not count
            await db.SaveChangesAsync();
        }
        Assert.NotEmpty(batches);
        var s = (await c.Admin.GetFromJsonAsync<JsonElement>("/api/v1/erp/procurement/suggestions")).EnumerateArray().ToDictionary(x => x.GetProperty("name").GetString()!);
        Assert.True(s["Amoxil"].GetProperty("belowReorderLevel").GetBoolean());
        Assert.Equal(100, s["Amoxil"].GetProperty("available").GetInt32());
        Assert.Equal(500, s["Amoxil"].GetProperty("suggestedQuantity").GetInt32()); // 2 x 300 - 100
        Assert.False(s["Cardiostat"].GetProperty("belowReorderLevel").GetBoolean());
        Assert.NotEqual(expired, Guid.Empty);

        // an approved order for 400 reduces the shortfall
        var req = await Json(await c.Admin.PostAsJsonAsync("/api/v1/erp/procurement/requisitions", new RequisitionRequest(amox, 400, D(30), "launch")));
        var approver = _f.ClientFor(c.Tenant, Guid.NewGuid(), "NationalSalesManager");
        (await approver.PostAsync($"/api/v1/erp/procurement/requisitions/{req.GetProperty("id").GetGuid()}/approve", null)).EnsureSuccessStatusCode();
        var after = (await c.Admin.GetFromJsonAsync<JsonElement>("/api/v1/erp/procurement/suggestions")).EnumerateArray().First(x => x.GetProperty("name").GetString() == "Amoxil");
        Assert.Equal(400, after.GetProperty("onOrder").GetInt32());
        Assert.False(after.GetProperty("belowReorderLevel").GetBoolean()); // 100 + 400 >= 300
    }

    [Fact]
    public async Task A_purchase_requisition_needs_a_second_approver_goes_to_the_erp_and_closes_on_receipt()
    {
        var c = await Setup(connect: true);
        var amox = await Product(c, "AMX500", "Amoxil", reorder: 100);
        Task<HttpResponseMessage> Create(int qty = 400, DateOnly? by = null) => c.Admin.PostAsJsonAsync("/api/v1/erp/procurement/requisitions", new RequisitionRequest(amox, qty, by ?? D(30), "note"));
        Assert.Equal(HttpStatusCode.BadRequest, (await Create(0)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Create(5, D(-1))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await c.Admin.PostAsJsonAsync("/api/v1/erp/procurement/requisitions", new RequisitionRequest(Guid.NewGuid(), 5, null, null))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await _f.ClientFor(c.Tenant, Guid.NewGuid(), "AreaManager").PostAsJsonAsync("/api/v1/erp/procurement/requisitions", new RequisitionRequest(amox, 5, null, null))).StatusCode);

        var req = await Json(await Create());
        var id = req.GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.Forbidden, (await c.Admin.PostAsync($"/api/v1/erp/procurement/requisitions/{id}/approve", null)).StatusCode); // not your own
        Assert.Equal(HttpStatusCode.Forbidden, (await c.Admin.PostAsJsonAsync($"/api/v1/erp/procurement/requisitions/{id}/reject", new NoteRequest("no"))).StatusCode);

        _f.Connector.Sent.Clear();
        _f.Connector.OnSend = m => new(true, false, "PR-4471", null);
        Assert.Equal(HttpStatusCode.OK, (await c.Other.PostAsync($"/api/v1/erp/procurement/requisitions/{id}/approve", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await c.Other.PostAsync($"/api/v1/erp/procurement/requisitions/{id}/approve", null)).StatusCode);
        await c.Admin.PostAsync("/api/v1/erp/outbox/dispatch", null);
        var sent = _f.Connector.Sent.Single(m => m.Type == "purchase.requisition");
        var payload = JsonDocument.Parse(sent.Payload).RootElement;
        Assert.Equal("AMX500", payload.GetProperty("itemCode").GetString());
        Assert.Equal(400, payload.GetProperty("quantity").GetInt32());

        var reqs = await c.Admin.GetFromJsonAsync<JsonElement>("/api/v1/erp/procurement/requisitions?status=Approved");
        Assert.Equal("PR-4471", reqs[0].GetProperty("erpReference").GetString()); // the ERP's own reference came back

        // goods arrive in two deliveries against that reference
        await Receive(c, "GR-1", "AMX500", "B-1", 400, 250, "PR-4471");
        Assert.Equal("Approved", (await c.Admin.GetFromJsonAsync<JsonElement>("/api/v1/erp/procurement/requisitions"))[0].GetProperty("status").GetString());
        await Receive(c, "GR-2", "AMX500", "B-1", 400, 150, "PR-4471");
        var done = (await c.Admin.GetFromJsonAsync<JsonElement>("/api/v1/erp/procurement/requisitions"))[0];
        Assert.Equal("Received", done.GetProperty("status").GetString());
        Assert.Equal(400, done.GetProperty("receivedQuantity").GetInt32());
        Assert.Equal(HttpStatusCode.Conflict, (await c.Admin.PostAsync($"/api/v1/erp/procurement/requisitions/{id}/cancel", null)).StatusCode);
    }

    [Fact]
    public async Task Requisitions_can_be_rejected_cancelled_and_referenced_by_hand()
    {
        var c = await Setup();
        var amox = await Product(c, "AMX500", "Amoxil");
        async Task<Guid> New() => (await Json(await c.Admin.PostAsJsonAsync("/api/v1/erp/procurement/requisitions", new RequisitionRequest(amox, 10, null, null)))).GetProperty("id").GetGuid();
        var a = await New(); var b = await New(); var d = await New();
        Assert.Equal(HttpStatusCode.BadRequest, (await c.Other.PostAsJsonAsync($"/api/v1/erp/procurement/requisitions/{a}/reject", new NoteRequest(" "))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await c.Other.PostAsJsonAsync($"/api/v1/erp/procurement/requisitions/{a}/reject", new NoteRequest("Over budget"))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await c.Admin.PostAsync($"/api/v1/erp/procurement/requisitions/{b}/cancel", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await c.Other.PostAsync($"/api/v1/erp/procurement/requisitions/{b}/approve", null)).StatusCode);

        Assert.Equal(HttpStatusCode.Conflict, (await c.Admin.PostAsJsonAsync($"/api/v1/erp/procurement/requisitions/{d}/reference", new ReferenceRequest("PO-1"))).StatusCode); // not approved yet
        await c.Other.PostAsync($"/api/v1/erp/procurement/requisitions/{d}/approve", null);
        Assert.Equal(HttpStatusCode.OK, (await c.Admin.PostAsJsonAsync($"/api/v1/erp/procurement/requisitions/{d}/reference", new ReferenceRequest("PO-8812"))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await c.Admin.PostAsJsonAsync($"/api/v1/erp/procurement/requisitions/{d}/reference", new ReferenceRequest(""))).StatusCode);
    }

    // ---------- finance ----------

    [Fact]
    public async Task Sample_spend_is_valued_at_standard_cost_and_missing_costs_are_listed()
    {
        _f2 = (c, id, terr) => _f.ClientFor(c.Tenant, id, "AreaManager", terr);
        var c = await Setup();
        var s = await StockedRep(c);                                  // Amoxil at 2.50
        var noCost = await Product(c, "NOC", "No cost item", cost: null);
        await Receive(c, "GR-9", "NOC", "N-1", 400, 100);
        var nBatch = (await c.Admin.GetFromJsonAsync<JsonElement>("/api/v1/samples/batches")).EnumerateArray().First(b => b.GetProperty("batchNumber").GetString() == "N-1").GetProperty("id").GetGuid();
        await Issue(c, s.Rep, s.Product, 40, s.RepClient);
        var rid = Guid.NewGuid();
        await s.RepClient.PostAsJsonAsync("/api/v1/samples/requests", new RequestDto(rid, noCost, 10, null));
        var area = (await c.Admin.GetFromJsonAsync<JsonElement>("/api/v1/admin/users")).EnumerateArray().First(u => u.GetProperty("role").GetString() == "AreaManager");
        await _f2(c, area.GetProperty("id").GetGuid(), area.GetProperty("territoryId").GetGuid()).PostAsJsonAsync($"/api/v1/samples/requests/{rid}/approve", new DecisionDto(null, null));
        await c.Admin.PostAsJsonAsync($"/api/v1/samples/requests/{rid}/fulfil", new FulfilDto(null));
        (await s.RepClient.PostAsJsonAsync("/api/v1/samples/distributions", new DistributionDto(Guid.NewGuid(), null, s.Customer, s.Product, s.Batch, 10, null, null, null))).EnsureSuccessStatusCode();
        (await s.RepClient.PostAsJsonAsync("/api/v1/samples/distributions", new DistributionDto(Guid.NewGuid(), null, s.Customer, noCost, nBatch, 4, null, null, null))).EnsureSuccessStatusCode();

        var from = Uri.EscapeDataString(DateTime.UtcNow.AddDays(-1).ToString("O")); var to = Uri.EscapeDataString(DateTime.UtcNow.AddDays(1).ToString("O"));
        var spend = await c.Admin.GetFromJsonAsync<JsonElement>($"/api/v1/samples/reports/spend?from={from}&to={to}");
        Assert.Equal(14, spend.GetProperty("totalUnits").GetInt32());
        Assert.Equal(25m, spend.GetProperty("totalCost").GetDecimal());             // 10 x 2.50, the other item has no cost yet
        Assert.Equal("No cost item", spend.GetProperty("productsWithoutCost")[0].GetProperty("name").GetString());
        Assert.Equal("Amoxil", spend.GetProperty("byProduct")[0].GetProperty("name").GetString());
        Assert.Equal(HttpStatusCode.Forbidden, (await s.RepClient.GetAsync($"/api/v1/samples/reports/spend?from={from}&to={to}")).StatusCode);
    }
}

public class WorkerTests : IClassFixture<ErpFactory>
{
    private readonly ErpFactory _f;
    public WorkerTests(ErpFactory f) => _f = f;

    [Fact]
    public async Task The_worker_delivers_waiting_messages_for_connected_tenants()
    {
        var tenant = Guid.NewGuid();
        await using (var db = _f.Db(tenant))
        {
            db.Tenants.Add(new Tenant { Id = tenant, Name = "T" });
            db.ErpConnections.Add(new ErpConnection { Provider = "rest", BaseUrl = "https://erp.example.com", Enabled = true, OutboundEnabled = true });
            db.OutboxMessages.Add(new OutboxMessage { Type = "sample.adjustment", Payload = "{}" });
            await db.SaveChangesAsync();
        }
        var worker = new ErpWorker(_f.Services, Microsoft.Extensions.Logging.Abstractions.NullLogger<ErpWorker>.Instance, new ConfigurationBuilder().Build());
        _f.Connector.Sent.Clear();
        _f.Connector.OnSend = _ => new(true, false, "REF-1", null);
        Assert.True(await worker.RunOnce(CancellationToken.None));
        await using var check = _f.Db(tenant);
        Assert.Equal(OutboxStatus.Sent, (await check.OutboxMessages.AsNoTracking().SingleAsync()).Status);
    }

    /// <summary>With several API instances, only one may run a pass at a time (PostgreSQL advisory lock). Runs only against a real PostgreSQL.</summary>
    [Fact]
    public async Task Only_one_instance_runs_a_pass_at_a_time()
    {
        if (TestDb.Postgres is null) return;
        var worker = new ErpWorker(_f.Services, Microsoft.Extensions.Logging.Abstractions.NullLogger<ErpWorker>.Instance, new ConfigurationBuilder().Build());
        using var scope = _f.Services.CreateScope();
        var options = scope.ServiceProvider.GetRequiredService<DbContextOptions<AppDbContext>>();
        await using var other = new AppDbContext(options, new WorkerTenant(Guid.Empty));
        var conn = other.Database.GetDbConnection();
        await conn.OpenAsync();
        await using (var cmd = conn.CreateCommand()) { cmd.CommandText = $"SELECT pg_advisory_lock({ErpWorker.LockKey})"; await cmd.ExecuteScalarAsync(); } // another instance holds the lock

        Assert.False(await worker.RunOnce(CancellationToken.None)); // this one backs off

        await using (var cmd = conn.CreateCommand()) { cmd.CommandText = $"SELECT pg_advisory_unlock({ErpWorker.LockKey})"; await cmd.ExecuteScalarAsync(); }
        Assert.True(await worker.RunOnce(CancellationToken.None));  // once released, it proceeds
    }
}
