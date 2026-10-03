using System.Text.Json;
using DasEngage.Domain;
using DasEngage.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace DasEngage.Api.Erp;

/// <summary>
/// Writes ERP-bound messages in the same unit of work as the business change (the transactional outbox pattern), so a change can
/// never be saved without its message, nor a message sent for a change that failed. Delivery happens later, with retries.
/// </summary>
public class ErpOutbox
{
    private readonly AppDbContext _db;
    private bool? _enabled;
    public ErpOutbox(AppDbContext db) => _db = db;

    public async Task<bool> IsEnabled() =>
        _enabled ??= await _db.ErpConnections.AsNoTracking().AnyAsync(c => c.Enabled && c.OutboundEnabled && c.Provider != "none");

    /// <summary>Adds the message to the context; the caller saves.</summary>
    public async Task Enqueue(string type, object payload)
    {
        if (!await IsEnabled()) return;
        _db.OutboxMessages.Add(new OutboxMessage { Type = type, Payload = JsonSerializer.Serialize(payload, ErpJson.Options) });
    }

    public record BatchInfo(string ItemCode, string BatchNumber, string ProductName);

    /// <summary>ERP item code and batch number for batches, for message payloads.</summary>
    public async Task<Dictionary<Guid, BatchInfo>> Batches(IEnumerable<Guid> batchIds)
    {
        var ids = batchIds.Distinct().ToList();
        var batches = await _db.SampleBatches.AsNoTracking().Where(b => ids.Contains(b.Id)).ToListAsync();
        var products = await _db.Products.AsNoTracking().ToDictionaryAsync(p => p.Id);
        return batches.ToDictionary(b => b.Id, b =>
        {
            var p = products.GetValueOrDefault(b.ProductId);
            return new BatchInfo(p?.Code ?? "", b.BatchNumber, p?.Name ?? "");
        });
    }
}
