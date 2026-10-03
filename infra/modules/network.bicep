// Virtual network for the API and database, with private DNS for private endpoints. Only deployed when network isolation is on.
param name string
param location string
param tags object

var addressSpace = '10.40.0.0/16'

resource vnet 'Microsoft.Network/virtualNetworks@2024-01-01' = {
  name: 'vnet-${name}'
  location: location
  tags: tags
  properties: {
    addressSpace: { addressPrefixes: [addressSpace] }
    subnets: [
      {
        name: 'snet-apps'
        properties: {
          addressPrefix: '10.40.0.0/23'
          delegations: [{ name: 'aca', properties: { serviceName: 'Microsoft.App/environments' } }]
        }
      }
      {
        name: 'snet-postgres'
        properties: {
          addressPrefix: '10.40.2.0/24'
          delegations: [{ name: 'pg', properties: { serviceName: 'Microsoft.DBforPostgreSQL/flexibleServers' } }]
        }
      }
      {
        name: 'snet-endpoints'
        properties: {
          addressPrefix: '10.40.3.0/24'
          privateEndpointNetworkPolicies: 'Disabled'
        }
      }
    ]
  }
}

var zoneNames = {
  postgres: '${name}.private.postgres.database.azure.com'
  blob: 'privatelink.blob.${environment().suffixes.storage}'
  vault: 'privatelink.vaultcore.azure.net'
  openai: 'privatelink.openai.azure.com'
}

resource zones 'Microsoft.Network/privateDnsZones@2020-06-01' = [for z in items(zoneNames): {
  name: z.value
  location: 'global'
  tags: tags
}]

resource links 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = [for (z, i) in items(zoneNames): {
  parent: zones[i]
  name: 'link-${name}'
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: { id: vnet.id }
  }
}]

output appsSubnetId string = vnet.properties.subnets[0].id
output postgresSubnetId string = vnet.properties.subnets[1].id
output endpointsSubnetId string = vnet.properties.subnets[2].id
output postgresZoneId string = zones[0].id
output blobZoneId string = zones[1].id
output vaultZoneId string = zones[2].id
output openAiZoneId string = zones[3].id
