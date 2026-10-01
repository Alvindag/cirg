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

public class ApiFactory : WebApplicationFactory<Program>
{
    public const string Key = "test-signing-key-0123456789abcdef-0123456789";
    private readonly string _db = Guid.NewGuid().ToString();

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
            s.RemoveAll<DbContextOptions<AppDbContext>>();
            s.RemoveAll<DbContextOptions>();
            s.AddDbContext<AppDbContext>(o => o.UseInMemoryDatabase(_db));
        });
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
