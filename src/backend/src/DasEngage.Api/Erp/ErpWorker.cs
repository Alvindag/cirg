using DasEngage.Domain;
using DasEngage.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace DasEngage.Api.Erp;

/// <summary>Runs in the background: every half minute it delivers waiting messages and pulls from each connected ERP when it is due.</summary>
public class ErpWorker : BackgroundService
{
    private readonly IServiceProvider _services;
    private readonly ILogger<ErpWorker> _log;
    private readonly IConfiguration _config;

    public ErpWorker(IServiceProvider services, ILogger<ErpWorker> log, IConfiguration config) { _services = services; _log = log; _config = config; }

    protected override async Task ExecuteAsync(CancellationToken stop)
    {
        if (!_config.GetValue("Erp:Worker:Enabled", true)) return;
        var every = TimeSpan.FromSeconds(Math.Max(5, _config.GetValue("Erp:Worker:IntervalSeconds", 30)));
        while (!stop.IsCancellationRequested)
        {
            try { await RunOnce(stop); }
            catch (Exception e) when (e is not OperationCanceledException) { _log.LogError(e, "ERP worker pass failed"); }
            try { await Task.Delay(every, stop); } catch (OperationCanceledException) { }
        }
    }

    /// <summary>Arbitrary but fixed number identifying the ERP worker's advisory lock in PostgreSQL.</summary>
    public const long LockKey = 727_001_001;

    /// <summary>
    /// One pass for every connected tenant. With several API instances running, only the one that gets the PostgreSQL advisory lock does the work,
    /// so messages are not delivered twice and the ERP is not polled by every instance. The lock is released when the pass ends (or the instance dies).
    /// Returns false when another instance holds it.
    /// </summary>
    public async Task<bool> RunOnce(CancellationToken ct)
    {
        using var scope = _services.CreateScope();
        var options = scope.ServiceProvider.GetRequiredService<DbContextOptions<AppDbContext>>();
        await using var lockDb = new AppDbContext(options, new WorkerTenant(Guid.Empty));
        System.Data.Common.DbConnection? connection = null;
        if (lockDb.Database.IsNpgsql())
        {
            connection = lockDb.Database.GetDbConnection();
            await connection.OpenAsync(ct);
            await using var cmd = connection.CreateCommand();
            cmd.CommandText = $"SELECT pg_try_advisory_lock({LockKey})";
            if (!(bool)(await cmd.ExecuteScalarAsync(ct))!) { await connection.CloseAsync(); return false; }
        }
        try { await Pass(scope, options, ct); return true; }
        finally
        {
            if (connection != null)
            {
                await using var unlock = connection.CreateCommand();
                unlock.CommandText = $"SELECT pg_advisory_unlock({LockKey})";
                await unlock.ExecuteScalarAsync(CancellationToken.None);
                await connection.CloseAsync();
            }
        }
    }

    private async Task Pass(IServiceScope scope, DbContextOptions<AppDbContext> options, CancellationToken ct)
    {
        List<Guid> tenants;
        await using (var any = new AppDbContext(options, new WorkerTenant(Guid.Empty)))
            tenants = await any.ErpConnections.IgnoreQueryFilters().Where(c => c.Enabled && c.DeletedAt == null).Select(c => c.TenantId).Distinct().ToListAsync(ct);

        var connector = scope.ServiceProvider.GetRequiredService<IErpConnector>();
        foreach (var tenant in tenants)
        {
            ct.ThrowIfCancellationRequested();
            try
            {
                var user = new WorkerTenant(tenant);
                await using var db = new AppDbContext(options, user);
                var samples = new SampleService(db, new ErpOutbox(db));
                var sync = new ErpSync(db, connector, new ErpImporter(db, user, samples));
                await sync.DispatchOutbox(50, ct);
                await sync.Pull(false, ct);
            }
            catch (Exception e) when (e is not OperationCanceledException) { _log.LogError(e, "ERP sync failed for tenant {Tenant}", tenant); }
        }
    }
}
