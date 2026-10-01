using System.Security.Claims;
using DasEngage.Domain;
using DasEngage.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace DasEngage.Api;

/// <summary>Claims added by the API itself after it resolves the caller from the database. Never trusted from a token.</summary>
public static class AppClaims
{
    public const string Prefix = "das_";
    public const string Tenant = "das_tid";
    public const string User = "das_uid";
    public const string Territory = "das_terr";
    public const string Resolved = "das_resolved";
}

/// <summary>
/// Turns a validated Entra ID token into the application identity.
/// Entra tenant (tid) -> our Tenant (Tenant.ExternalTenantId); Entra object id (oid) -> AppUser.ExternalId.
/// Role, territory and active status always come from our database (cached for Auth:UserCacheSeconds, default 60), so deactivating a user takes effect within a minute
/// even though their token is still valid. Unknown or inactive users get no application claims and are refused (403).
/// </summary>
public class AppClaimsTransformation : IClaimsTransformation
{
    private readonly AppDbContext _db;
    private readonly IMemoryCache _cache;
    private readonly bool _dev;
    private readonly int _cacheSeconds;

    public AppClaimsTransformation(AppDbContext db, IMemoryCache cache, IConfiguration cfg)
    {
        _db = db; _cache = cache;
        _dev = !string.IsNullOrEmpty(cfg["Auth:DevSigningKey"]);
        _cacheSeconds = cfg.GetValue("Auth:UserCacheSeconds", 60);
    }

    public async Task<ClaimsPrincipal> TransformAsync(ClaimsPrincipal principal)
    {
        if (principal.Identity?.IsAuthenticated != true || principal.HasClaim(c => c.Type == AppClaims.Resolved)) return principal;
        // Development/test tokens carry the application claims directly.
        if (_dev && principal.HasClaim(c => c.Type == AppClaims.Tenant)) return principal;

        // Never accept application or role claims from a token: identity, tenant and roles come from our database only.
        foreach (var id in principal.Identities)
            foreach (var c in id.Claims.Where(c => c.Type.StartsWith(AppClaims.Prefix, StringComparison.Ordinal) ||
                                                   c.Type is ClaimTypes.Role or "role" or "roles").ToList())
                id.RemoveClaim(c);

        var resolved = new ClaimsIdentity();
        resolved.AddClaim(new Claim(AppClaims.Resolved, "1"));

        var tid = principal.FindFirstValue("tid");
        var oid = principal.FindFirstValue("oid");
        if (!string.IsNullOrEmpty(tid) && !string.IsNullOrEmpty(oid))
        {
            var user = _cacheSeconds <= 0
                ? await Lookup(tid, oid)
                : await _cache.GetOrCreateAsync($"appuser:{tid}:{oid}", async entry =>
                {
                    entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromSeconds(_cacheSeconds);
                    return await Lookup(tid, oid);
                });
            if (user != null)
            {
                resolved.AddClaim(new Claim(AppClaims.Tenant, user.TenantId.ToString()));
                resolved.AddClaim(new Claim(AppClaims.User, user.Id.ToString()));
                resolved.AddClaim(new Claim(ClaimTypes.Role, user.Role.ToString()));
                if (user.TerritoryId is { } t) resolved.AddClaim(new Claim(AppClaims.Territory, t.ToString()));
            }
        }
        principal.AddIdentity(resolved);
        return principal;
    }

    private async Task<AppUser?> Lookup(string entraTenantId, string objectId)
    {
        var tenant = await _db.Tenants.AsNoTracking().FirstOrDefaultAsync(t => t.ExternalTenantId == entraTenantId && t.IsActive);
        if (tenant is null) return null;
        return await _db.Users.IgnoreQueryFilters().AsNoTracking()
            .FirstOrDefaultAsync(u => u.TenantId == tenant.Id && u.ExternalId == objectId && u.IsActive && u.DeletedAt == null);
    }
}

public static class EntraTokenRules
{
    /// <summary>
    /// For a multi-tenant SaaS the token may come from any customer directory, so the issuer cannot be a single fixed value.
    /// Require it to be the v2.0 issuer of the very tenant named in the token's own tid claim; whether that tenant is
    /// actually one of our customers is then decided by <see cref="AppClaimsTransformation"/>.
    /// </summary>
    public static string ValidateMultiTenantIssuer(string issuer, SecurityToken token, TokenValidationParameters parameters)
    {
        if (token is JsonWebToken jwt && jwt.TryGetPayloadValue<string>("tid", out var tid) && !string.IsNullOrEmpty(tid) &&
            Guid.TryParse(tid, out _) && issuer == $"https://login.microsoftonline.com/{tid}/v2.0")
            return issuer;
        throw new SecurityTokenInvalidIssuerException("Invalid issuer.") { InvalidIssuer = issuer };
    }

    /// <summary>The delegated-permission scope (scp claim) the app must have been granted; app-only tokens have none and are refused.</summary>
    public static bool HasScope(ClaimsPrincipal user, string requiredScope) =>
        (user.FindFirstValue("scp") ?? "").Split(' ', StringSplitOptions.RemoveEmptyEntries).Contains(requiredScope);
}

/// <summary>Creates a customer tenant and its first admin. Run once per customer: <c>dotnet DasEngage.Api.dll provision-tenant ...</c>.</summary>
public static class Provisioning
{
    public class NoTenant : ICurrentUser
    {
        public Guid TenantId => Guid.Empty;
        public Guid? UserId => null;
        public UserRole? Role => null;
    }

    private class FixedTenant : ICurrentUser
    {
        public FixedTenant(Guid t) => TenantId = t;
        public Guid TenantId { get; }
        public Guid? UserId => null;
        public UserRole? Role => null;
    }

    public static async Task<Guid> CreateTenant(DbContextOptions<AppDbContext> options, string name, string entraTenantId,
        string adminObjectId, string adminName, string adminEmail)
    {
        if (!Guid.TryParse(entraTenantId, out _)) throw new ArgumentException("Entra tenant id must be a GUID.");
        if (!Guid.TryParse(adminObjectId, out _)) throw new ArgumentException("Admin object id must be a GUID.");
        var tenant = new Tenant { Name = name, ExternalTenantId = entraTenantId.ToLowerInvariant() };
        await using var db = new AppDbContext(options, new FixedTenant(tenant.Id));
        if (await db.Tenants.AnyAsync(t => t.ExternalTenantId == tenant.ExternalTenantId))
            throw new InvalidOperationException("A tenant is already linked to this Entra tenant id.");
        db.Tenants.Add(tenant);
        db.Users.Add(new AppUser
        {
            TenantId = tenant.Id, ExternalId = adminObjectId.ToLowerInvariant(), FullName = adminName, Email = adminEmail, Role = UserRole.Admin,
        });
        await db.SaveChangesAsync();
        return tenant.Id;
    }
}
