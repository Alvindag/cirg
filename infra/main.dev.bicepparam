using './main.bicep'

// Development: small and cheap, public endpoints, no high availability.
param envName = 'dev'
param authAuthority = 'https://login.microsoftonline.com/organizations/v2.0'
param authValidAudiences = ['api://das-engage-360']
param postgresAdminPassword = readEnvironmentVariable('POSTGRES_ADMIN_PASSWORD', '')
param alertEmails = []
