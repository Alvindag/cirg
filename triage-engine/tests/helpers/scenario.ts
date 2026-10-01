import { analyze } from '../../src/core/analysis'

/** A small but realistic intrusion on SRV1 (brute force -> logon -> priv -> encoded PowerShell -> log clear) plus an unrelated WS9 event. */
export function intrusionCsv(): string {
  const cols = ['EventID', 'TimeGenerated', 'Computer', 'TargetUserName', 'SubjectUserName', 'IpAddress', 'LogonType', 'TargetLogonId', 'SubjectLogonId', 'NewProcessName', 'CommandLine', 'ServiceName']
  const rows = [cols.join(',')]
  const R = (t: string, o: Record<string, string>) => rows.push(cols.map((k) => (k === 'TimeGenerated' ? t : (o[k] ?? ''))).join(','))
  for (let i = 0; i < 12; i++) R(`2025-03-01T10:00:${String(i).padStart(2, '0')}Z`, { EventID: '4625', Computer: 'SRV1', TargetUserName: 'jdoe-admin', IpAddress: '203.0.113.9', LogonType: '3' })
  R('2025-03-01T10:01:00Z', { EventID: '4624', Computer: 'SRV1', TargetUserName: 'jdoe-admin', IpAddress: '203.0.113.9', LogonType: '3', TargetLogonId: '0xABC' })
  R('2025-03-01T10:01:01Z', { EventID: '4672', Computer: 'SRV1', SubjectUserName: 'jdoe-admin', SubjectLogonId: '0xABC' })
  R('2025-03-01T10:02:00Z', { EventID: '4688', Computer: 'SRV1', SubjectUserName: 'jdoe-admin', SubjectLogonId: '0xABC', NewProcessName: 'C:\\Users\\jdoe-admin\\AppData\\powershell.exe', CommandLine: 'powershell -enc ' + 'QUJD'.repeat(15) })
  R('2025-03-01T10:09:00Z', { EventID: '1102', Computer: 'SRV1', SubjectUserName: 'jdoe-admin', SubjectLogonId: '0xABC' })
  R('2025-03-01T11:00:00Z', { EventID: '4688', Computer: 'WKSTN-DAVE', SubjectUserName: 'dave.smith', NewProcessName: 'C:\\Windows\\System32\\vssadmin.exe', CommandLine: 'vssadmin delete shadows /all' })
  return rows.join('\n')
}

export const SENSITIVE = ['jdoe-admin', 'SRV1', '203.0.113.9', 'WKSTN-DAVE', 'dave.smith', 'vssadmin delete', 'QUJD', 'AppData']

export const intrusionResult = async () => (await analyze(new Blob([intrusionCsv()]), [], { format: 'csv' }))!
