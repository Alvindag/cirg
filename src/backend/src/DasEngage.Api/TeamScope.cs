using DasEngage.Domain;
using DasEngage.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace DasEngage.Api;

/// <summary>
/// Resolves which users and territories the caller may see, from the manager hierarchy (AppUser.ManagerId).
/// Reps: themselves. Area/Regional managers: themselves plus all direct and indirect reports.
/// National sales manager, executive, admin, marketing, KAM: whole tenant (null = unrestricted).
/// </summary>
public class TeamScope
{
    private readonly AppDbContext _db;
    private readonly HttpCurrentUser _u;
    private Guid[]? _users;
    private Guid[]? _territories;
    private bool _usersLoaded, _territoriesLoaded;

    public TeamScope(AppDbContext db, HttpCurrentUser u) { _db = db; _u = u; }

    public bool IsRestricted => _u.Role is UserRole.Rep or UserRole.AreaManager or UserRole.RegionalManager;

    /// <summary>Null means unrestricted.</summary>
    public async Task<Guid[]?> VisibleUserIds()
    {
        if (_usersLoaded) return _users;
        _usersLoaded = true;
        if (!IsRestricted) return _users = null;
        var self = _u.UserId ?? Guid.Empty;
        if (_u.Role == UserRole.Rep) return _users = new[] { self };
        return _users = await Subtree(_db, self);
    }

    public async Task<Guid[]?> VisibleTerritoryIds()
    {
        if (_territoriesLoaded) return _territories;
        _territoriesLoaded = true;
        if (!IsRestricted) return _territories = null;
        if (_u.Role == UserRole.Rep)
            return _territories = _u.TerritoryId is { } t ? new[] { t } : Array.Empty<Guid>();
        var ids = (await VisibleUserIds())!;
        var terrs = await _db.Users.AsNoTracking().Where(x => ids.Contains(x.Id) && x.TerritoryId != null)
            .Select(x => x.TerritoryId!.Value).ToListAsync();
        if (_u.TerritoryId is { } own) terrs.Add(own);
        return _territories = terrs.Distinct().ToArray();
    }

    /// <summary>The user plus every direct/indirect report. Tolerates cycles in bad data.</summary>
    public static async Task<Guid[]> Subtree(AppDbContext db, Guid root)
    {
        var edges = await db.Users.AsNoTracking().Where(x => x.ManagerId != null)
            .Select(x => new { x.Id, ManagerId = x.ManagerId!.Value }).ToListAsync();
        var children = edges.ToLookup(e => e.ManagerId, e => e.Id);
        var seen = new HashSet<Guid> { root };
        var queue = new Queue<Guid>();
        queue.Enqueue(root);
        while (queue.Count > 0)
            foreach (var c in children[queue.Dequeue()])
                if (seen.Add(c)) queue.Enqueue(c);
        return seen.ToArray();
    }
}
