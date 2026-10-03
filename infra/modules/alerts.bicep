// Alerts that tell a person something needs attention: server errors, restarts, a database running hot or filling up.
param name string
param tags object
param actionGroupId string
param apiId string
param postgresId string
param minReplicas int

var action = [{ actionGroupId: actionGroupId }]

resource serverErrors 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: 'alert-${name}-api-5xx'
  location: 'global'
  tags: tags
  properties: {
    description: 'More than 10 server errors (5xx) from the API in 15 minutes.'
    severity: 2
    enabled: true
    scopes: [apiId]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT15M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          name: 'Server errors'
          metricName: 'Requests'
          dimensions: [{ name: 'statusCodeCategory', operator: 'Include', values: ['5xx'] }]
          operator: 'GreaterThan'
          threshold: 10
          timeAggregation: 'Total'
          criterionType: 'StaticThresholdCriterion'
        }
      ]
    }
    actions: action
  }
}

resource restarts 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: 'alert-${name}-api-restarts'
  location: 'global'
  tags: tags
  properties: {
    description: 'The API container restarted more than 3 times in 15 minutes (crash loop).'
    severity: 2
    enabled: true
    scopes: [apiId]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT15M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        { name: 'Restarts', metricName: 'RestartCount', operator: 'GreaterThan', threshold: 3, timeAggregation: 'Total', criterionType: 'StaticThresholdCriterion' }
      ]
    }
    actions: action
  }
}

resource noReplicas 'Microsoft.Insights/metricAlerts@2018-03-01' = if (minReplicas > 0) {
  name: 'alert-${name}-api-down'
  location: 'global'
  tags: tags
  properties: {
    description: 'No API replica is running.'
    severity: 1
    enabled: true
    scopes: [apiId]
    evaluationFrequency: 'PT1M'
    windowSize: 'PT5M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        { name: 'Replicas', metricName: 'Replicas', operator: 'LessThan', threshold: 1, timeAggregation: 'Minimum', criterionType: 'StaticThresholdCriterion' }
      ]
    }
    actions: action
  }
}

resource dbCpu 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: 'alert-${name}-db-cpu'
  location: 'global'
  tags: tags
  properties: {
    description: 'Database CPU above 85% for 15 minutes.'
    severity: 2
    enabled: true
    scopes: [postgresId]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT15M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        { name: 'CPU', metricName: 'cpu_percent', operator: 'GreaterThan', threshold: 85, timeAggregation: 'Average', criterionType: 'StaticThresholdCriterion' }
      ]
    }
    actions: action
  }
}

resource dbStorage 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: 'alert-${name}-db-storage'
  location: 'global'
  tags: tags
  properties: {
    description: 'Database storage more than 85% full.'
    severity: 2
    enabled: true
    scopes: [postgresId]
    evaluationFrequency: 'PT15M'
    windowSize: 'PT1H'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        { name: 'Storage', metricName: 'storage_percent', operator: 'GreaterThan', threshold: 85, timeAggregation: 'Average', criterionType: 'StaticThresholdCriterion' }
      ]
    }
    actions: action
  }
}
