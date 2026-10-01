using Microsoft.AspNetCore.RateLimiting;
using System.Security.Claims;
using System.Text;
using DasEngage.Api;
using DasEngage.Infrastructure;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddHttpContextAccessor();
// Enums as readable strings ('Doctor', 'Completed') for mobile and web clients; numbers are still accepted on input.
builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter()));
builder.Services.AddScoped<HttpCurrentUser>();
builder.Services.AddScoped<TeamScope>();
builder.Services.AddScoped<CustomerImporter>();
builder.Services.AddScoped<SampleService>();
builder.Services.AddScoped<ICurrentUser>(sp => sp.GetRequiredService<HttpCurrentUser>());

// Database: PostgreSQL by default; tests swap in the in-memory provider via ConfigureTestServices.
builder.Services.AddDbContext<AppDbContext>(o =>
    o.UseNpgsql(builder.Configuration.GetConnectionString("Default"), n => n.MigrationsAssembly("DasEngage.Infrastructure")));

// Auth: Microsoft Entra ID (OIDC access tokens, v2.0).
//   Auth:Authority       https://login.microsoftonline.com/<directory-id>/v2.0, or .../organizations/v2.0 with Auth:MultiTenant=true
//   Auth:ValidAudiences  API App ID URI and/or client id, e.g. ["api://das-engage-360", "<client-id>"]
//   Auth:RequiredScope   delegated scope the mobile/web apps request (default access_as_user)
// Auth:DevSigningKey enables a symmetric key for local development and tests ONLY.
// Settings are read when the options are built (not here) so that test hosts can override configuration.
// File storage for photos, voice notes and signatures: Storage:Provider = local (default) or azure.
builder.Services.AddSingleton<IBlobStore>(sp =>
{
    var c = sp.GetRequiredService<IConfiguration>().GetSection("Storage");
    return c["Provider"]?.ToLowerInvariant() == "azure"
        ? new AzureBlobStore(c["ConnectionString"], c["AccountUrl"], c["Container"] ?? "attachments")
        : new LocalBlobStore(c["LocalPath"] ?? Path.Combine(Path.GetTempPath(), "das-engage-attachments"));
});
// The web dashboard runs on its own origin: only the origins listed in Cors:AllowedOrigins may call the API from a browser.
builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
{
    var origins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? Array.Empty<string>();
    if (origins.Length > 0) p.WithOrigins(origins).AllowAnyHeader().AllowAnyMethod().WithExposedHeaders("Content-Disposition");
}));
builder.Services.AddMemoryCache();
builder.Services.AddScoped<Microsoft.AspNetCore.Authentication.IClaimsTransformation, AppClaimsTransformation>();
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer();
builder.Services.AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme).Configure<IConfiguration, IHostEnvironment>((o, config, env) =>
{
    var auth = config.GetSection("Auth");
    var devKey = auth["DevSigningKey"];
    o.MapInboundClaims = false;
    o.TokenValidationParameters.RoleClaimType = ClaimTypes.Role;
    if (!string.IsNullOrEmpty(devKey))
    {
        if (!env.IsDevelopment() && !env.IsEnvironment("Testing"))
            throw new InvalidOperationException("Auth:DevSigningKey is only allowed in Development/Testing.");
        o.TokenValidationParameters.IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(devKey));
        o.TokenValidationParameters.ValidateIssuer = false;
        o.TokenValidationParameters.ValidateAudience = false;
    }
    else
    {
        var authority = auth["Authority"] ?? throw new InvalidOperationException("Auth:Authority is not configured.");
        var audiences = auth.GetSection("ValidAudiences").Get<string[]>() ?? Array.Empty<string>();
        if (audiences.Length == 0) throw new InvalidOperationException("Auth:ValidAudiences is not configured.");
        o.Authority = authority;
        o.TokenValidationParameters.ValidAudiences = audiences;
        o.TokenValidationParameters.ValidateAudience = true;
        o.TokenValidationParameters.ValidateLifetime = true;
        if (auth.GetValue<bool>("MultiTenant"))
        {
            o.TokenValidationParameters.ValidateIssuer = true;
            o.TokenValidationParameters.IssuerValidator = EntraTokenRules.ValidateMultiTenantIssuer;
        }
    }
});
builder.Services.AddAuthorization();
builder.Services.AddOptions<Microsoft.AspNetCore.Authorization.AuthorizationOptions>().Configure<IConfiguration>((o, config) =>
{
    var devKey = config["Auth:DevSigningKey"];
    var requiredScope = config["Auth:RequiredScope"] ?? "access_as_user";
    // Every authenticated caller must be a known, active user (resolved from the DB) and, with Entra, hold the API scope.
    var policy = new Microsoft.AspNetCore.Authorization.AuthorizationPolicyBuilder()
        .RequireAuthenticatedUser()
        .RequireClaim(AppClaims.User)
        .RequireAssertion(ctx => !string.IsNullOrEmpty(devKey) || EntraTokenRules.HasScope(ctx.User, requiredScope))
        .Build();
    o.DefaultPolicy = policy;
    o.FallbackPolicy = policy;
});

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddHealthChecks();
builder.Services.AddRateLimiter(o => o.AddFixedWindowLimiter("default", w => { w.PermitLimit = 300; w.Window = TimeSpan.FromMinutes(1); }));

var app = builder.Build();

if (!app.Environment.IsProduction()) { app.UseSwagger(); app.UseSwaggerUI(); }
app.UseHttpsRedirection();
app.UseCors();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

app.MapHealthChecks("/health").AllowAnonymous();
app.MapApi();

if (args.Length > 0 && args[0] == "provision-tenant")
{
    // provision-tenant <name> <entra-tenant-id> <admin-object-id> <admin-name> <admin-email>
    if (args.Length != 6) { Console.Error.WriteLine("usage: provision-tenant <name> <entra-tenant-id> <admin-object-id> <admin-name> <admin-email>"); return 2; }
    using var scope = app.Services.CreateScope();
    var options = scope.ServiceProvider.GetRequiredService<DbContextOptions<AppDbContext>>();
    await using (var migrate = new AppDbContext(options, new Provisioning.NoTenant())) await migrate.Database.MigrateAsync();
    var id = await Provisioning.CreateTenant(options, args[1], args[2], args[3], args[4], args[5]);
    Console.WriteLine($"Created tenant {id}. {args[4]} can now sign in as Admin.");
    return 0;
}

app.Run();
return 0;

public partial class Program;
