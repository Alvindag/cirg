const CODES: Record<string, string> = { '%%8448': 'Success added', '%%8449': 'Success removed', '%%8450': 'Failure added', '%%8451': 'Failure removed' }

/** Event 4719 stores AuditPolicyChanges as message-table codes (e.g. "%%8448, %%8450"). Return plain English. */
export function describeAuditChanges(raw: string): string {
  const parts = raw.split(/[,;\s]+/).filter(Boolean)
  const out = parts.map((p) => CODES[p] ?? p)
  return out.join(', ')
}
