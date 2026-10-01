using System.Text.Json;
using DasEngage.Domain;
using DasEngage.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace DasEngage.Api.Erp;

/// <summary>Sample procurement: suggestions when warehouse stock runs low, and a requisition that is approved by a second person and sent to the ERP.</summary>
public static class Procurement
{
    private static readonly string[] Admins = { "Admin", "NationalSalesManager" };
    private static readonly string[] Viewers = { "Admin", "NationalSalesManager", "Executive" };

    public static void Map(RouteGroupBuilder g)
    {
        var p = g.MapGroup("/procurement");

        // Products whose usable warehouse stock (active, unexpired batches) plus what is already on order is below the reorder level.
        p.MapGet("/suggestions", async (AppDbContext db) =>
        {
            var today = SampleService.Today;
            var products = await db.Products.AsNoTracking().Where(x => x.ReorderLevel != null).ToListAsync();
            var batches = await db.SampleBatches.AsNoTracking().Where(b => b.Status == BatchStatus.Active && b.ExpiryDate >= today).Select(b => new { b.Id, b.ProductId }).ToListAsync();
            var central = (await db.StockMovements.AsNoTracking().Where(m => m.HolderId == null).GroupBy(m => m.BatchId).Select(x => new { BatchId = x.Key, Qty = x.Sum(m => m.Delta) }).ToListAsync())
                .ToDictionary(x => x.BatchId, x => x.Qty);
            var onOrder = (await db.PurchaseRequisitions.AsNoTracking().Where(r => r.Status == RequisitionStatus.Approved).ToListAsync())
                .GroupBy(r => r.ProductId).ToDictionary(x => x.Key, x => x.Sum(r => Math.Max(0, r.Quantity - r.ReceivedQuantity)));
            var since = DateTime.UtcNow.AddDays(-90);
            var used = await db.SampleDistributions.AsNoTracking().Where(d => d.DistributedAt >= since).GroupBy(d => d.ProductId).Select(x => new { x.Key, Units = x.Sum(d => d.Quantity) }).ToListAsync();
            var usage = used.ToDictionary(x => x.Key, x => x.Units / 3.0);

            var rows = products.Select(pr =>
            {
                var available = batches.Where(b => b.ProductId == pr.Id).Sum(b => central.GetValueOrDefault(b.Id));
                var ordered = onOrder.GetValueOrDefault(pr.Id);
                var monthly = usage.GetValueOrDefault(pr.Id);
                var position = available + ordered;
                var suggested = Math.Max(0, pr.ReorderLevel!.Value * 2 - position);
                return new
                {
                    productId = pr.Id, itemCode = pr.Code, name = pr.Name, reorderLevel = pr.ReorderLevel, available, onOrder = ordered,
                    monthlyUsage = Math.Round(monthly, 1), monthsOfCover = monthly > 0 ? Math.Round(available / monthly, 1) : (double?)null,
                    belowReorderLevel = position < pr.ReorderLevel, suggestedQuantity = position < pr.ReorderLevel ? suggested : 0,
                };
            }).OrderByDescending(r => r.belowReorderLevel).ThenBy(r => r.name).ToList();
            return Results.Ok(rows);
        }).RequireAuthorization(a => a.RequireRole(Viewers));

        p.MapGet("/requisitions", async (AppDbContext db, string? status) =>
        {
            var q = db.PurchaseRequisitions.AsNoTracking().AsQueryable();
            if (Enum.TryParse<RequisitionStatus>(status, true, out var st)) q = q.Where(r => r.Status == st);
            return Results.Ok(await q.OrderByDescending(r => r.CreatedAt).Take(200).ToListAsync());
        }).RequireAuthorization(a => a.RequireRole(Viewers));

        p.MapPost("/requisitions", async (RequisitionRequest d, AppDbContext db, HttpCurrentUser u) =>
        {
            if (u.UserId is null) return Results.Forbid();
            if (d.Quantity is < 1 or > 1_000_000) return Results.BadRequest("Quantity must be between 1 and 1,000,000.");
            if (d.NeededBy is { } nb && nb < SampleService.Today) return Results.BadRequest("The needed-by date is in the past.");
            if (d.Note is { Length: > 500 }) return Results.BadRequest("The note is too long.");
            var product = await db.Products.FirstOrDefaultAsync(x => x.Id == d.ProductId);
            if (product is null) return Results.BadRequest("Unknown product.");
            if (string.IsNullOrEmpty(product.Code)) return Results.BadRequest("This product has no ERP item code. Import products from the ERP first.");
            var r = new PurchaseRequisition { ProductId = d.ProductId, Quantity = d.Quantity, NeededBy = d.NeededBy, Note = d.Note?.Trim(), RequestedBy = u.UserId.Value };
            db.PurchaseRequisitions.Add(r);
            await db.SaveChangesAsync();
            return Results.Created($"/api/v1/erp/procurement/requisitions/{r.Id}", r);
        }).RequireAuthorization(a => a.RequireRole(Admins));

        // Separation of duties: the person who asked for the purchase cannot approve it.
        p.MapPost("/requisitions/{id:guid}/approve", async (Guid id, AppDbContext db, HttpCurrentUser u, ErpOutbox outbox) =>
        {
            var r = await db.PurchaseRequisitions.FirstOrDefaultAsync(x => x.Id == id);
            if (r is null) return Results.NotFound();
            if (r.Status != RequisitionStatus.Draft) return Results.Conflict("Only a draft requisition can be approved.");
            if (r.RequestedBy == u.UserId) return Results.Problem(detail: "Someone else must approve a requisition you raised.", statusCode: 403);
            r.Status = RequisitionStatus.Approved; r.ApprovedBy = u.UserId; r.ApprovedAt = DateTime.UtcNow;
            var product = await db.Products.AsNoTracking().FirstAsync(x => x.Id == r.ProductId);
            var requester = await db.Users.AsNoTracking().FirstOrDefaultAsync(x => x.Id == r.RequestedBy);
            await outbox.Enqueue("purchase.requisition", new { requisitionId = r.Id, itemCode = product.Code, productName = product.Name, quantity = r.Quantity, neededBy = r.NeededBy,
                requestedBy = requester?.FullName, note = r.Note });
            await db.SaveChangesAsync();
            return Results.Ok(r);
        }).RequireAuthorization(a => a.RequireRole(Admins));

        p.MapPost("/requisitions/{id:guid}/reject", async (Guid id, NoteRequest d, AppDbContext db, HttpCurrentUser u) =>
        {
            if (string.IsNullOrWhiteSpace(d.Note)) return Results.BadRequest("A reason is required.");
            var r = await db.PurchaseRequisitions.FirstOrDefaultAsync(x => x.Id == id);
            if (r is null) return Results.NotFound();
            if (r.Status != RequisitionStatus.Draft) return Results.Conflict("Only a draft requisition can be rejected.");
            if (r.RequestedBy == u.UserId) return Results.Problem(detail: "Someone else must decide a requisition you raised. Cancel it instead.", statusCode: 403);
            r.Status = RequisitionStatus.Rejected; r.ApprovedBy = u.UserId; r.ApprovedAt = DateTime.UtcNow; r.DecisionNote = d.Note.Trim();
            await db.SaveChangesAsync();
            return Results.Ok(r);
        }).RequireAuthorization(a => a.RequireRole(Admins));

        p.MapPost("/requisitions/{id:guid}/cancel", async (Guid id, AppDbContext db) =>
        {
            var r = await db.PurchaseRequisitions.FirstOrDefaultAsync(x => x.Id == id);
            if (r is null) return Results.NotFound();
            if (r.Status is not (RequisitionStatus.Draft or RequisitionStatus.Approved) || r.ReceivedQuantity > 0) return Results.Conflict("This requisition can no longer be cancelled.");
            r.Status = RequisitionStatus.Cancelled;
            await db.SaveChangesAsync();
            return Results.Ok(r);
        }).RequireAuthorization(a => a.RequireRole(Admins));

        // For purchases entered in the ERP by hand: record its reference so goods receipts can be matched to this requisition.
        p.MapPost("/requisitions/{id:guid}/reference", async (Guid id, ReferenceRequest d, AppDbContext db) =>
        {
            if (string.IsNullOrWhiteSpace(d.ErpReference) || d.ErpReference.Length > 100) return Results.BadRequest("Enter the ERP purchase reference (max 100 characters).");
            var r = await db.PurchaseRequisitions.FirstOrDefaultAsync(x => x.Id == id);
            if (r is null) return Results.NotFound();
            if (r.Status != RequisitionStatus.Approved) return Results.Conflict("Only an approved requisition has an ERP reference.");
            r.ErpReference = d.ErpReference.Trim();
            await db.SaveChangesAsync();
            return Results.Ok(r);
        }).RequireAuthorization(a => a.RequireRole(Admins));
    }

    /// <summary>When the ERP accepts a purchase requisition and answers with its own reference, store it so receipts can be matched.</summary>
    public static async Task RecordReference(AppDbContext db, OutboxMessage sent)
    {
        if (sent.Type != "purchase.requisition" || string.IsNullOrEmpty(sent.ExternalRef)) return;
        using var doc = JsonDocument.Parse(sent.Payload);
        if (!doc.RootElement.TryGetProperty("requisitionId", out var id) || !Guid.TryParse(id.GetString(), out var rid)) return;
        var r = await db.PurchaseRequisitions.FirstOrDefaultAsync(x => x.Id == rid);
        if (r != null && string.IsNullOrEmpty(r.ErpReference)) r.ErpReference = sent.ExternalRef;
    }
}
