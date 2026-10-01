using DasEngage.Domain;

namespace DasEngage.Infrastructure;

public interface ICurrentUser
{
    Guid TenantId { get; }
    Guid? UserId { get; }
    UserRole? Role { get; }
}
