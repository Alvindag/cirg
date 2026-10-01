using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Encodings.Web;
using DasEngage.Domain;
using DasEngage.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace DasEngage.Api.Erp;

/// <summary>
/// Integration keys let ERP middleware push data without a person signing in. A key looks like <c>dek_{prefix}_{secret}</c>;
/// only the SHA-256 of the secret is stored, so a leaked database does not leak working keys. Keys belong to one tenant and can be revoked.
/// </summary>
public static class ApiKeyAuth
{
    public const string Scheme = "ApiKey";
    public const string AuthType = "DasApiKey";
    public const string Header = "X-Integration-Key";
    public const string Role = "Integration";

    public static (string Key, string Prefix, string Hash) Generate()
    {
        var prefix = Convert.ToHexString(RandomNumberGenerator.GetBytes(4)).ToLowerInvariant();
        var secret = Base64Url(RandomNumberGenerator.GetBytes(32));
        return ($"dek_{prefix}_{secret}", prefix, Hash(secret));
    }

    public static string Hash(string secret) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(secret))).ToLowerInvariant();

    public static bool TryParse(string? key, out string prefix, out string secret)
    {
        prefix = secret = "";
        if (string.IsNullOrEmpty(key) || key.Length > 100) return false;
        var parts = key.Split('_', 3);
        if (parts.Length != 3 || parts[0] != "dek" || parts[1].Length != 8 || parts[2].Length < 20) return false;
        prefix = parts[1]; secret = parts[2];
        return true;
    }

    private static string Base64Url(byte[] b) => Convert.ToBase64String(b).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}

public class ApiKeyHandler : AuthenticationHandler<AuthenticationSchemeOptions>
{
    private readonly AppDbContext _db;

    public ApiKeyHandler(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder, AppDbContext db) : base(options, logger, encoder) => _db = db;

    protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (!Request.Headers.TryGetValue(ApiKeyAuth.Header, out var header)) return AuthenticateResult.NoResult();
        if (!ApiKeyAuth.TryParse(header.ToString(), out var prefix, out var secret)) return AuthenticateResult.Fail("Invalid key.");

        var key = await _db.IntegrationKeys.IgnoreQueryFilters().FirstOrDefaultAsync(k => k.Prefix == prefix && k.DeletedAt == null);
        var expected = key?.KeyHash ?? new string('0', 64); // compare against a dummy when unknown, so timing does not reveal which prefixes exist
        var ok = CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(ApiKeyAuth.Hash(secret)), Encoding.ASCII.GetBytes(expected));
        if (key is null || !ok || key.RevokedAt != null) return AuthenticateResult.Fail("Invalid key.");

        var tenant = await _db.Tenants.AsNoTracking().FirstOrDefaultAsync(t => t.Id == key.TenantId);
        if (tenant is null || !tenant.IsActive) return AuthenticateResult.Fail("Invalid key.");

        if (key.LastUsedAt is null || DateTime.UtcNow - key.LastUsedAt > TimeSpan.FromMinutes(1))
        {
            key.LastUsedAt = DateTime.UtcNow; // not audited: it would write a row on every call
            await _db.SaveChangesAsync();
        }

        var identity = new ClaimsIdentity(new[]
        {
            new Claim(AppClaims.Tenant, key.TenantId.ToString()), new Claim(AppClaims.User, key.Id.ToString()),
            new Claim(ClaimTypes.Role, ApiKeyAuth.Role), new Claim(ClaimTypes.Name, $"key:{key.Name}"),
        }, ApiKeyAuth.AuthType, ClaimTypes.Name, ClaimTypes.Role);
        return AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), ApiKeyAuth.Scheme));
    }
}
