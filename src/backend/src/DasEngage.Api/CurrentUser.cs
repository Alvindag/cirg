using System.Security.Claims;
using DasEngage.Domain;
using DasEngage.Infrastructure;

namespace DasEngage.Api;

/// <summary>Reads tenant/user/role from the validated JWT. Claims (das_tid, das_uid, das_terr, role) are added by AppClaimsTransformation from the database.</summary>
public class HttpCurrentUser : ICurrentUser
{
    private readonly IHttpContextAccessor _http;
    public HttpCurrentUser(IHttpContextAccessor http) => _http = http;

    private ClaimsPrincipal? P => _http.HttpContext?.User;

    public Guid TenantId => Guid.TryParse(P?.FindFirstValue(AppClaims.Tenant), out var t) ? t : Guid.Empty;
    public Guid? UserId => Guid.TryParse(P?.FindFirstValue(AppClaims.User), out var u) ? u : null;
    public Guid? TerritoryId => Guid.TryParse(P?.FindFirstValue(AppClaims.Territory), out var t) ? t : null;
    public UserRole? Role => Enum.TryParse<UserRole>(P?.FindFirstValue(ClaimTypes.Role), out var r) ? r : null;
    public bool IsRep => Role == UserRole.Rep;
}
