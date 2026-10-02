using System.Text.Json;
using DasEngage.Domain;
using DasEngage.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace DasEngage.Api.Ai;

public record TranscribeRequest(Guid AttachmentId, string? Language, bool Force = false);
public record SummariseRequest(Guid VisitId, string? Notes);
public record DecisionRequest(string Status, string? EditedText, VisitSummaryDto? EditedSummary, bool ApplyToReport, int[]? TaskIndexes);
public record AiSettingsRequest(bool Enabled);
public record MoveRequest(Guid CustomerId, Guid ToTerritoryId);
public record ApplyMovesRequest(List<MoveRequest> Moves);
public record RouteRequest(DateOnly Date, Guid? RepId, double? StartLatitude, double? StartLongitude, bool Apply);

public static class AiEndpoints
{
    private static readonly string[] Governors = { "Admin", "NationalSalesManager", "Executive" };
    private static readonly string[] Admins = { "Admin", "NationalSalesManager" };

    private static IResult Problem(AiProblem p) => Results.Problem(detail: p.Message, statusCode: p.Status, title: "AI request refused");
    private static IResult Problem(AiUnavailableException e) => Results.Problem(detail: e.Message, statusCode: e.StatusCode, title: "AI request failed");

    public static void Map(RouteGroupBuilder api)
    {
        var g = api.MapGroup("/ai");
        MapGenerative(g);
        MapAnalytics(g);
        MapTerritory(g);
        MapGovernance(g);
    }

    // ---------- generative: voice-to-text and visit summaries ----------

    private static void MapGenerative(RouteGroupBuilder g)
    {
        g.MapGet("/status", async (AiService ai, AppDbContext db, HttpCurrentUser u) =>
        {
            var tenant = await db.Tenants.AsNoTracking().FirstOrDefaultAsync(t => t.Id == u.TenantId);
            var since = DateTime.UtcNow.AddHours(-24);
            var used = await db.AiOutputs.CountAsync(a => a.UserId == u.UserId && a.CreatedAt >= since);
            var gate = await ai.Gate();
            return Results.Ok(new
            {
                available = gate is null, reason = gate?.Message, tenantOptIn = tenant?.AiEnabled ?? false,
                dailyLimit = ai.Options.DailyLimitPerUser, usedToday = used,
            });
        });

        g.MapPost("/settings", async (AiSettingsRequest d, AppDbContext db, HttpCurrentUser u) =>
        {
            var tenant = await db.Tenants.FirstOrDefaultAsync(t => t.Id == u.TenantId);
            if (tenant is null) return Results.NotFound();
            tenant.AiEnabled = d.Enabled;
            await db.SaveChangesAsync();
            // Tenant is not a tenant-owned row, so record the switch in the audit log explicitly.
            db.AuditLogs.Add(await Chain(db, u, d.Enabled ? "ai-enabled" : "ai-disabled", "Tenant", tenant.Id));
            await db.SaveChangesAsync();
            return Results.Ok(new { enabled = tenant.AiEnabled });
        }).RequireAuthorization(p => p.RequireRole(Admins));

        g.MapPost("/transcriptions", async (TranscribeRequest d, AiService ai, AppDbContext db, HttpCurrentUser u) =>
        {
            if (await ai.Gate() is { } blocked) return Problem(blocked);
            var a = await db.Attachments.AsNoTracking().FirstOrDefaultAsync(x => x.Id == d.AttachmentId);
            if (a is null || a.RepId != u.UserId) return Results.NotFound(); // recordings are private to the rep who made them
            if (a.Kind != AttachmentKind.VoiceNote) return Results.BadRequest("Only voice notes can be transcribed.");
            if (!string.IsNullOrWhiteSpace(d.Language) && !LanguageTag.IsValid(d.Language)) return Results.BadRequest("That language is not supported for transcription. Use a code such as en, fr or sw, or leave it empty to detect it.");
            try { return Results.Ok(await ai.Transcribe(a, d.Language, d.Force)); }
            catch (AiUnavailableException e) { return Problem(e); }
        });

        g.MapPost("/visit-summaries", async (SummariseRequest d, AiService ai, AppDbContext db, HttpCurrentUser u) =>
        {
            if (await ai.Gate() is { } blocked) return Problem(blocked);
            var visit = await db.Visits.AsNoTracking().FirstOrDefaultAsync(v => v.Id == d.VisitId);
            if (visit is null || visit.RepId != u.UserId) return Results.NotFound();
            try { return Results.Ok(await ai.SummariseVisit(visit, d.Notes is { Length: > 4000 } ? d.Notes[..4000] : d.Notes)); }
            catch (AiUnavailableException e) { return Problem(e); }
        });

        g.MapGet("/outputs", async (AppDbContext db, HttpCurrentUser u, Guid? subjectId) =>
        {
            var q = db.AiOutputs.AsNoTracking().Where(a => a.UserId == u.UserId);
            if (subjectId != null) q = q.Where(a => a.SubjectId == subjectId);
            return Results.Ok(await q.OrderByDescending(a => a.CreatedAt).Take(50).ToListAsync());
        });

        g.MapPost("/outputs/{id:guid}/decision", async (Guid id, DecisionRequest d, AiService ai) =>
        {
            try
            {
                var (problem, output) = await ai.Decide(id, d.Status, d.EditedText, d.EditedSummary, d.ApplyToReport, d.TaskIndexes);
                return problem is null ? Results.Ok(output) : Problem(problem);
            }
            catch (FormatException e) { return Results.BadRequest(e.Message); }
        });
    }

    private static async Task<AuditLog> Chain(AppDbContext db, HttpCurrentUser u, string action, string type, Guid id)
    {
        var prev = await db.AuditLogs.IgnoreQueryFilters().Where(a => a.TenantId == u.TenantId).OrderByDescending(a => a.Id).Select(a => a.Hash).FirstOrDefaultAsync();
        var e = new AuditLog { TenantId = u.TenantId, UserId = u.UserId, At = DateTime.UtcNow, Action = action, EntityType = type, EntityId = id, PrevHash = prev };
        e.Hash = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes($"{e.PrevHash}|{e.TenantId}|{e.UserId}|{e.At:O}|{e.Action}|{e.EntityType}|{e.EntityId}|{e.Changes}")));
        return e;
    }

    // ---------- analytics: scores, next best actions, opportunities ----------

    private static void MapAnalytics(RouteGroupBuilder g)
    {
        g.MapGet("/customers/scores", async (AppDbContext db, TeamScope team, Guid? territoryId, string? order, int take = 50) =>
        {
            var now = DateTime.UtcNow;
            var facts = await AiData.LoadFacts(db, await team.VisibleTerritoryIds(), territoryId, now);
            var scores = facts.Select(f => CustomerScorer.Score(f, now)).ToList();
            // default order: customers who matter most but are being neglected first
            var sorted = order == "score" ? scores.OrderByDescending(s => s.Overall) : scores.OrderByDescending(s => s.Potential - s.Engagement).ThenByDescending(s => s.Potential);
            return Results.Ok(sorted.Take(Math.Clamp(take, 1, 200)).Select(s => new { s.CustomerId, s.Name, s.Potential, s.Engagement, s.Overall, s.Status, s.SuggestedSegment }));
        });

        g.MapGet("/customers/{id:guid}/score", async (Guid id, AppDbContext db, TeamScope team) =>
        {
            var now = DateTime.UtcNow;
            var f = (await AiData.LoadFacts(db, await team.VisibleTerritoryIds(), null, now, id)).FirstOrDefault();
            return f is null ? Results.NotFound() : Results.Ok(CustomerScorer.Score(f, now));
        });

        g.MapGet("/next-best-actions", async (AppDbContext db, TeamScope team, HttpCurrentUser u, Guid? repId, int max = 10) =>
        {
            var rep = repId ?? u.UserId;
            if (rep is null) return Results.Forbid();
            var visible = await team.VisibleUserIds();
            if (visible != null && !visible.Contains(rep.Value)) return Results.NotFound();
            // the caller's own territory comes from their identity; for someone else it is looked up
            var territoryId = rep == u.UserId ? u.TerritoryId : (await db.Users.AsNoTracking().FirstOrDefaultAsync(x => x.Id == rep))?.TerritoryId;
            if (rep != u.UserId && !await db.Users.AnyAsync(x => x.Id == rep)) return Results.NotFound();
            var now = DateTime.UtcNow;
            var territory = territoryId is { } t ? new[] { t } : Array.Empty<Guid>();
            var facts = await AiData.LoadFacts(db, territory, null, now);
            var tasks = (await db.Tasks.AsNoTracking().Where(x => x.AssignedToId == rep && x.Status == FollowUpStatus.Open).ToListAsync())
                .Select(x => new OpenTask(x.Id, x.CustomerId, x.Title, x.DueDate)).ToList();
            var stock = await AiData.Holdings(db, rep.Value);
            return Results.Ok(NextBestActions.Generate(facts, tasks, stock, DateOnly.FromDateTime(now), now, Math.Clamp(max, 1, 30)));
        });

        g.MapGet("/opportunities", async (AppDbContext db, TeamScope team, Guid productId, Guid? territoryId, int take = 25) =>
        {
            var now = DateTime.UtcNow;
            var product = await db.Products.AsNoTracking().FirstOrDefaultAsync(p => p.Id == productId);
            if (product is null) return Results.NotFound();
            var facts = await AiData.LoadFacts(db, await team.VisibleTerritoryIds(), territoryId, now);
            var pf = await AiData.LoadProductFacts(db, productId, facts.Select(f => f.Id).ToList(), now);
            var ranked = facts.Select(f => OpportunityScorer.Score(f, pf[f.Id], now)).OrderByDescending(o => o.Probability).Take(Math.Clamp(take, 1, 100)).ToList();
            return Results.Ok(new
            {
                product = product.Name,
                note = "Heuristic ranking from visits, call outcomes, interest and samples. It is not a sales forecast.",
                items = ranked,
            });
        });
    }

    // ---------- territory optimisation ----------

    private static void MapTerritory(RouteGroupBuilder g)
    {
        g.MapGet("/territories/balance", async (AppDbContext db, TeamScope team, Microsoft.Extensions.Options.IOptions<AiOptions> o) =>
        {
            var visible = await team.VisibleTerritoryIds();
            var terrs = await db.Territories.AsNoTracking().Where(t => visible == null || visible.Contains(t.Id)).OrderBy(t => t.Name).ToListAsync();
            var ids = terrs.Select(t => t.Id).ToList();
            var reps = (await db.Users.AsNoTracking().Where(u => u.Role == UserRole.Rep && u.IsActive && u.TerritoryId != null && ids.Contains(u.TerritoryId.Value))
                .GroupBy(u => u.TerritoryId!.Value).Select(x => new { Id = x.Key, N = x.Count() }).ToListAsync()).ToDictionary(x => x.Id, x => x.N);
            var customers = await db.Customers.AsNoTracking().Where(c => c.TerritoryId != null && ids.Contains(c.TerritoryId.Value))
                .Select(c => new CustomerPoint(c.Id, c.Name, c.TerritoryId!.Value, c.TargetVisitsPerMonth, c.Latitude, c.Longitude)).ToListAsync();
            return Results.Ok(TerritoryBalancer.Balance(terrs.Select(t => (t.Id, t.Name)).ToList(), reps, customers, o.Value.CallsPerRepPerMonth));
        }).RequireAuthorization(p => p.RequireRole(Roles.Managers));

        g.MapPost("/territories/moves/apply", async (ApplyMovesRequest d, AppDbContext db) =>
        {
            if (d.Moves is not { Count: > 0 and <= 200 }) return Results.BadRequest("Send between 1 and 200 moves.");
            var targets = d.Moves.Select(m => m.ToTerritoryId).Distinct().ToList();
            var known = await db.Territories.Where(t => targets.Contains(t.Id)).Select(t => t.Id).ToListAsync();
            if (targets.Any(t => !known.Contains(t))) return Results.BadRequest("Unknown territory.");
            var ids = d.Moves.Select(m => m.CustomerId).Distinct().ToList();
            var customers = await db.Customers.Where(c => ids.Contains(c.Id)).ToDictionaryAsync(c => c.Id);
            if (ids.Any(i => !customers.ContainsKey(i))) return Results.BadRequest("Unknown customer.");
            foreach (var m in d.Moves) customers[m.CustomerId].TerritoryId = m.ToTerritoryId; // audited like any other change
            await db.SaveChangesAsync();
            return Results.Ok(new { moved = d.Moves.Count });
        }).RequireAuthorization(p => p.RequireRole(Admins));

        g.MapPost("/routes/optimize", async (RouteRequest d, AppDbContext db, TeamScope team, HttpCurrentUser u) =>
        {
            var rep = d.RepId ?? u.UserId;
            if (rep is null) return Results.Forbid();
            var visible = await team.VisibleUserIds();
            if (visible != null && !visible.Contains(rep.Value)) return Results.NotFound();
            if (d.Apply && rep != u.UserId && u.Role == UserRole.Rep) return Results.Forbid();

            var planned = await db.PlannedVisits.Where(p => p.RepId == rep && p.PlannedDate == d.Date && p.Status != VisitStatus.Cancelled).OrderBy(p => p.Sequence).ToListAsync();
            if (planned.Count == 0) return Results.Ok(new { order = Array.Empty<object>(), originalKm = 0.0, optimizedKm = 0.0, applied = false });
            var cids = planned.Select(p => p.CustomerId).ToList();
            var customers = await db.Customers.AsNoTracking().Where(c => cids.Contains(c.Id)).ToDictionaryAsync(c => c.Id);
            var stops = planned.Select(p => new RouteStop(p.Id, customers.GetValueOrDefault(p.CustomerId)?.Latitude, customers.GetValueOrDefault(p.CustomerId)?.Longitude)).ToList();
            var start = d.StartLatitude is { } la && d.StartLongitude is { } lo ? (la, lo) : ((double, double)?)null;
            var plan = RouteOptimizer.Optimize(stops, start);

            var byId = planned.ToDictionary(p => p.Id);
            if (d.Apply)
            {
                for (var i = 0; i < plan.Order.Count; i++) byId[plan.Order[i]].Sequence = i + 1;
                await db.SaveChangesAsync();
            }
            return Results.Ok(new
            {
                order = plan.Order.Select((id, i) => new { plannedVisitId = id, customerId = byId[id].CustomerId, name = customers.GetValueOrDefault(byId[id].CustomerId)?.Name, sequence = i + 1 }),
                plan.OriginalKm, plan.OptimizedKm, applied = d.Apply,
            });
        });
    }

    // ---------- governance ----------

    private static void MapGovernance(RouteGroupBuilder g)
    {
        // The AI model-use register: what is on, which models, how much it is used, and whether people trust the output.
        g.MapGet("/governance", async (AppDbContext db, AiService ai, HttpCurrentUser u) =>
        {
            var o = ai.Options;
            var tenant = await db.Tenants.AsNoTracking().FirstOrDefaultAsync(t => t.Id == u.TenantId);
            var since = DateTime.UtcNow.AddDays(-30);
            var rows = await db.AiOutputs.AsNoTracking().Where(a => a.CreatedAt >= since).ToListAsync();
            return Results.Ok(new
            {
                configuration = new
                {
                    providerEnabled = o.Enabled && o.Provider != "none", provider = o.Provider, tenantOptIn = tenant?.AiEnabled ?? false,
                    chatDeployment = o.ChatDeployment, transcriptionDeployment = o.TranscriptionDeployment, dailyLimitPerUser = o.DailyLimitPerUser, maxInputChars = o.MaxInputChars,
                },
                usageLast30Days = rows.GroupBy(r => r.Feature).Select(x => new
                {
                    feature = x.Key.ToString(), requests = x.Count(), failed = x.Count(r => r.Status == AiStatus.Failed),
                    inputTokens = x.Sum(r => r.InputTokens), outputTokens = x.Sum(r => r.OutputTokens),
                    averageLatencyMs = x.Any() ? (int)x.Average(r => r.LatencyMs) : 0,
                    accepted = x.Count(r => r.Status == AiStatus.Accepted), rejected = x.Count(r => r.Status == AiStatus.Rejected), pendingReview = x.Count(r => r.Status == AiStatus.Draft),
                }).ToList(),
                topUsers = rows.GroupBy(r => r.UserId).Select(x => new { userId = x.Key, requests = x.Count() }).OrderByDescending(x => x.requests).Take(10).ToList(),
                safeguards = new[]
                {
                    "Generative AI is off until a tenant administrator opts in.",
                    "Emails, phone numbers, ID numbers, links and the customer's and rep's names are removed before text is sent to the model.",
                    "Only a hash of each prompt is stored, never the prompt itself.",
                    "Every output is a draft. A person must accept it, and can edit it, before it is used; nothing is applied automatically.",
                    "Visit notes are treated as untrusted data: the model is told to ignore instructions inside them, and its answer is validated and cut to size.",
                    "Scores, next best actions and territory suggestions are rule-based and explain every factor; they use no external model.",
                    "Each user has a daily limit on AI requests. Every request is in the model-use register above.",
                },
            });
        }).RequireAuthorization(p => p.RequireRole(Governors));
    }
}
