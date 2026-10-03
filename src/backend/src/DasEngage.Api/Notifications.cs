using DasEngage.Domain;
using DasEngage.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace DasEngage.Api;

/// <summary>
/// In-app notices for the signed-in user. They reach a rep's phone with the next sync (<c>notifications</c> in the pull) and show in the dashboard.
/// There is no push to a locked phone yet: that needs Firebase / Apple push credentials.
/// </summary>
public static class NotificationEndpoints
{
    public static void Map(RouteGroupBuilder api)
    {
        var g = api.MapGroup("/notifications");

        g.MapGet("/", async (AppDbContext db, HttpCurrentUser u, bool unreadOnly = true, int take = 50) =>
            u.UserId is not { } me ? Results.Forbid()
            : Results.Ok(await db.Notifications.AsNoTracking().Where(n => n.UserId == me && (!unreadOnly || n.ReadAt == null))
                .OrderByDescending(n => n.CreatedAt).Take(Math.Clamp(take, 1, 200)).ToListAsync()));

        g.MapPost("/{id:guid}/read", async (Guid id, AppDbContext db, HttpCurrentUser u) =>
        {
            var n = await db.Notifications.FirstOrDefaultAsync(x => x.Id == id && x.UserId == u.UserId);
            if (n is null) return Results.NotFound();
            n.ReadAt ??= DateTime.UtcNow;
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        g.MapPost("/read-all", async (AppDbContext db, HttpCurrentUser u) =>
        {
            var unread = await db.Notifications.Where(x => x.UserId == u.UserId && x.ReadAt == null).ToListAsync();
            foreach (var n in unread) n.ReadAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
            return Results.Ok(new { marked = unread.Count });
        });
    }

    /// <summary>Tells every rep who currently holds stock of the batch. Returns how many people were told.</summary>
    public static async Task<int> BatchHolders(AppDbContext db, SampleBatch batch, string productName, BatchStatus status)
    {
        var holders = await db.StockMovements.Where(m => m.BatchId == batch.Id && m.HolderId != null)
            .GroupBy(m => m.HolderId!.Value).Select(g => new { UserId = g.Key, Qty = g.Sum(m => m.Delta) }).Where(x => x.Qty > 0).ToListAsync();
        var kind = status == BatchStatus.Recalled ? "batch.recalled" : "batch.quarantined";
        foreach (var h in holders)
            db.Notifications.Add(new Notification
            {
                UserId = h.UserId, Kind = kind, RefId = batch.Id,
                Title = status == BatchStatus.Recalled ? $"Recall: {productName} batch {batch.BatchNumber}" : $"Quarantined: {productName} batch {batch.BatchNumber}",
                Body = $"You hold {h.Qty} unit(s). Do not hand them out" + (status == BatchStatus.Recalled ? " and return them to the warehouse." : " until you are told it is released.") + (string.IsNullOrWhiteSpace(batch.StatusReason) ? "" : $" Reason: {batch.StatusReason}"),
            });
        return holders.Count;
    }
}
