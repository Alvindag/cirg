using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using DasEngage.Api;
using DasEngage.Domain;
using DasEngage.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace DasEngage.Tests;

public class SampleTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _f;
    public SampleTests(ApiFactory f) => _f = f;

    private class TestTenant : ICurrentUser
    {
        public TestTenant(Guid t) => TenantId = t;
        public Guid TenantId { get; }
        public Guid? UserId => null;
        public UserRole? Role => null;
    }

    private record Org(Guid Tenant, HttpClient Admin, Guid AreaA, Guid AreaB, Guid Rep1, Guid Rep2, Guid Rep3, Guid Terr, Guid Product, Guid Customer);

    private async Task<Guid> User(HttpClient admin, string name, UserRole role, Guid? mgr, Guid? terr)
    {
        var id = Guid.NewGuid();
        (await admin.PostAsJsonAsync("/api/v1/admin/users", new UserDto(id, "e-" + id, name, name + "@x.test", role, mgr, terr))).EnsureSuccessStatusCode();
        return id;
    }

    private async Task<Org> BuildOrg()
    {
        var tenant = Guid.NewGuid();
        var admin = _f.ClientFor(tenant, Guid.NewGuid(), "Admin");
        var terr = (await (await admin.PostAsJsonAsync("/api/v1/admin/territories", new TerritoryDto(null, "T" + tenant, null, null))).Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        var aa = await User(admin, "AreaA", UserRole.AreaManager, null, terr);
        var ab = await User(admin, "AreaB", UserRole.AreaManager, null, terr);
        var r1 = await User(admin, "Rep1", UserRole.Rep, aa, terr);
        var r2 = await User(admin, "Rep2", UserRole.Rep, aa, terr);
        var r3 = await User(admin, "Rep3", UserRole.Rep, ab, terr);
        var product = (await (await admin.PostAsJsonAsync("/api/v1/admin/products", new Product { Name = "Amoxil 500", Code = "AMX" })).Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        var customer = (await (await admin.PostAsJsonAsync("/api/v1/customers", new CustomerDto(null, CustomerType.Doctor, "Dr Ama", null, Segment.A, terr, null, null, null, null, null, null, null, 2, null))).Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        return new Org(tenant, admin, aa, ab, r1, r2, r3, terr, product, customer);
    }

    private static DateOnly InDays(int d) => DateOnly.FromDateTime(DateTime.UtcNow.AddDays(d));

    private async Task<Guid> Batch(Org o, string number, int expiryDays, int receive)
    {
        var r = await o.Admin.PostAsJsonAsync("/api/v1/samples/batches", new BatchDto(null, o.Product, number, InDays(expiryDays)));
        r.EnsureSuccessStatusCode();
        var id = (await r.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        if (receive > 0) (await o.Admin.PostAsJsonAsync("/api/v1/samples/receipts", new ReceiptDto(id, receive, "PO-1"))).EnsureSuccessStatusCode();
        return id;
    }

    private HttpClient Rep(Org o, Guid rep) => _f.ClientFor(o.Tenant, rep, "Rep", o.Terr);
    private HttpClient Area(Org o, Guid area) => _f.ClientFor(o.Tenant, area, "AreaManager", o.Terr);

    /// <summary>Request, approve and fulfil so the rep holds stock.</summary>
    private async Task<JsonElement> Stock(Org o, Guid rep, int qty, Guid? area = null)
    {
        var id = Guid.NewGuid();
        (await Rep(o, rep).PostAsJsonAsync("/api/v1/samples/requests", new RequestDto(id, o.Product, qty, null))).EnsureSuccessStatusCode();
        (await Area(o, area ?? o.AreaA).PostAsJsonAsync($"/api/v1/samples/requests/{id}/approve", new DecisionDto(null, "ok"))).EnsureSuccessStatusCode();
        var f = await o.Admin.PostAsJsonAsync($"/api/v1/samples/requests/{id}/fulfil", new FulfilDto(null));
        Assert.True(f.IsSuccessStatusCode, await f.Content.ReadAsStringAsync());
        return await f.Content.ReadFromJsonAsync<JsonElement>();
    }

    private async Task<int> Held(Org o, Guid rep, Guid batch)
    {
        var rows = (await Rep(o, rep).GetFromJsonAsync<JsonElement>("/api/v1/samples/my-stock")).EnumerateArray();
        return rows.Where(r => r.GetProperty("batchId").GetGuid() == batch).Select(r => r.GetProperty("quantity").GetInt32()).FirstOrDefault();
    }

    private async Task<Guid> Visit(Org o, Guid rep)
    {
        var id = Guid.NewGuid();
        (await Rep(o, rep).PostAsJsonAsync("/api/v1/visits/check-in", new CheckInDto(id, o.Customer, null, null, null, null, null))).EnsureSuccessStatusCode();
        return id;
    }

    private static DistributionDto Dist(Org o, Guid batch, int qty, Guid? visit = null, Guid? id = null, Guid? signature = null, DateTime? at = null) =>
        new(id ?? Guid.NewGuid(), visit, o.Customer, o.Product, batch, qty, at, signature, null);

    // ---------- batches ----------

    [Fact]
    public async Task Batch_rules_and_permissions()
    {
        var o = await BuildOrg();
        var post = (BatchDto d) => o.Admin.PostAsJsonAsync("/api/v1/samples/batches", d);
        Assert.Equal(HttpStatusCode.Created, (await post(new BatchDto(null, o.Product, "B1", InDays(200)))).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await post(new BatchDto(null, o.Product, "B1", InDays(200)))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await post(new BatchDto(null, o.Product, "B2", InDays(-1)))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await post(new BatchDto(null, Guid.NewGuid(), "B3", InDays(100)))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await post(new BatchDto(null, o.Product, " ", InDays(100)))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Area(o, o.AreaA).PostAsJsonAsync("/api/v1/samples/batches", new BatchDto(null, o.Product, "B9", InDays(100)))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Rep(o, o.Rep1).GetAsync("/api/v1/samples/batches")).StatusCode);
    }

    [Fact]
    public async Task Receipts_and_adjustments_are_validated()
    {
        var o = await BuildOrg();
        var b = await Batch(o, "B1", 200, 100);
        async Task<HttpStatusCode> Adj(int delta, string? reason, string? type = null) =>
            (await o.Admin.PostAsJsonAsync("/api/v1/samples/adjustments", new AdjustmentDto(b, null, delta, reason ?? "", type))).StatusCode;
        Assert.Equal(HttpStatusCode.BadRequest, await Adj(-5, null));                 // reason needed
        Assert.Equal(HttpStatusCode.BadRequest, await Adj(0, "x"));
        Assert.Equal(HttpStatusCode.BadRequest, await Adj(500, "found", null));        // write-off must be negative
        Assert.Equal(HttpStatusCode.BadRequest, await Adj(-101, "damaged"));           // cannot go negative
        Assert.Equal(HttpStatusCode.NoContent, await Adj(-10, "damaged in transit"));
        Assert.Equal(HttpStatusCode.NoContent, await Adj(5, "stock count correction", "Adjustment"));
        Assert.Equal(HttpStatusCode.BadRequest, (await o.Admin.PostAsJsonAsync("/api/v1/samples/receipts", new ReceiptDto(b, 0, null))).StatusCode);

        var ledger = await o.Admin.GetFromJsonAsync<JsonElement>($"/api/v1/samples/reports/ledger?batchId={b}");
        Assert.Equal(3, ledger.GetArrayLength());
        Assert.Equal(95, ledger.EnumerateArray().Sum(m => m.GetProperty("delta").GetInt32()));
    }

    [Fact]
    public async Task The_stock_ledger_cannot_be_edited_or_deleted()
    {
        var o = await BuildOrg();
        var b = await Batch(o, "B1", 200, 10);
        using var scope = _f.Services.CreateScope();
        await using var db = new AppDbContext(scope.ServiceProvider.GetRequiredService<DbContextOptions<AppDbContext>>(), new TestTenant(o.Tenant));
        var move = await db.StockMovements.FirstAsync(m => m.BatchId == b);
        move.Delta = 9999;
        await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());
        db.ChangeTracker.Clear();
        db.StockMovements.Remove(await db.StockMovements.FirstAsync(m => m.BatchId == b));
        await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());
    }

    // ---------- requests and issuing ----------

    [Fact]
    public async Task Approved_requests_are_issued_oldest_expiry_first()
    {
        var o = await BuildOrg();
        var late = await Batch(o, "LATE", 400, 100);
        var early = await Batch(o, "EARLY", 120, 100);
        var res = await Stock(o, o.Rep1, 150);
        var allocs = res.GetProperty("allocations").EnumerateArray().Select(a => (a.GetProperty("batchId").GetGuid(), a.GetProperty("quantity").GetInt32())).ToList();
        Assert.Equal(new[] { (early, 100), (late, 50) }, allocs);
        Assert.Equal(100, await Held(o, o.Rep1, early));
        Assert.Equal(50, await Held(o, o.Rep1, late));
    }

    [Fact]
    public async Task Issuing_skips_batches_that_are_short_dated_or_not_active_and_refuses_shortfalls_unless_partial()
    {
        var o = await BuildOrg();
        await Batch(o, "SHORT", 10, 100);                  // inside the 30-day minimum shelf life
        var recalled = await Batch(o, "BAD", 300, 100);
        (await o.Admin.PostAsJsonAsync($"/api/v1/samples/batches/{recalled}/status", new BatchStatusDto("Recalled", "Quality defect"))).EnsureSuccessStatusCode();
        var good = await Batch(o, "GOOD", 300, 40);

        var id = Guid.NewGuid();
        await Rep(o, o.Rep1).PostAsJsonAsync("/api/v1/samples/requests", new RequestDto(id, o.Product, 60, null));
        await Area(o, o.AreaA).PostAsJsonAsync($"/api/v1/samples/requests/{id}/approve", new DecisionDto(null, null));
        Assert.Equal(HttpStatusCode.Conflict, (await o.Admin.PostAsJsonAsync($"/api/v1/samples/requests/{id}/fulfil", new FulfilDto(null))).StatusCode); // only 40 eligible
        var ok = await o.Admin.PostAsJsonAsync($"/api/v1/samples/requests/{id}/fulfil", new FulfilDto(null, true));
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
        Assert.Equal(40, await Held(o, o.Rep1, good));
        Assert.Equal(HttpStatusCode.Conflict, (await o.Admin.PostAsJsonAsync($"/api/v1/samples/requests/{id}/fulfil", new FulfilDto(null, true))).StatusCode); // already fulfilled
    }

    [Fact]
    public async Task Request_approval_follows_the_reporting_line()
    {
        var o = await BuildOrg();
        await Batch(o, "B1", 300, 500);
        var id = Guid.NewGuid();
        Assert.Equal(HttpStatusCode.Forbidden, (await Rep(o, o.Rep1).PostAsJsonAsync($"/api/v1/samples/requests/{id}/approve", new DecisionDto(null, null))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Rep(o, o.Rep1).PostAsJsonAsync("/api/v1/samples/requests", new RequestDto(id, o.Product, 50, "launch"))).StatusCode);

        Assert.Equal(HttpStatusCode.NotFound, (await Area(o, o.AreaB).PostAsJsonAsync($"/api/v1/samples/requests/{id}/approve", new DecisionDto(null, null))).StatusCode); // not their team
        Assert.Equal(HttpStatusCode.BadRequest, (await Area(o, o.AreaA).PostAsJsonAsync($"/api/v1/samples/requests/{id}/approve", new DecisionDto(51, null))).StatusCode); // cannot raise
        Assert.Equal(HttpStatusCode.OK, (await Area(o, o.AreaA).PostAsJsonAsync($"/api/v1/samples/requests/{id}/approve", new DecisionDto(30, "reduced"))).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await Area(o, o.AreaA).PostAsJsonAsync($"/api/v1/samples/requests/{id}/approve", new DecisionDto(null, null))).StatusCode);

        var fulfilled = await o.Admin.PostAsJsonAsync($"/api/v1/samples/requests/{id}/fulfil", new FulfilDto(null));
        Assert.Equal(30, (await fulfilled.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("allocations")[0].GetProperty("quantity").GetInt32()); // approved quantity, not requested
    }

    [Fact]
    public async Task Rejection_needs_a_reason_and_reps_can_cancel_open_requests()
    {
        var o = await BuildOrg();
        var id = Guid.NewGuid(); var id2 = Guid.NewGuid();
        await Rep(o, o.Rep1).PostAsJsonAsync("/api/v1/samples/requests", new RequestDto(id, o.Product, 10, null));
        await Rep(o, o.Rep1).PostAsJsonAsync("/api/v1/samples/requests", new RequestDto(id2, o.Product, 10, null));
        Assert.Equal(HttpStatusCode.BadRequest, (await Area(o, o.AreaA).PostAsJsonAsync($"/api/v1/samples/requests/{id}/reject", new DecisionDto(null, " "))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Area(o, o.AreaA).PostAsJsonAsync($"/api/v1/samples/requests/{id}/reject", new DecisionDto(null, "Budget used up"))).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await Rep(o, o.Rep1).PostAsync($"/api/v1/samples/requests/{id}/cancel", null)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Rep(o, o.Rep2).PostAsync($"/api/v1/samples/requests/{id2}/cancel", null)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Rep(o, o.Rep1).PostAsync($"/api/v1/samples/requests/{id2}/cancel", null)).StatusCode);
        // invalid requests
        Assert.Equal(HttpStatusCode.BadRequest, (await Rep(o, o.Rep1).PostAsJsonAsync("/api/v1/samples/requests", new RequestDto(null, o.Product, 0, null))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Rep(o, o.Rep1).PostAsJsonAsync("/api/v1/samples/requests", new RequestDto(null, Guid.NewGuid(), 5, null))).StatusCode);
    }

    // ---------- distribution ----------

    [Fact]
    public async Task Distribution_spends_the_reps_own_stock_and_is_idempotent()
    {
        var o = await BuildOrg();
        var b = await Batch(o, "B1", 300, 100);
        await Stock(o, o.Rep1, 20);
        var visit = await Visit(o, o.Rep1);
        var rep = Rep(o, o.Rep1);
        var id = Guid.NewGuid();

        Assert.Equal(HttpStatusCode.OK, (await rep.PostAsJsonAsync("/api/v1/samples/distributions", Dist(o, b, 5, visit, id))).StatusCode);
        Assert.Equal(15, await Held(o, o.Rep1, b));
        var again = await (await rep.PostAsJsonAsync("/api/v1/samples/distributions", Dist(o, b, 5, visit, id))).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("duplicate", again.GetProperty("status").GetString());
        Assert.Equal(15, await Held(o, o.Rep1, b)); // not spent twice

        Assert.Equal(HttpStatusCode.BadRequest, (await rep.PostAsJsonAsync("/api/v1/samples/distributions", Dist(o, b, 16, visit))).StatusCode); // more than held
        Assert.Equal(HttpStatusCode.BadRequest, (await Rep(o, o.Rep2).PostAsJsonAsync("/api/v1/samples/distributions", Dist(o, b, 1))).StatusCode); // rep2 holds none
        Assert.Equal(HttpStatusCode.BadRequest, (await Rep(o, o.Rep2).PostAsJsonAsync("/api/v1/samples/distributions", Dist(o, b, 1, id: id))).StatusCode); // id used by another rep
        Assert.Equal(HttpStatusCode.BadRequest, (await rep.PostAsJsonAsync("/api/v1/samples/distributions", Dist(o, b, 0))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await rep.PostAsJsonAsync("/api/v1/samples/distributions", Dist(o, b, 1, Guid.NewGuid()))).StatusCode); // unknown visit
        Assert.Equal(HttpStatusCode.BadRequest, (await rep.PostAsJsonAsync("/api/v1/samples/distributions", Dist(o, b, 1, at: DateTime.UtcNow.AddDays(5)))).StatusCode); // future
    }

    [Fact]
    public async Task Expired_recalled_and_quarantined_batches_cannot_be_handed_out()
    {
        var o = await BuildOrg();
        var good = await Batch(o, "GOOD", 300, 100);
        var other = await Batch(o, "OTHER", 300, 100);
        await Stock(o, o.Rep1, 150); // takes from both (FEFO tie broken by batch number)
        var rep = Rep(o, o.Rep1);

        (await o.Admin.PostAsJsonAsync($"/api/v1/samples/batches/{other}/status", new BatchStatusDto("Quarantined", "Under investigation"))).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.BadRequest, (await rep.PostAsJsonAsync("/api/v1/samples/distributions", Dist(o, other, 1))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await rep.PostAsJsonAsync("/api/v1/samples/distributions", Dist(o, good, 1))).StatusCode);

        // an expired batch, seeded directly (the API will not create or issue one)
        Guid expired;
        using (var scope = _f.Services.CreateScope())
        {
            await using var db = new AppDbContext(scope.ServiceProvider.GetRequiredService<DbContextOptions<AppDbContext>>(), new TestTenant(o.Tenant));
            var batch = new SampleBatch { ProductId = o.Product, BatchNumber = "OLD", ExpiryDate = InDays(-3) };
            db.SampleBatches.Add(batch);
            db.StockMovements.Add(new StockMovement { BatchId = batch.Id, HolderId = o.Rep1, Delta = 10, Type = MovementType.Receipt, OccurredAt = DateTime.UtcNow });
            await db.SaveChangesAsync();
            expired = batch.Id;
        }
        var res = await rep.PostAsJsonAsync("/api/v1/samples/distributions", Dist(o, expired, 1));
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.Contains("expired", await res.Content.ReadAsStringAsync());

        // recalled batches can never be reactivated
        (await o.Admin.PostAsJsonAsync($"/api/v1/samples/batches/{good}/status", new BatchStatusDto("Recalled", "Contamination"))).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Conflict, (await o.Admin.PostAsJsonAsync($"/api/v1/samples/batches/{good}/status", new BatchStatusDto("Active", null))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await o.Admin.PostAsJsonAsync($"/api/v1/samples/batches/{other}/status", new BatchStatusDto("Quarantined", ""))).StatusCode);
    }

    // ---------- sync ----------

    [Fact]
    public async Task Sync_applies_each_sample_line_independently_and_returns_stock_and_requests()
    {
        var o = await BuildOrg();
        var b = await Batch(o, "B1", 300, 100);
        await Stock(o, o.Rep1, 10);
        var rep = Rep(o, o.Rep1);
        var visit = Guid.NewGuid();
        var okId = Guid.NewGuid(); var badId = Guid.NewGuid(); var reqId = Guid.NewGuid();

        var push = new SyncPushRequest(
            new() { new CheckInOp(visit, new CheckInDto(null, o.Customer, null, null, null, null, null), null) }, null, null, null,
            new() { new RequestDto(reqId, o.Product, 25, "restock"), new RequestDto(Guid.NewGuid(), o.Product, -1, null) },
            new() { Dist(o, b, 4, visit, okId), Dist(o, b, 50, visit, badId) });
        var res = await rep.PostAsJsonAsync("/api/v1/sync/push", push);
        res.EnsureSuccessStatusCode();
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(body.GetProperty("ok").GetBoolean()); // rejected samples do not fail the batch
        var d = body.GetProperty("sampleDistributions").EnumerateArray().ToDictionary(x => x.GetProperty("id").GetGuid(), x => x.GetProperty("status").GetString());
        Assert.Equal("accepted", d[okId]);
        Assert.Equal("rejected", d[badId]);
        Assert.Equal(new[] { "accepted", "rejected" }, body.GetProperty("sampleRequests").EnumerateArray().Select(x => x.GetProperty("status").GetString()).ToArray());

        // replaying the same push changes nothing
        var replay = await (await rep.PostAsJsonAsync("/api/v1/sync/push", push)).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("duplicate", replay.GetProperty("sampleDistributions")[0].GetProperty("status").GetString());
        Assert.Equal(6, await Held(o, o.Rep1, b));

        var pull = await rep.GetFromJsonAsync<JsonElement>("/api/v1/sync/pull?since=0");
        Assert.Equal(6, pull.GetProperty("sampleStock")[0].GetProperty("quantity").GetInt32());
        Assert.Contains(pull.GetProperty("sampleRequests").EnumerateArray(), r => r.GetProperty("id").GetGuid() == reqId && r.GetProperty("status").GetString() == "Pending");
    }

    // ---------- reports ----------

    [Fact]
    public async Task Compliance_report_flags_unsigned_distributions_and_checks_the_ledger()
    {
        var o = await BuildOrg();
        var b = await Batch(o, "B1", 300, 100);
        await Stock(o, o.Rep1, 30);
        var rep = Rep(o, o.Rep1);
        var visit = await Visit(o, o.Rep1);

        // a real signature, uploaded for the visit
        var png = new byte[400]; Random.Shared.NextBytes(png); new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A }.CopyTo(png, 0);
        var sigId = Guid.NewGuid();
        var put = new HttpRequestMessage(HttpMethod.Put, $"/api/v1/attachments/{sigId}?kind=Signature&visitId={visit}&signerName=Dr%20Ama&meaning=Samples%20received") { Content = new ByteArrayContent(png) };
        put.Content.Headers.ContentType = new("image/png");
        put.Headers.Add("X-Content-SHA256", Convert.ToHexString(SHA256.HashData(png)).ToLowerInvariant());
        (await rep.SendAsync(put)).EnsureSuccessStatusCode();

        (await rep.PostAsJsonAsync("/api/v1/samples/distributions", Dist(o, b, 5, visit, signature: sigId))).EnsureSuccessStatusCode();           // signed
        (await rep.PostAsJsonAsync("/api/v1/samples/distributions", Dist(o, b, 3, visit))).EnsureSuccessStatusCode();                                // no signature
        (await rep.PostAsJsonAsync("/api/v1/samples/distributions", Dist(o, b, 2, visit, signature: Guid.NewGuid()))).EnsureSuccessStatusCode();     // referenced, not uploaded yet
        (await o.Admin.PostAsJsonAsync("/api/v1/samples/adjustments", new AdjustmentDto(b, o.Rep1, -1, "Damaged", null))).EnsureSuccessStatusCode();

        var from = Uri.EscapeDataString(DateTime.UtcNow.AddDays(-1).ToString("O")); var to = Uri.EscapeDataString(DateTime.UtcNow.AddDays(1).ToString("O"));
        var area = Area(o, o.AreaA);
        var report = await area.GetFromJsonAsync<JsonElement>($"/api/v1/samples/reports/compliance?from={from}&to={to}");
        var dist = report.GetProperty("distributions");
        Assert.Equal(3, dist.GetProperty("count").GetInt32());
        Assert.Equal(10, dist.GetProperty("units").GetInt32());
        Assert.Equal(2, dist.GetProperty("withoutSignature").GetInt32());
        Assert.Equal(5, dist.GetProperty("withoutSignatureUnits").GetInt32());
        Assert.True(report.GetProperty("reconciliation").GetProperty("ok").GetBoolean());
        Assert.Equal(1, report.GetProperty("writeOffs").GetProperty("units").GetInt32());
        Assert.Equal(2, report.GetProperty("byRep")[0].GetProperty("withoutSignature").GetInt32());

        var list = await area.GetFromJsonAsync<JsonElement>($"/api/v1/samples/reports/distributions?from={from}&to={to}");
        Assert.Equal(new[] { "Signed", "None", "Awaiting upload" }.OrderBy(x => x), list.EnumerateArray().Select(x => x.GetProperty("signatureState").GetString()!).OrderBy(x => x));
        Assert.Contains(list.EnumerateArray(), x => x.GetProperty("signerName").GetString() == "Dr Ama");

        var csv = await area.GetStringAsync($"/api/v1/samples/reports/distributions?from={from}&to={to}&format=csv");
        Assert.StartsWith("distributionId,repId", csv);
        Assert.Equal(4, csv.Trim().Split('\n').Length);
    }

    [Fact]
    public async Task Reports_are_scoped_to_the_managers_team_and_flag_stock_to_recover()
    {
        var o = await BuildOrg();
        var b = await Batch(o, "B1", 300, 100);
        await Stock(o, o.Rep1, 10);
        await Stock(o, o.Rep3, 10, o.AreaB);
        (await o.Admin.PostAsJsonAsync($"/api/v1/samples/batches/{b}/status", new BatchStatusDto("Recalled", "Defect"))).EnsureSuccessStatusCode();

        var areaA = await Area(o, o.AreaA).GetFromJsonAsync<JsonElement>("/api/v1/samples/reports/stock");
        Assert.Equal(new[] { o.Rep1 }, areaA.EnumerateArray().Select(r => r.GetProperty("holderId").GetGuid()).ToArray()); // no warehouse, no other team
        Assert.True(areaA[0].GetProperty("actionRequired").GetBoolean());

        var all = await o.Admin.GetFromJsonAsync<JsonElement>("/api/v1/samples/reports/stock");
        Assert.Equal(3, all.GetArrayLength()); // warehouse + two reps
        Assert.Contains(all.EnumerateArray(), r => r.GetProperty("location").GetString() == "Warehouse");

        Assert.Equal(HttpStatusCode.Forbidden, (await Rep(o, o.Rep1).GetAsync("/api/v1/samples/reports/stock")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Area(o, o.AreaA).GetAsync($"/api/v1/samples/reports/ledger?batchId={b}")).StatusCode);
    }

    [Fact]
    public async Task Returns_move_stock_back_to_the_warehouse_and_tenants_are_isolated()
    {
        var o = await BuildOrg();
        var b = await Batch(o, "B1", 300, 50);
        await Stock(o, o.Rep1, 20);
        var bad = await o.Admin.PostAsJsonAsync("/api/v1/samples/returns", new ReturnDto(o.Rep1, b, 21, null));
        Assert.Equal(HttpStatusCode.BadRequest, bad.StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await o.Admin.PostAsJsonAsync("/api/v1/samples/returns", new ReturnDto(o.Rep1, b, 5, "unused"))).StatusCode);
        Assert.Equal(15, await Held(o, o.Rep1, b));

        var other = _f.ClientFor(Guid.NewGuid(), Guid.NewGuid(), "Admin");
        Assert.Equal(0, (await other.GetFromJsonAsync<JsonElement>("/api/v1/samples/batches")).GetArrayLength());
    }

    [Fact]
    public void Csv_cells_are_quoted_and_formulas_defused()
    {
        Assert.Equal("\"plain\"", SampleReports.Csv("plain"));
        Assert.Equal("\"say \"\"hi\"\"\"", SampleReports.Csv("say \"hi\""));
        Assert.Equal("\"'=HYPERLINK(\"\"x\"\")\"", SampleReports.Csv("=HYPERLINK(\"x\")"));
        Assert.Equal("\"'@SUM(A1)\"", SampleReports.Csv("@SUM(A1)"));
        Assert.Equal("\"\"", SampleReports.Csv(null));
    }

    // ---------- limits, notifications, concurrency ----------

    private static Task<HttpResponseMessage> EditProduct(Org o, string name, int? limit, int? days) =>
        o.Admin.PutAsJsonAsync($"/api/v1/admin/products/{o.Product}", new ProductEditDto(name, null, null, null, limit, days));

    [Fact]
    public async Task A_customer_cannot_be_given_more_than_the_product_limit_in_the_period()
    {
        var o = await BuildOrg();
        var b = await Batch(o, "B1", 200, 100);
        await Stock(o, o.Rep1, 30);
        (await EditProduct(o, "Amoxil 500", 10, 30)).EnsureSuccessStatusCode();
        var rep = Rep(o, o.Rep1);
        var visit = await Visit(o, o.Rep1);

        Assert.Equal(HttpStatusCode.OK, (await rep.PostAsJsonAsync("/api/v1/samples/distributions", Dist(o, b, 6, visit))).StatusCode);
        var over = await rep.PostAsJsonAsync("/api/v1/samples/distributions", Dist(o, b, 5, visit));
        Assert.Equal(HttpStatusCode.BadRequest, over.StatusCode);
        Assert.Contains("already been given 6", await over.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.OK, (await rep.PostAsJsonAsync("/api/v1/samples/distributions", Dist(o, b, 4, visit))).StatusCode); // exactly the limit
        Assert.Equal(20, await Held(o, o.Rep1, b));

        // handing-out from earlier than the window does not count
        var old = await rep.PostAsJsonAsync("/api/v1/samples/distributions", Dist(o, b, 3, visit, at: DateTime.UtcNow.AddDays(-40)));
        Assert.Equal(HttpStatusCode.OK, old.StatusCode);

        // removing the limit lifts it
        (await EditProduct(o, "Amoxil 500", null, null)).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.OK, (await rep.PostAsJsonAsync("/api/v1/samples/distributions", Dist(o, b, 5, visit))).StatusCode);
    }

    [Fact]
    public async Task Product_limits_are_validated_and_restricted_to_stock_controllers()
    {
        var o = await BuildOrg();
        Assert.Equal(HttpStatusCode.BadRequest, (await EditProduct(o, "Amoxil 500", 10, null)).StatusCode);   // a limit needs its period
        Assert.Equal(HttpStatusCode.BadRequest, (await EditProduct(o, "Amoxil 500", 0, 30)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await EditProduct(o, " ", null, null)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await o.Admin.PutAsJsonAsync($"/api/v1/admin/products/{Guid.NewGuid()}", new ProductEditDto("X", null, null, null, null, null))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Area(o, o.AreaA).PutAsJsonAsync($"/api/v1/admin/products/{o.Product}", new ProductEditDto("X", null, null, null, null, null))).StatusCode);
    }

    [Fact]
    public async Task Reps_holding_a_recalled_batch_are_notified_and_can_read_their_notices()
    {
        var o = await BuildOrg();
        var b = await Batch(o, "B1", 200, 100);
        await Stock(o, o.Rep1, 10);
        await Stock(o, o.Rep2, 5, o.AreaA);

        var res = await o.Admin.PostAsJsonAsync($"/api/v1/samples/batches/{b}/status", new BatchStatusDto("Recalled", "Contamination"));
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(2, body.GetProperty("notified").GetInt32()); // the two reps, not the warehouse
        Assert.Equal("Recalled", body.GetProperty("status").GetString());

        var mine = await Rep(o, o.Rep1).GetFromJsonAsync<JsonElement>("/api/v1/notifications");
        var n = Assert.Single(mine.EnumerateArray().ToList());
        Assert.Equal("batch.recalled", n.GetProperty("kind").GetString());
        Assert.Contains("Amoxil 500", n.GetProperty("title").GetString());
        Assert.Contains("You hold 10", n.GetProperty("body").GetString());
        Assert.Empty((await Rep(o, o.Rep3).GetFromJsonAsync<JsonElement>("/api/v1/notifications")).EnumerateArray()); // not holding it: nothing

        // it also arrives with the sync pull, and marking it read removes it
        var pull = await Rep(o, o.Rep1).GetFromJsonAsync<JsonElement>("/api/v1/sync/pull");
        Assert.Equal(1, pull.GetProperty("notifications").GetArrayLength());
        var id = n.GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.NotFound, (await Rep(o, o.Rep2).PostAsync($"/api/v1/notifications/{id}/read", null)).StatusCode); // someone else's
        Assert.Equal(HttpStatusCode.NoContent, (await Rep(o, o.Rep1).PostAsync($"/api/v1/notifications/{id}/read", null)).StatusCode);
        Assert.Empty((await Rep(o, o.Rep1).GetFromJsonAsync<JsonElement>("/api/v1/notifications")).EnumerateArray());
        Assert.Single((await Rep(o, o.Rep1).GetFromJsonAsync<JsonElement>("/api/v1/notifications?unreadOnly=false")).EnumerateArray().ToList());

        // setting the same status again tells nobody twice
        var again = await (await o.Admin.PostAsJsonAsync($"/api/v1/samples/batches/{b}/status", new BatchStatusDto("Recalled", "Contamination"))).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(0, again.GetProperty("notified").GetInt32());
    }

    [Fact]
    public async Task Marking_all_notices_read_only_touches_the_callers_own()
    {
        var o = await BuildOrg();
        var b = await Batch(o, "B1", 200, 100);
        await Stock(o, o.Rep1, 10);
        await Stock(o, o.Rep2, 5, o.AreaA);
        (await o.Admin.PostAsJsonAsync($"/api/v1/samples/batches/{b}/status", new BatchStatusDto("Quarantined", "Under test"))).EnsureSuccessStatusCode();
        Assert.Equal(1, (await (await Rep(o, o.Rep1).PostAsync("/api/v1/notifications/read-all", null)).Content.ReadFromJsonAsync<JsonElement>()).GetProperty("marked").GetInt32());
        Assert.Single((await Rep(o, o.Rep2).GetFromJsonAsync<JsonElement>("/api/v1/notifications")).EnumerateArray().ToList());
    }

    /// <summary>Runs on PostgreSQL only (the in-memory provider has no transactions): two reps' hand-overs and one stock source racing must never overspend.</summary>
    [Fact]
    public async Task Concurrent_requests_for_the_same_stock_never_overspend_and_never_fail_with_a_server_error()
    {
        if (TestDb.Postgres is null) return;
        var o = await BuildOrg();
        var b = await Batch(o, "B1", 200, 100);
        await Stock(o, o.Rep1, 10);
        var rep = Rep(o, o.Rep1);
        var visit = await Visit(o, o.Rep1);

        // ten simultaneous hand-overs of 3 against a holding of 10: exactly three can succeed
        var results = await Task.WhenAll(Enumerable.Range(0, 10).Select(_ => rep.PostAsJsonAsync("/api/v1/samples/distributions", Dist(o, b, 3, visit))));
        Assert.DoesNotContain(results, r => (int)r.StatusCode >= 500);
        Assert.Equal(3, results.Count(r => r.StatusCode == HttpStatusCode.OK));
        Assert.Equal(1, await Held(o, o.Rep1, b));
    }

    [Fact]
    public void Only_serialization_failures_and_deadlocks_are_retried()
    {
        Assert.False(SampleService.IsSerializationFailure(new InvalidOperationException("x")));
        Assert.False(SampleService.IsSerializationFailure(new Microsoft.EntityFrameworkCore.DbUpdateException("x", new InvalidOperationException("y"))));
    }
}

public class DashboardChartTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _f;
    public DashboardChartTests(ApiFactory f) => _f = f;

    [Fact]
    public async Task Trend_and_product_views_are_scoped_and_complete()
    {
        var tenant = Guid.NewGuid(); var rep = Guid.NewGuid(); var other = Guid.NewGuid(); var terr = Guid.NewGuid();
        var admin = _f.ClientFor(tenant, Guid.NewGuid(), "Admin");
        var product = (await (await admin.PostAsJsonAsync("/api/v1/admin/products", new Product { Name = "Amoxil" })).Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        var cust = (await (await admin.PostAsJsonAsync("/api/v1/customers", new CustomerDto(null, CustomerType.Doctor, "Dr A", null, Segment.A, terr, null, null, null, null, null, null, null, 2, null))).Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();

        foreach (var r in new[] { rep, other })
        {
            var c = _f.ClientFor(tenant, r, "Rep", terr);
            var vid = Guid.NewGuid();
            var push = new SyncPushRequest(
                new() { new CheckInOp(vid, new CheckInDto(null, cust, null, DateTime.UtcNow.AddMinutes(-30), null, null, null), new CheckOutDto(DateTime.UtcNow, null, null)) },
                new() { new CallReportOp(new CallReportDto(Guid.NewGuid(), vid, "n", "Positive", null, null, new() { new CallProductDto(product, "good") })) }, null, null);
            (await c.PostAsJsonAsync("/api/v1/sync/push", push)).EnsureSuccessStatusCode();
        }

        var from = Uri.EscapeDataString(DateTime.UtcNow.AddDays(-2).ToString("O")); var to = Uri.EscapeDataString(DateTime.UtcNow.AddDays(1).ToString("O"));
        var trend = await admin.GetFromJsonAsync<JsonElement>($"/api/v1/dashboards/trend?from={from}&to={to}");
        Assert.True(trend.GetArrayLength() >= 3);
        Assert.Equal(2, trend.EnumerateArray().Sum(d => d.GetProperty("calls").GetInt32())); // gaps are filled with zeros

        var products = await admin.GetFromJsonAsync<JsonElement>($"/api/v1/dashboards/products?from={from}&to={to}");
        Assert.Equal("Amoxil", products[0].GetProperty("name").GetString());
        Assert.Equal(2, products[0].GetProperty("calls").GetInt32());

        // a rep sees only their own activity
        var mine = await _f.ClientFor(tenant, rep, "Rep", terr).GetFromJsonAsync<JsonElement>($"/api/v1/dashboards/products?from={from}&to={to}");
        Assert.Equal(1, mine[0].GetProperty("calls").GetInt32());
    }

    [Fact]
    public async Task Cors_only_allows_configured_origins()
    {
        var c = _f.CreateClient();
        var preflight = new HttpRequestMessage(HttpMethod.Options, "/api/v1/me");
        preflight.Headers.Add("Origin", "http://evil.example");
        preflight.Headers.Add("Access-Control-Request-Method", "GET");
        Assert.False((await c.SendAsync(preflight)).Headers.Contains("Access-Control-Allow-Origin"));
    }
}
