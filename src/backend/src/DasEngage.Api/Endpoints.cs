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
        MapDashboardCharts(api);
        MapAdmin(api);
        AdminUsers.Map(api);
        AttachmentEndpoints.Map(api);
        SampleEndpoints.Map(api);
        NotificationEndpoints.Map(api);
        Ai.AiEndpoints.Map(api);
        Erp.ErpEndpoints.Map(api);
        RtmEndpoints.Map(api);
        OrderEndpoints.Map(api);
        CoverageEndpoints.Map(api);
        TargetEndpoints.Map(api);
    }

    // ---------- Customers ----------
    private static void MapCustomers(RouteGroupBuilder api)
    {
        var g = api.MapGroup("/customers");

        g.MapGet("/", async (AppDbContext db, HttpCurrentUser u, CustomerType? type, Segment? segment,
            Guid? territoryId, string? q, TeamScope team, int page = 1, int pageSize = 50) =>
        {
            pageSize = Math.Clamp(pageSize, 1, 200);
            var query = db.Customers.AsNoTracking().AsQueryable();
            var terrs = await team.VisibleTerritoryIds();
            if (terrs != null) query = query.Where(c => c.TerritoryId != null && terrs.Contains(c.TerritoryId.Value));
            if (territoryId != null) query = query.Where(c => c.TerritoryId == territoryId);
            if (type != null) query = query.Where(c => c.Type == type);
            if (segment != null) query = query.Where(c => c.Segment == segment);
            if (!string.IsNullOrWhiteSpace(q))
                {
                var pattern = $"%{q.Trim().Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_")}%"; // a typed % or _ is a letter, not a wildcard
                query = query.Where(c => EF.Functions.ILike(c.Name, pattern) || (c.City != null && EF.Functions.ILike(c.City, pattern)));
            }
            var total = await query.CountAsync();
            var items = await query.OrderBy(c => c.Name).Skip((page - 1) * pageSize).Take(pageSize).ToListAsync();
            return Results.Ok(new { total, page, pageSize, items });
        });

        // Bulk import: POST the CSV as the request body (Content-Type: text/csv). Dry run by default.
        g.MapPost("/import", async (HttpRequest req, CustomerImporter importer, bool? dryRun, string? onDuplicate,
            bool? allowPossibleDuplicates) =>
        {
            if (!Enum.TryParse<DuplicateMode>(onDuplicate ?? "skip", true, out var mode)) return Results.BadRequest("onDuplicate must be skip or update.");
            if (req.ContentLength > 5_000_000) return Results.StatusCode(StatusCodes.Status413PayloadTooLarge);
            string csv;
            using (var reader = new StreamReader(req.Body, System.Text.Encoding.UTF8, true, 1024, true))
                csv = await reader.ReadToEndAsync();
            if (csv.Length > 5_000_000) return Results.StatusCode(StatusCodes.Status413PayloadTooLarge);
            try
            {
                return Results.Ok(await importer.Run(csv, dryRun ?? true, mode, allowPossibleDuplicates ?? false));
            }
            catch (FormatException e) { return Results.BadRequest(e.Message); }
        }).RequireAuthorization(p => p.RequireRole(Roles.ImportAllowed)).Accepts<string>("text/csv");

        g.MapGet("/{id:guid}", async (Guid id, AppDbContext db, TeamScope team) =>
        {
            var c = await db.Customers.AsNoTracking().Include(x => x.ProductInterests).FirstOrDefaultAsync(x => x.Id == id);
            var terrs = await team.VisibleTerritoryIds();
            if (c is null || (terrs != null && (c.TerritoryId == null || !terrs.Contains(c.TerritoryId.Value)))) return Results.NotFound();
            var recent = await db.Visits.AsNoTracking().Where(v => v.CustomerId == id)
                .OrderByDescending(v => v.CheckInAt).Take(20).ToListAsync();
            return Results.Ok(new { customer = c, recentVisits = recent });
        });

        g.MapPost("/", async (CustomerDto d, AppDbContext db, HttpCurrentUser u, TeamScope team) =>
        {
            if (string.IsNullOrWhiteSpace(d.Name)) return Results.BadRequest("Name is required.");
            var terrs = await team.VisibleTerritoryIds();
            if (!u.IsRep && terrs != null && d.TerritoryId != null && !terrs.Contains(d.TerritoryId.Value)) return Results.Forbid();
            var c = new Customer { Id = d.Id ?? Guid.NewGuid() };
            Apply(c, d);
            if (u.IsRep) c.TerritoryId = u.TerritoryId;
            await SetInterests(db, c, d.ProductIds);
            db.Customers.Add(c);
            await db.SaveChangesAsync();
            return Results.Created($"/api/v1/customers/{c.Id}", c);
        }).RequireAuthorization(p => p.RequireRole(Roles.CustomerEditors));

        g.MapPut("/{id:guid}", async (Guid id, CustomerDto d, AppDbContext db, HttpCurrentUser u, TeamScope team) =>
        {
            var c = await db.Customers.Include(x => x.ProductInterests).FirstOrDefaultAsync(x => x.Id == id);
            var terrs = await team.VisibleTerritoryIds();
            if (c is null || (terrs != null && (c.TerritoryId == null || !terrs.Contains(c.TerritoryId.Value)))) return Results.NotFound();
            if (terrs != null && d.TerritoryId != null && !terrs.Contains(d.TerritoryId.Value)) return Results.Forbid();
            var territory = c.TerritoryId;
            Apply(c, d);
            if (u.IsRep) c.TerritoryId = territory; // reps cannot move customers between territories
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
        api.MapGet("/planned-visits", async (AppDbContext db, HttpCurrentUser u, DateOnly from, DateOnly to, Guid? repId, TeamScope team) =>
        {
            var ids = await team.VisibleUserIds();
            var q = db.PlannedVisits.AsNoTracking().Where(p => p.PlannedDate >= from && p.PlannedDate <= to);
            if (repId != null) q = q.Where(p => p.RepId == repId);
            if (ids != null) q = q.Where(p => ids.Contains(p.RepId));
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
            // Only the rep who checked in can check out.
            if (v is null || v.RepId != u.UserId) return Results.NotFound();
            ApplyCheckOut(v, d);
            await db.SaveChangesAsync();
            return Results.Ok(v);
        });

        api.MapGet("/visits", async (AppDbContext db, HttpCurrentUser u, DateTime from, DateTime to, Guid? repId, TeamScope team) =>
        {
            var ids = await team.VisibleUserIds();
            var q = db.Visits.AsNoTracking().Where(v => v.CheckInAt >= from && v.CheckInAt <= to);
            if (repId != null) q = q.Where(v => v.RepId == repId);
            if (ids != null) q = q.Where(v => ids.Contains(v.RepId));
            return Results.Ok(await q.OrderBy(v => v.CheckInAt).ToListAsync());
        });

        api.MapPost("/call-reports", async (CallReportDto d, AppDbContext db, HttpCurrentUser u) =>
        {
            if (u.UserId is null) return Results.Forbid();
            var r = await SaveCallReport(db, u.UserId.Value, d);
            return r is null ? Results.BadRequest("Unknown visit.") : Results.Ok(r);
        });

        api.MapGet("/call-reports", async (AppDbContext db, HttpCurrentUser u, Guid? customerId, TeamScope team, int take = 50) =>
        {
            var q = db.CallReports.AsNoTracking().Include(r => r.Products).AsQueryable();
            var ids = await team.VisibleUserIds();
            if (ids != null) q = q.Where(r => ids.Contains(r.RepId));
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
        api.MapGet("/gps/last-known", async (AppDbContext db, TeamScope team) =>
        {
            var since = DateTime.UtcNow.Date;
            var ids = await team.VisibleUserIds();
            var rows = await db.GpsPings.AsNoTracking().Where(p => p.RecordedAt >= since && (ids == null || ids.Contains(p.RepId)))
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
        if (Enum.TryParse<FollowUpStatus>(d.Status, true, out var st)) t.Status = st;
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
        g.MapGet("/pull", async (AppDbContext db, HttpCurrentUser u, SampleService samples, long since = 0, string? scope = null) =>
        {
            var now = DateTime.UtcNow;
            // What this person is allowed to see (who they are, their role and territory). Changes since the cursor are only enough while that
            // stays the same: after a move to another territory the customers there changed long ago, so the phone would never get them.
            // A device that reports a different scope than today's (or none at all) is sent everything again, once. Older apps send no scope.
            var scopeKey = ScopeKey(u);
            var full = scope is not null && scope != scopeKey;
            var cursor = full ? DateTime.MinValue : new DateTime(Math.Clamp(since, DateTime.MinValue.Ticks, DateTime.MaxValue.Ticks), DateTimeKind.Utc);
            var cq = db.Customers.IgnoreQueryFilters().Where(c => c.TenantId == u.TenantId && c.UpdatedAt > cursor);
            if (u.IsRep) cq = cq.Where(c => c.TerritoryId == u.TerritoryId);
            var rep = u.IsRep ? u.UserId : null;
            var wipe = u.UserId is { } uid && await db.Users.AsNoTracking().AnyAsync(x => x.Id == uid && x.WipeRequestedAt != null);
            return Results.Ok(new
            {
                cursor = now.Ticks,
                scope = scopeKey,
                full,
                wipe,
                customers = await cq.Include(c => c.ProductInterests).AsNoTracking().ToListAsync(),
                products = await db.Products.IgnoreQueryFilters().Where(p => p.TenantId == u.TenantId && p.UpdatedAt > cursor).AsNoTracking().ToListAsync(),
                plannedVisits = await db.PlannedVisits.IgnoreQueryFilters().Where(p => p.TenantId == u.TenantId && p.UpdatedAt > cursor && (rep == null || p.RepId == rep)).AsNoTracking().ToListAsync(),
                // Always the full current picture (small): what this user carries, and their own requests from the last 90 days.
                sampleStock = u.UserId is { } me ? await samples.HoldingsFor(me) : new List<object>(),
                notifications = await db.Notifications.AsNoTracking().Where(n => n.UserId == u.UserId && n.ReadAt == null && n.CreatedAt > now.AddDays(-30)).OrderByDescending(n => n.CreatedAt).ToListAsync(),
                sampleRequests = await db.SampleRequests.AsNoTracking().Where(r => r.RepId == u.UserId && r.CreatedAt > now.AddDays(-90)).ToListAsync(),
                orders = await db.Orders.AsNoTracking().Include(o => o.Lines).Where(o => o.RepId == u.UserId && o.PlacedAt > now.AddDays(-90)).OrderByDescending(o => o.PlacedAt).ToListAsync(),
                tasks = await db.Tasks.IgnoreQueryFilters().Where(t => t.TenantId == u.TenantId && t.UpdatedAt > cursor && t.AssignedToId == u.UserId).AsNoTracking().ToListAsync(),
            });
        });

        // Push: idempotent on client-generated ids; safe to retry. Every item gets its own result, so one refused item
        // (a visit to a customer that no longer exists, for example) never blocks the rest of the batch.
        g.MapPost("/push", async (SyncPushRequest req, AppDbContext db, HttpCurrentUser u, SampleService samples, OrderService orders, TeamScope team) =>
        {
            if (u.UserId is null) return Results.Forbid();
            var me = u.UserId.Value;
            var errors = new List<string>();

            // Order matters: things other items refer to come first (a new customer, then a visit planned for it, then the visit).
            var customers = new List<ItemResult>();
            foreach (var c in req.Customers ?? new())
                customers.Add(await Guarded(db, c.Id ?? Guid.Empty, () => UpsertCustomer(db, u, team, c)));

            var planned = new List<ItemResult>();
            foreach (var p in req.PlannedVisits ?? new())
                planned.Add(await Guarded(db, p.Id, () => SavePlanned(db, me, p)));

            var checkIns = new List<ItemResult>();
            foreach (var op in req.CheckIns ?? new())
                checkIns.Add(await Guarded(db, op.VisitId, async () =>
                {
                    var v = await CheckIn(db, me, op.CheckIn with { VisitId = op.VisitId });
                    if (v is null) { errors.Add($"visit {op.VisitId}: unknown customer"); return "This customer is not available any more."; }
                    if (op.CheckOut is { } co && v.CheckOutAt is null) { ApplyCheckOut(v, co); await db.SaveChangesAsync(); }
                    return null;
                }));

            var reports = new List<ItemResult>();
            foreach (var op in req.CallReports ?? new())
                reports.Add(await Guarded(db, op.Report.Id ?? Guid.Empty, async () =>
                {
                    if (await SaveCallReport(db, me, op.Report) is not null) return null;
                    errors.Add($"call report {op.Report.Id}: unknown visit");
                    return "The visit this report belongs to is not on the server.";
                }));

            var tasks = new List<ItemResult>();
            foreach (var t in req.Tasks ?? new())
                tasks.Add(await Guarded(db, t.Id ?? Guid.Empty, async () => { await SaveTask(db, u, t); return null; }));

            if (req.GpsPings is { Count: > 0 } pings) await SavePings(db, me, pings);

            if (req.NotificationReads is { Count: > 0 } reads)
            {
                foreach (var n in await db.Notifications.Where(n => reads.Contains(n.Id) && n.UserId == me && n.ReadAt == null).ToListAsync()) n.ReadAt = DateTime.UtcNow;
                await db.SaveChangesAsync();
            }

            // Samples report a result per item, so one rejected line (expired batch, not enough stock) never blocks the rest of the batch.
            var requests = new List<ItemResult>();
            foreach (var r in req.SampleRequests ?? new()) requests.Add(await samples.CreateRequest(me, r));
            var orderResults = new List<ItemResult>();
            foreach (var o in req.Orders ?? new()) orderResults.Add(await orders.Create(me, o));
            var distributions = new List<ItemResult>();
            foreach (var d in req.SampleDistributions ?? new())
                distributions.Add(await samples.InTransaction(() => samples.RecordDistribution(me, d)));

            return Results.Ok(new { ok = errors.Count == 0, errors, customers, plannedVisits = planned, checkIns, callReports = reports, tasks, sampleRequests = requests, sampleDistributions = distributions, orders = orderResults });
        });

        // The device confirms it cleared its data after a remote wipe was requested.
        g.MapPost("/wiped", async (AppDbContext db, HttpCurrentUser u) =>
        {
            var me = await db.Users.FirstOrDefaultAsync(x => x.Id == u.UserId);
            if (me is null) return Results.NotFound();
            me.WipeRequestedAt = null;
            await db.SaveChangesAsync();
            return Results.NoContent();
        });
    }

    /// <summary>Runs one pushed item; a refusal (message) or an unexpected save failure becomes that item's "rejected" result instead of failing the batch.</summary>
    /// <summary>A short fingerprint of what the signed-in person may see: who they are, their role and territory.</summary>
    internal static string ScopeKey(HttpCurrentUser u) =>
        Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes($"{u.UserId}|{u.Role}|{u.TerritoryId}")))[..16].ToLowerInvariant();

    private static async Task<ItemResult> Guarded(AppDbContext db, Guid id, Func<Task<string?>> work)
    {
        try
        {
            var reason = await work();
            return reason is null ? new(id, "accepted", null) : new(id, "rejected", reason);
        }
        catch (Exception e) when (e is DbUpdateException or InvalidOperationException)
        {
            db.ChangeTracker.Clear(); // drop what the failed item had staged so the next one starts clean
            return new(id, "rejected", "It could not be saved. Check the details and try again.");
        }
    }

    /// <summary>
    /// A customer created or changed on the device. Reps can add customers to their own territory and edit the ones in it,
    /// but never move a customer to another territory (the same rules as the customer endpoints).
    /// </summary>
    private static async Task<string?> UpsertCustomer(AppDbContext db, HttpCurrentUser u, TeamScope team, CustomerDto d)
    {
        if (d.Id is null) return "The customer has no id.";
        if (u.Role is null || !Roles.CustomerEditors.Contains(u.Role.ToString()!)) return "Your role cannot add or change customers.";
        if (string.IsNullOrWhiteSpace(d.Name) || d.Name.Length > 200) return "A name is required (up to 200 characters).";
        if (d.TargetVisitsPerMonth is < 0 or > 31) return "Visits per month must be between 0 and 31.";
        var terrs = await team.VisibleTerritoryIds();
        var existing = await db.Customers.Include(x => x.ProductInterests).FirstOrDefaultAsync(x => x.Id == d.Id);
        if (existing is null)
        {
            if (!u.IsRep && terrs != null && d.TerritoryId != null && !terrs.Contains(d.TerritoryId.Value)) return "That territory is outside your team.";
            var c = new Customer { Id = d.Id.Value };
            Apply(c, d);
            if (u.IsRep) c.TerritoryId = u.TerritoryId;
            await SetInterests(db, c, d.ProductIds);
            db.Customers.Add(c);
        }
        else
        {
            if (terrs != null && (existing.TerritoryId == null || !terrs.Contains(existing.TerritoryId.Value))) return "This customer is not in your territory.";
            if (terrs != null && d.TerritoryId != null && !terrs.Contains(d.TerritoryId.Value)) return "That territory is outside your team.";
            var territory = existing.TerritoryId;
            Apply(existing, d);
            if (u.IsRep) existing.TerritoryId = territory;
            await SetInterests(db, existing, d.ProductIds);
        }
        await db.SaveChangesAsync();
        return null;
    }

    private static async Task<string?> SavePlanned(AppDbContext db, Guid repId, PlannedVisitOp p)
    {
        var existing = await db.PlannedVisits.FirstOrDefaultAsync(x => x.Id == p.Id);
        if (existing is not null)
        {
            if (existing.RepId != repId) return "This planned visit belongs to someone else.";
            if (p.Cancelled && existing.Status == VisitStatus.Planned) existing.Status = VisitStatus.Cancelled;
            await db.SaveChangesAsync();
            return null;
        }
        if (await db.Customers.AnyAsync(c => c.Id == p.CustomerId) is false) return "This customer is not available any more.";
        db.PlannedVisits.Add(new PlannedVisit
        {
            Id = p.Id, RepId = repId, CustomerId = p.CustomerId, PlannedDate = p.PlannedDate, Sequence = p.Sequence, Objective = p.Objective,
            Status = p.Cancelled ? VisitStatus.Cancelled : VisitStatus.Planned,
        });
        await db.SaveChangesAsync();
        return null;
    }

    // ---------- Dashboards ----------
    private static void MapDashboards(RouteGroupBuilder api)
    {
        // Calls completed, coverage % (distinct customers visited vs customers in scope), by rep.
        api.MapGet("/dashboards/sales", async (AppDbContext db, HttpCurrentUser u, DateTime from, DateTime to, TeamScope team) =>
        {
            var ids = await team.VisibleUserIds();
            var terrs = await team.VisibleTerritoryIds();
            var visits = db.Visits.AsNoTracking().Where(v => v.CheckInAt >= from && v.CheckInAt <= to && v.Status == VisitStatus.Completed);
            if (ids != null) visits = visits.Where(v => ids.Contains(v.RepId));
            var byRep = await visits.GroupBy(v => v.RepId)
                .Select(g => new { repId = g.Key, calls = g.Count(), uniqueCustomers = g.Select(v => v.CustomerId).Distinct().Count(),
                    outsideGeofence = g.Count(v => v.GeofenceOk == false) }).ToListAsync();
            var customers = db.Customers.AsNoTracking();
            if (terrs != null) customers = customers.Where(c => c.TerritoryId != null && terrs.Contains(c.TerritoryId.Value));
            var total = await customers.CountAsync();
            var visited = await visits.Select(v => v.CustomerId).Distinct().CountAsync();
            var planned = await db.PlannedVisits.AsNoTracking().CountAsync(p => p.PlannedDate >= DateOnly.FromDateTime(from) && p.PlannedDate <= DateOnly.FromDateTime(to) && (ids == null || ids.Contains(p.RepId)));
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

    // ---------- Dashboards (trend and product views for the web app) ----------
    internal static void MapDashboardCharts(RouteGroupBuilder api)
    {
        // Completed calls per day, for the activity trend chart.
        api.MapGet("/dashboards/trend", async (AppDbContext db, TeamScope team, DateTime from, DateTime to) =>
        {
            var ids = await team.VisibleUserIds();
            var q = db.Visits.AsNoTracking().Where(v => v.CheckInAt >= from && v.CheckInAt <= to && v.Status == VisitStatus.Completed);
            if (ids != null) q = q.Where(v => ids.Contains(v.RepId));
            var rows = await q.Select(v => v.CheckInAt).ToListAsync();
            var byDay = rows.GroupBy(d => DateOnly.FromDateTime(d)).ToDictionary(g => g.Key, g => g.Count());
            var days = new List<object>();
            for (var d = DateOnly.FromDateTime(from); d <= DateOnly.FromDateTime(to) && days.Count < 366; d = d.AddDays(1))
                days.Add(new { date = d, calls = byDay.GetValueOrDefault(d) });
            return Results.Ok(days);
        });

        // Product engagement: how often each product was discussed on calls, and how many sample units went out.
        api.MapGet("/dashboards/products", async (AppDbContext db, TeamScope team, DateTime from, DateTime to) =>
        {
            var ids = await team.VisibleUserIds();
            var reports = db.CallReports.AsNoTracking().Where(r => r.CreatedAt >= from && r.CreatedAt <= to);
            if (ids != null) reports = reports.Where(r => ids.Contains(r.RepId));
            var discussed = await reports.SelectMany(r => r.Products).GroupBy(p => p.ProductId)
                .Select(g => new { productId = g.Key, calls = g.Count() }).ToListAsync();
            var dist = db.SampleDistributions.AsNoTracking().Where(d => d.DistributedAt >= from && d.DistributedAt <= to);
            if (ids != null) dist = dist.Where(d => ids.Contains(d.RepId));
            var samples = await dist.GroupBy(d => d.ProductId).Select(g => new { productId = g.Key, units = g.Sum(d => d.Quantity) }).ToListAsync();
            var products = await db.Products.AsNoTracking().ToDictionaryAsync(p => p.Id, p => p.Name);
            var all = discussed.Select(d => d.productId).Union(samples.Select(s => s.productId)).Distinct();
            return Results.Ok(all.Select(id => new
            {
                productId = id, name = products.GetValueOrDefault(id, "Unknown"),
                calls = discussed.FirstOrDefault(d => d.productId == id)?.calls ?? 0,
                sampleUnits = samples.FirstOrDefault(s => s.productId == id)?.units ?? 0,
            }).OrderByDescending(x => x.calls).ThenByDescending(x => x.sampleUnits));
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
        g.MapPut("/products/{id:guid}", async (Guid id, ProductEditDto d, AppDbContext db) =>
        {
            var p = await db.Products.FirstOrDefaultAsync(x => x.Id == id);
            if (p is null) return Results.NotFound();
            if (string.IsNullOrWhiteSpace(d.Name) || d.Name.Length > 200) return Results.BadRequest("Name is required (max 200 characters).");
            if (d.StandardCost < 0 || d.ReorderLevel < 0) return Results.BadRequest("Cost and reorder level cannot be negative.");
            // both or neither: a limit without a period (or the reverse) would be ambiguous
            if ((d.SampleLimitPerCustomer is null) != (d.SampleLimitDays is null)) return Results.BadRequest("Set both the sample limit and its period in days, or neither.");
            if (d.SampleLimitPerCustomer is < 1 or > 100_000 || d.SampleLimitDays is < 1 or > 3650) return Results.BadRequest("The limit must be at least 1 unit and the period between 1 and 3650 days.");
            p.Name = d.Name.Trim(); p.TherapeuticArea = d.TherapeuticArea?.Trim(); p.StandardCost = d.StandardCost; p.ReorderLevel = d.ReorderLevel;
            p.SampleLimitPerCustomer = d.SampleLimitPerCustomer; p.SampleLimitDays = d.SampleLimitDays;
            await db.SaveChangesAsync();
            return Results.Ok(p);
        }).RequireAuthorization(p => p.RequireRole("Admin", "NationalSalesManager"));
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
    public static readonly string[] ImportAllowed = { "AreaManager", "RegionalManager", "NationalSalesManager", "Admin" };
    public static readonly string[] CustomerEditors = { "Rep", "AreaManager", "RegionalManager", "NationalSalesManager", "KeyAccountManager", "Marketing", "Admin" };
}
