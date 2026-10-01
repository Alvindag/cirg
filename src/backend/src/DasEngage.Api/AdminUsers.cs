using DasEngage.Domain;
using DasEngage.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace DasEngage.Api;

public record UserDto(Guid? Id, string ExternalId, string FullName, string Email, UserRole Role, Guid? ManagerId,
    Guid? TerritoryId, bool IsActive = true);

public record TerritoryDto(Guid? Id, string Name, string? Region, string? District);

public static class AdminUsers
{
    private static readonly string[] Admins = { "Admin", "NationalSalesManager" };

    /// <summary>Reps report to area managers, area managers to regional managers, regional managers to the NSM.</summary>
    private static int Rank(UserRole r) => r switch
    {
        UserRole.Rep => 0, UserRole.AreaManager => 1, UserRole.RegionalManager => 2, UserRole.NationalSalesManager => 3, _ => -1,
    };

    public static void Map(RouteGroupBuilder api)
    {
        api.MapGet("/me", async (AppDbContext db, HttpCurrentUser u) =>
            await db.Users.AsNoTracking().FirstOrDefaultAsync(x => x.Id == u.UserId) is { } me ? Results.Ok(me) : Results.NotFound());

        MapTerritories(api.MapGroup("/admin/territories"));
        MapUsers(api.MapGroup("/admin/users"));
    }

    // ---------- Territories ----------
    private static void MapTerritories(RouteGroupBuilder g)
    {
        g.MapGet("/", async (AppDbContext db, TeamScope team) =>
        {
            var ids = await team.VisibleTerritoryIds();
            var q = db.Territories.AsNoTracking().AsQueryable();
            if (ids != null) q = q.Where(t => ids.Contains(t.Id));
            return Results.Ok(await q.OrderBy(t => t.Region).ThenBy(t => t.Name).ToListAsync());
        }).RequireAuthorization(p => p.RequireRole(Roles.Managers));

        g.MapPost("/", async (TerritoryDto d, AppDbContext db) =>
        {
            if (string.IsNullOrWhiteSpace(d.Name)) return Results.BadRequest("Name is required.");
            if (await db.Territories.AnyAsync(t => t.Name == d.Name.Trim()))
                return Results.Conflict("A territory with this name already exists.");
            var t = new Territory { Id = d.Id ?? Guid.NewGuid(), Name = d.Name.Trim(), Region = d.Region, District = d.District };
            db.Territories.Add(t);
            await db.SaveChangesAsync();
            return Results.Created($"/api/v1/admin/territories/{t.Id}", t);
        }).RequireAuthorization(p => p.RequireRole(Admins));

        g.MapPut("/{id:guid}", async (Guid id, TerritoryDto d, AppDbContext db) =>
        {
            var t = await db.Territories.FirstOrDefaultAsync(x => x.Id == id);
            if (t is null) return Results.NotFound();
            if (string.IsNullOrWhiteSpace(d.Name)) return Results.BadRequest("Name is required.");
            if (await db.Territories.AnyAsync(x => x.Id != id && x.Name == d.Name.Trim()))
                return Results.Conflict("A territory with this name already exists.");
            t.Name = d.Name.Trim(); t.Region = d.Region; t.District = d.District;
            await db.SaveChangesAsync();
            return Results.Ok(t);
        }).RequireAuthorization(p => p.RequireRole(Admins));

        g.MapDelete("/{id:guid}", async (Guid id, AppDbContext db) =>
        {
            var t = await db.Territories.FirstOrDefaultAsync(x => x.Id == id);
            if (t is null) return Results.NotFound();
            var users = await db.Users.CountAsync(x => x.TerritoryId == id);
            var customers = await db.Customers.CountAsync(x => x.TerritoryId == id);
            if (users + customers > 0)
                return Results.Conflict($"Territory is still assigned to {users} user(s) and {customers} customer(s); reassign them first.");
            t.DeletedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
            return Results.NoContent();
        }).RequireAuthorization(p => p.RequireRole(Admins));
    }

    // ---------- Users ----------
    private static void MapUsers(RouteGroupBuilder g)
    {
        // Managers see their own subtree; NSM/Executive/Admin see everyone.
        g.MapGet("/", async (AppDbContext db, TeamScope team, UserRole? role, Guid? managerId, bool includeInactive = false) =>
        {
            var ids = await team.VisibleUserIds();
            var q = db.Users.AsNoTracking().AsQueryable();
            if (ids != null) q = q.Where(x => ids.Contains(x.Id));
            if (role != null) q = q.Where(x => x.Role == role);
            if (managerId != null) q = q.Where(x => x.ManagerId == managerId);
            if (!includeInactive) q = q.Where(x => x.IsActive);
            return Results.Ok(await q.OrderBy(x => x.FullName).ToListAsync());
        }).RequireAuthorization(p => p.RequireRole(Roles.Managers));

        g.MapGet("/{id:guid}", async (Guid id, AppDbContext db, TeamScope team) =>
        {
            var ids = await team.VisibleUserIds();
            if (ids != null && !ids.Contains(id)) return Results.NotFound();
            return await db.Users.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id) is { } user ? Results.Ok(user) : Results.NotFound();
        }).RequireAuthorization(p => p.RequireRole(Roles.Managers));

        // Everyone below this user in the hierarchy (excluding the user).
        g.MapGet("/{id:guid}/team", async (Guid id, AppDbContext db, TeamScope team) =>
        {
            var visible = await team.VisibleUserIds();
            if (visible != null && !visible.Contains(id)) return Results.NotFound();
            var ids = await TeamScope.Subtree(db, id);
            var members = await db.Users.AsNoTracking().Where(x => ids.Contains(x.Id) && x.Id != id && x.IsActive)
                .OrderBy(x => x.FullName).ToListAsync();
            return Results.Ok(members);
        }).RequireAuthorization(p => p.RequireRole(Roles.Managers));

        g.MapPost("/", async (UserDto d, AppDbContext db) =>
        {
            if (await Validate(db, d, null) is { } error) return error;
            var user = new AppUser { Id = d.Id ?? Guid.NewGuid() };
            Apply(user, d);
            db.Users.Add(user);
            await db.SaveChangesAsync();
            return Results.Created($"/api/v1/admin/users/{user.Id}", user);
        }).RequireAuthorization(p => p.RequireRole(Admins));

        g.MapPut("/{id:guid}", async (Guid id, UserDto d, AppDbContext db) =>
        {
            var user = await db.Users.FirstOrDefaultAsync(x => x.Id == id);
            if (user is null) return Results.NotFound();
            if (await Validate(db, d, id) is { } error) return error;
            // Demoting a manager who still has reports would break the rank rule below them.
            if (Rank(d.Role) < Rank(user.Role) &&
                await db.Users.AnyAsync(x => x.ManagerId == id && x.IsActive))
                return Results.Conflict("User still has direct reports; reassign them before changing the role.");
            Apply(user, d);
            await db.SaveChangesAsync();
            return Results.Ok(user);
        }).RequireAuthorization(p => p.RequireRole(Admins));

        // Deactivate (soft delete). Direct reports must be handed to someone else.
        g.MapPost("/{id:guid}/deactivate", async (Guid id, AppDbContext db, Guid? reassignTo) =>
        {
            var user = await db.Users.FirstOrDefaultAsync(x => x.Id == id);
            if (user is null) return Results.NotFound();
            var reports = await db.Users.Where(x => x.ManagerId == id && x.IsActive).ToListAsync();
            if (reports.Count > 0)
            {
                if (reassignTo is null) return Results.Conflict($"User has {reports.Count} direct report(s); pass reassignTo.");
                if (reassignTo == id) return Results.BadRequest("Cannot reassign to the same user.");
                var target = await db.Users.FirstOrDefaultAsync(x => x.Id == reassignTo && x.IsActive);
                if (target is null) return Results.BadRequest("reassignTo user not found or inactive.");
                var targetSubtree = await TeamScope.Subtree(db, id);
                if (targetSubtree.Contains(target.Id)) return Results.BadRequest("Cannot reassign to someone in this user's own team.");
                foreach (var r in reports)
                {
                    if (Rank(r.Role) >= 0 && Rank(target.Role) <= Rank(r.Role))
                        return Results.BadRequest($"{target.FullName} is too junior to manage {r.FullName}.");
                    r.ManagerId = target.Id;
                }
            }
            user.IsActive = false;
            await db.SaveChangesAsync();
            return Results.Ok(user);
        }).RequireAuthorization(p => p.RequireRole(Admins));

        g.MapPost("/{id:guid}/reactivate", async (Guid id, AppDbContext db) =>
        {
            var user = await db.Users.FirstOrDefaultAsync(x => x.Id == id);
            if (user is null) return Results.NotFound();
            user.IsActive = true;
            await db.SaveChangesAsync();
            return Results.Ok(user);
        }).RequireAuthorization(p => p.RequireRole(Admins));
    }

    private static void Apply(AppUser u, UserDto d)
    {
        u.ExternalId = d.ExternalId.Trim(); u.FullName = d.FullName.Trim(); u.Email = d.Email.Trim();
        u.Role = d.Role; u.ManagerId = d.ManagerId; u.TerritoryId = d.TerritoryId; u.IsActive = d.IsActive;
    }

    /// <summary>Returns an error result, or null when the user is valid.</summary>
    private static async Task<IResult?> Validate(AppDbContext db, UserDto d, Guid? existingId)
    {
        if (string.IsNullOrWhiteSpace(d.ExternalId) || string.IsNullOrWhiteSpace(d.FullName) || string.IsNullOrWhiteSpace(d.Email))
            return Results.BadRequest("ExternalId, FullName and Email are required.");
        if (!Enum.IsDefined(d.Role)) return Results.BadRequest("Unknown role.");
        if (await db.Users.AnyAsync(x => x.ExternalId == d.ExternalId.Trim() && x.Id != existingId))
            return Results.Conflict("A user with this ExternalId already exists.");
        if (d.TerritoryId != null && !await db.Territories.AnyAsync(t => t.Id == d.TerritoryId))
            return Results.BadRequest("Territory not found.");

        if (d.ManagerId is { } mid)
        {
            if (mid == existingId) return Results.BadRequest("A user cannot be their own manager.");
            var manager = await db.Users.AsNoTracking().FirstOrDefaultAsync(x => x.Id == mid && x.IsActive);
            if (manager is null) return Results.BadRequest("Manager not found or inactive.");
            if (Rank(manager.Role) < 1 && manager.Role is not (UserRole.Executive or UserRole.Admin))
                return Results.BadRequest("Manager must be an area, regional or national manager.");
            if (Rank(d.Role) >= 0 && Rank(manager.Role) <= Rank(d.Role))
                return Results.BadRequest($"A {d.Role} must report to a more senior manager than {manager.Role}.");
            // No cycles: the proposed manager must not be inside this user's own subtree.
            if (existingId is { } uid && (await TeamScope.Subtree(db, uid)).Contains(mid))
                return Results.BadRequest("This would create a reporting cycle.");
        }
        else if (d.Role == UserRole.Rep)
            return Results.BadRequest("A rep must have a manager.");
        return null;
    }
}
