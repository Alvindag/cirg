// DAS Engage 360: everything the platform runs on, in one resource group per environment.
//   az deployment group create -g <rg> -f infra/main.bicep -p infra/main.<env>.bicepparam
// First deployment: deployApp=false (creates the registry and data stores), push the image, then deploy again with deployApp=true.
targetScope = 'resourceGroup'

@allowed(['dev', 'staging', 'prod'])
param envName string
param location string = resourceGroup().location
@minLength(2)
@maxLength(6)
param namePrefix string = 'das'

@description('Create the API app and migration job. Leave false until an image has been pushed to the registry.')
param deployApp bool = false
@description('Full image reference, e.g. <registry>.azurecr.io/das-engage-api:1.4.0')
param apiImage string = ''

@description('Private network for the API and database, private endpoints for storage, vault and OpenAI. Use for staging and production.')
param networkIsolation bool = false

// --- sign-in ---
param authAuthority string = '${environment().authentication.loginEndpoint}organizations/v2.0'
param authMultiTenant bool = true
param authValidAudiences array
param authRequiredScope string = 'access_as_user'
@description('Extra browser origins allowed to call the API (the Static Web App is added automatically).')
param corsOrigins array = []

// --- database ---
@secure()
@description('Letters and digits only (it is placed in a connection string).')
param postgresAdminPassword string
param postgresSku string = 'Standard_B1ms'
param postgresTier string = 'Burstable'
param postgresStorageGb int = 32
param postgresHighAvailability bool = false
param postgresGeoRedundantBackup bool = false
param postgresBackupRetentionDays int = 7

// --- storage, registry, web ---
param storageRedundancy string = 'Standard_LRS'
param attachmentsCoolAfterDays int = 90
param attachmentsDeleteRetentionDays int = 30
param registrySku string = 'Basic'
param staticWebSku string = 'Free'
param staticWebLocation string = 'westeurope'

// --- API sizing ---
param apiCpu string = '0.5'
param apiMemory string = '1Gi'
param apiMinReplicas int = 1
param apiMaxReplicas int = 2
param apiConcurrentRequests int = 40
param enableErpWorker bool = true
@description('Entra application (client) id the API uses to sign in to Dynamics 365 Business Central. Empty when Business Central is not used.')
param businessCentralClientId string = ''
@description('Business Central vendor number that purchase requisitions are created for.')
param businessCentralVendor string = ''
@description('Key Vault secret URI of the Business Central client secret (create the secret in the vault first). It is available to the connection under the secret name BC_CLIENT_SECRET.')
param businessCentralSecretUri string = ''

// --- AI (optional) ---
param deployOpenAi bool = false
param openAiLocation string = 'swedencentral'
param chatDeployment string = 'gpt-4o-mini'
param chatModel string = 'gpt-4o-mini'
param chatModelVersion string = '2024-07-18'
param chatCapacity int = 30
param transcriptionDeployment string = 'whisper'
param transcriptionCapacity int = 3

// --- operations ---
param alertEmails array = []
param logRetentionDays int = 30

var name = '${namePrefix}-${envName}'
var suffix = uniqueString(resourceGroup().id)
var tags = { app: 'das-engage-360', environment: envName, managedBy: 'bicep' }
var isolated = networkIsolation

resource appIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-${name}'
  location: location
  tags: tags
}

module monitoring 'modules/monitoring.bicep' = {
  name: 'monitoring'
  params: { name: name, location: location, retentionDays: logRetentionDays, alertEmails: alertEmails, tags: tags }
}

module network 'modules/network.bicep' = if (isolated) {
  name: 'network'
  params: { name: name, location: location, tags: tags }
}

module postgres 'modules/postgres.bicep' = {
  name: 'postgres'
  params: {
    name: 'psql-${name}-${take(suffix, 6)}'
    location: location
    tags: tags
    isolated: isolated
    skuName: postgresSku
    skuTier: postgresTier
    storageGb: postgresStorageGb
    highAvailability: postgresHighAvailability
    geoRedundantBackup: postgresGeoRedundantBackup
    backupRetentionDays: postgresBackupRetentionDays
    workspaceId: monitoring.outputs.workspaceId
    delegatedSubnetId: isolated ? network!.outputs.postgresSubnetId : ''
    privateDnsZoneId: isolated ? network!.outputs.postgresZoneId : ''
    administratorPassword: postgresAdminPassword
  }
}

module vault 'modules/keyvault.bicep' = {
  name: 'keyvault'
  params: {
    name: 'kv-${namePrefix}-${envName}-${take(suffix, 6)}'
    location: location
    tags: tags
    isolated: isolated
    workspaceId: monitoring.outputs.workspaceId
    endpointsSubnetId: isolated ? network!.outputs.endpointsSubnetId : ''
    vaultZoneId: isolated ? network!.outputs.vaultZoneId : ''
    appIdentityPrincipalId: appIdentity.properties.principalId
    postgresAdminPassword: postgresAdminPassword
    postgresConnectionStringTemplate: 'Host=${postgres.outputs.fqdn};Database=${postgres.outputs.databaseName};Username=${postgres.outputs.administratorLogin};Password={password};Ssl Mode=Require;Trust Server Certificate=false;Maximum Pool Size=30'
  }
}

module storage 'modules/storage.bicep' = {
  name: 'storage'
  params: {
    name: take('st${namePrefix}${envName}${suffix}', 24)
    location: location
    tags: tags
    isolated: isolated
    redundancy: storageRedundancy
    workspaceId: monitoring.outputs.workspaceId
    endpointsSubnetId: isolated ? network!.outputs.endpointsSubnetId : ''
    blobZoneId: isolated ? network!.outputs.blobZoneId : ''
    appIdentityPrincipalId: appIdentity.properties.principalId
    deleteRetentionDays: attachmentsDeleteRetentionDays
    coolAfterDays: attachmentsCoolAfterDays
  }
}

module registry 'modules/registry.bicep' = {
  name: 'registry'
  params: {
    name: 'acr${namePrefix}${envName}${suffix}'
    location: location
    tags: tags
    sku: registrySku
    appIdentityPrincipalId: appIdentity.properties.principalId
  }
}

module openai 'modules/openai.bicep' = if (deployOpenAi) {
  name: 'openai'
  params: {
    name: 'oai-${name}-${take(suffix, 6)}'
    location: openAiLocation
    tags: tags
    isolated: isolated
    workspaceId: monitoring.outputs.workspaceId
    chatDeployment: chatDeployment
    chatModel: chatModel
    chatModelVersion: chatModelVersion
    transcriptionDeployment: transcriptionDeployment
    chatCapacity: chatCapacity
    transcriptionCapacity: transcriptionCapacity
    endpointsSubnetId: isolated ? network!.outputs.endpointsSubnetId : ''
    openAiZoneId: isolated ? network!.outputs.openAiZoneId : ''
    appIdentityPrincipalId: appIdentity.properties.principalId
  }
}

module web 'modules/staticweb.bicep' = {
  name: 'web'
  params: { name: name, location: staticWebLocation, tags: tags, sku: staticWebSku }
}

// The dashboard's own address is known only after it is created, so it takes slot 0; extra origins follow.
var extraOriginEnv = [for (o, i) in corsOrigins: { name: 'Cors__AllowedOrigins__${i + 1}', value: o }]
var audienceEnv = [for (a, i) in authValidAudiences: { name: 'Auth__ValidAudiences__${i}', value: a }]

var appEnv = concat([
  { name: 'Auth__Authority', value: authAuthority }
  { name: 'Auth__MultiTenant', value: string(authMultiTenant) }
  { name: 'Auth__RequiredScope', value: authRequiredScope }
  { name: 'Storage__Provider', value: 'azure' }
  { name: 'Storage__AccountUrl', value: storage.outputs.blobEndpoint }
  { name: 'Storage__Container', value: 'attachments' }
  { name: 'Erp__Worker__Enabled', value: string(enableErpWorker) }
  { name: 'Erp__BusinessCentral__ClientId', value: businessCentralClientId }
  { name: 'Erp__BusinessCentral__DefaultVendorNumber', value: businessCentralVendor }
  { name: 'Ai__Enabled', value: string(deployOpenAi) }
  { name: 'Ai__Provider', value: deployOpenAi ? 'azure' : 'none' }
  { name: 'Ai__ChatDeployment', value: chatDeployment }
  { name: 'Ai__TranscriptionDeployment', value: transcriptionDeployment }
  { name: 'Ai__Endpoint', value: deployOpenAi ? openai!.outputs.endpoint : '' }
  { name: 'Cors__AllowedOrigins__0', value: 'https://${web.outputs.hostname}' }
], audienceEnv, extraOriginEnv)

module app 'modules/containerapps.bicep' = if (deployApp) {
  name: 'app'
  params: {
    name: name
    location: location
    tags: tags
    workspaceName: monitoring.outputs.workspaceName
    isolated: isolated
    appsSubnetId: isolated ? network!.outputs.appsSubnetId : ''
    image: apiImage
    registryServer: registry.outputs.loginServer
    identityId: appIdentity.id
    identityClientId: appIdentity.properties.clientId
    keyVaultConnectionStringUri: vault.outputs.connectionStringSecretUri
    erpSecretUri: businessCentralSecretUri
    appInsightsConnectionString: monitoring.outputs.appInsightsConnectionString
    cpu: apiCpu
    memory: apiMemory
    minReplicas: apiMinReplicas
    maxReplicas: apiMaxReplicas
    concurrentRequests: apiConcurrentRequests
    env: appEnv
  }
}

module alerts 'modules/alerts.bicep' = if (deployApp) {
  name: 'alerts'
  params: {
    name: name
    tags: tags
    actionGroupId: monitoring.outputs.actionGroupId
    apiId: app!.outputs.apiId
    postgresId: postgres.outputs.serverId
    minReplicas: apiMinReplicas
  }
}

output resourceGroup string = resourceGroup().name
output registryName string = registry.outputs.name
output registryLoginServer string = registry.outputs.loginServer
output keyVaultName string = vault.outputs.vaultName
output postgresServer string = postgres.outputs.fqdn
output storageAccount string = storage.outputs.accountName
output staticWebAppName string = web.outputs.name
output webUrl string = 'https://${web.outputs.hostname}'
output apiAppName string = deployApp ? app!.outputs.apiName : ''
output apiUrl string = deployApp ? 'https://${app!.outputs.apiFqdn}' : ''
output migrationJobName string = deployApp ? app!.outputs.jobName : ''
output appIdentityClientId string = appIdentity.properties.clientId
