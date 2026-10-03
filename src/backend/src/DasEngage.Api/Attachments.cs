using System.Security.Cryptography;
using System.Text;
using DasEngage.Domain;
using DasEngage.Infrastructure;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.EntityFrameworkCore;

namespace DasEngage.Api;

public record AttachmentInfo(Guid Id, AttachmentKind Kind, Guid VisitId, Guid? CallReportId, Guid CustomerId, Guid RepId, string FileName,
    string ContentType, long SizeBytes, string Sha256, DateTime CapturedAt, string? SignerName, string? Meaning, string? RecordHash)
{
    public static AttachmentInfo From(Attachment a) => new(a.Id, a.Kind, a.VisitId, a.CallReportId, a.CustomerId, a.RepId, a.FileName,
        a.ContentType, a.SizeBytes, a.Sha256, a.CapturedAt, a.SignerName, a.Meaning, a.RecordHash);
}

/// <summary>Photos, voice notes and signatures captured on a visit.</summary>
public static class AttachmentEndpoints
{
    // Hard limits per kind; the mobile app compresses photos and records AAC so real files are far smaller.
    private static readonly Dictionary<AttachmentKind, long> MaxBytes = new()
    {
        [AttachmentKind.Photo] = 10_000_000, [AttachmentKind.VoiceNote] = 25_000_000, [AttachmentKind.Signature] = 1_000_000,
    };

    private static readonly Dictionary<AttachmentKind, string[]> ContentTypes = new()
    {
        [AttachmentKind.Photo] = new[] { "image/jpeg", "image/png" },
        [AttachmentKind.VoiceNote] = new[] { "audio/mp4", "audio/aac", "audio/x-m4a", "audio/m4a", "audio/wav", "audio/x-wav", "audio/mpeg" },
        [AttachmentKind.Signature] = new[] { "image/png" },
    };

    public static void Map(RouteGroupBuilder api)
    {
        var g = api.MapGroup("/attachments");

        // Idempotent on the client-generated id, so an upload interrupted and retried never duplicates.
        g.MapPut("/{id:guid}", async (Guid id, HttpRequest req, AppDbContext db, HttpCurrentUser u, IBlobStore blobs,
            string kind, Guid visitId, DateTime? capturedAt, Guid? callReportId, string? signerName, string? meaning, string? fileName) =>
        {
            if (u.UserId is null) return Results.Forbid();
            if (!Enum.TryParse<AttachmentKind>(kind, true, out var k) || !Enum.IsDefined(k)) return Results.BadRequest("Unknown kind.");
            var contentType = (req.ContentType ?? "").Split(';')[0].Trim().ToLowerInvariant();
            if (!ContentTypes[k].Contains(contentType)) return Results.StatusCode(StatusCodes.Status415UnsupportedMediaType);
            var claimed = req.Headers["X-Content-SHA256"].ToString().ToLowerInvariant();
            if (claimed.Length != 64) return Results.BadRequest("X-Content-SHA256 header (hex SHA-256 of the body) is required.");
            if (k == AttachmentKind.Signature && (string.IsNullOrWhiteSpace(signerName) || string.IsNullOrWhiteSpace(meaning)))
                return Results.BadRequest("A signature needs signerName and meaning.");
            if ((signerName?.Length ?? 0) > 100 || (meaning?.Length ?? 0) > 200) return Results.BadRequest("signerName/meaning too long.");

            var visit = await db.Visits.AsNoTracking().FirstOrDefaultAsync(v => v.Id == visitId);
            if (visit is null) return Results.Conflict("Visit not found on the server yet; sync visits first.");
            if (visit.RepId != u.UserId) return Results.Forbid();

            var existing = await db.Attachments.IgnoreQueryFilters().FirstOrDefaultAsync(a => a.Id == id && a.TenantId == u.TenantId);
            if (existing != null)
                return existing.RepId == u.UserId && existing.Sha256 == claimed
                    ? Results.Ok(AttachmentInfo.From(existing))
                    : Results.Conflict("An attachment with this id already exists with different content.");

            // Read with a hard cap so an oversized or endless body cannot exhaust memory.
            var max = MaxBytes[k];
            if (req.ContentLength > max) return Results.StatusCode(StatusCodes.Status413PayloadTooLarge);
            var ms = new MemoryStream();
            var buffer = new byte[81920];
            int n;
            while ((n = await req.Body.ReadAsync(buffer)) > 0)
            {
                if (ms.Length + n > max) return Results.StatusCode(StatusCodes.Status413PayloadTooLarge);
                ms.Write(buffer, 0, n);
            }
            if (ms.Length == 0) return Results.BadRequest("Empty body.");
            var actual = Sha256Hex(ms.GetBuffer(), (int)ms.Length);
            if (actual != claimed) return Results.BadRequest("Content hash mismatch; the upload was corrupted. Retry.");
            if (!LooksLike(contentType, ms.GetBuffer(), (int)ms.Length)) return Results.BadRequest("File content does not match its type.");

            var when = (capturedAt ?? DateTime.UtcNow).ToUniversalTime();
            var ext = contentType switch { "image/jpeg" => ".jpg", "image/png" => ".png", "audio/wav" or "audio/x-wav" => ".wav", "audio/mpeg" => ".mp3", _ => ".m4a" };
            var a = new Attachment
            {
                Id = id, Kind = k, RepId = u.UserId.Value, VisitId = visitId, CallReportId = callReportId, CustomerId = visit.CustomerId,
                FileName = Clean(fileName) ?? $"{k.ToString().ToLowerInvariant()}{ext}", ContentType = contentType, SizeBytes = ms.Length,
                Sha256 = actual, CapturedAt = when, SignerName = signerName?.Trim(), Meaning = meaning?.Trim(),
                StorageKey = $"{u.TenantId}/{when:yyyy}/{when:MM}/{id}{ext}",
            };
            if (k == AttachmentKind.Signature)
                a.RecordHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(
                    $"{id}|{visitId}|{a.SignerName}|{a.Meaning}|{when:O}|{actual}"))).ToLowerInvariant();

            ms.Position = 0;
            await blobs.PutAsync(a.StorageKey, ms, contentType);
            db.Attachments.Add(a);
            await db.SaveChangesAsync();
            return Results.Created($"/api/v1/attachments/{id}", AttachmentInfo.From(a));
        }).WithMetadata(new Microsoft.AspNetCore.Mvc.RequestSizeLimitAttribute(26_000_000));

        g.MapGet("/", async (AppDbContext db, TeamScope team, Guid? visitId, Guid? customerId, int take = 100) =>
        {
            var ids = await team.VisibleUserIds();
            var q = db.Attachments.AsNoTracking().AsQueryable();
            if (ids != null) q = q.Where(a => ids.Contains(a.RepId));
            if (visitId != null) q = q.Where(a => a.VisitId == visitId);
            if (customerId != null) q = q.Where(a => a.CustomerId == customerId);
            var rows = await q.OrderByDescending(a => a.CapturedAt).Take(Math.Clamp(take, 1, 500)).ToListAsync();
            return Results.Ok(rows.Select(AttachmentInfo.From));
        });

        g.MapGet("/{id:guid}/content", async (Guid id, AppDbContext db, TeamScope team, IBlobStore blobs, HttpResponse res) =>
        {
            var a = await db.Attachments.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id);
            var ids = await team.VisibleUserIds();
            if (a is null || (ids != null && !ids.Contains(a.RepId))) return Results.NotFound();
            var stream = await blobs.OpenReadAsync(a.StorageKey);
            if (stream is null) return Results.NotFound();
            // Never let a browser sniff or render user-supplied files inline.
            res.Headers["X-Content-Type-Options"] = "nosniff";
            res.Headers["Content-Security-Policy"] = "default-src 'none'; sandbox";
            return Results.File(stream, a.ContentType, a.FileName, enableRangeProcessing: true);
        });

        // Signatures are evidence and cannot be removed. Photos and voice notes can be deleted by their owner or a manager.
        g.MapDelete("/{id:guid}", async (Guid id, AppDbContext db, HttpCurrentUser u, TeamScope team) =>
        {
            var a = await db.Attachments.FirstOrDefaultAsync(x => x.Id == id);
            var ids = await team.VisibleUserIds();
            if (a is null || (ids != null && !ids.Contains(a.RepId))) return Results.NotFound();
            if (a.Kind == AttachmentKind.Signature) return Results.Conflict("Signatures cannot be deleted.");
            if (u.IsRep && a.RepId != u.UserId) return Results.NotFound();
            a.DeletedAt = DateTime.UtcNow; // the file is kept in storage for retention; the row is hidden and the deletion audited
            await db.SaveChangesAsync();
            return Results.NoContent();
        });
    }

    private static string? Clean(string? name)
    {
        if (string.IsNullOrWhiteSpace(name)) return null;
        var n = Path.GetFileName(name.Replace('\\', '/'));
        n = new string(n.Where(c => !char.IsControl(c) && c != '"').ToArray());
        return n.Length == 0 ? null : n.Length > 100 ? n[..100] : n;
    }

    /// <summary>Magic-byte check so a file cannot claim to be a photo/audio note while being something else.</summary>
    private static string Sha256Hex(byte[] buffer, int length) =>
        Convert.ToHexString(SHA256.HashData(new ReadOnlySpan<byte>(buffer, 0, length))).ToLowerInvariant();

    private static bool LooksLike(string contentType, byte[] b, int length)
    {
        var len = length;
        bool Jpeg() => len > 3 && b[0] == 0xFF && b[1] == 0xD8 && b[2] == 0xFF;
        bool Png() => len > 8 && b[0] == 0x89 && b[1] == 0x50 && b[2] == 0x4E && b[3] == 0x47;
        bool Mp4() => len > 12 && b[4] == (byte)'f' && b[5] == (byte)'t' && b[6] == (byte)'y' && b[7] == (byte)'p';
        bool Wav() => len > 12 && b[0] == (byte)'R' && b[1] == (byte)'I' && b[2] == (byte)'F' && b[3] == (byte)'F';
        bool Mp3() => len > 3 && ((b[0] == (byte)'I' && b[1] == (byte)'D' && b[2] == (byte)'3') || (b[0] == 0xFF && (b[1] & 0xE0) == 0xE0));
        bool Adts() => len > 2 && b[0] == 0xFF && (b[1] & 0xF0) == 0xF0;
        return contentType switch
        {
            "image/jpeg" => Jpeg(),
            "image/png" => Png(),
            "audio/wav" or "audio/x-wav" => Wav(),
            "audio/mpeg" => Mp3(),
            "audio/aac" => Adts(),
            _ => Mp4(),
        };
    }
}
