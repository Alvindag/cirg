// Static Web App that hosts the dashboard. The pipeline uploads the built files; there is no source-control link.
param name string
param location string
param tags object
param sku string

resource site 'Microsoft.Web/staticSites@2023-12-01' = {
  name: 'stapp-${name}'
  location: location
  tags: tags
  sku: { name: sku, tier: sku }
  properties: {
    stagingEnvironmentPolicy: sku == 'Free' ? 'Disabled' : 'Enabled'
    allowConfigFileUpdates: true
    enterpriseGradeCdnStatus: 'Disabled'
  }
}

output name string = site.name
output hostname string = site.properties.defaultHostname
