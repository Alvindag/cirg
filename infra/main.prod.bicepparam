using './main.bicep'

// Production: private network, zone-redundant database with geo-redundant backups, at least two API replicas.
param envName = 'prod'
param networkIsolation = true
param authValidAudiences = ['api://das-engage-360']
param postgresAdminPassword = readEnvironmentVariable('POSTGRES_ADMIN_PASSWORD', '')
param postgresSku = 'Standard_D4ds_v5'
param postgresTier = 'GeneralPurpose'
param postgresStorageGb = 128
param postgresHighAvailability = true
param postgresGeoRedundantBackup = true
param postgresBackupRetentionDays = 35
param storageRedundancy = 'Standard_GZRS'
param attachmentsCoolAfterDays = 90
param attachmentsDeleteRetentionDays = 30
param registrySku = 'Standard'
param staticWebSku = 'Standard'
param apiCpu = '1'
param apiMemory = '2Gi'
param apiMinReplicas = 2
param apiMaxReplicas = 10
param deployOpenAi = true
param alertEmails = ['platform-alerts@example.com']
param logRetentionDays = 90
