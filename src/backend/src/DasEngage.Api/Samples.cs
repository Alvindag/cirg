using DasEngage.Domain;
using DasEngage.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace DasEngage.Api;

public record BatchDto(Guid? Id, Guid ProductId, string BatchNumber, DateOnly ExpiryDate);
public record BatchStatusDto(string Status, string? Reason);
public record ReceiptDto(Guid BatchId, int Quantity, string? Note);
public record AdjustmentDto(Guid BatchId, Guid? HolderId, int Delta, string Reason, string? Type);
public record ReturnDto(Guid RepId, Guid BatchId, int Quantity, string? Note);
public record RequestDto(Guid? Id, Guid ProductId, int Quantity, string? Notes);
public record DecisionDto(int? Quantity, string? Note);
public record AllocationDto(Guid BatchId, int Quantity);
public record FulfilDto(List<AllocationDto>? Allocations, bool AllowPartial = false);
public record DistributionDto(Guid? Id, Guid? VisitId, Guid CustomerId, Guid ProductId, Guid BatchId, int Quantity,
    DateTime? DistributedAt, Guid? SignatureAttachmentId, string? Notes);

public record ItemResult(Guid Id, string Status, string? Reason);

/// <summary>Sample accountability rules: who holds what, expiry, FEFO issuing, and handing samples to customers.</summary>
public class SampleService
{
    /// <summary>Stock closer to expiry than this is not issued to reps.</summary>
    public const int MinShelfLifeDaysToIssue = 30;
    public const int MaxQuantityPerLine = 1000;

    private readonly AppDbContext _db;
    private readonly Erp.ErpOutbox _outbox;
    public SampleService(AppDbContext db, Erp.ErpOutbox outbox) { _db = db; _outbox = outbox; }

    public static DateOnly Today => DateOnly.FromDateTime(DateTime.UtcNow);

    public async Task<int> Balance(Guid batchId, Guid? holderId) =>
        await _db.StockMovements.Where(m => m.BatchId == batchId && m.HolderId == holderId).SumAsync(m => (int?)m.Delta) ?? 0;

    /// <summary>
    /// Runs stock-changing work in one serializable transaction on PostgreSQL, so two requests cannot both spend the same stock.
    /// (Callers should retry on a serialization failure, SQLSTATE 40001.) The in-memory test provider has no transactions.
    /// </summary>
    public async Task<T> InTransaction<T>(Func<Task<T>> work)
    {
        if (!_db.Database.IsRelational()) return await work();
        await using IDbContextTransaction tx = await _db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable);
        var result = await work();
        await tx.CommitAsync();
        return result;
    }

    /// <summary>Adds a warehouse receipt without saving (the caller saves, so it can be part of a bigger change).</summary>
    public void ReceiveInto(Guid batchId, int quantity, string note, DateTime at) => Move(batchId, null, quantity, MovementType.Receipt, null, note, at);

    private void Move(Guid batchId, Guid? holder, int delta, MovementType type, Guid? refId, string? note, DateTime at) =>
        _db.StockMovements.Add(new StockMovement { BatchId = batchId, HolderId = holder, Delta = delta, Type = type, RefId = refId, Note = note, OccurredAt = at });

    // ---------- receiving, adjusting, returning ----------

    public async Task<string?> Receive(ReceiptDto d)
    {
        if (d.Quantity is < 1 or > 1_000_000) return "Quantity must be between 1 and 1,000,000.";
        var batch = await _db.SampleBatches.FirstOrDefaultAsync(b => b.Id == d.BatchId);
        if (batch is null) return "Batch not found.";
        if (batch.ExpiryDate <= Today) return "This batch has already expired and cannot be received.";
        Move(d.BatchId, null, d.Quantity, MovementType.Receipt, null, d.Note, DateTime.UtcNow);
        await _db.SaveChangesAsync();
        return null;
    }

    /// <summary>Write-offs (damage, loss, expiry) and corrections. A reason is mandatory; stock can never go negative.</summary>
    public async Task<string?> Adjust(AdjustmentDto d)
    {
        if (d.Delta == 0) return "Delta cannot be zero.";
        if (string.IsNullOrWhiteSpace(d.Reason)) return "A reason is required.";
        var type = string.Equals(d.Type, "Adjustment", StringComparison.OrdinalIgnoreCase) ? MovementType.Adjustment : MovementType.WriteOff;
        if (type == MovementType.WriteOff && d.Delta > 0) return "A write-off must be negative; use type Adjustment to add stock back.";
        if (await _db.SampleBatches.FirstOrDefaultAsync(b => b.Id == d.BatchId) is null) return "Batch not found.";
        if (d.HolderId is { } h && await _db.Users.FirstOrDefaultAsync(u => u.Id == h) is null) return "Holder not found.";
        if (d.Delta < 0 && await Balance(d.BatchId, d.HolderId) < -d.Delta) return "Not enough stock for this adjustment.";
        Move(d.BatchId, d.HolderId, d.Delta, type, null, d.Reason.Trim(), DateTime.UtcNow);
        if (await _outbox.IsEnabled())
        {
            var info = (await _outbox.Batches(new[] { d.BatchId }))[d.BatchId];
            await _outbox.Enqueue("sample.adjustment", new { kind = type == MovementType.WriteOff ? "writeoff" : "adjustment", location = d.HolderId == null ? "warehouse" : "rep", repId = d.HolderId,
                itemCode = info.ItemCode, batchNumber = info.BatchNumber, delta = d.Delta, reason = d.Reason.Trim(), at = DateTime.UtcNow });
        }
        await _db.SaveChangesAsync();
        return null;
    }

    public async Task<string?> ReturnToWarehouse(ReturnDto d)
    {
        if (d.Quantity < 1) return "Quantity must be at least 1.";
        if (await _db.Users.FirstOrDefaultAsync(u => u.Id == d.RepId) is null) return "Rep not found.";
        if (await _db.SampleBatches.FirstOrDefaultAsync(b => b.Id == d.BatchId) is null) return "Batch not found.";
        if (await Balance(d.BatchId, d.RepId) < d.Quantity) return "The rep does not hold that much of this batch.";
        var now = DateTime.UtcNow;
        Move(d.BatchId, d.RepId, -d.Quantity, MovementType.ReturnFromRep, null, d.Note, now);
        Move(d.BatchId, null, d.Quantity, MovementType.ReturnFromRep, null, d.Note, now);
        if (await _outbox.IsEnabled())
        {
            var info = (await _outbox.Batches(new[] { d.BatchId }))[d.BatchId];
            await _outbox.Enqueue("sample.return", new { repId = d.RepId, itemCode = info.ItemCode, batchNumber = info.BatchNumber, quantity = d.Quantity, note = d.Note, at = now });
        }
        await _db.SaveChangesAsync();
        return null;
    }

    // ---------- requests ----------

    public async Task<ItemResult> CreateRequest(Guid repId, RequestDto d)
    {
        var id = d.Id ?? Guid.NewGuid();
        if (await _db.SampleRequests.FirstOrDefaultAsync(r => r.Id == id) is { } existing)
            return existing.RepId == repId ? new(id, "duplicate", null) : new(id, "rejected", "Id already used.");
        if (d.Quantity < 1 || d.Quantity > MaxQuantityPerLine) return new(id, "rejected", $"Quantity must be between 1 and {MaxQuantityPerLine}.");
        if (await _db.Products.FirstOrDefaultAsync(p => p.Id == d.ProductId) is null) return new(id, "rejected", "Unknown product.");
        _db.SampleRequests.Add(new SampleRequest { Id = id, RepId = repId, ProductId = d.ProductId, Quantity = d.Quantity, Notes = d.Notes?.Trim() });
        await _db.SaveChangesAsync();
        return new(id, "accepted", null);
    }

    /// <summary>
    /// Issues approved stock from the warehouse to the rep, oldest expiry first (FEFO) unless explicit batches are given.
    /// Only active batches with at least <see cref="MinShelfLifeDaysToIssue"/> days of shelf life are used.
    /// </summary>
    public async Task<(string? Error, List<AllocationDto>? Allocations)> Fulfil(SampleRequest req, FulfilDto d)
    {
        if (req.Status != SampleRequestStatus.Approved) return ("Only approved requests can be fulfilled.", null);
        var wanted = req.ApprovedQuantity ?? req.Quantity;
        var cutoff = Today.AddDays(MinShelfLifeDaysToIssue);
        var plan = new List<AllocationDto>();

        if (d.Allocations is { Count: > 0 })
        {
            foreach (var a in d.Allocations)
            {
                if (a.Quantity < 1) return ("Allocation quantities must be positive.", null);
                var b = await _db.SampleBatches.FirstOrDefaultAsync(x => x.Id == a.BatchId);
                if (b is null || b.ProductId != req.ProductId) return ("A batch does not exist or is for a different product.", null);
                if (b.Status != BatchStatus.Active) return ($"Batch {b.BatchNumber} is {b.Status}.", null);
                if (b.ExpiryDate < cutoff) return ($"Batch {b.BatchNumber} expires too soon to issue.", null);
                if (await Balance(b.Id, null) < a.Quantity) return ($"Not enough warehouse stock of batch {b.BatchNumber}.", null);
                plan.Add(a);
            }
            if (plan.GroupBy(p => p.BatchId).Any(g => g.Count() > 1)) return ("List each batch only once.", null);
        }
        else
        {
            var batches = await _db.SampleBatches.Where(b => b.ProductId == req.ProductId && b.Status == BatchStatus.Active && b.ExpiryDate >= cutoff)
                .OrderBy(b => b.ExpiryDate).ThenBy(b => b.BatchNumber).ToListAsync();
            var left = wanted;
            foreach (var b in batches)
            {
                if (left == 0) break;
                var take = Math.Min(left, await Balance(b.Id, null));
                if (take > 0) { plan.Add(new AllocationDto(b.Id, take)); left -= take; }
            }
        }

        var total = plan.Sum(p => p.Quantity);
        if (total > wanted) return ("Allocated more than the approved quantity.", null);
        if (total == 0) return ("No eligible stock is available in the warehouse.", null);
        if (total < wanted && !d.AllowPartial) return ($"Only {total} of {wanted} available; set allowPartial to issue what is available.", null);

        var now = DateTime.UtcNow;
        foreach (var a in plan)
        {
            Move(a.BatchId, null, -a.Quantity, MovementType.IssueToRep, req.Id, null, now);
            Move(a.BatchId, req.RepId, a.Quantity, MovementType.IssueToRep, req.Id, null, now);
        }
        req.Status = SampleRequestStatus.Fulfilled;
        req.FulfilledAt = now;
        if (await _outbox.IsEnabled())
        {
            var info = await _outbox.Batches(plan.Select(p => p.BatchId));
            var rep = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == req.RepId);
            await _outbox.Enqueue("sample.issue", new { requestId = req.Id, repId = req.RepId, repName = rep?.FullName, issuedAt = now,
                lines = plan.Select(p => new { itemCode = info[p.BatchId].ItemCode, batchNumber = info[p.BatchId].BatchNumber, quantity = p.Quantity }) });
        }
        await _db.SaveChangesAsync();
        return (null, plan);
    }

    // ---------- distribution to customers ----------

    /// <summary>Records samples given to a customer, validating batch, expiry and the rep's own stock. Idempotent on the id.</summary>
    public async Task<ItemResult> RecordDistribution(Guid repId, DistributionDto d)
    {
        var id = d.Id ?? Guid.NewGuid();
        if (await _db.SampleDistributions.FirstOrDefaultAsync(x => x.Id == id) is { } existing)
            return existing.RepId == repId ? new(id, "duplicate", null) : new(id, "rejected", "Id already used.");
        if (d.Quantity < 1 || d.Quantity > MaxQuantityPerLine) return new(id, "rejected", $"Quantity must be between 1 and {MaxQuantityPerLine}.");

        var at = (d.DistributedAt ?? DateTime.UtcNow).ToUniversalTime();
        if (at > DateTime.UtcNow.AddDays(1)) return new(id, "rejected", "Distribution date is in the future.");

        var batch = await _db.SampleBatches.FirstOrDefaultAsync(b => b.Id == d.BatchId);
        if (batch is null || batch.ProductId != d.ProductId) return new(id, "rejected", "Unknown batch for this product.");
        if (batch.Status != BatchStatus.Active) return new(id, "rejected", $"Batch {batch.BatchNumber} is {batch.Status} and cannot be distributed.");
        if (batch.ExpiryDate < DateOnly.FromDateTime(at)) return new(id, "rejected", $"Batch {batch.BatchNumber} had expired ({batch.ExpiryDate:yyyy-MM-dd}).");

        if (await _db.Customers.FirstOrDefaultAsync(c => c.Id == d.CustomerId) is null) return new(id, "rejected", "Unknown customer.");
        if (d.VisitId is { } vid)
        {
            var visit = await _db.Visits.FirstOrDefaultAsync(v => v.Id == vid);
            if (visit is null) return new(id, "rejected", "Visit not found.");
            if (visit.RepId != repId || visit.CustomerId != d.CustomerId) return new(id, "rejected", "The visit does not belong to this rep and customer.");
        }

        if (await Balance(d.BatchId, repId) < d.Quantity) return new(id, "rejected", "You do not hold enough of this batch.");

        _db.SampleDistributions.Add(new SampleDistribution
        {
            Id = id, RepId = repId, VisitId = d.VisitId, CustomerId = d.CustomerId, ProductId = d.ProductId, BatchId = d.BatchId,
            Quantity = d.Quantity, DistributedAt = at, SignatureAttachmentId = d.SignatureAttachmentId, Notes = d.Notes?.Trim(),
        });
        Move(d.BatchId, repId, -d.Quantity, MovementType.Distribution, id, null, at);
        if (await _outbox.IsEnabled())
        {
            var info = (await _outbox.Batches(new[] { d.BatchId }))[d.BatchId];
            var customer = await _db.Customers.AsNoTracking().FirstOrDefaultAsync(c => c.Id == d.CustomerId);
            var rep = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == repId);
            await _outbox.Enqueue("sample.distribution", new { distributionId = id, repId, repName = rep?.FullName, customerAccountCode = customer?.ErpAccountCode, customerName = customer?.Name,
                itemCode = info.ItemCode, batchNumber = info.BatchNumber, quantity = d.Quantity, distributedAt = at, signed = d.SignatureAttachmentId != null });
        }
        await _db.SaveChangesAsync();
        return new(id, "accepted", null);
    }

    /// <summary>What a rep (or any holder) currently carries, for the device to work offline.</summary>
    public async Task<List<object>> HoldingsFor(Guid holderId)
    {
        var rows = await _db.StockMovements.AsNoTracking().Where(m => m.HolderId == holderId)
            .GroupBy(m => m.BatchId).Select(g => new { BatchId = g.Key, Qty = g.Sum(m => m.Delta) }).Where(x => x.Qty > 0).ToListAsync();
        var ids = rows.Select(r => r.BatchId).ToList();
        var batches = await _db.SampleBatches.AsNoTracking().Where(b => ids.Contains(b.Id)).ToDictionaryAsync(b => b.Id);
        return rows.Where(r => batches.ContainsKey(r.BatchId)).Select(r =>
        {
            var b = batches[r.BatchId];
            return (object)new { batchId = b.Id, productId = b.ProductId, batchNumber = b.BatchNumber, expiryDate = b.ExpiryDate, status = b.Status.ToString(), quantity = r.Qty };
        }).ToList();
    }
}

public static class SampleEndpoints
{
    private static readonly string[] StockControllers = { "Admin", "NationalSalesManager" };
    private static readonly string[] Approvers = { "AreaManager", "RegionalManager", "NationalSalesManager", "Admin" };

    public static void Map(RouteGroupBuilder api)
    {
        var g = api.MapGroup("/samples");
        MapBatches(g);
        MapStock(g);
        MapRequests(g);
        MapDistributions(g);
        SampleReports.Map(g);
    }

    private static IResult Fail(string? error) => error is null ? Results.NoContent() : Results.BadRequest(error);

    private static void MapBatches(RouteGroupBuilder g)
    {
        g.MapGet("/batches", async (AppDbContext db, Guid? productId, bool includeExpired = false) =>
        {
            var q = db.SampleBatches.AsNoTracking().AsQueryable();
            if (productId != null) q = q.Where(b => b.ProductId == productId);
            if (!includeExpired) q = q.Where(b => b.ExpiryDate >= SampleService.Today);
            return Results.Ok(await q.OrderBy(b => b.ExpiryDate).ToListAsync());
        }).RequireAuthorization(p => p.RequireRole(Roles.Managers));

        g.MapPost("/batches", async (BatchDto d, AppDbContext db) =>
        {
            if (string.IsNullOrWhiteSpace(d.BatchNumber) || d.BatchNumber.Length > 50) return Results.BadRequest("Batch number is required (max 50 characters).");
            if (d.ExpiryDate <= SampleService.Today) return Results.BadRequest("Expiry date must be in the future.");
            if (await db.Products.FirstOrDefaultAsync(p => p.Id == d.ProductId) is null) return Results.BadRequest("Unknown product.");
            var number = d.BatchNumber.Trim();
            if (await db.SampleBatches.AnyAsync(b => b.ProductId == d.ProductId && b.BatchNumber == number)) return Results.Conflict("This batch number already exists for the product.");
            var b = new SampleBatch { Id = d.Id ?? Guid.NewGuid(), ProductId = d.ProductId, BatchNumber = number, ExpiryDate = d.ExpiryDate };
            db.SampleBatches.Add(b);
            await db.SaveChangesAsync();
            return Results.Created($"/api/v1/samples/batches/{b.Id}", b);
        }).RequireAuthorization(p => p.RequireRole(StockControllers));

        // Quarantine or recall a batch: it stops being issued or handed out immediately. Reps holding it are listed in the stock report.
        g.MapPost("/batches/{id:guid}/status", async (Guid id, BatchStatusDto d, AppDbContext db) =>
        {
            if (!Enum.TryParse<BatchStatus>(d.Status, true, out var status)) return Results.BadRequest("Status must be Active, Quarantined or Recalled.");
            if (status != BatchStatus.Active && string.IsNullOrWhiteSpace(d.Reason)) return Results.BadRequest("A reason is required.");
            var b = await db.SampleBatches.FirstOrDefaultAsync(x => x.Id == id);
            if (b is null) return Results.NotFound();
            if (b.Status == BatchStatus.Recalled && status != BatchStatus.Recalled) return Results.Conflict("A recalled batch cannot be reactivated.");
            b.Status = status; b.StatusReason = d.Reason?.Trim();
            await db.SaveChangesAsync();
            return Results.Ok(b);
        }).RequireAuthorization(p => p.RequireRole(StockControllers));
    }

    private static void MapStock(RouteGroupBuilder g)
    {
        g.MapPost("/receipts", async (ReceiptDto d, SampleService s) => Fail(await s.InTransaction(() => s.Receive(d))))
            .RequireAuthorization(p => p.RequireRole(StockControllers));
        g.MapPost("/adjustments", async (AdjustmentDto d, SampleService s) => Fail(await s.InTransaction(() => s.Adjust(d))))
            .RequireAuthorization(p => p.RequireRole(StockControllers));
        g.MapPost("/returns", async (ReturnDto d, SampleService s) => Fail(await s.InTransaction(() => s.ReturnToWarehouse(d))))
            .RequireAuthorization(p => p.RequireRole(StockControllers));

        // The caller's own holdings (what a rep carries).
        g.MapGet("/my-stock", async (HttpCurrentUser u, SampleService s) => u.UserId is { } id ? Results.Ok(await s.HoldingsFor(id)) : Results.Forbid());
    }

    private static void MapRequests(RouteGroupBuilder g)
    {
        g.MapPost("/requests", async (RequestDto d, SampleService s, HttpCurrentUser u) =>
        {
            if (u.UserId is null) return Results.Forbid();
            var r = await s.CreateRequest(u.UserId.Value, d);
            return r.Status == "rejected" ? Results.BadRequest(r.Reason) : Results.Ok(r);
        });

        g.MapGet("/requests", async (AppDbContext db, TeamScope team, string? status, Guid? repId) =>
        {
            var ids = await team.VisibleUserIds();
            var q = db.SampleRequests.AsNoTracking().AsQueryable();
            if (ids != null) q = q.Where(r => ids.Contains(r.RepId));
            if (repId != null) q = q.Where(r => r.RepId == repId);
            if (Enum.TryParse<SampleRequestStatus>(status, true, out var st)) q = q.Where(r => r.Status == st);
            return Results.Ok(await q.OrderByDescending(r => r.CreatedAt).Take(200).ToListAsync());
        });

        // Approve (optionally for a smaller quantity) or reject: by a manager in the rep's reporting line, never the requester.
        g.MapPost("/requests/{id:guid}/approve", async (Guid id, DecisionDto d, AppDbContext db, TeamScope team, HttpCurrentUser u) =>
        {
            var r = await Decidable(db, team, u, id);
            if (r.Result != null) return r.Result;
            var qty = d.Quantity ?? r.Request!.Quantity;
            if (qty < 1 || qty > r.Request!.Quantity) return Results.BadRequest("Approved quantity must be between 1 and the requested quantity.");
            Decide(r.Request!, u, SampleRequestStatus.Approved, d.Note); r.Request!.ApprovedQuantity = qty;
            await db.SaveChangesAsync();
            return Results.Ok(r.Request);
        }).RequireAuthorization(p => p.RequireRole(Approvers));

        g.MapPost("/requests/{id:guid}/reject", async (Guid id, DecisionDto d, AppDbContext db, TeamScope team, HttpCurrentUser u) =>
        {
            if (string.IsNullOrWhiteSpace(d.Note)) return Results.BadRequest("A reason is required.");
            var r = await Decidable(db, team, u, id);
            if (r.Result != null) return r.Result;
            Decide(r.Request!, u, SampleRequestStatus.Rejected, d.Note);
            await db.SaveChangesAsync();
            return Results.Ok(r.Request);
        }).RequireAuthorization(p => p.RequireRole(Approvers));

        g.MapPost("/requests/{id:guid}/cancel", async (Guid id, AppDbContext db, HttpCurrentUser u) =>
        {
            var r = await db.SampleRequests.FirstOrDefaultAsync(x => x.Id == id && x.RepId == u.UserId);
            if (r is null) return Results.NotFound();
            if (r.Status is not (SampleRequestStatus.Pending or SampleRequestStatus.Approved)) return Results.Conflict("Only open requests can be cancelled.");
            r.Status = SampleRequestStatus.Cancelled;
            await db.SaveChangesAsync();
            return Results.Ok(r);
        });

        g.MapPost("/requests/{id:guid}/fulfil", async (Guid id, FulfilDto d, AppDbContext db, SampleService s) =>
        {
            var (error, allocations) = await s.InTransaction(async () =>
            {
                var r = await db.SampleRequests.FirstOrDefaultAsync(x => x.Id == id);
                if (r is null) return ("Request not found.", (List<AllocationDto>?)null);
                return await s.Fulfil(r, d);
            });
            return error == "Request not found." ? Results.NotFound() : error != null ? Results.Conflict(error) : Results.Ok(new { allocations });
        }).RequireAuthorization(p => p.RequireRole(StockControllers));
    }

    private static async Task<(SampleRequest? Request, IResult? Result)> Decidable(AppDbContext db, TeamScope team, HttpCurrentUser u, Guid id)
    {
        var r = await db.SampleRequests.FirstOrDefaultAsync(x => x.Id == id);
        var ids = await team.VisibleUserIds();
        if (r is null || (ids != null && !ids.Contains(r.RepId))) return (null, Results.NotFound());
        if (r.RepId == u.UserId) return (null, Results.Forbid());
        if (r.Status != SampleRequestStatus.Pending) return (null, Results.Conflict("This request has already been decided."));
        return (r, null);
    }

    private static void Decide(SampleRequest r, HttpCurrentUser u, SampleRequestStatus status, string? note)
    {
        r.Status = status; r.DecidedBy = u.UserId; r.DecidedAt = DateTime.UtcNow; r.DecisionNote = note?.Trim();
    }

    private static void MapDistributions(RouteGroupBuilder g)
    {
        g.MapPost("/distributions", async (DistributionDto d, SampleService s, HttpCurrentUser u) =>
        {
            if (u.UserId is null) return Results.Forbid();
            var r = await s.InTransaction(() => s.RecordDistribution(u.UserId.Value, d));
            return r.Status == "rejected" ? Results.BadRequest(r.Reason) : Results.Ok(r);
        });
    }
}
