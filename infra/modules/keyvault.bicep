// Key Vault for secrets (RBAC only, no access policies). The app reads secrets through its managed identity.
param name string
param location string
param tags object
param isolated bool
param workspaceId string
param endpointsSubnetId string = ''
param vaultZoneId string = ''
param appIdentityPrincipalId string

@secure()
param postgresAdminPassword string
param postgresConnectionStringTemplate string

resource vault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  // checkov:skip=CKV_AZURE_109: the firewall is Deny + private endpoint when isolated (staging, production); development is reachable by RBAC only
  name: name
  location: location
  tags: tags
  properties: {
    tenantId: subscription().tenantId
    sku: { family: 'A', name: 'standard' }
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 30
    enablePurgeProtection: true // cannot be turned off once on; the vault name includes a hash of the resource group, so recreating an environment gets a new vault
    publicNetworkAccess: isolated ? 'Disabled' : 'Enabled'
    networkAcls: { defaultAction: isolated ? 'Deny' : 'Allow', bypass: 'AzureServices' }
  }
}

resource adminPassword 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  // checkov:skip=CKV_AZURE_41: rotated by the release process, not by expiry (an expired secret would stop the API)
  parent: vault
  name: 'postgres-admin-password'
  properties: { value: postgresAdminPassword, contentType: 'text/plain', attributes: { enabled: true } }
}

resource connectionString 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  // checkov:skip=CKV_AZURE_41: rotated by the release process, not by expiry (an expired secret would stop the API)
  parent: vault
  name: 'postgres-connection-string'
  properties: { value: replace(postgresConnectionStringTemplate, '{password}', postgresAdminPassword), contentType: 'text/plain', attributes: { enabled: true } }
}

// Key Vault Secrets User for the API's identity
resource readSecrets 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: vault
  name: guid(vault.id, appIdentityPrincipalId, 'kv-secrets-user')
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-416a-b8b3-5a0b0c3f1e6c')
    principalId: appIdentityPrincipalId
    principalType: 'ServicePrincipal'
  }
}

resource endpoint 'Microsoft.Network/privateEndpoints@2024-01-01' = if (isolated) {
  name: 'pe-${name}'
  location: location
  tags: tags
  properties: {
    subnet: { id: endpointsSubnetId }
    privateLinkServiceConnections: [{ name: 'vault', properties: { privateLinkServiceId: vault.id, groupIds: ['vault'] } }]
  }
}

resource endpointDns 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2024-01-01' = if (isolated) {
  parent: endpoint
  name: 'default'
  properties: { privateDnsZoneConfigs: [{ name: 'vault', properties: { privateDnsZoneId: vaultZoneId } }] }
}

resource diagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  scope: vault
  name: 'to-log-analytics'
  properties: {
    workspaceId: workspaceId
    logs: [{ categoryGroup: 'audit', enabled: true }]
  }
}

output vaultUri string = vault.properties.vaultUri
output vaultName string = vault.name
output connectionStringSecretUri string = connectionString.properties.secretUri
