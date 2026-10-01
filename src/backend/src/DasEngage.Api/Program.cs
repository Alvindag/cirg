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
builder.Services.AddScoped<ICurrentUser>(sp => sp.GetRequiredService<HttpCurrentUser>());

// Database: PostgreSQL by default; tests swap in the in-memory provider via ConfigureTestServices.
builder.Services.AddDbContext<AppDbContext>(o =>
    o.UseNpgsql(builder.Configuration.GetConnectionString("Default"), n => n.MigrationsAssembly("DasEngage.Infrastructure")));

// Auth: Entra ID / OIDC in production (Auth:Authority + Auth:Audience).
// Auth:DevSigningKey enables a symmetric key for local development and tests ONLY.
var auth = builder.Configuration.GetSection("Auth");
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(o =>
{
    o.MapInboundClaims = false;
    o.TokenValidationParameters.RoleClaimType = ClaimTypes.Role;
    var devKey = auth["DevSigningKey"];
    if (!string.IsNullOrEmpty(devKey))
    {
        if (!builder.Environment.IsDevelopment() && !builder.Environment.IsEnvironment("Testing"))
            throw new InvalidOperationException("Auth:DevSigningKey is only allowed in Development/Testing.");
        o.TokenValidationParameters.IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(devKey));
        o.TokenValidationParameters.ValidateIssuer = false;
        o.TokenValidationParameters.ValidateAudience = false;
    }
    else
    {
        o.Authority = auth["Authority"];
        o.Audience = auth["Audience"];
    }
});
builder.Services.AddAuthorization(o =>
    o.FallbackPolicy = new Microsoft.AspNetCore.Authorization.AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build());

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddHealthChecks();
builder.Services.AddRateLimiter(o => o.AddFixedWindowLimiter("default", w => { w.PermitLimit = 300; w.Window = TimeSpan.FromMinutes(1); }));

var app = builder.Build();

if (!app.Environment.IsProduction()) { app.UseSwagger(); app.UseSwaggerUI(); }
app.UseHttpsRedirection();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

app.MapHealthChecks("/health").AllowAnonymous();
app.MapApi();

app.Run();

public partial class Program;
