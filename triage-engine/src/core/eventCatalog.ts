/** Human-readable names for common Security events (display only; detection lives in rule packs). */
export const EVENT_NAMES: Record<number, string> = {
  1102: 'Audit log cleared', 4624: 'Successful logon', 4625: 'Failed logon', 4634: 'Logoff', 4648: 'Logon with explicit credentials',
  4662: 'Operation performed on object', 4672: 'Special privileges assigned', 4688: 'Process created', 4697: 'Service installed',
  4698: 'Scheduled task created', 4719: 'Audit policy changed', 4720: 'User account created', 4722: 'User account enabled',
  4724: 'Password reset attempt', 4728: 'Member added to global group', 4732: 'Member added to local group',
  4738: 'User account changed', 4768: 'Kerberos TGT requested', 4769: 'Kerberos service ticket requested',
  4776: 'NTLM credential validation', 4798: 'Local group membership enumerated', 7045: 'Service installed (System log)',
}
export const eventName = (id: number) => EVENT_NAMES[id] ?? 'Other'
