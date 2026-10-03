// Container registry for the API image. No admin user: the pipeline pushes with its own identity, the app pulls with its managed identity.
param name string
param location string
param tags object
param sku string
param appIdentityPrincipalId string

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  // checkov:skip=CKV_AZURE_139: the pipeline (GitHub-hosted runners) and the app must reach it; use Premium with a private endpoint and self-hosted runners to close it
  // checkov:skip=CKV_AZURE_163: vulnerability scanning is enabled subscription-wide with Microsoft Defender for Containers
  // checkov:skip=CKV_AZURE_166: image quarantine is a Premium preview feature; images are scanned in the pipeline before they are pushed
  name: name
  location: location
  tags: tags
  sku: { name: sku }
  properties: {
    adminUserEnabled: false
    publicNetworkAccess: 'Enabled'
    zoneRedundancy: sku == 'Premium' ? 'Enabled' : 'Disabled'
  }
}

// AcrPull for the API's identity
resource pull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: registry
  name: guid(registry.id, appIdentityPrincipalId, 'acr-pull')
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
    principalId: appIdentityPrincipalId
    principalType: 'ServicePrincipal'
  }
}

output loginServer string = registry.properties.loginServer
output name string = registry.name
