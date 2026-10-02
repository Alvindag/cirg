// Container Apps environment, the API, and a manual job that runs database migrations with the same image and identity.
param name string
param location string
param tags object
param workspaceName string
param isolated bool
param appsSubnetId string = ''
param image string
param registryServer string
param identityId string
param identityClientId string
param keyVaultConnectionStringUri string
@secure()
param appInsightsConnectionString string
param cpu string
param memory string
param minReplicas int
param maxReplicas int
param concurrentRequests int
param env array

resource workspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' existing = {
  name: workspaceName
}

resource environment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: 'cae-${name}'
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: { customerId: workspace.properties.customerId, sharedKey: workspace.listKeys().primarySharedKey }
    }
    vnetConfiguration: isolated ? { infrastructureSubnetId: appsSubnetId, internal: false } : null
    workloadProfiles: [{ name: 'Consumption', workloadProfileType: 'Consumption' }]
    zoneRedundant: false
  }
}

var secrets = [
  { name: 'db-connection', keyVaultUrl: keyVaultConnectionStringUri, identity: identityId }
  { name: 'appinsights', value: appInsightsConnectionString }
]

var commonEnv = concat([
  { name: 'ASPNETCORE_ENVIRONMENT', value: 'Production' }
  { name: 'ASPNETCORE_FORWARDEDHEADERS_ENABLED', value: 'true' }
  { name: 'AZURE_CLIENT_ID', value: identityClientId } // makes DefaultAzureCredential use the user-assigned identity
  { name: 'ConnectionStrings__Default', secretRef: 'db-connection' }
  { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', secretRef: 'appinsights' }
], env)

resource api 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'ca-${name}-api'
  location: location
  tags: union(tags, { 'azd-service-name': 'api' })
  identity: { type: 'UserAssigned', userAssignedIdentities: { '${identityId}': {} } }
  properties: {
    managedEnvironmentId: environment.id
    workloadProfileName: 'Consumption'
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: { external: true, targetPort: 8080, transport: 'auto', allowInsecure: false }
      registries: [{ server: registryServer, identity: identityId }]
      secrets: secrets
    }
    template: {
      containers: [
        {
          name: 'api'
          image: image
          resources: { cpu: json(cpu), memory: memory }
          env: commonEnv
          probes: [
            { type: 'Startup', httpGet: { path: '/health/live', port: 8080 }, periodSeconds: 3, failureThreshold: 30 }
            { type: 'Liveness', httpGet: { path: '/health/live', port: 8080 }, periodSeconds: 15, failureThreshold: 3 }
            { type: 'Readiness', httpGet: { path: '/health/ready', port: 8080 }, periodSeconds: 10, failureThreshold: 3 }
          ]
        }
      ]
      scale: {
        minReplicas: minReplicas
        maxReplicas: maxReplicas
        rules: [{ name: 'http', http: { metadata: { concurrentRequests: string(concurrentRequests) } } }]
      }
    }
  }
}

// Run before each release: `az containerapp job start`. It applies pending migrations and exits.
resource migrate 'Microsoft.App/jobs@2024-03-01' = {
  name: 'caj-${name}-migrate'
  location: location
  tags: tags
  identity: { type: 'UserAssigned', userAssignedIdentities: { '${identityId}': {} } }
  properties: {
    environmentId: environment.id
    workloadProfileName: 'Consumption'
    configuration: {
      triggerType: 'Manual'
      replicaTimeout: 900
      replicaRetryLimit: 0
      manualTriggerConfig: { parallelism: 1, replicaCompletionCount: 1 }
      registries: [{ server: registryServer, identity: identityId }]
      secrets: [secrets[0]]
    }
    template: {
      containers: [
        {
          name: 'migrate'
          image: image
          args: ['migrate']
          resources: { cpu: json('0.5'), memory: '1Gi' }
          env: [
            { name: 'ASPNETCORE_ENVIRONMENT', value: 'Production' }
            { name: 'ConnectionStrings__Default', secretRef: 'db-connection' }
          ]
        }
      ]
    }
  }
}

output apiName string = api.name
output apiId string = api.id
output apiFqdn string = api.properties.configuration.ingress.fqdn
output jobName string = migrate.name
