// Verifies the integrity block of an exported JSON report, and optionally the SHA-256 of the original log file.
// Usage: node scripts/verify-report.mjs triage-report-XXXX.json [original-log-file]
// Integrity, not authenticity: it detects modification after export; it cannot say who produced the file.
import crypto from 'node:crypto'
import fs from 'node:fs'

const [reportPath, logPath] = process.argv.slice(2)
if (!reportPath) { console.error('usage: node scripts/verify-report.mjs <report.json> [original-log-file]'); process.exit(2) }

const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
const { integrity, ...body } = report
let ok = true
const line = (pass, msg) => { console.log(`${pass ? 'PASS' : 'FAIL'}  ${msg}`); if (!pass) ok = false }

if (!integrity || integrity.algorithm !== 'SHA-256') { line(false, 'report has no SHA-256 integrity block'); process.exit(1) }
const actual = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex')
line(actual === integrity.contentSha256, `report content hash ${actual === integrity.contentSha256 ? 'matches' : `differs (expected ${integrity.contentSha256}, got ${actual})`}`)

if (logPath) {
  const h = crypto.createHash('sha256')
  await new Promise((res, rej) => fs.createReadStream(logPath).on('data', (d) => h.update(d)).on('end', res).on('error', rej))
  const got = h.digest('hex')
  line(got === report.source.sha256, `original log SHA-256 ${got === report.source.sha256 ? 'matches the report' : `differs (report ${report.source.sha256}, file ${got})`}`)
} else console.log('NOTE  pass the original log file as a second argument to also verify the chain of custody')
console.log(`\nCase: ${report.case?.id ?? '-'}  Generated: ${report.generatedAt}  Tool: ${report.tool.name} v${report.tool.version}  Redacted: ${report.redaction.applied}`)
process.exit(ok ? 0 : 1)
