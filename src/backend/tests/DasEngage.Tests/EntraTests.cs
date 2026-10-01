using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using DasEngage.Api;
using DasEngage.Domain;
using DasEngage.Infrastructure;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;

namespace DasEngage.Tests;

/// <summary>
/// Runs the API in its production auth mode (no dev signing key, Entra-style v2 tokens, multi-tenant issuer rules).
/// Only the signing key is swapped for a local one, since we cannot reach Entra here.
/// </summary>
public class EntraFactory : WebApplicationFactory<Program>
{
    public static readonly SymmetricSecurityKey Key = new(Encoding.UTF8.GetBytes("entra-test-signing-key-0123456789abcdef-0123456789"));
    public const string Audience = "api://das-engage-test";
    private readonly string _db = Guid.NewGuid().ToString();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.ConfigureAppConfiguration((_, c) => c.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Auth:Authority"] = "https://login.microsoftonline.com/organizations/v2.0",
            ["Auth:MultiTenant"] = "true",
            ["Auth:ValidAudiences:0"] = Audience,
            ["Auth:RequiredScope"] = "access_as_user",
            ["Auth:UserCacheSeconds"] = "0",
            ["ConnectionStrings:Default"] = "Host=unused",
        }));
        builder.ConfigureServices(s =>
        {
            s.RemoveAll<DbContextOptions<AppDbContext>>();
            s.RemoveAll<DbContextOptions>();
            s.AddDbContext<AppDbContext>(o => o.UseInMemoryDatabase(_db));
            s.Configure<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme, o =>
            {
                o.Configuration = new OpenIdConnectConfiguration(); // no metadata download
                o.TokenValidationParameters.IssuerSigningKey = Key;
            });
        });
    }

    public async Task<Guid> Provision(string entraTenant, string adminOid, string name = "Acme Pharma")
    {
        using var scope = Services.CreateScope();
        return await Provisioning.CreateTenant(scope.ServiceProvider.GetRequiredService<DbContextOptions<AppDbContext>>(),
            name, entraTenant, adminOid, "Admin User", "admin@acme.test");
    }

    public HttpClient Client(string tid, string oid, string scope = "access_as_user", string? audience = null, string? issuerTid = null,
        IEnumerable<Claim>? extra = null)
    {
        var claims = new List<Claim> { new("tid", tid), new("oid", oid), new("name", "Someone") };
        if (scope != "") claims.Add(new Claim("scp", scope));
        if (extra != null) claims.AddRange(extra);
        var token = new JwtSecurityTokenHandler().WriteToken(new JwtSecurityToken(
            issuer: $"https://login.microsoftonline.com/{issuerTid ?? tid}/v2.0", audience: audience ?? Audience,
            claims: claims, expires: DateTime.UtcNow.AddHours(1),
            signingCredentials: new SigningCredentials(Key, SecurityAlgorithms.HmacSha256)));
        var c = CreateClient();
        c.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return c;
    }
}

public class EntraTests : IClassFixture<EntraFactory>
{
    private readonly EntraFactory _f;
    public EntraTests(EntraFactory f) => _f = f;

    private static string NewId() => Guid.NewGuid().ToString();

    [Fact]
    public async Task Unprovisioned_tenant_and_user_are_refused()
    {
        var tid = NewId();
        Assert.Equal(HttpStatusCode.Forbidden, (await _f.Client(tid, NewId()).GetAsync("/api/v1/me")).StatusCode); // unknown directory

        await _f.Provision(tid, NewId());
        Assert.Equal(HttpStatusCode.Forbidden, (await _f.Client(tid, NewId()).GetAsync("/api/v1/me")).StatusCode); // known directory, unknown user
    }

    [Fact]
    public async Task Provisioned_admin_signs_in_and_role_comes_from_the_database()
    {
        var tid = NewId(); var oid = NewId();
        var tenantId = await _f.Provision(tid, oid);
        var admin = _f.Client(tid, oid);

        var me = await admin.GetFromJsonAsync<JsonElement>("/api/v1/me");
        Assert.Equal("Admin", me.GetProperty("role").GetString());
        Assert.Equal(tenantId, me.GetProperty("tenantId").GetGuid());

        // admin creates a rep whose ExternalId is the rep's Entra object id
        var mgrOid = NewId(); var repOid = NewId();
        var mgr = Guid.NewGuid();
        (await admin.PostAsJsonAsync("/api/v1/admin/users", new UserDto(mgr, mgrOid, "Area Mgr", "m@acme.test", UserRole.AreaManager, null, null)))
            .EnsureSuccessStatusCode();
        // a manager must have a manager of higher rank for reps only; area manager root is allowed
        (await admin.PostAsJsonAsync("/api/v1/admin/users", new UserDto(null, repOid, "Rep", "r@acme.test", UserRole.Rep, mgr, null)))
            .EnsureSuccessStatusCode();

        // an Entra "roles" claim claiming Admin must not elevate the rep
        var rep = _f.Client(tid, repOid, extra: new[] { new Claim("roles", "Admin"), new Claim(ClaimTypes.Role, "Admin") });
        Assert.Equal("Rep", (await rep.GetFromJsonAsync<JsonElement>("/api/v1/me")).GetProperty("role").GetString());
        Assert.Equal(HttpStatusCode.Forbidden, (await rep.GetAsync("/api/v1/admin/users")).StatusCode);
    }

    [Fact]
    public async Task Application_claims_in_a_token_are_ignored()
    {
        var tidA = NewId(); var oidA = NewId(); var tidB = NewId(); var oidB = NewId();
        var a = await _f.Provision(tidA, oidA, "A");
        var b = await _f.Provision(tidB, oidB, "B");
        var bUser = (await _f.Client(tidB, oidB).GetFromJsonAsync<JsonElement>("/api/v1/me")).GetProperty("id").GetGuid();

        // tenant A's user tries to smuggle in tenant B's identity
        var spoof = _f.Client(tidA, oidA, extra: new[] { new Claim(AppClaims.Tenant, b.ToString()), new Claim(AppClaims.User, bUser.ToString()) });
        var me = await spoof.GetFromJsonAsync<JsonElement>("/api/v1/me");
        Assert.Equal(a, me.GetProperty("tenantId").GetGuid());
        Assert.NotEqual(bUser, me.GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task Tokens_are_rejected_for_wrong_scope_audience_or_issuer()
    {
        var tid = NewId(); var oid = NewId();
        await _f.Provision(tid, oid);
        Assert.Equal(HttpStatusCode.OK, (await _f.Client(tid, oid, scope: "other.scope access_as_user").GetAsync("/api/v1/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await _f.Client(tid, oid, scope: "other.scope").GetAsync("/api/v1/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await _f.Client(tid, oid, scope: "").GetAsync("/api/v1/me")).StatusCode); // app-only token
        Assert.Equal(HttpStatusCode.Unauthorized, (await _f.Client(tid, oid, audience: "api://someone-else").GetAsync("/api/v1/me")).StatusCode);
        // issuer of a different directory than the token's tid
        Assert.Equal(HttpStatusCode.Unauthorized, (await _f.Client(tid, oid, issuerTid: NewId()).GetAsync("/api/v1/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await _f.CreateClient().GetAsync("/api/v1/me")).StatusCode);
    }

    [Fact]
    public async Task Deactivated_users_lose_access_even_with_a_valid_token()
    {
        var tid = NewId(); var oid = NewId(); var repOid = NewId();
        await _f.Provision(tid, oid);
        var admin = _f.Client(tid, oid);
        var mgr = Guid.NewGuid(); var rep = Guid.NewGuid();
        (await admin.PostAsJsonAsync("/api/v1/admin/users", new UserDto(mgr, NewId(), "M", "m@x.test", UserRole.AreaManager, null, null))).EnsureSuccessStatusCode();
        (await admin.PostAsJsonAsync("/api/v1/admin/users", new UserDto(rep, repOid, "R", "r@x.test", UserRole.Rep, mgr, null))).EnsureSuccessStatusCode();

        var repClient = _f.Client(tid, repOid);
        Assert.Equal(HttpStatusCode.OK, (await repClient.GetAsync("/api/v1/me")).StatusCode);
        (await admin.PostAsync($"/api/v1/admin/users/{rep}/deactivate", null)).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Forbidden, (await repClient.GetAsync("/api/v1/me")).StatusCode);
    }

    [Fact]
    public async Task Provisioning_validates_input_and_refuses_duplicates()
    {
        var tid = NewId();
        await _f.Provision(tid, NewId());
        await Assert.ThrowsAsync<InvalidOperationException>(() => _f.Provision(tid, NewId()));
        await Assert.ThrowsAsync<ArgumentException>(() => _f.Provision("not-a-guid", NewId()));
        await Assert.ThrowsAsync<ArgumentException>(() => _f.Provision(NewId(), "not-a-guid"));
    }
}
