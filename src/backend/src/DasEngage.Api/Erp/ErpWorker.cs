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

    public async Task RunOnce(CancellationToken ct)
    {
        using var scope = _services.CreateScope();
        var options = scope.ServiceProvider.GetRequiredService<DbContextOptions<AppDbContext>>();
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
