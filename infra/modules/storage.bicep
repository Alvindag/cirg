// Blob storage for photos, voice notes and signatures. Private, versioned, soft-deleted, no shared keys (managed identity only).
param name string
param location string
param tags object
param isolated bool
param redundancy string
param workspaceId string
param endpointsSubnetId string = ''
param blobZoneId string = ''
param appIdentityPrincipalId string
param deleteRetentionDays int
param coolAfterDays int

resource account 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  // checkov:skip=CKV_AZURE_35: default action is Deny with a private endpoint when isolated (staging, production); development is public with RBAC and no shared keys
  // checkov:skip=CKV_AZURE_206: redundancy is a parameter (ZRS/GZRS in staging and production, LRS in development)
  name: name
  location: location
  tags: tags
  kind: 'StorageV2'
  sku: { name: redundancy }
  properties: {
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
    defaultToOAuthAuthentication: true
    publicNetworkAccess: isolated ? 'Disabled' : 'Enabled'
    networkAcls: { defaultAction: isolated ? 'Deny' : 'Allow', bypass: 'AzureServices' }
    encryption: { services: { blob: { enabled: true, keyType: 'Account' } }, keySource: 'Microsoft.Storage' }
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: account
  name: 'default'
  properties: {
    isVersioningEnabled: true
    deleteRetentionPolicy: { enabled: true, days: deleteRetentionDays }
    containerDeleteRetentionPolicy: { enabled: true, days: deleteRetentionDays }
  }
}

resource attachments 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'attachments'
  properties: { publicAccess: 'None' }
}

// Older files cost less to keep. Retention (how long records must be kept) is a policy decision: set it with the data protection officer.
resource lifecycle 'Microsoft.Storage/storageAccounts/managementPolicies@2023-05-01' = {
  parent: account
  name: 'default'
  properties: {
    policy: {
      rules: [
        {
          name: 'cool-old-attachments'
          enabled: true
          type: 'Lifecycle'
          definition: {
            filters: { blobTypes: ['blockBlob'], prefixMatch: ['attachments/'] }
            actions: { baseBlob: { tierToCool: { daysAfterModificationGreaterThan: coolAfterDays } } }
          }
        }
        {
          name: 'expire-old-versions'
          enabled: true
          type: 'Lifecycle'
          definition: {
            filters: { blobTypes: ['blockBlob'] }
            actions: { version: { delete: { daysAfterCreationGreaterThan: 365 } } }
          }
        }
      ]
    }
  }
}

// Storage Blob Data Contributor for the API's identity
resource blobAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: account
  name: guid(account.id, appIdentityPrincipalId, 'blob-contributor')
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe')
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
    privateLinkServiceConnections: [{ name: 'blob', properties: { privateLinkServiceId: account.id, groupIds: ['blob'] } }]
  }
}

resource endpointDns 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2024-01-01' = if (isolated) {
  parent: endpoint
  name: 'default'
  properties: { privateDnsZoneConfigs: [{ name: 'blob', properties: { privateDnsZoneId: blobZoneId } }] }
}

resource diagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  scope: blobService
  name: 'to-log-analytics'
  properties: {
    workspaceId: workspaceId
    logs: [{ categoryGroup: 'audit', enabled: true }]
    metrics: [{ category: 'Transaction', enabled: true }]
  }
}

output blobEndpoint string = account.properties.primaryEndpoints.blob
output accountName string = account.name
output accountId string = account.id
