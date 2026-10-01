using System.Text.Json;
using DasEngage.Domain;
using DasEngage.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace DasEngage.Api.Erp;

public record ConnectionDto(string Provider, string? BaseUrl, string? SecretName, bool Enabled, bool OutboundEnabled, bool PullEnabled, int PullIntervalMinutes, string? Currency);
public record KeyRequest(string Name);
public record LinkRequest(Guid CustomerId, string AccountCode);
public record RequisitionRequest(Guid ProductId, int Quantity, DateOnly? NeededBy, string? Note);
public record NoteRequest(string? Note);
public record ReferenceRequest(string ErpReference);

public static class ErpEndpoints
{
    private static readonly string[] ErpAdmins = { "Admin", "NationalSalesManager" };
    private static readonly string[] ErpViewers = { "Admin", "NationalSalesManager", "Executive" };

    public static void Map(RouteGroupBuilder api)
    {
        var g = api.MapGroup("/erp");
        MapConnection(g);
        MapImport(g);
        MapMonitoring(g);
        Procurement.Map(g);
        ErpReports.Map(api);
    }

    // ---------- connection and keys ----------

    private static void MapConnection(RouteGroupBuilder g)
    {
        g.MapGet("/connection", async (AppDbContext db) =>
        {
            var c = await db.ErpConnections.AsNoTracking().FirstOrDefaultAsync();
            return Results.Ok(c is null
                ? new { provider = "none", baseUrl = (string?)null, secretName = (string?)null, enabled = false, outboundEnabled = false, pullEnabled = false, pullIntervalMinutes = 60, currency = "GHS", lastPullAt = (DateTime?)null, lastError = (string?)null }
                : new { provider = c.Provider, baseUrl = c.BaseUrl, secretName = c.SecretName, enabled = c.Enabled, outboundEnabled = c.OutboundEnabled, pullEnabled = c.PullEnabled, pullIntervalMinutes = c.PullIntervalMinutes, currency = c.Currency, lastPullAt = c.LastPullAt, lastError = c.LastError });
        }).RequireAuthorization(p => p.RequireRole(ErpViewers));

        g.MapPut("/connection", async (ConnectionDto d, AppDbContext db, IConfiguration cfg, IWebHostEnvironment env) =>
        {
            var provider = d.Provider?.ToLowerInvariant();
            if (provider is not ("none" or "rest")) return Results.BadRequest("Provider must be none or rest.");
            var currency = (d.Currency ?? "GHS").Trim().ToUpperInvariant();
            if (currency.Length != 3) return Results.BadRequest("Currency must be a 3-letter code.");
            if (d.PullIntervalMinutes is < 5 or > 1440) return Results.BadRequest("The pull interval must be between 5 and 1440 minutes.");
            if (provider == "rest")
            {
                var allowHttp = env.IsDevelopment() || cfg.GetValue<bool>("Erp:AllowInsecureHttp");
                var problem = UrlGuard.Validate(d.BaseUrl, allowHttp, cfg.GetSection("Erp:AllowedHosts").Get<string[]>());
                if (problem != null) return Results.BadRequest(problem);
                if (d.SecretName is { Length: > 100 }) return Results.BadRequest("Secret name is too long.");
            }
            else if (d.Enabled && (d.OutboundEnabled || d.PullEnabled)) return Results.BadRequest("Choose the rest provider to send to or pull from an ERP.");

            var c = await db.ErpConnections.FirstOrDefaultAsync();
            if (c is null) { c = new ErpConnection(); db.ErpConnections.Add(c); }
            c.Provider = provider; c.BaseUrl = provider == "rest" ? d.BaseUrl!.Trim() : null; c.SecretName = d.SecretName?.Trim();
            c.Enabled = d.Enabled; c.OutboundEnabled = d.OutboundEnabled; c.PullEnabled = d.PullEnabled; c.PullIntervalMinutes = d.PullIntervalMinutes; c.Currency = currency;
            await db.SaveChangesAsync();
            return Results.Ok(new { saved = true });
        }).RequireAuthorization(p => p.RequireRole(ErpAdmins));

        g.MapPost("/connection/test", async (AppDbContext db, IErpConnector connector) =>
        {
            var c = await db.ErpConnections.AsNoTracking().FirstOrDefaultAsync();
            if (c is null || c.Provider == "none") return Results.BadRequest("No ERP gateway is configured.");
            var error = await connector.PingAsync(c);
            return Results.Ok(new { ok = error is null, error });
        }).RequireAuthorization(p => p.RequireRole(ErpAdmins));

        g.MapGet("/keys", async (AppDbContext db) =>
            Results.Ok(await db.IntegrationKeys.AsNoTracking().OrderByDescending(k => k.CreatedAt)
                .Select(k => new { k.Id, k.Name, k.Prefix, k.CreatedAt, k.LastUsedAt, k.RevokedAt }).ToListAsync()))
            .RequireAuthorization(p => p.RequireRole(ErpViewers));

        // The key is returned once, here, and never again.
        g.MapPost("/keys", async (KeyRequest d, AppDbContext db) =>
        {
            if (string.IsNullOrWhiteSpace(d.Name) || d.Name.Length > 80) return Results.BadRequest("Give the key a name (max 80 characters), for example the system that will use it.");
            var (key, prefix, hash) = ApiKeyAuth.Generate();
            var k = new IntegrationKey { Name = d.Name.Trim(), Prefix = prefix, KeyHash = hash };
            db.IntegrationKeys.Add(k);
            await db.SaveChangesAsync();
            return Results.Ok(new { k.Id, k.Name, k.Prefix, key, note = "Copy this key now. It cannot be shown again." });
        }).RequireAuthorization(p => p.RequireRole(ErpAdmins));

        g.MapDelete("/keys/{id:guid}", async (Guid id, AppDbContext db) =>
        {
            var k = await db.IntegrationKeys.FirstOrDefaultAsync(x => x.Id == id);
            if (k is null) return Results.NotFound();
            k.RevokedAt ??= DateTime.UtcNow;
            await db.SaveChangesAsync();
            return Results.NoContent();
        }).RequireAuthorization(p => p.RequireRole(ErpAdmins));
    }

    // ---------- import by a person (JSON or CSV) and by middleware (API key) ----------

    private static async Task<IResult> Run(string entity, string source, HttpRequest req, ErpImporter importer, AppDbContext db, bool createMissing)
    {
        string defaultCurrency = (await db.ErpConnections.AsNoTracking().Select(c => c.Currency).FirstOrDefaultAsync()) ?? "GHS";
        var isCsv = (req.ContentType ?? "").StartsWith("text/csv", StringComparison.OrdinalIgnoreCase);
        try
        {
            ImportSummary s;
            List<ItemOutcome> parseErrors = new();
            if (isCsv)
            {
                using var reader = new StreamReader(req.Body, System.Text.Encoding.UTF8, true, 1024, true);
                var csv = await reader.ReadToEndAsync();
                if (csv.Length > 5_000_000) return Results.StatusCode(StatusCodes.Status413PayloadTooLarge);
                switch (entity)
                {
                    case "products": { var p = CsvMapper.Products(csv); parseErrors = p.Errors; s = await importer.Products(p.Items, source); break; }
                    case "customers": { var p = CsvMapper.Customers(csv); s = await importer.Customers(p.Items, source, createMissing); break; }
                    case "sales": { var p = CsvMapper.Sales(csv); parseErrors = p.Errors; s = await importer.Sales(p.Items, source, defaultCurrency); break; }
                    case "goods-receipts": { var p = CsvMapper.GoodsReceipts(csv); parseErrors = p.Errors; s = await importer.GoodsReceipts(p.Items, source); break; }
                    default: { var p = CsvMapper.StockLevels(csv); parseErrors = p.Errors; s = await importer.StockLevels(p.Items, source); break; }
                }
            }
            else
            {
                var opts = ErpJson.Options;
                switch (entity)
                {
                    case "products": s = await importer.Products(await Read<ErpProduct>(req, opts), source); break;
                    case "customers": s = await importer.Customers(await Read<ErpCustomer>(req, opts), source, createMissing); break;
                    case "sales": s = await importer.Sales(await Read<ErpSale>(req, opts), source, defaultCurrency); break;
                    case "goods-receipts": s = await importer.GoodsReceipts(await Read<ErpGoodsReceipt>(req, opts), source); break;
                    default: s = await importer.StockLevels(await Read<ErpStockLevel>(req, opts), source); break;
                }
            }
            if (parseErrors.Count > 0) s = s with { Errors = s.Errors + parseErrors.Count, Items = parseErrors.Concat(s.Items).ToList() };
            return Results.Ok(s);
        }
        catch (FormatException e) { return Results.BadRequest(e.Message); }
        catch (ArgumentException e) { return Results.BadRequest(e.Message); }
        catch (JsonException) { return Results.BadRequest("The body is not valid JSON for this record type."); }
    }

    private static async Task<List<T>> Read<T>(HttpRequest req, JsonSerializerOptions opts) =>
        await JsonSerializer.DeserializeAsync<List<T>>(req.Body, opts) ?? throw new FormatException("Send a JSON array of records.");

    private static readonly string[] Entities = { "products", "customers", "sales", "goods-receipts", "stock-levels" };

    private static void MapImport(RouteGroupBuilder g)
    {
        g.MapPost("/import/{entity}", async (string entity, HttpRequest req, ErpImporter importer, AppDbContext db, bool? createMissing) =>
            !Entities.Contains(entity) ? Results.NotFound() : await Run(entity, "csv", req, importer, db, createMissing ?? false))
            .RequireAuthorization(p => p.RequireRole(ErpAdmins)).WithMetadata(new Microsoft.AspNetCore.Mvc.RequestSizeLimitAttribute(6_000_000));

        g.MapPost("/customers/link", async (LinkRequest d, ErpImporter importer) =>
            await importer.LinkCustomer(d.CustomerId, d.AccountCode) is { } error ? Results.BadRequest(error) : Results.NoContent())
            .RequireAuthorization(p => p.RequireRole(ErpAdmins));
    }

    /// <summary>The key-authenticated door for ERP middleware. Same rules and the same results as an upload.</summary>
    public static void MapIntegration(WebApplication app)
    {
        var g = app.MapGroup("/integration/v1").RequireAuthorization("Integration").RequireRateLimiting("default");
        g.MapGet("/health", () => Results.Ok(new { status = "ok" }));
        foreach (var entity in Entities)
        {
            var e = entity;
            g.MapPost($"/{e}", async (HttpRequest req, ErpImporter importer, AppDbContext db, bool? createMissing) => await Run(e, "push", req, importer, db, createMissing ?? false))
                .WithMetadata(new Microsoft.AspNetCore.Mvc.RequestSizeLimitAttribute(6_000_000));
        }
    }

    // ---------- monitoring ----------

    private static void MapMonitoring(RouteGroupBuilder g)
    {
        g.MapGet("/runs", async (AppDbContext db, int take = 50) =>
            Results.Ok(await db.SyncRuns.AsNoTracking().OrderByDescending(r => r.StartedAt).Take(Math.Clamp(take, 1, 200)).ToListAsync()))
            .RequireAuthorization(p => p.RequireRole(ErpViewers));

        g.MapGet("/outbox", async (AppDbContext db, string? status, int take = 100) =>
        {
            var q = db.OutboxMessages.AsNoTracking().AsQueryable();
            if (Enum.TryParse<OutboxStatus>(status, true, out var st)) q = q.Where(m => m.Status == st);
            var counts = await db.OutboxMessages.AsNoTracking().GroupBy(m => m.Status).Select(x => new { status = x.Key.ToString(), n = x.Count() }).ToListAsync();
            return Results.Ok(new { counts, items = await q.OrderByDescending(m => m.CreatedAt).Take(Math.Clamp(take, 1, 500)).ToListAsync() });
        }).RequireAuthorization(p => p.RequireRole(ErpViewers));

        g.MapPost("/outbox/{id:guid}/retry", async (Guid id, AppDbContext db) =>
        {
            var m = await db.OutboxMessages.FirstOrDefaultAsync(x => x.Id == id);
            if (m is null) return Results.NotFound();
            if (m.Status != OutboxStatus.DeadLetter) return Results.Conflict("Only failed messages can be retried.");
            m.Status = OutboxStatus.Pending; m.Attempts = 0; m.NextAttemptAt = DateTime.UtcNow; m.LastError = null;
            await db.SaveChangesAsync();
            return Results.Ok(m);
        }).RequireAuthorization(p => p.RequireRole(ErpAdmins));

        g.MapPost("/outbox/dispatch", async (ErpSync sync) => Results.Ok(await sync.DispatchOutbox())).RequireAuthorization(p => p.RequireRole(ErpAdmins));
        g.MapPost("/pull", async (ErpSync sync) => Results.Ok(await sync.Pull(force: true))).RequireAuthorization(p => p.RequireRole(ErpAdmins));

        // ERP accounts and items we could not tie to a DAS customer or product yet: what to link by hand.
        g.MapGet("/unmatched", async (AppDbContext db) =>
        {
            var customers = await db.SalesFacts.AsNoTracking().Where(s => s.CustomerId == null).GroupBy(s => s.AccountCode)
                .Select(x => new { accountCode = x.Key, lines = x.Count(), amount = x.Sum(s => s.NetAmount) }).OrderByDescending(x => x.amount).Take(100).ToListAsync();
            var items = await db.SalesFacts.AsNoTracking().Where(s => s.ProductId == null).GroupBy(s => s.ItemCode)
                .Select(x => new { itemCode = x.Key, lines = x.Count() }).OrderByDescending(x => x.lines).Take(100).ToListAsync();
            return Results.Ok(new { customers, items });
        }).RequireAuthorization(p => p.RequireRole(ErpViewers));

        // Is the warehouse stock in DAS Engage the same as in the ERP?
        g.MapGet("/reconciliation/stock", async (AppDbContext db) =>
        {
            var snaps = await db.ErpStockSnapshots.AsNoTracking().ToListAsync();
            var central = await db.StockMovements.AsNoTracking().Where(m => m.HolderId == null).GroupBy(m => m.BatchId).Select(x => new { BatchId = x.Key, Qty = x.Sum(m => m.Delta) }).ToListAsync();
            var batches = await db.SampleBatches.AsNoTracking().ToDictionaryAsync(b => b.Id);
            var products = await db.Products.AsNoTracking().ToDictionaryAsync(p => p.Id);
            var rows = new List<object>();
            var seen = new HashSet<string>();

            foreach (var c in central.Where(c => batches.ContainsKey(c.BatchId)))
            {
                var b = batches[c.BatchId]; var p = products.GetValueOrDefault(b.ProductId);
                var code = p?.Code ?? "";
                var batchSnap = snaps.FirstOrDefault(s => s.ItemCode == code && s.BatchNumber == b.BatchNumber);
                seen.Add($"{code}/{b.BatchNumber}");
                // when the ERP only reports a total per item, compare totals instead
                if (batchSnap is null && snaps.Any(s => s.ItemCode == code && s.BatchNumber == null)) continue;
                var erp = batchSnap?.Quantity;
                rows.Add(new { itemCode = code, product = p?.Name, batchNumber = b.BatchNumber, das = c.Qty, erp, difference = erp is null ? (decimal?)null : erp - c.Qty,
                    status = erp is null ? "Missing in ERP" : erp == c.Qty ? "Match" : "Differs", asOf = batchSnap?.AsOf });
            }
            foreach (var s in snaps.Where(s => s.BatchNumber != null && !seen.Contains($"{s.ItemCode}/{s.BatchNumber}")))
                rows.Add(new { itemCode = s.ItemCode, product = products.GetValueOrDefault(s.ProductId ?? Guid.Empty)?.Name, batchNumber = s.BatchNumber, das = 0, erp = (decimal?)s.Quantity, difference = (decimal?)s.Quantity,
                    status = s.Quantity == 0 ? "Match" : "Missing in DAS", asOf = (DateTime?)s.AsOf });

            foreach (var totals in snaps.Where(s => s.BatchNumber == null))
            {
                var das = central.Where(c => batches.TryGetValue(c.BatchId, out var bb) && products.GetValueOrDefault(bb.ProductId)?.Code == totals.ItemCode).Sum(c => c.Qty);
                rows.Add(new { itemCode = totals.ItemCode, product = products.GetValueOrDefault(totals.ProductId ?? Guid.Empty)?.Name, batchNumber = (string?)null, das, erp = (decimal?)totals.Quantity,
                    difference = (decimal?)(totals.Quantity - das), status = totals.Quantity == das ? "Match" : "Differs", asOf = (DateTime?)totals.AsOf });
            }
            var ordered = rows.Cast<dynamic>().OrderBy(r => (string)r.status == "Match" ? 1 : 0).ThenBy(r => (string)r.itemCode).ToList();
            return Results.Ok(new { balanced = ordered.All(r => (string)r.status == "Match"), snapshotCount = snaps.Count, rows = ordered });
        }).RequireAuthorization(p => p.RequireRole(ErpViewers));
    }
}
