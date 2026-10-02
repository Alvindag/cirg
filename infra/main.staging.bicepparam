using './main.bicep'

// Staging: production-shaped (private network, redundancy off to save cost), used to rehearse releases and migrations.
param envName = 'staging'
param networkIsolation = true
param authValidAudiences = ['api://das-engage-360']
param postgresAdminPassword = readEnvironmentVariable('POSTGRES_ADMIN_PASSWORD', '')
param postgresSku = 'Standard_D2ds_v5'
param postgresTier = 'GeneralPurpose'
param postgresStorageGb = 64
param postgresBackupRetentionDays = 14
param storageRedundancy = 'Standard_ZRS'
param registrySku = 'Standard'
param staticWebSku = 'Standard'
param apiCpu = '1'
param apiMemory = '2Gi'
param apiMinReplicas = 1
param apiMaxReplicas = 3
param deployOpenAi = true
param alertEmails = ['platform-alerts@example.com']
param logRetentionDays = 60
