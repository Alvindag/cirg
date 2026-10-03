using System.Text.Json;
using DasEngage.Domain;
using DasEngage.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace DasEngage.Api.Erp;

/// <summary>Delivers the outbox to the ERP and pulls new data from it, for one tenant.</summary>
public class ErpSync
{
    public const int MaxAttempts = 8;
    /// <summary>Wait before attempt n+1: 1 min, 5 min, 30 min, 2 h, then 12 h.</summary>
    public static readonly TimeSpan[] Backoff = { TimeSpan.FromMinutes(1), TimeSpan.FromMinutes(5), TimeSpan.FromMinutes(30), TimeSpan.FromHours(2), TimeSpan.FromHours(12) };
    public static readonly string[] Entities = { "products", "customers", "sales", "goods-receipts", "stock-levels" };

    private readonly AppDbContext _db;
    private readonly IErpConnector _connector;
    private readonly ErpImporter _importer;
    private readonly Func<DateTime> _now;

    public ErpSync(AppDbContext db, IErpConnector connector, ErpImporter importer, Func<DateTime>? now = null)
    {
        _db = db; _connector = connector; _importer = importer; _now = now ?? (() => DateTime.UtcNow);
    }

    public record DispatchResult(int Sent, int Retrying, int DeadLettered);

    public async Task<DispatchResult> DispatchOutbox(int max = 50, CancellationToken ct = default)
    {
        var conn = await _db.ErpConnections.FirstOrDefaultAsync(c => c.Enabled && c.OutboundEnabled, ct);
        if (conn is null) return new(0, 0, 0);
        var now = _now();
        var due = await _db.OutboxMessages.Where(m => m.Status == OutboxStatus.Pending && m.NextAttemptAt <= now).OrderBy(m => m.CreatedAt).Take(max).ToListAsync(ct);
        int sent = 0, retry = 0, dead = 0;
        foreach (var m in due)
        {
            var r = await _connector.SendAsync(conn, m, ct);
            m.Attempts++;
            if (r.Success) { m.Status = OutboxStatus.Sent; m.SentAt = _now(); m.ExternalRef = r.Reference; m.LastError = null; sent++; await Procurement.RecordReference(_db, m); }
            else if (r.Permanent || m.Attempts >= MaxAttempts) { m.Status = OutboxStatus.DeadLetter; m.LastError = r.Error; dead++; }
            else { m.LastError = r.Error; m.NextAttemptAt = _now() + Backoff[Math.Min(m.Attempts - 1, Backoff.Length - 1)]; retry++; }
            await _db.SaveChangesAsync(ct); // after each message, so a crash never resends one that was already accepted
        }
        return new(sent, retry, dead);
    }

    public async Task<List<ImportSummary>> Pull(bool force = false, CancellationToken ct = default)
    {
        var results = new List<ImportSummary>();
        var conn = await _db.ErpConnections.FirstOrDefaultAsync(c => c.Enabled && c.PullEnabled, ct);
        if (conn is null) return results;
        if (!force && conn.LastPullAt is { } last && _now() - last < TimeSpan.FromMinutes(Math.Max(5, conn.PullIntervalMinutes))) return results;
        var cursors = string.IsNullOrEmpty(conn.Cursors) ? new Dictionary<string, string>() : JsonSerializer.Deserialize<Dictionary<string, string>>(conn.Cursors) ?? new();
        string? error = null;

        foreach (var entity in Entities)
        {
            for (var page = 0; page < 20 && error is null; page++)
            {
                cursors.TryGetValue(entity, out var cursor);
                ImportSummary? s;
                string? next, err;
                switch (entity)
                {
                    case "products": { var p = await _connector.PullAsync<ErpProduct>(conn, entity, cursor, ct); err = p.Error; next = p.NextCursor; s = err is null && p.Items.Count > 0 ? await _importer.Products(p.Items, "pull") : null; break; }
                    case "customers": { var p = await _connector.PullAsync<ErpCustomer>(conn, entity, cursor, ct); err = p.Error; next = p.NextCursor; s = err is null && p.Items.Count > 0 ? await _importer.Customers(p.Items, "pull", false) : null; break; }
                    case "sales": { var p = await _connector.PullAsync<ErpSale>(conn, entity, cursor, ct); err = p.Error; next = p.NextCursor; s = err is null && p.Items.Count > 0 ? await _importer.Sales(p.Items, "pull", conn.Currency) : null; break; }
                    case "goods-receipts": { var p = await _connector.PullAsync<ErpGoodsReceipt>(conn, entity, cursor, ct); err = p.Error; next = p.NextCursor; s = err is null && p.Items.Count > 0 ? await _importer.GoodsReceipts(p.Items, "pull") : null; break; }
                    default: { var p = await _connector.PullAsync<ErpStockLevel>(conn, entity, cursor, ct); err = p.Error; next = p.NextCursor; s = err is null && p.Items.Count > 0 ? await _importer.StockLevels(p.Items, "pull") : null; break; }
                }
                if (err != null) { error = $"{entity}: {err}"; break; }
                if (s != null) results.Add(s);
                if (next == PullCursor.Reset) { cursors.Remove(entity); break; } // a full snapshot was read: start from the top next time
                if (!string.IsNullOrEmpty(next)) cursors[entity] = next; // advance only after the page was applied
                if (s is null || string.IsNullOrEmpty(next)) break;
            }
            if (error != null) break;
        }

        conn.Cursors = JsonSerializer.Serialize(cursors);
        conn.LastPullAt = _now();
        conn.LastError = error;
        await _db.SaveChangesAsync(ct);
        return results;
    }
}
