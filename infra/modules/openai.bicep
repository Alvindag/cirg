// Azure OpenAI for voice-to-text and visit summaries. Key-less: the API's managed identity is the only way in.
param name string
param location string
param tags object
param isolated bool
param workspaceId string
param chatDeployment string
param chatModel string
param chatModelVersion string
param transcriptionDeployment string
param chatCapacity int
param transcriptionCapacity int
param endpointsSubnetId string = ''
param openAiZoneId string = ''
param appIdentityPrincipalId string

resource account 'Microsoft.CognitiveServices/accounts@2024-10-01' = {
  // checkov:skip=CKV_AZURE_134: public access is disabled when isolated (staging, production); local (key) authentication is always off
  name: name
  location: location
  tags: tags
  identity: { type: 'SystemAssigned' }
  kind: 'OpenAI'
  sku: { name: 'S0' }
  properties: {
    customSubDomainName: name
    disableLocalAuth: true
    publicNetworkAccess: isolated ? 'Disabled' : 'Enabled'
    networkAcls: { defaultAction: isolated ? 'Deny' : 'Allow' }
  }
}

resource chat 'Microsoft.CognitiveServices/accounts/deployments@2024-10-01' = {
  parent: account
  name: chatDeployment
  sku: { name: 'Standard', capacity: chatCapacity }
  properties: { model: { format: 'OpenAI', name: chatModel, version: chatModelVersion } }
}

resource whisper 'Microsoft.CognitiveServices/accounts/deployments@2024-10-01' = {
  parent: account
  name: transcriptionDeployment
  sku: { name: 'Standard', capacity: transcriptionCapacity }
  properties: { model: { format: 'OpenAI', name: 'whisper', version: '001' } }
  dependsOn: [chat] // deployments are created one at a time
}

// Cognitive Services OpenAI User for the API's identity
resource user 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: account
  name: guid(account.id, appIdentityPrincipalId, 'openai-user')
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd')
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
    privateLinkServiceConnections: [{ name: 'openai', properties: { privateLinkServiceId: account.id, groupIds: ['account'] } }]
  }
}

resource endpointDns 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2024-01-01' = if (isolated) {
  parent: endpoint
  name: 'default'
  properties: { privateDnsZoneConfigs: [{ name: 'openai', properties: { privateDnsZoneId: openAiZoneId } }] }
}

resource diagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  scope: account
  name: 'to-log-analytics'
  properties: {
    workspaceId: workspaceId
    logs: [{ categoryGroup: 'audit', enabled: true }]
    metrics: [{ category: 'AllMetrics', enabled: true }]
  }
}

output endpoint string = account.properties.endpoint
