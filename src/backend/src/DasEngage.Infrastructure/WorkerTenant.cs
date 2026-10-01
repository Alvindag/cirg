using DasEngage.Domain;

namespace DasEngage.Infrastructure;

/// <summary>Identity for background work that acts for one tenant (there is no HTTP request to take it from).</summary>
public class WorkerTenant : ICurrentUser
{
    public WorkerTenant(Guid tenantId, Guid? userId = null) { TenantId = tenantId; UserId = userId; }
    public Guid TenantId { get; }
    public Guid? UserId { get; }
    public UserRole? Role => null;
}
