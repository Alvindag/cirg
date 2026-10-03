using System.Globalization;
using System.Text;
using DasEngage.Domain;
using DasEngage.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace DasEngage.Api;

/// <summary>Stock, distribution and compliance reports for managers. Everything respects the manager's team scope.</summary>
public static class SampleReports
{
    private const int ExpiringSoonDays = 90;

    public static void Map(RouteGroupBuilder g)
    {
        var r = g.MapGroup("/reports").RequireAuthorization(p => p.RequireRole(Roles.Managers));

        // Who holds which batch right now, flagged for expiry and recalled/quarantined batches that still need to be recovered.
        r.MapGet("/stock", async (AppDbContext db, TeamScope team) =>
        {
            var ids = await team.VisibleUserIds();
            var moves = db.StockMovements.AsNoTracking().AsQueryable();
            if (ids != null) moves = moves.Where(m => m.HolderId != null && ids.Contains(m.HolderId.Value));
            var balances = await moves.GroupBy(m => new { m.BatchId, m.HolderId })
                .Select(x => new { x.Key.BatchId, x.Key.HolderId, Qty = x.Sum(m => m.Delta) }).Where(x => x.Qty != 0).ToListAsync();
            var batchIds = balances.Select(b => b.BatchId).Distinct().ToList();
            var batches = await db.SampleBatches.AsNoTracking().Where(b => batchIds.Contains(b.Id)).ToDictionaryAsync(b => b.Id);
            var today = SampleService.Today;
            var rows = balances.Where(b => batches.ContainsKey(b.BatchId)).Select(b =>
            {
                var batch = batches[b.BatchId];
                var days = batch.ExpiryDate.DayNumber - today.DayNumber;
                return new
                {
                    holderId = b.HolderId, location = b.HolderId == null ? "Warehouse" : "Rep", batchId = batch.Id, productId = batch.ProductId,
                    batchNumber = batch.BatchNumber, expiryDate = batch.ExpiryDate, daysToExpiry = days, status = batch.Status.ToString(), quantity = b.Qty,
                    expired = days < 0, expiringSoon = days >= 0 && days <= ExpiringSoonDays,
                    actionRequired = b.Qty > 0 && (days < 0 || batch.Status != BatchStatus.Active),
                };
            }).OrderBy(x => x.daysToExpiry).ToList();
            return Results.Ok(rows);
        });

        r.MapGet("/distributions", async (AppDbContext db, TeamScope team, DateTime from, DateTime to, Guid? repId, Guid? productId, Guid? customerId, string? format) =>
        {
            var rows = await Distributions(db, team, from, to, repId, productId, customerId);
            return format == "csv" ? Results.Text(ToCsv(rows), "text/csv; charset=utf-8") : Results.Ok(rows);
        });

        r.MapGet("/compliance", async (AppDbContext db, TeamScope team, DateTime from, DateTime to) =>
        {
            var ids = await team.VisibleUserIds();
            var dist = await Distributions(db, team, from, to, null, null, null);
            var unsigned = dist.Where(d => d.SignatureState != "Signed").ToList();

            var moves = db.StockMovements.AsNoTracking().AsQueryable();
            if (ids != null) moves = moves.Where(m => m.HolderId != null && ids.Contains(m.HolderId.Value));
            var writeOffs = await moves.Where(m => m.Type == MovementType.WriteOff && m.OccurredAt >= from && m.OccurredAt <= to)
                .GroupBy(m => 1).Select(x => new { Count = x.Count(), Units = -x.Sum(m => m.Delta) }).FirstOrDefaultAsync();

            var balances = await moves.GroupBy(m => new { m.BatchId, m.HolderId })
                .Select(x => new { x.Key.BatchId, x.Key.HolderId, Qty = x.Sum(m => m.Delta) }).ToListAsync();
            var batches = await db.SampleBatches.AsNoTracking().ToDictionaryAsync(b => b.Id);
            var today = SampleService.Today;
            var held = balances.Where(b => b.Qty > 0 && batches.ContainsKey(b.BatchId)).ToList();

            // Reconciliation: no negative balances, and the units in the distribution log equal the units the ledger says left stock.
            var negatives = balances.Where(b => b.Qty < 0).Select(b => new { b.BatchId, b.HolderId, quantity = b.Qty }).ToList();
            var ledgerUnits = -await moves.Where(m => m.Type == MovementType.Distribution && m.OccurredAt >= from && m.OccurredAt <= to).SumAsync(m => (int?)m.Delta) ?? 0;
            var loggedUnits = dist.Sum(d => d.Quantity);

            return Results.Ok(new
            {
                period = new { from, to },
                distributions = new { count = dist.Count, units = loggedUnits, withoutSignature = unsigned.Count, withoutSignatureUnits = unsigned.Sum(d => d.Quantity) },
                byRep = dist.GroupBy(d => d.RepId).Select(x => new
                {
                    repId = x.Key, count = x.Count(), units = x.Sum(d => d.Quantity), withoutSignature = x.Count(d => d.SignatureState != "Signed"),
                }).OrderByDescending(x => x.withoutSignature).ToList(),
                stockHeld = new
                {
                    expiredUnits = held.Where(b => batches[b.BatchId].ExpiryDate < today).Sum(b => b.Qty),
                    expiringWithin90DaysUnits = held.Where(b => { var d = batches[b.BatchId].ExpiryDate.DayNumber - today.DayNumber; return d >= 0 && d <= ExpiringSoonDays; }).Sum(b => b.Qty),
                    quarantinedOrRecalledUnits = held.Where(b => batches[b.BatchId].Status != BatchStatus.Active).Sum(b => b.Qty),
                },
                writeOffs = new { count = writeOffs?.Count ?? 0, units = writeOffs?.Units ?? 0 },
                reconciliation = new { ok = negatives.Count == 0 && ledgerUnits == loggedUnits, negativeBalances = negatives, ledgerDistributionUnits = ledgerUnits, loggedDistributionUnits = loggedUnits },
            });
        });

        // Full movement history of a batch (stock controllers).
        r.MapGet("/ledger", async (AppDbContext db, Guid batchId) =>
            Results.Ok(await db.StockMovements.AsNoTracking().Where(m => m.BatchId == batchId).OrderBy(m => m.OccurredAt).ThenBy(m => m.CreatedAt).ToListAsync()))
            .RequireAuthorization(p => p.RequireRole(new[] { "Admin", "NationalSalesManager" }));
    }

    public record DistributionRow(Guid Id, Guid RepId, Guid CustomerId, Guid ProductId, Guid BatchId, string BatchNumber, DateOnly Expiry,
        int Quantity, DateTime DistributedAt, Guid? VisitId, string SignatureState, string? SignerName);

    private static async Task<List<DistributionRow>> Distributions(AppDbContext db, TeamScope team, DateTime from, DateTime to, Guid? repId, Guid? productId, Guid? customerId)
    {
        var ids = await team.VisibleUserIds();
        var q = db.SampleDistributions.AsNoTracking().Where(d => d.DistributedAt >= from && d.DistributedAt <= to);
        if (ids != null) q = q.Where(d => ids.Contains(d.RepId));
        if (repId != null) q = q.Where(d => d.RepId == repId);
        if (productId != null) q = q.Where(d => d.ProductId == productId);
        if (customerId != null) q = q.Where(d => d.CustomerId == customerId);
        var list = await q.OrderBy(d => d.DistributedAt).Take(5000).ToListAsync();

        var sigIds = list.Where(d => d.SignatureAttachmentId != null).Select(d => d.SignatureAttachmentId!.Value).ToList();
        var sigs = await db.Attachments.AsNoTracking().Where(a => sigIds.Contains(a.Id) && a.Kind == AttachmentKind.Signature).ToDictionaryAsync(a => a.Id);
        var batchIds = list.Select(d => d.BatchId).Distinct().ToList();
        var batches = await db.SampleBatches.AsNoTracking().Where(b => batchIds.Contains(b.Id)).ToDictionaryAsync(b => b.Id);

        return list.Select(d =>
        {
            Attachment? sig = null;
            var state = d.SignatureAttachmentId is null ? "None" : sigs.TryGetValue(d.SignatureAttachmentId.Value, out sig) ? "Signed" : "Awaiting upload";
            var b = batches.GetValueOrDefault(d.BatchId);
            return new DistributionRow(d.Id, d.RepId, d.CustomerId, d.ProductId, d.BatchId, b?.BatchNumber ?? "", b?.ExpiryDate ?? default,
                d.Quantity, d.DistributedAt, d.VisitId, state, sig?.SignerName);
        }).ToList();
    }

    private static string ToCsv(List<DistributionRow> rows)
    {
        var sb = new StringBuilder("distributionId,repId,customerId,productId,batchNumber,expiry,quantity,distributedAt,visitId,signatureState,signer\n");
        foreach (var r in rows)
            sb.AppendLine(string.Join(',', new[]
            {
                Csv(r.Id), Csv(r.RepId), Csv(r.CustomerId), Csv(r.ProductId), Csv(r.BatchNumber), Csv(r.Expiry.ToString("yyyy-MM-dd")), Csv(r.Quantity),
                Csv(r.DistributedAt.ToString("O", CultureInfo.InvariantCulture)), Csv(r.VisitId), Csv(r.SignatureState), Csv(r.SignerName),
            }));
        return sb.ToString();
    }

    /// <summary>Quotes a value and defuses spreadsheet formula injection (cells starting with = + - @).</summary>
    public static string Csv(object? v)
    {
        var s = Convert.ToString(v, CultureInfo.InvariantCulture) ?? "";
        if (s.Length > 0 && "=+-@\t\r".Contains(s[0])) s = "'" + s;
        return "\"" + s.Replace("\"", "\"\"") + "\"";
    }
}
