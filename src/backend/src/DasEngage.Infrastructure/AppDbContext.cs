using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using DasEngage.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;

namespace DasEngage.Infrastructure;

public class AppDbContext : DbContext
{
    private readonly ICurrentUser _current;

    public AppDbContext(DbContextOptions<AppDbContext> options, ICurrentUser current) : base(options)
        => _current = current;

    // Evaluated per query by EF global filters.
    private Guid CurrentTenantId => _current.TenantId;

    public DbSet<Tenant> Tenants => Set<Tenant>();
    public DbSet<Territory> Territories => Set<Territory>();
    public DbSet<AppUser> Users => Set<AppUser>();
    public DbSet<Product> Products => Set<Product>();
    public DbSet<Customer> Customers => Set<Customer>();
    public DbSet<CustomerProductInterest> CustomerProductInterests => Set<CustomerProductInterest>();
    public DbSet<PlannedVisit> PlannedVisits => Set<PlannedVisit>();
    public DbSet<Visit> Visits => Set<Visit>();
    public DbSet<CallReport> CallReports => Set<CallReport>();
    public DbSet<CallReportProduct> CallReportProducts => Set<CallReportProduct>();
    public DbSet<FollowUpTask> Tasks => Set<FollowUpTask>();
    public DbSet<GpsPing> GpsPings => Set<GpsPing>();
    public DbSet<Attachment> Attachments => Set<Attachment>();
    public DbSet<SampleBatch> SampleBatches => Set<SampleBatch>();
    public DbSet<StockMovement> StockMovements => Set<StockMovement>();
    public DbSet<SampleRequest> SampleRequests => Set<SampleRequest>();
    public DbSet<SampleDistribution> SampleDistributions => Set<SampleDistribution>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<Customer>().HasMany(c => c.ProductInterests).WithOne().HasForeignKey(p => p.CustomerId);
        b.Entity<CallReport>().HasMany(c => c.Products).WithOne().HasForeignKey(p => p.CallReportId);

        b.Entity<Customer>().HasIndex(x => new { x.TenantId, x.TerritoryId });
        b.Entity<Customer>().HasIndex(x => new { x.TenantId, x.UpdatedAt });
        b.Entity<PlannedVisit>().HasIndex(x => new { x.TenantId, x.RepId, x.PlannedDate });
        b.Entity<Visit>().HasIndex(x => new { x.TenantId, x.RepId, x.CheckInAt });
        b.Entity<CallReport>().HasIndex(x => new { x.TenantId, x.UpdatedAt });
        b.Entity<GpsPing>().HasIndex(x => new { x.TenantId, x.RepId, x.RecordedAt });
        b.Entity<Attachment>().HasIndex(x => new { x.TenantId, x.VisitId });
        b.Entity<SampleBatch>().HasIndex(x => new { x.TenantId, x.ProductId, x.BatchNumber }).IsUnique();
        b.Entity<StockMovement>().HasIndex(x => new { x.TenantId, x.BatchId, x.HolderId });
        b.Entity<SampleRequest>().HasIndex(x => new { x.TenantId, x.RepId, x.Status });
        b.Entity<SampleDistribution>().HasIndex(x => new { x.TenantId, x.RepId, x.DistributedAt });
        b.Entity<SampleDistribution>().HasIndex(x => new { x.TenantId, x.BatchId });
        b.Entity<AppUser>().HasIndex(x => new { x.TenantId, x.ExternalId }).IsUnique();
        b.Entity<Tenant>().HasIndex(x => x.ExternalTenantId).IsUnique();
        b.Entity<AuditLog>().HasIndex(x => new { x.TenantId, x.Id });

        // Tenant isolation + soft delete on every tenant-owned entity.
        // (Add PostgreSQL Row-Level Security as defence in depth in a migration.)
        b.Entity<Territory>().HasQueryFilter(e => e.TenantId == CurrentTenantId && e.DeletedAt == null);
        b.Entity<AppUser>().HasQueryFilter(e => e.TenantId == CurrentTenantId && e.DeletedAt == null);
        b.Entity<Product>().HasQueryFilter(e => e.TenantId == CurrentTenantId && e.DeletedAt == null);
        b.Entity<Customer>().HasQueryFilter(e => e.TenantId == CurrentTenantId && e.DeletedAt == null);
        b.Entity<CustomerProductInterest>().HasQueryFilter(e => e.TenantId == CurrentTenantId && e.DeletedAt == null);
        b.Entity<PlannedVisit>().HasQueryFilter(e => e.TenantId == CurrentTenantId && e.DeletedAt == null);
        b.Entity<Visit>().HasQueryFilter(e => e.TenantId == CurrentTenantId && e.DeletedAt == null);
        b.Entity<CallReport>().HasQueryFilter(e => e.TenantId == CurrentTenantId && e.DeletedAt == null);
        b.Entity<CallReportProduct>().HasQueryFilter(e => e.TenantId == CurrentTenantId && e.DeletedAt == null);
        b.Entity<FollowUpTask>().HasQueryFilter(e => e.TenantId == CurrentTenantId && e.DeletedAt == null);
        b.Entity<GpsPing>().HasQueryFilter(e => e.TenantId == CurrentTenantId && e.DeletedAt == null);
        b.Entity<Attachment>().HasQueryFilter(e => e.TenantId == CurrentTenantId && e.DeletedAt == null);
        b.Entity<SampleBatch>().HasQueryFilter(e => e.TenantId == CurrentTenantId && e.DeletedAt == null);
        b.Entity<StockMovement>().HasQueryFilter(e => e.TenantId == CurrentTenantId && e.DeletedAt == null);
        b.Entity<SampleRequest>().HasQueryFilter(e => e.TenantId == CurrentTenantId && e.DeletedAt == null);
        b.Entity<SampleDistribution>().HasQueryFilter(e => e.TenantId == CurrentTenantId && e.DeletedAt == null);
        b.Entity<AuditLog>().HasQueryFilter(e => e.TenantId == CurrentTenantId);
    }

    public override async Task<int> SaveChangesAsync(CancellationToken ct = default)
    {
        var now = DateTime.UtcNow;
        var audits = new List<(string Action, string Type, Guid Id, string? Changes)>();

        foreach (var e in ChangeTracker.Entries<StockMovement>())
            if (e.State is EntityState.Modified or EntityState.Deleted)
                throw new InvalidOperationException("Stock movements are immutable; record a correcting movement instead.");

        foreach (var e in ChangeTracker.Entries<TenantEntity>().ToList())
        {
            if (e.State == EntityState.Added)
            {
                if (e.Entity.TenantId == Guid.Empty) e.Entity.TenantId = _current.TenantId;
                if (e.Entity.TenantId != _current.TenantId)
                    throw new InvalidOperationException("Cross-tenant write rejected.");
                e.Entity.CreatedAt = now;
                e.Entity.CreatedBy = _current.UserId;
                e.Entity.UpdatedAt = now;
                e.Entity.UpdatedBy = _current.UserId;
                audits.Add(("create", e.Entity.GetType().Name, e.Entity.Id, null));
            }
            else if (e.State == EntityState.Modified)
            {
                e.Entity.UpdatedAt = now;
                e.Entity.UpdatedBy = _current.UserId;
                e.Property(x => x.TenantId).IsModified = false;
                e.Property(x => x.CreatedAt).IsModified = false;
                var action = e.Entity.DeletedAt != null ? "delete" : "update";
                audits.Add((action, e.Entity.GetType().Name, e.Entity.Id, ChangedFields(e)));
            }
        }

        if (audits.Count > 0)
        {
            var prev = await AuditLogs.IgnoreQueryFilters()
                .Where(a => a.TenantId == _current.TenantId)
                .OrderByDescending(a => a.Id).Select(a => a.Hash).FirstOrDefaultAsync(ct);
            foreach (var a in audits)
            {
                var entry = new AuditLog
                {
                    TenantId = _current.TenantId, UserId = _current.UserId, At = now,
                    Action = a.Action, EntityType = a.Type, EntityId = a.Id, Changes = a.Changes, PrevHash = prev,
                };
                entry.Hash = Hash(entry);
                prev = entry.Hash;
                AuditLogs.Add(entry);
            }
        }

        return await base.SaveChangesAsync(ct);
    }

    private static string? ChangedFields(EntityEntry e)
    {
        var d = e.Properties.Where(p => p.IsModified && p.Metadata.Name is not ("UpdatedAt" or "UpdatedBy"))
            .ToDictionary(p => p.Metadata.Name, p => new { from = p.OriginalValue, to = p.CurrentValue });
        return d.Count == 0 ? null : JsonSerializer.Serialize(d);
    }

    private static string Hash(AuditLog a)
    {
        var s = $"{a.PrevHash}|{a.TenantId}|{a.UserId}|{a.At:O}|{a.Action}|{a.EntityType}|{a.EntityId}|{a.Changes}";
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(s)));
    }
}
