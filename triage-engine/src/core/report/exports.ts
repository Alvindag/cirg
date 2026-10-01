import type { Report, ReportFinding } from './model'

export const reportToJson = (r: Report) => JSON.stringify(r, null, 2)

/**
 * One alert per line, using ECS-style field names (@timestamp, event.*, rule.*, threat.*, host.*, user.*, source.ip) so most SIEMs
 * (Elastic, Sentinel via DCR, Splunk via CIM mapping) can ingest it with little or no remapping. "ECS-style" means field naming only;
 * it is not validated against a specific ECS version.
 */
export function reportToNdjson(r: Report): string {
  const lines: string[] = []
  const chain = new Map(r.chains.map((c) => [c.id, c]))
  const sev = { info: 1, low: 25, medium: 47, high: 73, critical: 99 } as const
  for (const f of r.findings) {
    const c = f.chainId ? chain.get(f.chainId) : undefined
    const users = f.entities.accounts.map(([n]) => n)
    const ips = f.entities.ips.map(([n]) => n)
    const doc = {
      '@timestamp': f.firstSeen,
      event: { kind: 'alert', category: ['intrusion_detection'], severity: sev[f.severity], start: f.firstSeen, end: f.lastSeen, count: f.count, id: `${r.generatedAt}/${f.id}` },
      message: f.ruleName,
      rule: { id: f.ruleId, name: f.ruleName, description: f.context.summary },
      threat: {
        framework: 'MITRE ATT&CK',
        tactic: { id: f.attack.map((a) => a.tactic), name: f.attack.map((a) => a.tacticName ?? '') },
        technique: { id: f.attack.map((a) => a.technique), name: f.attack.map((a) => a.techniqueName ?? '') },
      },
      host: { name: f.host ?? f.entities.hosts[0]?.[0] },
      user: { name: users },
      source: { ip: ips },
      triage: {
        report_schema: r.schemaVersion, finding_id: f.id, kind: f.kind, severity: f.severity, confidence: f.confidence, score: f.score,
        chain_id: f.chainId ?? null, chain_score: c?.risk.score ?? null, redacted: r.redaction.applied, group: f.group ?? null,
      },
    }
    lines.push(JSON.stringify(doc))
  }
  return lines.join('\n') + (lines.length ? '\n' : '')
}

export type { ReportFinding }
