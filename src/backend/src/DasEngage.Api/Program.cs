using Azure.Monitor.OpenTelemetry.AspNetCore;
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
builder.Services.AddScoped<DasEngage.Api.Erp.ErpOutbox>();
builder.Services.AddScoped<SampleService>();

// ERP integration: a gateway speaking the DAS Engage contract (docs/erp-integration.md), reached over https.
builder.Services.AddSingleton<DasEngage.Api.Erp.ISecretProvider, DasEngage.Api.Erp.ConfigSecretProvider>();
builder.Services.AddHttpClient<DasEngage.Api.Erp.RestErpConnector>(c => c.Timeout = TimeSpan.FromSeconds(30));
builder.Services.AddHttpClient<DasEngage.Api.Erp.BusinessCentralConnector>(c => c.Timeout = TimeSpan.FromSeconds(60));
builder.Services.AddScoped<DasEngage.Api.Erp.IErpConnector, DasEngage.Api.Erp.ErpConnectorRouter>();
builder.Services.AddScoped<DasEngage.Api.Erp.ErpImporter>();
builder.Services.AddScoped<DasEngage.Api.Erp.ErpSync>();
builder.Services.AddHostedService<DasEngage.Api.Erp.ErpWorker>();

// AI: Azure OpenAI over REST (managed identity), or nothing. Rule-based analytics always work without it.
builder.Services.Configure<DasEngage.Api.Ai.AiOptions>(builder.Configuration.GetSection("Ai"));
builder.Services.AddHttpClient<DasEngage.Api.Ai.AzureOpenAi>(c => c.Timeout = TimeSpan.FromSeconds(100));
builder.Services.AddScoped<DasEngage.Api.Ai.IChatModel>(sp =>
    sp.GetRequiredService<Microsoft.Extensions.Options.IOptions<DasEngage.Api.Ai.AiOptions>>().Value.Provider == "azure"
        ? sp.GetRequiredService<DasEngage.Api.Ai.AzureOpenAi>() : new DasEngage.Api.Ai.UnavailableModel());
builder.Services.AddScoped<DasEngage.Api.Ai.ITranscriber>(sp =>
    sp.GetRequiredService<Microsoft.Extensions.Options.IOptions<DasEngage.Api.Ai.AiOptions>>().Value.Provider == "azure"
        ? sp.GetRequiredService<DasEngage.Api.Ai.AzureOpenAi>() : new DasEngage.Api.Ai.UnavailableModel());
builder.Services.AddScoped<DasEngage.Api.Ai.AiService>();
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
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer()
    .AddScheme<Microsoft.AspNetCore.Authentication.AuthenticationSchemeOptions, DasEngage.Api.Erp.ApiKeyHandler>(DasEngage.Api.Erp.ApiKeyAuth.Scheme, null);
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
    // ERP middleware authenticates with an integration key, never a user token, and can reach only the /integration endpoints.
    o.AddPolicy("Integration", p => p.AddAuthenticationSchemes(DasEngage.Api.Erp.ApiKeyAuth.Scheme).RequireAuthenticatedUser().RequireRole(DasEngage.Api.Erp.ApiKeyAuth.Role));
});

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
// Liveness (/health, /health/live) never touches dependencies; readiness (/health/ready) checks the database.
builder.Services.AddHealthChecks().AddDbContextCheck<AppDbContext>("database", tags: new[] { "ready" });

// Application Insights / Azure Monitor (traces, metrics, logs) when a connection string is provided by the platform.
if (!string.IsNullOrEmpty(builder.Configuration["APPLICATIONINSIGHTS_CONNECTION_STRING"]))
    builder.Services.AddOpenTelemetry().UseAzureMonitor();
// Rate limit per signed-in user (or per client address when anonymous), so one busy or abusive client cannot use up everyone's allowance.
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.AddPolicy("default", ctx =>
    {
        var config = ctx.RequestServices.GetRequiredService<IConfiguration>();
        // ERP middleware is identified by its integration key's prefix (the key itself is verified later, in authorization).
        if (ctx.Request.Headers.TryGetValue(DasEngage.Api.Erp.ApiKeyAuth.Header, out var apiKey) && DasEngage.Api.Erp.ApiKeyAuth.TryParse(apiKey.ToString(), out var prefix, out _))
            return System.Threading.RateLimiting.RateLimitPartition.GetFixedWindowLimiter($"k:{prefix}", _ => new System.Threading.RateLimiting.FixedWindowRateLimiterOptions
            { PermitLimit = config.GetValue("RateLimit:IntegrationPerMinute", 120), Window = TimeSpan.FromMinutes(1), QueueLimit = 0 });
        var user = ctx.User.FindFirst(DasEngage.Api.AppClaims.User)?.Value ?? ctx.User.FindFirst("oid")?.Value ?? ctx.User.FindFirst("sub")?.Value;
        var key = user is not null ? $"u:{user}" : $"ip:{ctx.Connection.RemoteIpAddress}";
        var limit = user is not null ? config.GetValue("RateLimit:PerUserPerMinute", 600) : config.GetValue("RateLimit:AnonymousPerMinute", 60);
        return System.Threading.RateLimiting.RateLimitPartition.GetFixedWindowLimiter(key, _ => new System.Threading.RateLimiting.FixedWindowRateLimiterOptions
        { PermitLimit = limit, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 });
    });
});

var app = builder.Build();

if (!app.Environment.IsProduction()) { app.UseSwagger(); app.UseSwaggerUI(); }
// Behind the platform's ingress the original scheme and client address arrive in X-Forwarded-* (enabled by ASPNETCORE_FORWARDEDHEADERS_ENABLED).
if (string.Equals(app.Configuration["ASPNETCORE_FORWARDEDHEADERS_ENABLED"], "true", StringComparison.OrdinalIgnoreCase)) app.UseForwardedHeaders();
// API responses are never cached or sniffed, and cannot be framed.
app.Use(async (ctx, next) =>
{
    ctx.Response.OnStarting(() =>
    {
        var h = ctx.Response.Headers;
        h["X-Content-Type-Options"] = "nosniff";
        h["Referrer-Policy"] = "no-referrer";
        if (ctx.Request.Path.StartsWithSegments("/api") || ctx.Request.Path.StartsWithSegments("/integration"))
        { h["Cache-Control"] = "no-store"; h["Content-Security-Policy"] = "frame-ancestors 'none'"; }
        return Task.CompletedTask;
    });
    await next();
});
if (!app.Environment.IsDevelopment() && !app.Environment.IsEnvironment("Testing")) app.UseHsts();
app.UseHttpsRedirection();
app.UseCors();
// Authentication first, so the rate limiter can see who is calling and give each user their own allowance.
app.UseAuthentication();
app.UseRateLimiter();
app.UseAuthorization();

app.MapHealthChecks("/health", new Microsoft.AspNetCore.Diagnostics.HealthChecks.HealthCheckOptions { Predicate = _ => false }).AllowAnonymous();
app.MapHealthChecks("/health/live", new Microsoft.AspNetCore.Diagnostics.HealthChecks.HealthCheckOptions { Predicate = _ => false }).AllowAnonymous();
app.MapHealthChecks("/health/ready", new Microsoft.AspNetCore.Diagnostics.HealthChecks.HealthCheckOptions { Predicate = c => c.Tags.Contains("ready") }).AllowAnonymous();
app.MapApi();
DasEngage.Api.Erp.ErpEndpoints.MapIntegration(app);

// `migrate`: apply database migrations and exit. Run by the deployment pipeline (a job), never at web start-up, so several instances never race.
if (args.Length > 0 && args[0] == "migrate")
{
    using var scope = app.Services.CreateScope();
    var options = scope.ServiceProvider.GetRequiredService<DbContextOptions<AppDbContext>>();
    await using var db = new AppDbContext(options, new Provisioning.NoTenant());
    var pending = (await db.Database.GetPendingMigrationsAsync()).ToList();
    Console.WriteLine(pending.Count == 0 ? "Database is up to date." : $"Applying {pending.Count} migration(s): {string.Join(", ", pending)}");
    await db.Database.MigrateAsync();
    Console.WriteLine("Migrations applied.");
    return 0;
}

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
