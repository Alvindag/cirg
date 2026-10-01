using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using DasEngage.Domain;
using DasEngage.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace DasEngage.Api.Ai;

public record AiProblem(int Status, string Message);

/// <summary>
/// Generative AI with governance built in: tenant opt-in, daily quotas, personal data removed before sending, every call recorded in the
/// model-use register (<see cref="AiOutput"/>), and every output a draft that a person must accept.
/// </summary>
public class AiService
{
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private readonly AppDbContext _db;
    private readonly HttpCurrentUser _user;
    private readonly AiOptions _o;
    private readonly IChatModel _chat;
    private readonly ITranscriber _transcriber;
    private readonly IBlobStore _blobs;

    public AiService(AppDbContext db, HttpCurrentUser user, IOptions<AiOptions> o, IChatModel chat, ITranscriber transcriber, IBlobStore blobs)
    {
        _db = db; _user = user; _o = o.Value; _chat = chat; _transcriber = transcriber; _blobs = blobs;
    }

    public AiOptions Options => _o;

    /// <summary>Null when the caller may use generative AI now; otherwise the reason.</summary>
    public async Task<AiProblem?> Gate()
    {
        if (!_o.Enabled || _o.Provider == "none") return new(503, "AI features are not available on this system.");
        if (_user.UserId is not { } uid) return new(403, "Not allowed.");
        var tenant = await _db.Tenants.AsNoTracking().FirstOrDefaultAsync(t => t.Id == _user.TenantId);
        if (tenant is null || !tenant.AiEnabled) return new(403, "AI features are switched off for your organisation. An administrator can enable them.");
        var since = DateTime.UtcNow.AddHours(-24);
        var used = await _db.AiOutputs.CountAsync(a => a.UserId == uid && a.CreatedAt >= since);
        if (used >= _o.DailyLimitPerUser) return new(429, $"You have reached the daily limit of {_o.DailyLimitPerUser} AI requests. Try again tomorrow.");
        return null;
    }

    private static string Hash(string s) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(s))).ToLowerInvariant();

    private AiOutput NewRecord(AiFeature feature, string subjectType, Guid subjectId, string model, string promptHash) => new()
    {
        UserId = _user.UserId!.Value, Feature = feature, SubjectType = subjectType, SubjectId = subjectId, Model = model, PromptHash = promptHash,
    };

    // ---------- voice note -> text ----------

    public async Task<AiOutput> Transcribe(Attachment voiceNote, string? language, bool force)
    {
        if (!force)
        {
            var existing = await _db.AiOutputs.FirstOrDefaultAsync(a => a.Feature == AiFeature.Transcription && a.SubjectId == voiceNote.Id &&
                (a.Status == AiStatus.Draft || a.Status == AiStatus.Accepted));
            if (existing != null) return existing; // one paid transcription per voice note
        }
        var record = NewRecord(AiFeature.Transcription, "Attachment", voiceNote.Id, _transcriber.Deployment, voiceNote.Sha256);
        var sw = Stopwatch.StartNew();
        try
        {
            if (voiceNote.SizeBytes > _o.MaxAudioBytes) throw new AiUnavailableException("This voice note is too long to transcribe.", 422);
            await using var stream = await _blobs.OpenReadAsync(voiceNote.StorageKey) ?? throw new AiUnavailableException("The audio file could not be found.", 404);
            var result = await _transcriber.TranscribeAsync(stream, voiceNote.FileName, voiceNote.ContentType, language);
            record.Content = result.Text.Trim();
            if (record.Content.Length == 0) throw new AiUnavailableException("No speech was recognised in this voice note.", 422);
        }
        catch (AiUnavailableException e) { record.Status = AiStatus.Failed; record.Error = e.Message; Finish(record, sw); await _db.SaveChangesAsync(); throw; }
        Finish(record, sw);
        _db.AiOutputs.Add(record);
        await _db.SaveChangesAsync();
        return record;
    }

    private void Finish(AiOutput record, Stopwatch sw)
    {
        record.LatencyMs = (int)sw.ElapsedMilliseconds;
        if (_db.Entry(record).State == EntityState.Detached) _db.AiOutputs.Add(record);
    }

    // ---------- visit summary ----------

    /// <summary>Everything written or said about the visit, ready to be redacted and sent.</summary>
    public async Task<(string Text, int ContentChars, string CustomerContext, List<string> Products, List<string> Names)> GatherVisitText(Visit visit, string? extraNotes)
    {
        var customer = await _db.Customers.AsNoTracking().FirstOrDefaultAsync(c => c.Id == visit.CustomerId);
        var report = await _db.CallReports.AsNoTracking().Include(r => r.Products).FirstOrDefaultAsync(r => r.VisitId == visit.Id);
        var productNames = await _db.Products.AsNoTracking().ToDictionaryAsync(p => p.Id, p => p.Name);
        var voiceIds = await _db.Attachments.AsNoTracking().Where(a => a.VisitId == visit.Id && a.Kind == AttachmentKind.VoiceNote).Select(a => a.Id).ToListAsync();
        var transcripts = await _db.AiOutputs.AsNoTracking().Where(a => a.Feature == AiFeature.Transcription && voiceIds.Contains(a.SubjectId) &&
            (a.Status == AiStatus.Draft || a.Status == AiStatus.Accepted)).OrderBy(a => a.CreatedAt).ToListAsync();

        var parts = new List<string>();
        var contentChars = 0; // what the rep actually wrote or said, without our labels
        void Add(string label, string? value)
        {
            if (string.IsNullOrWhiteSpace(value)) return;
            parts.Add($"{label}: {value}");
            contentChars += value.Trim().Length;
        }
        var discussed = new List<string>();
        if (report != null)
        {
            Add("Outcome", report.Outcome);
            discussed = report.Products.Where(p => p.DeletedAt == null).Select(p => productNames.GetValueOrDefault(p.ProductId)).Where(n => n != null).Cast<string>().ToList();
            foreach (var p in report.Products) Add($"Feedback on {productNames.GetValueOrDefault(p.ProductId, "a product")}", p.Feedback);
            Add("Notes", report.Notes);
            Add("Planned next step", report.NextStep);
        }
        foreach (var t in transcripts) Add("Voice note", t.EditedContent ?? t.Content);
        Add("Additional notes", extraNotes);

        var ctx = customer is null ? "unknown" : $"{customer.Type}{(string.IsNullOrWhiteSpace(customer.Specialty) ? "" : $", {customer.Specialty}")}";
        var names = new List<string> { customer?.Name ?? "" };
        names.AddRange(await _db.Users.AsNoTracking().Where(u => u.Id == visit.RepId).Select(u => u.FullName).ToListAsync());
        return (string.Join("\n", parts), contentChars, ctx, discussed, names);
    }

    public async Task<AiOutput> SummariseVisit(Visit visit, string? extraNotes)
    {
        var (text, contentChars, ctx, discussed, names) = await GatherVisitText(visit, extraNotes);
        if (contentChars < 20) throw new AiUnavailableException("There is not enough text yet. Save the call report or add a transcribed voice note first.", 400);

        var cleaned = Redactor.Redact(text, names);
        if (cleaned.Length > _o.MaxInputChars) cleaned = cleaned[.._o.MaxInputChars];
        var user = VisitSummaryPrompt.User(ctx, cleaned);
        var record = NewRecord(AiFeature.VisitSummary, "Visit", visit.Id, _chat.Deployment, Hash(VisitSummaryPrompt.System + "\n" + user));
        var sw = Stopwatch.StartNew();
        try
        {
            var result = await _chat.CompleteJsonAsync(VisitSummaryPrompt.System, user);
            record.InputTokens = result.InputTokens; record.OutputTokens = result.OutputTokens;
            VisitSummaryDto dto;
            try { dto = VisitSummaryPrompt.Parse(result.Content, discussed); }
            catch (FormatException e) { throw new AiUnavailableException("The AI returned an answer that could not be used. Please try again.", 502) { Data = { ["detail"] = e.Message } }; }
            record.Content = JsonSerializer.Serialize(dto, Json);
        }
        catch (AiUnavailableException e) { record.Status = AiStatus.Failed; record.Error = e.Message; Finish(record, sw); await _db.SaveChangesAsync(); throw; }
        Finish(record, sw);
        await _db.SaveChangesAsync();
        return record;
    }

    // ---------- the person decides ----------

    public async Task<(AiProblem? Problem, AiOutput? Output)> Decide(Guid id, string status, string? editedText, VisitSummaryDto? editedSummary, bool applyToReport, int[]? taskIndexes)
    {
        var o = await _db.AiOutputs.FirstOrDefaultAsync(a => a.Id == id);
        if (o is null || o.UserId != _user.UserId) return (new(404, "Not found."), null);
        if (o.Status != AiStatus.Draft) return (new(409, "This draft has already been decided."), null);
        if (!Enum.TryParse<AiStatus>(status, true, out var decision) || decision is not (AiStatus.Accepted or AiStatus.Rejected))
            return (new(400, "Status must be Accepted or Rejected."), null);

        var summary = o.Feature == AiFeature.VisitSummary ? JsonSerializer.Deserialize<VisitSummaryDto>(o.Content, Json) : null;
        if (decision == AiStatus.Accepted)
        {
            if (o.Feature == AiFeature.Transcription && !string.IsNullOrWhiteSpace(editedText) && editedText.Trim() != o.Content)
                o.EditedContent = editedText.Trim()[..Math.Min(editedText.Trim().Length, 20_000)];
            if (summary != null && editedSummary != null)
            {
                // an edited summary is re-validated like model output, so the UI cannot store anything oversized or malformed
                var cleaned = VisitSummaryPrompt.Parse(JsonSerializer.Serialize(editedSummary, Json), editedSummary.ProductsDiscussed);
                summary = cleaned;
                o.EditedContent = JsonSerializer.Serialize(cleaned, Json);
            }
        }
        o.Status = decision;
        o.DecidedAt = DateTime.UtcNow;

        if (decision == AiStatus.Accepted && applyToReport && summary != null)
        {
            var report = await _db.CallReports.FirstOrDefaultAsync(r => r.VisitId == o.SubjectId);
            if (report is null) return (new(409, "Save the call report first, then apply the summary."), null);
            const string marker = "--- AI-assisted summary (reviewed by the rep) ---";
            if (!(report.Notes ?? "").Contains(marker))
                report.Notes = $"{report.Notes}\n\n{marker}\n{summary.Summary}".Trim();
            foreach (var i in (taskIndexes ?? Array.Empty<int>()).Distinct().Where(i => i >= 0 && i < summary.FollowUps.Count))
            {
                var f = summary.FollowUps[i];
                _db.Tasks.Add(new FollowUpTask
                {
                    AssignedToId = o.UserId, CustomerId = report.CustomerId, CallReportId = report.Id, Title = f.Title,
                    DueDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(f.DueInDays)),
                });
            }
        }
        await _db.SaveChangesAsync();
        return (null, o);
    }
}
