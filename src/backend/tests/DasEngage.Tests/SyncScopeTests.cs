using System.Net.Http.Json;
using System.Text.Json;
using DasEngage.Domain;

namespace DasEngage.Tests;

/// <summary>
/// A phone asks for what changed since its last sync. That is only enough while the person's scope stays the same: after a move to
/// another territory, the customers there changed long ago, so the phone must be sent everything again (once).
/// </summary>
public class SyncScopeTests : IClassFixture<ErpFactory>
{
    private readonly ErpFactory _f;
    public SyncScopeTests(ErpFactory f) => _f = f;

    private static async Task<JsonElement> Pull(HttpClient c, long since, string? scope = null) =>
        await c.GetFromJsonAsync<JsonElement>($"/api/v1/sync/pull?since={since}" + (scope is null ? "" : $"&scope={scope}"));
    private static string[] Names(JsonElement pull) => pull.GetProperty("customers").EnumerateArray().Select(c => c.GetProperty("name").GetString()!).OrderBy(n => n).ToArray();

    private async Task<(Guid Tenant, Guid Rep, Guid A, Guid B)> Setup()
    {
        var tenant = Guid.NewGuid(); var rep = Guid.NewGuid(); var a = Guid.NewGuid(); var b = Guid.NewGuid();
        await using var db = _f.Db(tenant);
        db.Tenants.Add(new Tenant { Id = tenant, Name = "T" + tenant });
        db.Territories.AddRange(new Territory { Id = a, Name = "A" }, new Territory { Id = b, Name = "B" });
        db.Customers.AddRange(
            new Customer { Name = "In A", Type = CustomerType.Pharmacy, TerritoryId = a },
            new Customer { Name = "In B 1", Type = CustomerType.Pharmacy, TerritoryId = b },
            new Customer { Name = "In B 2", Type = CustomerType.Hospital, TerritoryId = b });
        await db.SaveChangesAsync();
        return (tenant, rep, a, b);
    }

    [Fact]
    public async Task A_rep_moved_to_another_territory_gets_that_territorys_existing_customers_once()
    {
        var (tenant, rep, a, b) = await Setup();
        var inA = _f.ClientFor(tenant, rep, "Rep", a);
        var first = await Pull(inA, 0);
        Assert.Equal(new[] { "In A" }, Names(first));
        Assert.False(first.GetProperty("full").GetBoolean());
        var scopeA = first.GetProperty("scope").GetString()!;
        var cursor = first.GetProperty("cursor").GetInt64();
        Assert.Empty(Names(await Pull(inA, cursor, scopeA))); // nothing changed: nothing sent

        // the same person, now in territory B (a new token): the customers there changed before the cursor, but the phone must still get them
        var inB = _f.ClientFor(tenant, rep, "Rep", b);
        var moved = await Pull(inB, cursor, scopeA);
        Assert.True(moved.GetProperty("full").GetBoolean());
        Assert.Equal(new[] { "In B 1", "In B 2" }, Names(moved));
        var scopeB = moved.GetProperty("scope").GetString()!;
        Assert.NotEqual(scopeA, scopeB);

        // and only once: the next pull is a normal one again
        var next = await Pull(inB, moved.GetProperty("cursor").GetInt64(), scopeB);
        Assert.False(next.GetProperty("full").GetBoolean());
        Assert.Empty(Names(next));
    }

    [Fact]
    public async Task A_phone_that_has_no_scope_yet_is_sent_everything_once_and_older_apps_are_unchanged()
    {
        var (tenant, rep, _, b) = await Setup();
        var inB = _f.ClientFor(tenant, rep, "Rep", b);
        var future = DateTime.UtcNow.AddMinutes(5).Ticks; // a cursor from after every change, as the stuck phone had

        // an app from before scopes existed sends none: behaviour is as it was
        var old = await Pull(inB, future);
        Assert.Empty(Names(old));
        Assert.False(old.GetProperty("full").GetBoolean());

        // an updated app that has not stored a scope yet sends an empty one: it is caught up
        var caughtUp = await Pull(inB, future, "");
        Assert.True(caughtUp.GetProperty("full").GetBoolean());
        Assert.Equal(new[] { "In B 1", "In B 2" }, Names(caughtUp));
    }

    [Fact]
    public async Task Different_people_and_roles_have_different_scopes_and_a_bad_cursor_is_harmless()
    {
        var (tenant, rep, a, _) = await Setup();
        string Scope(JsonElement p) => p.GetProperty("scope").GetString()!;
        var s1 = Scope(await Pull(_f.ClientFor(tenant, rep, "Rep", a), 0));
        var s2 = Scope(await Pull(_f.ClientFor(tenant, Guid.NewGuid(), "Rep", a), 0));
        var s3 = Scope(await Pull(_f.ClientFor(tenant, rep, "AreaManager", a), 0));
        Assert.Equal(3, new[] { s1, s2, s3 }.Distinct().Count());
        Assert.Equal(s1, Scope(await Pull(_f.ClientFor(tenant, rep, "Rep", a), 0))); // stable

        var wild = await _f.ClientFor(tenant, rep, "Rep", a).GetAsync($"/api/v1/sync/pull?since={long.MaxValue}&scope={s1}"); // a cursor far beyond any date
        Assert.True(wild.IsSuccessStatusCode);
    }
}
