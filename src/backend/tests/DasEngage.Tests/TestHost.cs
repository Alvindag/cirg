using System.IdentityModel.Tokens.Jwt;
using System.Net.Http.Headers;
using System.Security.Claims;
using System.Text;
using DasEngage.Infrastructure;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.IdentityModel.Tokens;

namespace DasEngage.Tests;

/// <summary>
/// Picks the database for a test host. By default tests run on the fast in-memory provider; with TEST_POSTGRES set
/// (for example "Host=localhost;Username=postgres;Password=postgres") every host gets its own real PostgreSQL database,
/// created by the EF migrations. CI runs the whole suite both ways, so migrations and PostgreSQL query translation are tested too.
/// </summary>
public static class TestDb
{
    public static string? Postgres => Environment.GetEnvironmentVariable("TEST_POSTGRES");

    public static string Use(IServiceCollection s)
    {
        var name = Guid.NewGuid().ToString("N");
        s.RemoveAll<DbContextOptions<AppDbContext>>();
        s.RemoveAll<DbContextOptions>();
        if (Postgres is null)
        {
            s.AddDbContext<AppDbContext>(o => o.UseInMemoryDatabase(name));
            return name;
        }
        var connection = $"{Postgres};Database=das_test_{name}";
        var options = new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(connection, n => n.MigrationsAssembly("DasEngage.Infrastructure")).Options;
        using (var db = new AppDbContext(options, new WorkerTenant(Guid.Empty))) db.Database.Migrate();
        s.AddDbContext<AppDbContext>(o => o.UseNpgsql(connection, n => n.MigrationsAssembly("DasEngage.Infrastructure")));
        return connection;
    }

    public static void Drop(string? connection)
    {
        if (Postgres is null || connection is null || !connection.Contains("Database=")) return;
        var name = connection[(connection.IndexOf("Database=", StringComparison.Ordinal) + 9)..];
        Npgsql.NpgsqlConnection.ClearAllPools();
        using var admin = new Npgsql.NpgsqlConnection($"{Postgres};Database=postgres");
        admin.Open();
        using var cmd = admin.CreateCommand();
        cmd.CommandText = $"DROP DATABASE IF EXISTS \"{name}\" WITH (FORCE)";
        cmd.ExecuteNonQuery();
    }
}

public class MemoryBlobStore : IBlobStore
{
    private readonly System.Collections.Concurrent.ConcurrentDictionary<string, byte[]> _files = new();
    public async Task PutAsync(string key, Stream content, string contentType, CancellationToken ct = default)
    {
        using var ms = new MemoryStream();
        await content.CopyToAsync(ms, ct);
        _files[key] = ms.ToArray();
    }
    public Task<Stream?> OpenReadAsync(string key, CancellationToken ct = default) =>
        Task.FromResult<Stream?>(_files.TryGetValue(key, out var b) ? new MemoryStream(b) : null);
}

public class ApiFactory : WebApplicationFactory<Program>
{
    public const string Key = "test-signing-key-0123456789abcdef-0123456789";
    private string? _db;

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.ConfigureAppConfiguration((_, c) => c.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Auth:DevSigningKey"] = Key,
            ["ConnectionStrings:Default"] = "Host=unused",
        }));
        builder.ConfigureServices(s =>
        {
            _db = TestDb.Use(s);
            s.RemoveAll<IBlobStore>();
            s.AddSingleton<IBlobStore>(new MemoryBlobStore());
        });
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (disposing) TestDb.Drop(_db);
    }

    public HttpClient ClientFor(Guid tenant, Guid user, string role, Guid? territory = null)
    {
        var claims = new List<Claim> { new("das_tid", tenant.ToString()), new("das_uid", user.ToString()), new(ClaimTypes.Role, role) };
        if (territory != null) claims.Add(new("das_terr", territory.ToString()!));
        var token = new JwtSecurityTokenHandler().WriteToken(new JwtSecurityToken(
            claims: claims, expires: DateTime.UtcNow.AddHours(1),
            signingCredentials: new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(Key)), SecurityAlgorithms.HmacSha256)));
        var c = CreateClient();
        c.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return c;
    }
}
