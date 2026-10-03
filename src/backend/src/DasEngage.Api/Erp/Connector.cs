using System.Net;
using System.Net.Http.Headers;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using DasEngage.Domain;

namespace DasEngage.Api.Erp;

public record SendResult(bool Success, bool Permanent, string? Reference, string? Error);
public record PullResult<T>(List<T> Items, string? NextCursor, string? Error);

/// <summary>Talks to an ERP gateway. The shape of the data is the canonical contract; only the transport differs per ERP.</summary>
public interface IErpConnector
{
    Task<SendResult> SendAsync(ErpConnection connection, OutboxMessage message, CancellationToken ct = default);
    Task<PullResult<T>> PullAsync<T>(ErpConnection connection, string entity, string? cursor, CancellationToken ct = default);
    /// <summary>Null when the gateway answered; otherwise the reason it did not.</summary>
    Task<string?> PingAsync(ErpConnection connection, CancellationToken ct = default);
}

public interface ISecretProvider
{
    string? Get(string name);
}

/// <summary>Secrets come from configuration, which in production is backed by Azure Key Vault. The database only holds the secret's name.</summary>
public class ConfigSecretProvider : ISecretProvider
{
    private readonly IConfiguration _c;
    public ConfigSecretProvider(IConfiguration c) => _c = c;
    public string? Get(string name) => _c[$"Secrets:{name}"];
}

/// <summary>
/// An administrator chooses the gateway address, and the server then calls it, so the address must not be able to point at
/// internal services (SSRF). Requires https, refuses local and private addresses, and honours an optional host allow-list.
/// (Literal addresses are checked here; for hostnames, also restrict outbound network access at the platform level.)
/// </summary>
public static class UrlGuard
{
    public static string? Validate(string? url, bool allowInsecure = false, IEnumerable<string>? allowedHosts = null)
    {
        if (string.IsNullOrWhiteSpace(url) || !Uri.TryCreate(url.Trim(), UriKind.Absolute, out var u)) return "Enter a full web address, for example https://erp-gateway.example.com.";
        if (u.Scheme != Uri.UriSchemeHttps && !(allowInsecure && u.Scheme == Uri.UriSchemeHttp)) return "The address must use https.";
        if (!string.IsNullOrEmpty(u.UserInfo)) return "The address must not contain a username or password.";
        var host = u.IdnHost.ToLowerInvariant();
        if (host == "localhost" || host.EndsWith(".localhost") || host.EndsWith(".local") || host.EndsWith(".internal")) return "That address is not allowed.";
        if (IPAddress.TryParse(host.Trim('[', ']'), out var ip) && IsInternal(ip)) return "That address is not allowed.";
        var allow = allowedHosts?.Where(h => !string.IsNullOrWhiteSpace(h)).Select(h => h.ToLowerInvariant()).ToList();
        if (allow is { Count: > 0 } && !allow.Contains(host)) return "That host is not on the list of approved ERP hosts.";
        return null;
    }

    private static bool IsInternal(IPAddress ip)
    {
        if (IPAddress.IsLoopback(ip) || ip.Equals(IPAddress.Any) || ip.Equals(IPAddress.IPv6Any)) return true;
        if (ip.IsIPv4MappedToIPv6) ip = ip.MapToIPv4();
        if (ip.AddressFamily == AddressFamily.InterNetworkV6) return ip.IsIPv6LinkLocal || ip.IsIPv6SiteLocal || (ip.GetAddressBytes()[0] & 0xFE) == 0xFC;
        var b = ip.GetAddressBytes();
        return b[0] == 10 || b[0] == 127 || (b[0] == 172 && b[1] is >= 16 and <= 31) || (b[0] == 192 && b[1] == 168) || (b[0] == 169 && b[1] == 254) || (b[0] == 100 && b[1] is >= 64 and <= 127) || b[0] == 0;
    }
}

/// <summary>
/// The generic connector: an HTTPS gateway in front of the ERP implementing
/// <c>GET /dasengage/health</c>, <c>GET /dasengage/{entity}?since=&amp;limit=</c> and <c>POST /dasengage/outbox/{type}</c> (docs/erp-integration.md).
/// </summary>
public class RestErpConnector : IErpConnector
{
    private readonly HttpClient _http;
    private readonly ISecretProvider _secrets;
    private readonly bool _allowInsecure;
    private readonly string[] _allowedHosts;

    public RestErpConnector(HttpClient http, ISecretProvider secrets, IConfiguration config)
    {
        _http = http; _secrets = secrets;
        _allowInsecure = config.GetValue<bool>("Erp:AllowInsecureHttp");
        _allowedHosts = config.GetSection("Erp:AllowedHosts").Get<string[]>() ?? Array.Empty<string>();
    }

    private Uri? Url(ErpConnection c, string path, out string? error)
    {
        error = UrlGuard.Validate(c.BaseUrl, _allowInsecure, _allowedHosts);
        return error is null ? new Uri($"{c.BaseUrl!.TrimEnd('/')}/dasengage/{path}") : null;
    }

    private HttpRequestMessage Request(HttpMethod method, Uri uri, ErpConnection c)
    {
        var req = new HttpRequestMessage(method, uri);
        var secret = string.IsNullOrEmpty(c.SecretName) ? null : _secrets.Get(c.SecretName);
        if (!string.IsNullOrEmpty(secret)) req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", secret);
        return req;
    }

    public async Task<string?> PingAsync(ErpConnection c, CancellationToken ct = default)
    {
        var uri = Url(c, "health", out var err);
        if (uri is null) return err;
        try
        {
            using var r = await _http.SendAsync(Request(HttpMethod.Get, uri, c), ct);
            return r.IsSuccessStatusCode ? null : $"The ERP gateway answered {(int)r.StatusCode}.";
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException) { return "The ERP gateway could not be reached."; }
    }

    public async Task<SendResult> SendAsync(ErpConnection c, OutboxMessage m, CancellationToken ct = default)
    {
        var uri = Url(c, $"outbox/{Uri.EscapeDataString(m.Type)}", out var err);
        if (uri is null) return new(false, true, null, err);
        var body = JsonSerializer.Serialize(new { id = m.Id, type = m.Type, createdAt = m.CreatedAt, payload = JsonDocument.Parse(m.Payload).RootElement }, ErpJson.Options);
        using var req = Request(HttpMethod.Post, uri, c);
        req.Content = new StringContent(body, Encoding.UTF8, "application/json");
        req.Headers.Add("Idempotency-Key", m.Id.ToString()); // the gateway can safely ignore a message it has already seen
        try
        {
            using var r = await _http.SendAsync(req, ct);
            if (r.IsSuccessStatusCode)
            {
                string? reference = null;
                try { using var d = JsonDocument.Parse(await r.Content.ReadAsStringAsync(ct)); reference = d.RootElement.TryGetProperty("reference", out var x) ? x.GetString() : null; } catch { /* body is optional */ }
                return new(true, false, reference, null);
            }
            var text = (await r.Content.ReadAsStringAsync(ct)).Trim();
            if (text.Length > 300) text = text[..300];
            // 4xx other than "timeout" and "slow down" means the ERP will never accept this message as it is
            var permanent = (int)r.StatusCode is >= 400 and < 500 && r.StatusCode is not (HttpStatusCode.RequestTimeout or HttpStatusCode.TooManyRequests);
            return new(false, permanent, null, $"ERP answered {(int)r.StatusCode}: {text}");
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException) { return new(false, false, null, "The ERP gateway could not be reached."); }
    }

    public async Task<PullResult<T>> PullAsync<T>(ErpConnection c, string entity, string? cursor, CancellationToken ct = default)
    {
        var path = $"{entity}?limit=1000" + (string.IsNullOrEmpty(cursor) ? "" : $"&since={Uri.EscapeDataString(cursor)}");
        var uri = Url(c, path, out var err);
        if (uri is null) return new(new(), null, err);
        try
        {
            using var r = await _http.SendAsync(Request(HttpMethod.Get, uri, c), ct);
            if (!r.IsSuccessStatusCode) return new(new(), null, $"The ERP gateway answered {(int)r.StatusCode} for {entity}.");
            var page = JsonSerializer.Deserialize<ErpPage<T>>(await r.Content.ReadAsStringAsync(ct), ErpJson.Options);
            return page is null ? new(new(), null, $"The ERP gateway returned nothing usable for {entity}.") : new(page.Items ?? new(), page.NextCursor, null);
        }
        catch (JsonException) { return new(new(), null, $"The ERP gateway returned data for {entity} that does not match the contract."); }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException) { return new(new(), null, "The ERP gateway could not be reached."); }
    }
}

/// <summary>Used when no gateway is configured: nothing is sent and nothing is pulled.</summary>
public class NullErpConnector : IErpConnector
{
    public Task<SendResult> SendAsync(ErpConnection c, OutboxMessage m, CancellationToken ct = default) => Task.FromResult(new SendResult(false, false, null, "No ERP gateway is configured."));
    public Task<PullResult<T>> PullAsync<T>(ErpConnection c, string entity, string? cursor, CancellationToken ct = default) => Task.FromResult(new PullResult<T>(new(), null, "No ERP gateway is configured."));
    public Task<string?> PingAsync(ErpConnection c, CancellationToken ct = default) => Task.FromResult<string?>("No ERP gateway is configured.");
}
