import { describe, expect, it } from 'vitest'
import { analyze } from '../src/core/analysis'
import { buildReport } from '../src/core/report/model'
import { buildStandaloneHtml } from '../src/ui/exportHtml'
import { intrusionResult, SENSITIVE } from './helpers/scenario'

const NOW = new Date('2025-03-02T00:00:00Z')
const EVIL = '<script>alert(1)</script>'
const EVIL_ATTR = '"><img src=x onerror=alert(2)>'

async function hostile() {
  const q = (s: string) => `"${s.replaceAll('"', '""')}"`
  const csv = ['EventID,TimeGenerated,Computer,TargetUserName,SubjectUserName,NewProcessName,CommandLine',
    `4688,2025-03-01T10:00:00Z,${q('</title><script>x()</script>')},${q(EVIL_ATTR)},${q(EVIL_ATTR)},C:\\Windows\\System32\\vssadmin.exe,${q(`vssadmin delete shadows /all ${EVIL} javascript:alert(3)`)}`].join('\n')
  const pack = JSON.stringify({ schemaVersion: '1.0', pack: { id: 'evil-pack', name: `Evil ${EVIL}`, version: '1.0.0' }, rules: [{
    id: 'EVL-001', name: `Rule ${EVIL_ATTR}`, kind: 'match', severity: 'high', attack: [{ tactic: 'TA0002', technique: 'T1059' }], when: { eventIds: [4688] },
    context: { summary: `Summary ${EVIL}`, falsePositives: [EVIL_ATTR], maliciousIndicators: ['<b onmouseover=alert(4)>x</b>'], references: ['javascript:alert(5)'] },
    response: { investigate: [{ title: `T ${EVIL}`, shell: 'kql', command: 'X | where A == "{{commandLine}}"' }] } }] })
  return (await analyze(new Blob([csv]), [{ name: 'evil.json', text: pack, format: 'json' }], { format: 'csv' }))!
}

describe('standalone HTML report', () => {
  it('has all five sections, the CSP meta, and zero active content', async () => {
    const html = await buildStandaloneHtml(buildReport(await intrusionResult(), { redact: false, generatedAt: NOW, sourceName: 'x.csv' }))
    for (const h of ['1. Executive summary', '2. Technical deep dive', '3. Contextual analysis', '4. Actionable next steps', '5. Appendix']) expect(html).toContain(h)
    expect(html).toContain(`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'`)
    expect(html).not.toMatch(/<script/i)
    expect(html).not.toMatch(/<(iframe|object|embed|form|link|base)\b/i)
    expect(html).not.toMatch(/\son[a-z]+\s*=/i)          // no inline event handlers
    expect(html).not.toMatch(/(src|href)\s*=\s*"(?!#)/i) // no external references (only in-page anchors)
    expect(html).toContain('Windows Security Triage Report 2025-03-02')
    expect(html).toContain('Investigate (read-only)')
    expect(html).toContain('DISRUPTIVE')
  })

  it('escapes hostile log data and hostile rule-pack text everywhere', async () => {
    const html = await buildStandaloneHtml(buildReport(await hostile(), { redact: false, generatedAt: NOW, sourceName: `${EVIL}.csv` }))
    expect(html).not.toMatch(/<script/i)
    expect(html).not.toMatch(/<img/i)
    expect(html).not.toMatch(/<b onmouseover/i)
    expect(html).not.toMatch(/<\/title><script/i)
    expect(html).not.toMatch(/<[^>]*\sonerror\s*=/i)
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')                 // present, but as text
    expect(html).toContain('javascript:alert(3)')                                   // shown as inert text...
    expect(html).not.toMatch(/href\s*=\s*"javascript:/i)                            // ...never as a link
    expect(html.match(/<title>[^<]*<\/title>/)![0]).toBe('<title>Windows Security Triage Report 2025-03-02</title>') // title never contains data
  })

  it('redacted HTML contains none of the sensitive values', async () => {
    const html = await buildStandaloneHtml(buildReport(await intrusionResult(), { redact: true, generatedAt: NOW, sourceName: 'customer-secret.csv' }))
    for (const s of SENSITIVE) expect(html.toLowerCase(), `leaked: ${s}`).not.toContain(s.toLowerCase())
    expect(html).not.toContain('customer-secret')
    expect(html).toContain('Redacted report.')
    expect(html).toMatch(/USER-\d/)
  })

  it('is deterministic and reasonably small', async () => {
    const r = buildReport(await intrusionResult(), { redact: false, generatedAt: NOW, sourceName: 'x.csv' })
    const [a, b] = [await buildStandaloneHtml(r), await buildStandaloneHtml(r)]
    expect(a).toBe(b)
    expect(a.length).toBeLessThan(400_000)
  })
})
