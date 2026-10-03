// PostgreSQL Flexible Server: backups, optional zone-redundant high availability, private access when isolated.
param name string
param location string
param tags object
param isolated bool
param skuName string
param skuTier string
param storageGb int
param highAvailability bool
param geoRedundantBackup bool
param backupRetentionDays int
param workspaceId string
param delegatedSubnetId string = ''
param privateDnsZoneId string = ''
param administratorLogin string = 'dasadmin'

@secure()
param administratorPassword string

resource server 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: name
  location: location
  tags: tags
  sku: { name: skuName, tier: skuTier }
  properties: {
    version: '16'
    administratorLogin: administratorLogin
    administratorLoginPassword: administratorPassword
    storage: { storageSizeGB: storageGb, autoGrow: 'Enabled' }
    backup: { backupRetentionDays: backupRetentionDays, geoRedundantBackup: geoRedundantBackup ? 'Enabled' : 'Disabled' }
    highAvailability: { mode: highAvailability ? 'ZoneRedundant' : 'Disabled' }
    network: isolated ? {
      delegatedSubnetResourceId: delegatedSubnetId
      privateDnsZoneArmResourceId: privateDnsZoneId
      publicNetworkAccess: 'Disabled'
    } : {
      publicNetworkAccess: 'Enabled'
    }
    authConfig: { activeDirectoryAuth: 'Enabled', passwordAuth: 'Enabled', tenantId: subscription().tenantId }
    maintenanceWindow: { customWindow: 'Enabled', dayOfWeek: 0, startHour: 2, startMinute: 0 }
  }
}

resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: server
  name: 'das_engage'
  properties: { charset: 'UTF8', collation: 'en_US.utf8' }
}

// Without a private network (development), let Azure services reach the server. Production uses the private subnet instead.
resource allowAzure 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2024-08-01' = if (!isolated) {
  parent: server
  name: 'AllowAzureServices'
  properties: { startIpAddress: '0.0.0.0', endIpAddress: '0.0.0.0' }
}

resource requireTls 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2024-08-01' = {
  parent: server
  name: 'require_secure_transport'
  properties: { value: 'on', source: 'user-override' }
}

resource slowQueries 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2024-08-01' = {
  parent: server
  name: 'log_min_duration_statement'
  properties: { value: '1000', source: 'user-override' }
  dependsOn: [requireTls] // configuration changes are applied one at a time
}

resource diagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  scope: server
  name: 'to-log-analytics'
  properties: {
    workspaceId: workspaceId
    logs: [{ categoryGroup: 'allLogs', enabled: true }]
    metrics: [{ category: 'AllMetrics', enabled: true }]
  }
}

output fqdn string = server.properties.fullyQualifiedDomainName
output serverName string = server.name
output serverId string = server.id
output databaseName string = database.name
output administratorLogin string = administratorLogin
