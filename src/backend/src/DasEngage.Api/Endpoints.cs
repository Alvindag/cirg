using DasEngage.Domain;
using DasEngage.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace DasEngage.Api;

public static class Endpoints
{
    public static void MapApi(this WebApplication app)
    {
        var api = app.MapGroup("/api/v1").RequireAuthorization().RequireRateLimiting("default");
        MapCustomers(api);
        MapFieldForce(api);
        MapSync(api);
        MapDashboards(api);
        MapAdmin(api);
    }

    // ---------- Customers ----------
    private static void MapCustomers(RouteGroupBuilder api)
    {
        var g = api.MapGroup("/customers");

        g.MapGet("/", async (AppDbContext db, HttpCurrentUser u, CustomerType? type, Segment? segment,
            Guid? territoryId, string? q, int page = 1, int pageSize = 50) =>
        {
            pageSize = Math.Clamp(pageSize, 1, 200);
            var query = db.Customers.AsNoTracking().AsQueryable();
            if (u.IsRep) query = query.Where(c => c.TerritoryId == u.TerritoryId);
            else if (territoryId != null) query = query.Where(c => c.TerritoryId == territoryId);
            if (type != null) query = query.Where(c => c.Type == type);
            if (segment != null) query = query.Where(c => c.Segment == segment);
            if (!string.IsNullOrWhiteSpace(q))
                query = query.Where(c => EF.Functions.ILike(c.Name, $"%{q}%"));
            var total = await query.CountAsync();
            var items = await query.OrderBy(c => c.Name).Skip((page - 1) * pageSize).Take(pageSize).ToListAsync();
            return Results.Ok(new { total, page, pageSize, items });
        });

        g.MapGet("/{id:guid}", async (Guid id, AppDbContext db, HttpCurrentUser u) =>
        {
            var c = await db.Customers.AsNoTracking().Include(x => x.ProductInterests).FirstOrDefaultAsync(x => x.Id == id);
            if (c is null || (u.IsRep && c.TerritoryId != u.TerritoryId)) return Results.NotFound();
            var recent = await db.Visits.AsNoTracking().Where(v => v.CustomerId == id)
                .OrderByDescending(v => v.CheckInAt).Take(20).ToListAsync();
            return Results.Ok(new { customer = c, recentVisits = recent });
        });

        g.MapPost("/", async (CustomerDto d, AppDbContext db, HttpCurrentUser u) =>
        {
            if (string.IsNullOrWhiteSpace(d.Name)) return Results.BadRequest("Name is required.");
            var c = new Customer { Id = d.Id ?? Guid.NewGuid() };
            Apply(c, d);
            if (u.IsRep) c.TerritoryId = u.TerritoryId;
            await SetInterests(db, c, d.ProductIds);
            db.Customers.Add(c);
            await db.SaveChangesAsync();
            return Results.Created($"/api/v1/customers/{c.Id}", c);
        }).RequireAuthorization(p => p.RequireRole(Roles.CustomerEditors));

        g.MapPut("/{id:guid}", async (Guid id, CustomerDto d, AppDbContext db) =>
        {
            var c = await db.Customers.Include(x => x.ProductInterests).FirstOrDefaultAsync(x => x.Id == id);
            if (c is null) return Results.NotFound();
            Apply(c, d);
            await SetInterests(db, c, d.ProductIds);
            await db.SaveChangesAsync();
            return Results.Ok(c);
        }).RequireAuthorization(p => p.RequireRole(Roles.CustomerEditors));

        g.MapDelete("/{id:guid}", async (Guid id, AppDbContext db) =>
        {
            var c = await db.Customers.FirstOrDefaultAsync(x => x.Id == id);
            if (c is null) return Results.NotFound();
            c.DeletedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
            return Results.NoContent();
        }).RequireAuthorization(p => p.RequireRole(Roles.Managers));
    }

    private static void Apply(Customer c, CustomerDto d)
    {
        c.Type = d.Type; c.Name = d.Name.Trim(); c.Specialty = d.Specialty; c.Segment = d.Segment;
        c.TerritoryId = d.TerritoryId; c.ParentCustomerId = d.ParentCustomerId; c.Phone = d.Phone;
        c.Email = d.Email; c.Address = d.Address; c.City = d.City; c.Latitude = d.Latitude;
        c.Longitude = d.Longitude; c.TargetVisitsPerMonth = d.TargetVisitsPerMonth;
    }

    private static async Task SetInterests(AppDbContext db, Customer c, List<Guid>? productIds)
    {
        if (productIds is null) return;
        foreach (var p in c.ProductInterests.Where(p => !productIds.Contains(p.ProductId)).ToList())
            p.DeletedAt = DateTime.UtcNow;
        foreach (var pid in productIds.Except(c.ProductInterests.Where(p => p.DeletedAt == null).Select(p => p.ProductId)))
            c.ProductInterests.Add(new CustomerProductInterest { CustomerId = c.Id, ProductId = pid });
        await Task.CompletedTask;
    }

    // ---------- Field force ----------
    private static void MapFieldForce(RouteGroupBuilder api)
    {
        api.MapGet("/planned-visits", async (AppDbContext db, HttpCurrentUser u, DateOnly from, DateOnly to, Guid? repId) =>
        {
            var rep = u.IsRep ? u.UserId : repId;
            var q = db.PlannedVisits.AsNoTracking().Where(p => p.PlannedDate >= from && p.PlannedDate <= to);
            if (rep != null) q = q.Where(p => p.RepId == rep);
            return Results.Ok(await q.OrderBy(p => p.PlannedDate).ThenBy(p => p.Sequence).ToListAsync());
        });

        api.MapPost("/planned-visits", async (PlannedVisitDto d, AppDbContext db, HttpCurrentUser u) =>
        {
            if (u.UserId is null) return Results.Forbid();
            var pv = new PlannedVisit
            {
                Id = d.Id ?? Guid.NewGuid(), RepId = u.UserId.Value, CustomerId = d.CustomerId,
                PlannedDate = d.PlannedDate, Sequence = d.Sequence, Objective = d.Objective,
            };
            db.PlannedVisits.Add(pv);
            await db.SaveChangesAsync();
            return Results.Created($"/api/v1/planned-visits/{pv.Id}", pv);
        });

        api.MapPost("/visits/check-in", async (CheckInDto d, AppDbContext db, HttpCurrentUser u) =>
        {
            if (u.UserId is null) return Results.Forbid();
            var v = await CheckIn(db, u.UserId.Value, d);
            return v is null ? Results.BadRequest("Unknown customer.") : Results.Ok(v);
        });

        api.MapPost("/visits/{id:guid}/check-out", async (Guid id, CheckOutDto d, AppDbContext db, HttpCurrentUser u) =>
        {
            var v = await db.Visits.FirstOrDefaultAsync(x => x.Id == id);
            if (v is null || (u.IsRep && v.RepId != u.UserId)) return Results.NotFound();
            ApplyCheckOut(v, d);
            await db.SaveChangesAsync();
            return Results.Ok(v);
        });

        api.MapGet("/visits", async (AppDbContext db, HttpCurrentUser u, DateTime from, DateTime to, Guid? repId) =>
        {
            var rep = u.IsRep ? u.UserId : repId;
            var q = db.Visits.AsNoTracking().Where(v => v.CheckInAt >= from && v.CheckInAt <= to);
            if (rep != null) q = q.Where(v => v.RepId == rep);
            return Results.Ok(await q.OrderBy(v => v.CheckInAt).ToListAsync());
        });

        api.MapPost("/call-reports", async (CallReportDto d, AppDbContext db, HttpCurrentUser u) =>
        {
            if (u.UserId is null) return Results.Forbid();
            var r = await SaveCallReport(db, u.UserId.Value, d);
            return r is null ? Results.BadRequest("Unknown visit.") : Results.Ok(r);
        });

        api.MapGet("/call-reports", async (AppDbContext db, HttpCurrentUser u, Guid? customerId, int take = 50) =>
        {
            var q = db.CallReports.AsNoTracking().Include(r => r.Products).AsQueryable();
            if (u.IsRep) q = q.Where(r => r.RepId == u.UserId);
            if (customerId != null) q = q.Where(r => r.CustomerId == customerId);
            return Results.Ok(await q.OrderByDescending(r => r.CreatedAt).Take(Math.Clamp(take, 1, 200)).ToListAsync());
        });

        api.MapPost("/tasks", async (TaskDto d, AppDbContext db, HttpCurrentUser u) =>
        {
            var t = await SaveTask(db, u, d);
            return Results.Ok(t);
        });

        api.MapGet("/tasks", async (AppDbContext db, HttpCurrentUser u, bool openOnly = true) =>
        {
            var q = db.Tasks.AsNoTracking().Where(t => t.AssignedToId == u.UserId);
            if (openOnly) q = q.Where(t => t.Status == FollowUpStatus.Open);
            return Results.Ok(await q.OrderBy(t => t.DueDate).ToListAsync());
        });

        api.MapPost("/tasks/{id:guid}/complete", async (Guid id, AppDbContext db, HttpCurrentUser u) =>
        {
            var t = await db.Tasks.FirstOrDefaultAsync(x => x.Id == id && x.AssignedToId == u.UserId);
            if (t is null) return Results.NotFound();
            t.Status = FollowUpStatus.Done;
            await db.SaveChangesAsync();
            return Results.Ok(t);
        });

        api.MapPost("/gps/pings", async (List<GpsPingDto> pings, AppDbContext db, HttpCurrentUser u) =>
        {
            if (u.UserId is null) return Results.Forbid();
            await SavePings(db, u.UserId.Value, pings);
            return Results.Accepted();
        });

        // Manager live map: last known position per rep today.
        api.MapGet("/gps/last-known", async (AppDbContext db) =>
        {
            var since = DateTime.UtcNow.Date;
            var rows = await db.GpsPings.AsNoTracking().Where(p => p.RecordedAt >= since)
                .GroupBy(p => p.RepId).Select(g => g.OrderByDescending(p => p.RecordedAt).First()).ToListAsync();
            return Results.Ok(rows);
        }).RequireAuthorization(p => p.RequireRole(Roles.Managers));
    }

    internal static async Task<Visit?> CheckIn(AppDbContext db, Guid repId, CheckInDto d)
    {
        // Idempotent: a retried offline push with the same VisitId returns the existing row.
        if (d.VisitId is { } vid && await db.Visits.FirstOrDefaultAsync(x => x.Id == vid) is { } existing) return existing;

        var customer = await db.Customers.AsNoTracking().FirstOrDefaultAsync(c => c.Id == d.CustomerId);
        if (customer is null) return null;

        var v = new Visit
        {
            Id = d.VisitId ?? Guid.NewGuid(), RepId = repId, CustomerId = d.CustomerId, PlannedVisitId = d.PlannedVisitId,
            CheckInAt = d.At ?? DateTime.UtcNow, CheckInLat = d.Latitude, CheckInLng = d.Longitude,
            CheckInAccuracyM = d.AccuracyM,
        };
        if (d.Latitude is { } lat && d.Longitude is { } lng && customer.Latitude is { } clat && customer.Longitude is { } clng)
        {
            v.DistanceFromCustomerM = Geo.DistanceMeters(lat, lng, clat, clng);
            v.GeofenceOk = v.DistanceFromCustomerM <= Geo.DefaultGeofenceMeters + (d.AccuracyM ?? 0);
        }
        db.Visits.Add(v);
        if (d.PlannedVisitId is { } pid && await db.PlannedVisits.FirstOrDefaultAsync(p => p.Id == pid) is { } pv)
            pv.Status = VisitStatus.InProgress;
        await db.SaveChangesAsync();
        return v;
    }

    internal static void ApplyCheckOut(Visit v, CheckOutDto d)
    {
        v.CheckOutAt = d.At ?? DateTime.UtcNow;
        v.CheckOutLat = d.Latitude;
        v.CheckOutLng = d.Longitude;
        v.Status = VisitStatus.Completed;
    }

    internal static async Task<CallReport?> SaveCallReport(AppDbContext db, Guid repId, CallReportDto d)
    {
        var visit = await db.Visits.FirstOrDefaultAsync(v => v.Id == d.VisitId);
        if (visit is null) return null;
        var r = d.Id is { } id ? await db.CallReports.Include(x => x.Products).FirstOrDefaultAsync(x => x.Id == id) : null;
        if (r is null)
        {
            r = new CallReport { Id = d.Id ?? Guid.NewGuid(), VisitId = d.VisitId, RepId = repId, CustomerId = visit.CustomerId };
            db.CallReports.Add(r);
        }
        r.Notes = d.Notes; r.Outcome = d.Outcome; r.NextStep = d.NextStep; r.VoiceNoteUrl = d.VoiceNoteUrl;
        foreach (var p in d.Products ?? new())
        {
            var existing = r.Products.FirstOrDefault(x => x.ProductId == p.ProductId && x.DeletedAt == null);
            if (existing is null) r.Products.Add(new CallReportProduct { CallReportId = r.Id, ProductId = p.ProductId, Feedback = p.Feedback });
            else existing.Feedback = p.Feedback;
        }
        await db.SaveChangesAsync();
        return r;
    }

    internal static async Task<FollowUpTask> SaveTask(AppDbContext db, HttpCurrentUser u, TaskDto d)
    {
        var t = d.Id is { } id ? await db.Tasks.FirstOrDefaultAsync(x => x.Id == id) : null;
        if (t is null) { t = new FollowUpTask { Id = d.Id ?? Guid.NewGuid() }; db.Tasks.Add(t); }
        t.AssignedToId = d.AssignedToId ?? u.UserId ?? Guid.Empty;
        t.CustomerId = d.CustomerId; t.CallReportId = d.CallReportId; t.Title = d.Title; t.DueDate = d.DueDate;
        await db.SaveChangesAsync();
        return t;
    }

    internal static async Task SavePings(AppDbContext db, Guid repId, List<GpsPingDto> pings)
    {
        var ids = pings.Where(p => p.Id != null).Select(p => p.Id!.Value).ToList();
        var known = (await db.GpsPings.Where(p => ids.Contains(p.Id)).Select(p => p.Id).ToListAsync()).ToHashSet();
        foreach (var p in pings.Take(500).Where(p => p.Id == null || !known.Contains(p.Id.Value)))
            db.GpsPings.Add(new GpsPing { Id = p.Id ?? Guid.NewGuid(), RepId = repId, RecordedAt = p.RecordedAt,
                Latitude = p.Latitude, Longitude = p.Longitude, AccuracyM = p.AccuracyM });
        await db.SaveChangesAsync();
    }

    // ---------- Sync ----------
    private static void MapSync(RouteGroupBuilder api)
    {
        var g = api.MapGroup("/sync");

        // Pull: everything changed since the cursor (UTC ticks). Tombstones included via DeletedAt.
        g.MapGet("/pull", async (AppDbContext db, HttpCurrentUser u, long since = 0) =>
        {
            var cursor = new DateTime(since, DateTimeKind.Utc);
            var now = DateTime.UtcNow;
            var cq = db.Customers.IgnoreQueryFilters().Where(c => c.TenantId == u.TenantId && c.UpdatedAt > cursor);
            if (u.IsRep) cq = cq.Where(c => c.TerritoryId == u.TerritoryId);
            var rep = u.IsRep ? u.UserId : null;
            return Results.Ok(new
            {
                cursor = now.Ticks,
                customers = await cq.Include(c => c.ProductInterests).AsNoTracking().ToListAsync(),
                products = await db.Products.IgnoreQueryFilters().Where(p => p.TenantId == u.TenantId && p.UpdatedAt > cursor).AsNoTracking().ToListAsync(),
                plannedVisits = await db.PlannedVisits.IgnoreQueryFilters().Where(p => p.TenantId == u.TenantId && p.UpdatedAt > cursor && (rep == null || p.RepId == rep)).AsNoTracking().ToListAsync(),
                tasks = await db.Tasks.IgnoreQueryFilters().Where(t => t.TenantId == u.TenantId && t.UpdatedAt > cursor && t.AssignedToId == u.UserId).AsNoTracking().ToListAsync(),
            });
        });

        // Push: idempotent on client-generated ids; safe to retry.
        g.MapPost("/push", async (SyncPushRequest req, AppDbContext db, HttpCurrentUser u) =>
        {
            if (u.UserId is null) return Results.Forbid();
            var errors = new List<string>();
            foreach (var op in req.CheckIns ?? new())
            {
                var v = await CheckIn(db, u.UserId.Value, op.CheckIn with { VisitId = op.VisitId });
                if (v is null) { errors.Add($"visit {op.VisitId}: unknown customer"); continue; }
                if (op.CheckOut is { } co && v.CheckOutAt is null) { ApplyCheckOut(v, co); await db.SaveChangesAsync(); }
            }
            foreach (var op in req.CallReports ?? new())
                if (await SaveCallReport(db, u.UserId.Value, op.Report) is null)
                    errors.Add($"call report {op.Report.Id}: unknown visit");
            foreach (var t in req.Tasks ?? new()) await SaveTask(db, u, t);
            if (req.GpsPings is { Count: > 0 } pings) await SavePings(db, u.UserId.Value, pings);
            return Results.Ok(new { ok = errors.Count == 0, errors });
        });
    }

    // ---------- Dashboards ----------
    private static void MapDashboards(RouteGroupBuilder api)
    {
        // Calls completed, coverage % (distinct customers visited vs customers in scope), by rep.
        api.MapGet("/dashboards/sales", async (AppDbContext db, HttpCurrentUser u, DateTime from, DateTime to) =>
        {
            var visits = db.Visits.AsNoTracking().Where(v => v.CheckInAt >= from && v.CheckInAt <= to && v.Status == VisitStatus.Completed);
            if (u.IsRep) visits = visits.Where(v => v.RepId == u.UserId);
            var byRep = await visits.GroupBy(v => v.RepId)
                .Select(g => new { repId = g.Key, calls = g.Count(), uniqueCustomers = g.Select(v => v.CustomerId).Distinct().Count(),
                    outsideGeofence = g.Count(v => v.GeofenceOk == false) }).ToListAsync();
            var customers = db.Customers.AsNoTracking();
            if (u.IsRep) customers = customers.Where(c => c.TerritoryId == u.TerritoryId);
            var total = await customers.CountAsync();
            var visited = await visits.Select(v => v.CustomerId).Distinct().CountAsync();
            var planned = await db.PlannedVisits.AsNoTracking().CountAsync(p => p.PlannedDate >= DateOnly.FromDateTime(from) && p.PlannedDate <= DateOnly.FromDateTime(to) && (!u.IsRep || p.RepId == u.UserId));
            var calls = byRep.Sum(r => r.calls);
            return Results.Ok(new
            {
                callsCompleted = calls, plannedVisits = planned,
                planAdherencePct = planned == 0 ? 0 : Math.Round(100.0 * calls / planned, 1),
                coveragePct = total == 0 ? 0 : Math.Round(100.0 * visited / total, 1),
                byRep,
            });
        });
    }

    // ---------- Admin ----------
    private static void MapAdmin(RouteGroupBuilder api)
    {
        var g = api.MapGroup("/admin").RequireAuthorization(p => p.RequireRole(Roles.Managers));
        g.MapGet("/audit-logs", async (AppDbContext db, int take = 100, long? before = null) =>
        {
            var q = db.AuditLogs.AsNoTracking().AsQueryable();
            if (before != null) q = q.Where(a => a.Id < before);
            return Results.Ok(await q.OrderByDescending(a => a.Id).Take(Math.Clamp(take, 1, 500)).ToListAsync());
        });
        g.MapGet("/products", async (AppDbContext db) => Results.Ok(await db.Products.AsNoTracking().OrderBy(p => p.Name).ToListAsync()));
        g.MapPost("/products", async (Product p, AppDbContext db) =>
        {
            p.Id = Guid.NewGuid();
            db.Products.Add(p);
            await db.SaveChangesAsync();
            return Results.Created($"/api/v1/admin/products/{p.Id}", p);
        });
    }
}

public static class Roles
{
    public static readonly string[] Managers = { "AreaManager", "RegionalManager", "NationalSalesManager", "Executive", "Admin" };
    public static readonly string[] CustomerEditors = { "Rep", "AreaManager", "RegionalManager", "NationalSalesManager", "KeyAccountManager", "Marketing", "Admin" };
}
