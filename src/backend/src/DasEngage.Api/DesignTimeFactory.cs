using DasEngage.Domain;
using DasEngage.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace DasEngage.Api;

/// <summary>Used only by `dotnet ef` to build the model without a running database.</summary>
public class DesignTimeFactory : IDesignTimeDbContextFactory<AppDbContext>
{
    private class NoUser : ICurrentUser
    {
        public Guid TenantId => Guid.Empty;
        public Guid? UserId => null;
        public UserRole? Role => null;
    }

    public AppDbContext CreateDbContext(string[] args) =>
        new(new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql("Host=localhost;Database=das_engage", o => o.MigrationsAssembly("DasEngage.Infrastructure")).Options, new NoUser());
}
