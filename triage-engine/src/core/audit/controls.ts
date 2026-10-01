/**
 * Indicative mapping targets: framework control IDs with short titles, so a finding can say which audit / security control
 * its evidence is relevant to. These are NOT assessments. A control is satisfied by an organisation's processes, not by a tool:
 * the report uses this to point reviewers at relevant evidence. Verify IDs against the current edition of each framework.
 */
export const FRAMEWORKS: Record<string, string> = {
  'nist-800-53': 'NIST SP 800-53 Rev. 5',
  'nist-800-171': 'NIST SP 800-171 Rev. 2',
  'nist-csf-2': 'NIST Cybersecurity Framework 2.0',
  'iso-27001': 'ISO/IEC 27001:2022 Annex A',
  'pci-dss-4': 'PCI DSS v4.0',
  'cis-v8': 'CIS Critical Security Controls v8',
  soc2: 'AICPA SOC 2 Trust Services Criteria',
  hipaa: 'HIPAA Security Rule (45 CFR 164)',
}

export const CONTROLS: Record<string, string> = {
  'nist-800-53:AU-2': 'Event Logging', 'nist-800-53:AU-3': 'Content of Audit Records', 'nist-800-53:AU-6': 'Audit Record Review, Analysis, and Reporting',
  'nist-800-53:AU-7': 'Audit Record Reduction and Report Generation', 'nist-800-53:AU-8': 'Time Stamps', 'nist-800-53:AU-9': 'Protection of Audit Information',
  'nist-800-53:AU-12': 'Audit Record Generation', 'nist-800-53:AC-2': 'Account Management', 'nist-800-53:AC-6': 'Least Privilege',
  'nist-800-53:AC-7': 'Unsuccessful Logon Attempts', 'nist-800-53:AC-17': 'Remote Access', 'nist-800-53:IA-5': 'Authenticator Management',
  'nist-800-53:SI-3': 'Malicious Code Protection', 'nist-800-53:SI-4': 'System Monitoring', 'nist-800-53:IR-4': 'Incident Handling',
  'nist-800-53:IR-5': 'Incident Monitoring', 'nist-800-53:IR-6': 'Incident Reporting', 'nist-800-53:CM-6': 'Configuration Settings', 'nist-800-53:CP-9': 'System Backup',

  'nist-800-171:3.1.5': 'Employ the principle of least privilege', 'nist-800-171:3.1.6': 'Use non-privileged accounts for nonsecurity functions',
  'nist-800-171:3.1.8': 'Limit unsuccessful logon attempts', 'nist-800-171:3.3.1': 'Create and retain system audit logs and records',
  'nist-800-171:3.3.2': 'Ensure user actions can be uniquely traced', 'nist-800-171:3.3.5': 'Correlate audit review, analysis and reporting',
  'nist-800-171:3.3.6': 'Provide audit record reduction and report generation', 'nist-800-171:3.3.8': 'Protect audit information and audit logging tools',
  'nist-800-171:3.6.1': 'Establish an incident-handling capability', 'nist-800-171:3.14.6': 'Monitor systems to detect attacks and indicators of attack',
  'nist-800-171:3.14.7': 'Identify unauthorized use of systems',

  'nist-csf-2:PR.PS-04': 'Log records are generated and made available for continuous monitoring',
  'nist-csf-2:PR.AA-05': 'Access permissions are managed incorporating least privilege',
  'nist-csf-2:DE.CM-03': 'Personnel activity and technology usage are monitored',
  'nist-csf-2:DE.CM-09': 'Computing hardware, software, and runtime environments are monitored',
  'nist-csf-2:DE.AE-02': 'Potentially adverse events are analyzed', 'nist-csf-2:DE.AE-03': 'Information is correlated from multiple sources',
  'nist-csf-2:RS.AN-03': 'Analysis establishes what took place and the root cause', 'nist-csf-2:RS.AN-07': 'Incident data and metadata are collected, with integrity and provenance preserved',

  'iso-27001:A.5.16': 'Identity management', 'iso-27001:A.5.25': 'Assessment and decision on information security events',
  'iso-27001:A.5.26': 'Response to information security incidents', 'iso-27001:A.5.28': 'Collection of evidence',
  'iso-27001:A.8.2': 'Privileged access rights', 'iso-27001:A.8.5': 'Secure authentication', 'iso-27001:A.8.7': 'Protection against malware',
  'iso-27001:A.8.9': 'Configuration management', 'iso-27001:A.8.13': 'Information backup', 'iso-27001:A.8.15': 'Logging',
  'iso-27001:A.8.16': 'Monitoring activities', 'iso-27001:A.8.17': 'Clock synchronization', 'iso-27001:A.8.20': 'Networks security',

  'pci-dss-4:8.3.4': 'Invalid authentication attempts are limited', 'pci-dss-4:10.2.1': 'Audit logs are enabled and active for all system components',
  'pci-dss-4:10.2.1.2': 'Audit logs capture all actions by individuals with administrative access', 'pci-dss-4:10.2.1.4': 'Audit logs capture all invalid logical access attempts',
  'pci-dss-4:10.2.1.5': 'Audit logs capture changes to identification and authentication credentials', 'pci-dss-4:10.2.1.6': 'Audit logs capture starting, stopping or pausing of audit logs',
  'pci-dss-4:10.2.1.7': 'Audit logs capture creation and deletion of system-level objects', 'pci-dss-4:10.2.2': 'Audit logs record sufficient detail for each event',
  'pci-dss-4:10.3.2': 'Audit log files are protected to prevent modification', 'pci-dss-4:10.4.1': 'Audit logs are reviewed at least once daily',
  'pci-dss-4:10.5.1': 'Audit log history is retained (12 months, 3 months immediately available)', 'pci-dss-4:10.6.1': 'System clocks are synchronized',

  'cis-v8:4.1': 'Establish and maintain a secure configuration process', 'cis-v8:5.4': 'Restrict administrator privileges to dedicated administrator accounts',
  'cis-v8:6.4': 'Require MFA for remote network access', 'cis-v8:8.2': 'Collect audit logs', 'cis-v8:8.5': 'Collect detailed audit logs',
  'cis-v8:8.9': 'Centralize audit logs', 'cis-v8:8.10': 'Retain audit logs', 'cis-v8:8.11': 'Conduct audit log reviews',
  'cis-v8:10.1': 'Deploy and maintain anti-malware software', 'cis-v8:11.2': 'Perform automated backups',

  'soc2:CC6.1': 'Logical access security', 'soc2:CC6.2': 'User registration and authorization', 'soc2:CC6.3': 'Access removal and least privilege',
  'soc2:CC7.2': 'System components are monitored for anomalies', 'soc2:CC7.3': 'Security events are evaluated', 'soc2:CC7.4': 'Security incidents are responded to',
  'soc2:CC8.1': 'Changes are authorized and controlled',

  'hipaa:164.312(b)': 'Audit controls', 'hipaa:164.308(a)(1)(ii)(D)': 'Information system activity review', 'hipaa:164.312(a)(1)': 'Access control',
  'hipaa:164.312(c)(1)': 'Integrity',
}

export const parseControl = (ref: string): { framework: string; id: string } => {
  const i = ref.indexOf(':')
  return { framework: ref.slice(0, i), id: ref.slice(i + 1) }
}
export const controlTitle = (ref: string): string | undefined => CONTROLS[ref]
export const frameworkName = (fw: string): string => FRAMEWORKS[fw] ?? fw
