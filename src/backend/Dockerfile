# DAS Engage 360 API. Build from the repository root:  docker build -f src/backend/Dockerfile -t das-engage-api .
# syntax=docker/dockerfile:1

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src/backend
# Restore first (cached until a project file changes)
COPY src/backend/DasEngage.sln ./
COPY src/backend/src/DasEngage.Domain/DasEngage.Domain.csproj src/DasEngage.Domain/
COPY src/backend/src/DasEngage.Infrastructure/DasEngage.Infrastructure.csproj src/DasEngage.Infrastructure/
COPY src/backend/src/DasEngage.Api/DasEngage.Api.csproj src/DasEngage.Api/
RUN dotnet restore src/DasEngage.Api/DasEngage.Api.csproj
COPY src/backend/src/ src/
RUN dotnet publish src/DasEngage.Api/DasEngage.Api.csproj -c Release -o /app --no-restore /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /app ./
# Runs as the image's built-in non-root user; TLS is terminated by the platform ingress.
USER $APP_UID
ENV ASPNETCORE_URLS=http://+:8080 \
    ASPNETCORE_ENVIRONMENT=Production \
    ASPNETCORE_FORWARDEDHEADERS_ENABLED=true \
    DOTNET_EnableDiagnostics=0
EXPOSE 8080
# Liveness: GET /health/live   Readiness: GET /health/ready   Database migrations: `dotnet DasEngage.Api.dll migrate` (run as a job, not at start-up)
ENTRYPOINT ["dotnet", "DasEngage.Api.dll"]
