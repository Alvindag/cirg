using DasEngage.Domain;
using DasEngage.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace DasEngage.Api;

public record OrderLineDto(Guid ProductId, int Quantity);
public record OrderDto(Guid? Id, Guid CustomerId, List<OrderLineDto>? Lines, string? Notes, DateTime? PlacedAt);
public record OrderNoteDto(string? Note);
public record ConfirmDto(string? Note, DateOnly? PromisedDate);
public record DeliverDto(bool? InFull, string? Note);
public record PriceDto(Guid ProductId, decimal? Price);

/// <summary>
/// Order rules, kept in one place so the phone sync and the web use the same ones: the server prices every order from the product list,
/// a rep orders only for customers in their own territory, repeated products are merged, a retry never saves an order twice.
/// </summary>
public partial class OrderService
{
    public const int MaxQuantityPerLine = 1000;
    public const int MaxLines = 100;
    /// <summary>Delivery is promised this many days after confirmation unless the office sets a date.</summary>
    public const int DefaultPromiseDays = 2;

    private readonly AppDbContext _db;
    private readonly TeamScope _team;
    public OrderService(AppDbContext db, TeamScope team) { _db = db; _team = team; }

    private static DateTime Utc(DateTime d) => d.Kind switch
    {
        DateTimeKind.Utc => d,
        DateTimeKind.Local => d.ToUniversalTime(),
        _ => DateTime.SpecifyKind(d, DateTimeKind.Utc),
    };

    public async Task<ItemResult> Create(Guid repId, OrderDto d)
    {
        var id = d.Id ?? Guid.NewGuid();
        if (await _db.Orders.FirstOrDefaultAsync(o => o.Id == id) is { } existing)
            return existing.RepId == repId ? new(id, "duplicate", null) : new(id, "rejected", "Id already used.");

        var lines = d.Lines ?? new();
        if (lines.Count == 0) return new(id, "rejected", "An order needs at least one product.");
        if (lines.Count > MaxLines) return new(id, "rejected", $"An order may have at most {MaxLines} products.");
        foreach (var l in lines)
            if (l.Quantity < 1 || l.Quantity > MaxQuantityPerLine)
                return new(id, "rejected", $"Each quantity must be a whole number from 1 to {MaxQuantityPerLine}.");

        var customer = await _db.Customers.FirstOrDefaultAsync(c => c.Id == d.CustomerId);
        if (customer is null) return new(id, "rejected", "This customer is not available any more.");
        var territories = await _team.VisibleTerritoryIds();
        if (territories != null && (customer.TerritoryId is null || !territories.Contains(customer.TerritoryId.Value)))
            return new(id, "rejected", "You can only order for customers in your own territory.");

        // Repeated products are added together, so the 1,000 limit applies to what is really being ordered.
        var merged = lines.GroupBy(l => l.ProductId).Select(g => (ProductId: g.Key, Quantity: g.Sum(x => x.Quantity))).ToList();
        var ids = merged.Select(m => m.ProductId).ToList();
        var products = await _db.Products.Where(p => ids.Contains(p.Id)).ToDictionaryAsync(p => p.Id);
        var order = new SalesOrder { Id = id, RepId = repId, CustomerId = customer.Id, CustomerName = customer.Name, Notes = d.Notes?.Trim() };
        foreach (var (productId, qty) in merged)
        {
            if (!products.TryGetValue(productId, out var p)) return new(id, "rejected", "A product on this order is not available any more.");
            if (qty > MaxQuantityPerLine) return new(id, "rejected", $"{p.Name}: at most {MaxQuantityPerLine} per order.");
            if (p.ListPrice is not > 0) return new(id, "rejected", $"{p.Name} has no price yet, so it cannot be ordered.");
            var total = Math.Round(p.ListPrice.Value * qty, 2);
            order.Lines.Add(new SalesOrderLine { OrderId = id, ProductId = p.Id, ProductName = p.Name, Quantity = qty, UnitPrice = p.ListPrice.Value, LineTotal = total });
            order.Total += total;
        }

        await ApplyCreditRules(order);

        var now = DateTime.UtcNow;
        // The rep's own clock is kept (offline orders), but never in the future and never before the app could have existed.
        var placed = d.PlacedAt is { } t ? Utc(t) : now;
        order.PlacedAt = placed > now ? now : placed < now.AddDays(-45) ? now : placed;
        order.Number = $"ORD-{order.PlacedAt:yyyyMMdd}-{id.ToString("N")[..6].ToUpperInvariant()}";
        _db.Orders.Add(order);
        await _db.SaveChangesAsync();
        return new(id, "accepted", null);
    }
}

public partial class OrderService
{
    /// <summary>
    /// An order is taken even when the customer is over their limit or has overdue invoices (the rep is in front of the customer and may be offline),
    /// but it is held: a senior manager must release it, with a reason, before it can be confirmed. Customers with no limit set are never held for the limit.
    /// </summary>
    private async Task ApplyCreditRules(SalesOrder order)
    {
        var credit = await _db.CustomerCredits.AsNoTracking().FirstOrDefaultAsync(c => c.CustomerId == order.CustomerId);
        if (credit is null) return;
        var reasons = new List<string>();
        if (credit.Overdue > 0) reasons.Add($"has GHS {credit.Overdue:N2} overdue");
        if (credit.CreditLimit is > 0)
        {
            // Orders taken but not yet delivered are not in the ERP balance yet, so they count too.
            var open = await _db.Orders.Where(o => o.CustomerId == order.CustomerId && (o.Status == OrderStatus.Placed || o.Status == OrderStatus.Confirmed)).SumAsync(o => (decimal?)o.Total) ?? 0;
            var exposure = credit.Outstanding + open + order.Total;
            if (exposure > credit.CreditLimit) reasons.Add($"would owe GHS {exposure:N2} against a limit of GHS {credit.CreditLimit:N2} (GHS {credit.Outstanding:N2} owed, GHS {open:N2} on open orders, GHS {order.Total:N2} on this one)");
        }
        if (reasons.Count == 0) return;
        order.CreditHold = true;
        order.CreditHoldReason = "The customer " + string.Join(" and ", reasons) + ".";
    }
}

public static class OrderEndpoints
{
    private static readonly string[] Approvers = { "AreaManager", "RegionalManager", "NationalSalesManager", "Admin" };
    private static readonly string[] PriceEditors = { "NationalSalesManager", "Executive", "Admin" };

    public static void Map(RouteGroupBuilder api)
    {
        var g = api.MapGroup("/orders");

        g.MapPost("/", async (OrderDto d, OrderService s, HttpCurrentUser u) =>
        {
            if (u.UserId is null) return Results.Forbid();
            var r = await s.Create(u.UserId.Value, d);
            return r.Status == "rejected" ? Results.BadRequest(r.Reason) : Results.Ok(r);
        });

        g.MapGet("/", async (AppDbContext db, TeamScope team, string? status, Guid? customerId, Guid? repId, int? days) =>
        {
            var q = await Visible(db, team);
            if (Enum.TryParse<OrderStatus>(status, true, out var st)) q = q.Where(o => o.Status == st);
            if (customerId != null) q = q.Where(o => o.CustomerId == customerId);
            if (repId != null) q = q.Where(o => o.RepId == repId);
            if (days is > 0 and <= 730) { var from = DateTime.UtcNow.AddDays(-days.Value); q = q.Where(o => o.PlacedAt >= from); }
            return Results.Ok(await q.Include(o => o.Lines).OrderByDescending(o => o.PlacedAt).Take(200).ToListAsync());
        });

        // Totals for the period, and the time from taking an order to delivering it.
        g.MapGet("/summary", async (AppDbContext db, TeamScope team, int? days) =>
        {
            var d = Math.Clamp(days ?? 30, 1, 365);
            var from = DateTime.UtcNow.AddDays(-d);
            var orders = await (await Visible(db, team)).Where(o => o.PlacedAt >= from).Include(o => o.Lines).ToListAsync();
            var live = orders.Where(o => o.Status != OrderStatus.Cancelled).ToList();
            var delivered = orders.Where(o => o.Status == OrderStatus.Delivered && o.DeliveredAt != null).ToList();
            return Results.Ok(new
            {
                days = d,
                orders = live.Count,
                value = live.Sum(o => o.Total),
                placed = orders.Count(o => o.Status == OrderStatus.Placed),
                confirmed = orders.Count(o => o.Status == OrderStatus.Confirmed),
                delivered = delivered.Count,
                cancelled = orders.Count(o => o.Status == OrderStatus.Cancelled),
                avgHoursToDeliver = delivered.Count == 0 ? (double?)null : Math.Round(delivered.Average(o => (o.DeliveredAt!.Value - o.PlacedAt).TotalHours), 1),
                service = Service(delivered),
                lateOpen = orders.Count(o => o.Status == OrderStatus.Confirmed && o.PromisedAt != null && o.PromisedAt < DateTime.UtcNow),
                regions = await ServiceByRegion(db, delivered),
                topProducts = live.SelectMany(o => o.Lines).GroupBy(l => new { l.ProductId, l.ProductName })
                    .Select(x => new { x.Key.ProductId, name = x.Key.ProductName, quantity = x.Sum(l => l.Quantity), value = x.Sum(l => l.LineTotal) })
                    .OrderByDescending(x => x.value).Take(5).ToList(),
            });
        });

        // The price list orders are priced from. An empty price takes a product off sale.
        g.MapPut("/prices", async (List<PriceDto> rows, AppDbContext db) =>
        {
            if (rows.Count is 0 or > 500) return Results.BadRequest("Send between 1 and 500 prices.");
            if (rows.Any(r => r.Price is < 0 or > 1_000_000)) return Results.BadRequest("A price must be between 0 and 1,000,000.");
            var ids = rows.Select(r => r.ProductId).Distinct().ToList();
            var products = await db.Products.Where(p => ids.Contains(p.Id)).ToDictionaryAsync(p => p.Id);
            if (ids.Any(i => !products.ContainsKey(i))) return Results.BadRequest("One of the products does not exist.");
            foreach (var r in rows) products[r.ProductId].ListPrice = r.Price is > 0 ? Math.Round(r.Price.Value, 2) : null;
            await db.SaveChangesAsync();
            return Results.NoContent();
        }).RequireAuthorization(p => p.RequireRole(PriceEditors));

        g.MapPost("/{id:guid}/confirm", async (Guid id, ConfirmDto? d, AppDbContext db, TeamScope team, HttpCurrentUser u) =>
        {
            var o = await Find(db, team, id);
            if (o is null) return Results.NotFound();
            if (o.Status != OrderStatus.Placed) return Results.BadRequest("Only a placed order can be confirmed.");
            if (o.CreditHold)
            {
                if (u.Role is not (UserRole.NationalSalesManager or UserRole.Admin)) return Results.Json("This order is on credit hold. A National Sales Manager or Admin must release it.", statusCode: 403);
                if (string.IsNullOrWhiteSpace(d?.Note)) return Results.BadRequest("This order is on credit hold: give the reason for releasing it.");
                o.CreditReleasedBy = u.UserId; o.CreditReleaseNote = d!.Note!.Trim();
            }
            var confirmedAt = DateTime.UtcNow;
            if (d?.PromisedDate is { } day && day < DateOnly.FromDateTime(confirmedAt)) return Results.BadRequest("The promised date cannot be in the past.");
            o.Status = OrderStatus.Confirmed; o.ConfirmedAt = confirmedAt; o.ConfirmedBy = u.UserId;
            o.PromisedAt = d?.PromisedDate is { } pd ? new DateTime(pd.Year, pd.Month, pd.Day, 23, 59, 59, DateTimeKind.Utc) : confirmedAt.AddDays(OrderService.DefaultPromiseDays);
            await db.SaveChangesAsync();
            return Results.Ok(o);
        }).RequireAuthorization(p => p.RequireRole(Approvers));

        g.MapPost("/{id:guid}/deliver", async (Guid id, DeliverDto? d, AppDbContext db, TeamScope team, HttpCurrentUser u) =>
        {
            var o = await Find(db, team, id);
            if (o is null) return Results.NotFound();
            if (o.Status != OrderStatus.Confirmed) return Results.BadRequest("Only a confirmed order can be marked delivered.");
            var inFull = d?.InFull ?? true;
            if (!inFull && string.IsNullOrWhiteSpace(d?.Note)) return Results.BadRequest("Say what was short when an order is not delivered in full.");
            o.Status = OrderStatus.Delivered; o.DeliveredAt = DateTime.UtcNow; o.DeliveredBy = u.UserId;
            o.DeliveredInFull = inFull; o.ShortfallNote = inFull ? null : d!.Note!.Trim();
            await db.SaveChangesAsync();
            return Results.Ok(o);
        }).RequireAuthorization(p => p.RequireRole(Approvers));

        // A rep may withdraw their own order until it is confirmed; a manager may cancel anything not yet delivered, with a reason.
        g.MapPost("/{id:guid}/cancel", async (Guid id, OrderNoteDto d, AppDbContext db, TeamScope team, HttpCurrentUser u) =>
        {
            var o = await Find(db, team, id);
            if (o is null) return Results.NotFound();
            var manager = u.Role is not null && Approvers.Contains(u.Role.Value.ToString());
            if (!manager && (o.RepId != u.UserId || o.Status != OrderStatus.Placed))
                return Results.BadRequest("You can only cancel your own order before it is confirmed.");
            if (o.Status is OrderStatus.Delivered or OrderStatus.Cancelled) return Results.BadRequest("This order can no longer be cancelled.");
            if (manager && o.RepId != u.UserId && string.IsNullOrWhiteSpace(d.Note)) return Results.BadRequest("A reason is required.");
            o.Status = OrderStatus.Cancelled; o.CancelledAt = DateTime.UtcNow; o.CancelledBy = u.UserId; o.CancelReason = d.Note?.Trim();
            await db.SaveChangesAsync();
            return Results.Ok(o);
        });
    }

    /// <summary>On time (delivered by the promised time), in full, and both (OTIF), as a share of delivered orders that carry a promise.</summary>
    private static object Service(List<SalesOrder> delivered)
    {
        var judged = delivered.Where(o => o.PromisedAt != null && o.DeliveredInFull != null).ToList();
        double? Pct(Func<SalesOrder, bool> f) => judged.Count == 0 ? null : Math.Round(judged.Count(f) * 100.0 / judged.Count, 1);
        return new
        {
            judged = judged.Count,
            onTimePct = Pct(o => o.DeliveredAt <= o.PromisedAt),
            inFullPct = Pct(o => o.DeliveredInFull == true),
            otifPct = Pct(o => o.DeliveredAt <= o.PromisedAt && o.DeliveredInFull == true),
        };
    }

    private static async Task<object> ServiceByRegion(AppDbContext db, List<SalesOrder> delivered)
    {
        var judged = delivered.Where(o => o.PromisedAt != null && o.DeliveredInFull != null).ToList();
        if (judged.Count == 0) return new List<object>();
        var ids = judged.Select(o => o.CustomerId).Distinct().ToList();
        var terr = await db.Customers.AsNoTracking().Where(c => ids.Contains(c.Id)).Select(c => new { c.Id, c.TerritoryId }).ToDictionaryAsync(c => c.Id, c => c.TerritoryId);
        var regionOf = await db.Territories.AsNoTracking().ToDictionaryAsync(t => t.Id, t => (t.Region ?? "").Trim());
        string Region(Guid customer) => terr.TryGetValue(customer, out var t) && t is { } id && regionOf.TryGetValue(id, out var r) && r != "" ? r : "No region";
        return judged.GroupBy(o => Region(o.CustomerId)).OrderBy(g => g.Key).Select(g => (object)new
        {
            region = g.Key, delivered = g.Count(),
            onTimePct = Math.Round(g.Count(o => o.DeliveredAt <= o.PromisedAt) * 100.0 / g.Count(), 1),
            inFullPct = Math.Round(g.Count(o => o.DeliveredInFull == true) * 100.0 / g.Count(), 1),
            otifPct = Math.Round(g.Count(o => o.DeliveredAt <= o.PromisedAt && o.DeliveredInFull == true) * 100.0 / g.Count(), 1),
        }).ToList();
    }

    private static async Task<IQueryable<SalesOrder>> Visible(AppDbContext db, TeamScope team)
    {
        var q = db.Orders.AsNoTracking().AsQueryable();
        var ids = await team.VisibleUserIds();
        return ids != null ? q.Where(o => ids.Contains(o.RepId)) : q;
    }

    private static async Task<SalesOrder?> Find(AppDbContext db, TeamScope team, Guid id)
    {
        var ids = await team.VisibleUserIds();
        var o = await db.Orders.Include(x => x.Lines).FirstOrDefaultAsync(x => x.Id == id);
        return o is null || (ids != null && !ids.Contains(o.RepId)) ? null : o;
    }
}
