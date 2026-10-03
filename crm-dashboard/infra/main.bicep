// DAS Engage 360 on Azure: App Service (Linux, Node 20), PostgreSQL Flexible Server, Key Vault.
// Nothing here has been deployed. See docs/azure-deployment.md before running it.
//
//   az group create -n <rg> -l <region>
//   az deployment group create -g <rg> -f infra/main.bicep -p infra/main.parameters.example.json
//
// Run `az bicep build -f infra/main.bicep` or `az deployment group what-if` first: this file has not been
// run against Azure yet.

targetScope = 'resourceGroup'

@description('Short lowercase name used in resource names (3-12 letters or digits).')
@minLength(3)
@maxLength(12)
param appName string

param location string = resourceGroup().location

@description('App Service plan size. B1 for a pilot; use P0v3 or larger for production.')
param appServiceSku string = 'B1'

@description('PostgreSQL compute. Burstable B1ms is enough for a pilot.')
param postgresSku string = 'Standard_B1ms'

param postgresStorageGb int = 32

@description('Entra tenant (directory) ID that people sign in with.')
param entraTenantId string

@description('Application (client) ID of the Entra app registration.')
param entraClientId string

@secure()
@description('Client secret of the Entra app registration.')
param entraClientSecret string

@secure()
@description('At least 32 random characters. Signs session cookies.')
@minLength(32)
param authSessionSecret string

@secure()
@description('Password for the PostgreSQL administrator login.')
@minLength(16)
param postgresAdminPassword string

@description('Work email of the first administrator. Created when they first sign in.')
param bootstrapAdminEmail string

@description('Public address of the app, e.g. https://crm.example.com. Defaults to the azurewebsites.net address.')
param appBaseUrl string = ''

var suffix = uniqueString(resourceGroup().id, appName)
var webName = '${appName}-web-${suffix}'
var pgName = '${appName}-pg-${suffix}'
var kvName = take('${appName}-kv-${suffix}', 24)
var dbName = 'dasengage'
var adminLogin = 'dasadmin'
var publicUrl = empty(appBaseUrl) ? 'https://${webName}.azurewebsites.net' : appBaseUrl

resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: '${appName}-plan'
  location: location
  kind: 'linux'
  sku: { name: appServiceSku }
  properties: { reserved: true }
}

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2023-12-01-preview' = {
  name: pgName
  location: location
  sku: { name: postgresSku, tier: 'Burstable' }
  properties: {
    version: '16'
    administratorLogin: adminLogin
    administratorLoginPassword: postgresAdminPassword
    storage: { storageSizeGB: postgresStorageGb }
    backup: { backupRetentionDays: 14, geoRedundantBackup: 'Disabled' }
    highAvailability: { mode: 'Disabled' }
    authConfig: { activeDirectoryAuth: 'Disabled', passwordAuth: 'Enabled' }
  }
}

resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-12-01-preview' = {
  parent: postgres
  name: dbName
}

// Lets Azure services (the web app) connect. Tighten this with a private endpoint for production.
resource allowAzure 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2023-12-01-preview' = {
  parent: postgres
  name: 'AllowAzureServices'
  properties: { startIpAddress: '0.0.0.0', endIpAddress: '0.0.0.0' }
}

resource vault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: kvName
  location: location
  properties: {
    tenantId: subscription().tenantId
    sku: { family: 'A', name: 'standard' }
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 30
    enablePurgeProtection: true
  }
}

resource sDatabaseUrl 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: vault
  name: 'database-url'
  properties: {
    value: 'postgres://${adminLogin}:${uriComponent(postgresAdminPassword)}@${postgres.properties.fullyQualifiedDomainName}:5432/${dbName}?sslmode=require'
  }
}

resource sEntraSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: vault
  name: 'entra-client-secret'
  properties: { value: entraClientSecret }
}

resource sSession 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: vault
  name: 'auth-session-secret'
  properties: { value: authSessionSecret }
}

resource web 'Microsoft.Web/sites@2023-12-01' = {
  name: webName
  location: location
  kind: 'app,linux'
  identity: { type: 'SystemAssigned' }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'NODE|20-lts'
      appCommandLine: 'node server.js'
      alwaysOn: appServiceSku != 'F1'
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      healthCheckPath: '/connect'
      appSettings: [
        { name: 'NODE_ENV', value: 'production' }
        { name: 'WEBSITE_RUN_FROM_PACKAGE', value: '1' }
        { name: 'ENTRA_TENANT_ID', value: entraTenantId }
        { name: 'ENTRA_CLIENT_ID', value: entraClientId }
        { name: 'ENTRA_BOOTSTRAP_ADMIN_EMAIL', value: bootstrapAdminEmail }
        { name: 'APP_BASE_URL', value: publicUrl }
        { name: 'SEED_SAMPLE_DATA', value: 'false' }
        { name: 'ENTRA_CLIENT_SECRET', value: '@Microsoft.KeyVault(SecretUri=${sEntraSecret.properties.secretUri})' }
        { name: 'AUTH_SESSION_SECRET', value: '@Microsoft.KeyVault(SecretUri=${sSession.properties.secretUri})' }
        { name: 'DATABASE_URL', value: '@Microsoft.KeyVault(SecretUri=${sDatabaseUrl.properties.secretUri})' }
      ]
    }
  }
}

// Key Vault Secrets User: the web app may read secrets, nothing else.
resource readSecrets 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: vault
  name: guid(vault.id, web.id, 'kv-secrets-user')
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')
    principalId: web.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

output webAppName string = web.name
output appUrl string = publicUrl
output redirectUri string = '${publicUrl}/auth/callback'
output keyVaultName string = vault.name
output postgresHost string = postgres.properties.fullyQualifiedDomainName
