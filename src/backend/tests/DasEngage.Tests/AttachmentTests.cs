using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using DasEngage.Api;
using DasEngage.Domain;

namespace DasEngage.Tests;

public class AttachmentTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _f;
    public AttachmentTests(ApiFactory f) => _f = f;

    private static byte[] Jpeg(int size = 2000) { var b = new byte[size]; Random.Shared.NextBytes(b); b[0] = 0xFF; b[1] = 0xD8; b[2] = 0xFF; return b; }
    private static byte[] Png(int size = 500) { var b = new byte[size]; Random.Shared.NextBytes(b); new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A }.CopyTo(b, 0); return b; }
    private static byte[] M4a(int size = 3000) { var b = new byte[size]; Random.Shared.NextBytes(b); Encoding.ASCII.GetBytes("ftypM4A ").CopyTo(b, 4); return b; }
    private static string Sha(byte[] b) => Convert.ToHexString(SHA256.HashData(b)).ToLowerInvariant();

    private record Ctx(Guid Tenant, Guid Rep, HttpClient RepClient, Guid VisitId, Guid CustomerId);

    private async Task<Ctx> Setup()
    {
        var tenant = Guid.NewGuid(); var rep = Guid.NewGuid(); var terr = Guid.NewGuid();
        var mgr = _f.ClientFor(tenant, Guid.NewGuid(), "NationalSalesManager");
        var cust = (await (await mgr.PostAsJsonAsync("/api/v1/customers",
            new CustomerDto(null, CustomerType.Hospital, "Hospital", null, Segment.A, terr, null, null, null, null, null, null, null, 1, null)))
            .Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        var client = _f.ClientFor(tenant, rep, "Rep", terr);
        var visit = Guid.NewGuid();
        (await client.PostAsJsonAsync("/api/v1/visits/check-in", new CheckInDto(visit, cust, null, null, null, null, null))).EnsureSuccessStatusCode();
        return new Ctx(tenant, rep, client, visit, cust);
    }

    private static Task<HttpResponseMessage> Put(HttpClient c, Guid id, string kind, Guid visit, byte[] body, string contentType,
        string? hash = null, string extra = "")
    {
        var req = new HttpRequestMessage(HttpMethod.Put, $"/api/v1/attachments/{id}?kind={kind}&visitId={visit}{extra}") { Content = new ByteArrayContent(body) };
        req.Content.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue(contentType);
        if (hash != "none") req.Headers.Add("X-Content-SHA256", hash ?? Sha(body));
        return c.SendAsync(req);
    }

    [Fact]
    public async Task Photo_round_trips_with_safe_download_headers()
    {
        var x = await Setup();
        var id = Guid.NewGuid(); var bytes = Jpeg();
        var r = await Put(x.RepClient, id, "Photo", x.VisitId, bytes, "image/jpeg");
        Assert.Equal(HttpStatusCode.Created, r.StatusCode);
        var info = await r.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(Sha(bytes), info.GetProperty("sha256").GetString());
        Assert.Equal(x.CustomerId, info.GetProperty("customerId").GetGuid());

        var get = await x.RepClient.GetAsync($"/api/v1/attachments/{id}/content");
        Assert.Equal(bytes, await get.Content.ReadAsByteArrayAsync());
        Assert.Equal("image/jpeg", get.Content.Headers.ContentType!.MediaType);
        Assert.Equal("nosniff", get.Headers.GetValues("X-Content-Type-Options").Single());
        Assert.Equal("attachment", get.Content.Headers.ContentDisposition!.DispositionType);

        var list = await x.RepClient.GetFromJsonAsync<JsonElement>($"/api/v1/attachments?visitId={x.VisitId}");
        Assert.Equal(1, list.GetArrayLength());
    }

    [Fact]
    public async Task Voice_note_uploads()
    {
        var x = await Setup();
        Assert.Equal(HttpStatusCode.Created, (await Put(x.RepClient, Guid.NewGuid(), "VoiceNote", x.VisitId, M4a(), "audio/mp4")).StatusCode);
    }

    [Fact]
    public async Task Upload_is_idempotent_and_refuses_conflicting_reuse_of_an_id()
    {
        var x = await Setup();
        var id = Guid.NewGuid(); var bytes = Jpeg();
        Assert.Equal(HttpStatusCode.Created, (await Put(x.RepClient, id, "Photo", x.VisitId, bytes, "image/jpeg")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Put(x.RepClient, id, "Photo", x.VisitId, bytes, "image/jpeg")).StatusCode); // retry
        Assert.Equal(HttpStatusCode.Conflict, (await Put(x.RepClient, id, "Photo", x.VisitId, Jpeg(), "image/jpeg")).StatusCode);
        Assert.Equal(1, (await x.RepClient.GetFromJsonAsync<JsonElement>($"/api/v1/attachments?visitId={x.VisitId}")).GetArrayLength());
    }

    [Fact]
    public async Task Bad_uploads_are_rejected()
    {
        var x = await Setup();
        var j = Jpeg();
        Assert.Equal(HttpStatusCode.BadRequest, (await Put(x.RepClient, Guid.NewGuid(), "Photo", x.VisitId, j, "image/jpeg", hash: "none")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Put(x.RepClient, Guid.NewGuid(), "Photo", x.VisitId, j, "image/jpeg", hash: new string('a', 64))).StatusCode); // corrupted in transit
        Assert.Equal(HttpStatusCode.UnsupportedMediaType, (await Put(x.RepClient, Guid.NewGuid(), "Photo", x.VisitId, j, "application/pdf")).StatusCode);
        Assert.Equal(HttpStatusCode.UnsupportedMediaType, (await Put(x.RepClient, Guid.NewGuid(), "Photo", x.VisitId, j, "text/html")).StatusCode);
        var notAnImage = Encoding.UTF8.GetBytes("<html><script>alert(1)</script></html>");
        Assert.Equal(HttpStatusCode.BadRequest, (await Put(x.RepClient, Guid.NewGuid(), "Photo", x.VisitId, notAnImage, "image/jpeg")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Put(x.RepClient, Guid.NewGuid(), "Photo", x.VisitId, Array.Empty<byte>(), "image/jpeg")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Put(x.RepClient, Guid.NewGuid(), "Hologram", x.VisitId, j, "image/jpeg")).StatusCode);
        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, (await Put(x.RepClient, Guid.NewGuid(), "Signature", x.VisitId, Png(1_000_001), "image/png",
            extra: "&signerName=A&meaning=B")).StatusCode);
    }

    [Fact]
    public async Task Uploads_must_belong_to_the_callers_own_existing_visit()
    {
        var x = await Setup();
        Assert.Equal(HttpStatusCode.Conflict, (await Put(x.RepClient, Guid.NewGuid(), "Photo", Guid.NewGuid(), Jpeg(), "image/jpeg")).StatusCode);
        var other = _f.ClientFor(x.Tenant, Guid.NewGuid(), "Rep", Guid.NewGuid());
        Assert.Equal(HttpStatusCode.Forbidden, (await Put(other, Guid.NewGuid(), "Photo", x.VisitId, Jpeg(), "image/jpeg")).StatusCode);
    }

    [Fact]
    public async Task Signature_records_signer_meaning_and_a_binding_hash_and_cannot_be_deleted()
    {
        var x = await Setup();
        var id = Guid.NewGuid(); var png = Png();
        Assert.Equal(HttpStatusCode.BadRequest, (await Put(x.RepClient, id, "Signature", x.VisitId, png, "image/png")).StatusCode); // no signer
        var when = new DateTime(2026, 10, 1, 9, 30, 0, DateTimeKind.Utc);
        var r = await Put(x.RepClient, id, "Signature", x.VisitId, png, "image/png",
            extra: $"&signerName={Uri.EscapeDataString("Dr Ama Boateng")}&meaning={Uri.EscapeDataString("Received 2 sample packs")}&capturedAt={Uri.EscapeDataString(when.ToString("O"))}");
        Assert.Equal(HttpStatusCode.Created, r.StatusCode);
        var info = await r.Content.ReadFromJsonAsync<JsonElement>();
        var expected = Sha(Encoding.UTF8.GetBytes($"{id}|{x.VisitId}|Dr Ama Boateng|Received 2 sample packs|{when:O}|{Sha(png)}"));
        Assert.Equal(expected, info.GetProperty("recordHash").GetString());

        Assert.Equal(HttpStatusCode.Conflict, (await x.RepClient.DeleteAsync($"/api/v1/attachments/{id}")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await x.RepClient.GetAsync($"/api/v1/attachments/{id}/content")).StatusCode);
    }

    [Fact]
    public async Task Photos_can_be_deleted_by_their_owner()
    {
        var x = await Setup();
        var id = Guid.NewGuid();
        await Put(x.RepClient, id, "Photo", x.VisitId, Jpeg(), "image/jpeg");
        Assert.Equal(HttpStatusCode.NoContent, (await x.RepClient.DeleteAsync($"/api/v1/attachments/{id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await x.RepClient.GetAsync($"/api/v1/attachments/{id}/content")).StatusCode);
    }

    [Fact]
    public async Task Access_follows_the_team_scope_and_tenant_boundary()
    {
        var x = await Setup();
        var id = Guid.NewGuid();
        await Put(x.RepClient, id, "Photo", x.VisitId, Jpeg(), "image/jpeg");

        var sameTenantOtherRep = _f.ClientFor(x.Tenant, Guid.NewGuid(), "Rep", Guid.NewGuid());
        Assert.Equal(HttpStatusCode.NotFound, (await sameTenantOtherRep.GetAsync($"/api/v1/attachments/{id}/content")).StatusCode);
        Assert.Equal(0, (await sameTenantOtherRep.GetFromJsonAsync<JsonElement>($"/api/v1/attachments?visitId={x.VisitId}")).GetArrayLength());

        var nsm = _f.ClientFor(x.Tenant, Guid.NewGuid(), "NationalSalesManager");
        Assert.Equal(HttpStatusCode.OK, (await nsm.GetAsync($"/api/v1/attachments/{id}/content")).StatusCode);

        var otherTenant = _f.ClientFor(Guid.NewGuid(), Guid.NewGuid(), "NationalSalesManager");
        Assert.Equal(HttpStatusCode.NotFound, (await otherTenant.GetAsync($"/api/v1/attachments/{id}/content")).StatusCode);
    }
}
