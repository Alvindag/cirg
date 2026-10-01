/**
 * Event 4719 stores AuditPolicyChanges as message-table codes (e.g. "%%8449, %%8451").
 * PROVENANCE: this orientation (8448/8450 = removed, 8449/8451 = added) was established from a real Windows Server 2016 domain
 * controller export where an administrator had just ENABLED auditing; an earlier version of this table had it inverted and raised a
 * false "auditing removed" alert. Microsoft's documentation could not be consulted when this was written, so every finding that
 * depends on it tells the analyst to confirm "Changes made" in Event Viewer.
 */
const CODES: Record<string, string> = { '%%8448': 'Success removed', '%%8449': 'Success added', '%%8450': 'Failure removed', '%%8451': 'Failure added' }

export function describeAuditChanges(raw: string): string {
  const parts = raw.split(/[,;\s]+/).filter(Boolean)
  return parts.map((p) => CODES[p] ?? p).join(', ')
}
