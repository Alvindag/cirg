// CycloneDX 1.5 SBOM of everything that ships in the app: production npm closure (from package-lock.json) + the Rust crates
// compiled into the EVTX WASM (from evtx-wasm/Cargo.lock). Deterministic: no timestamps/UUIDs, so it can be diffed in review.
// (`npm sbom --omit dev` was found to drop the production dependency `yaml`, hence this script.)
import fs from 'node:fs'

const root = new URL('..', import.meta.url).pathname
const lock = JSON.parse(fs.readFileSync(root + 'package-lock.json', 'utf8'))
const pkg = JSON.parse(fs.readFileSync(root + 'package.json', 'utf8'))

/** Resolve `name` as Node would from the package at `from` (walk up node_modules). */
function resolve(from, name) {
  for (let p = from; ; p = p.slice(0, p.lastIndexOf('/node_modules/')) ) {
    const key = p ? `${p}/node_modules/${name}` : `node_modules/${name}`
    if (lock.packages[key]) return key
    if (!p) return null
  }
}

const seen = new Map()
const visit = (key) => {
  if (!key || seen.has(key)) return
  const e = lock.packages[key]; seen.set(key, e)
  for (const dep of Object.keys({ ...e.dependencies, ...e.optionalDependencies })) visit(resolve(key, dep))
}
for (const dep of Object.keys(pkg.dependencies ?? {})) visit(resolve('', dep))

const hexOf = (integrity) => { const m = /^sha512-(.+)$/.exec(integrity ?? ''); return m ? [{ alg: 'SHA-512', content: Buffer.from(m[1], 'base64').toString('hex') }] : undefined }
const components = [...seen].map(([key, e]) => {
  const name = key.split('node_modules/').pop()
  const purl = `pkg:npm/${name.startsWith('@') ? name.replace('@', '%40') : name}@${e.version}`
  return { type: 'library', name, version: e.version, purl, 'bom-ref': purl, hashes: hexOf(e.integrity), licenses: e.license ? [{ license: { id: e.license } }] : undefined, scope: 'required' }
})

const cargo = fs.readFileSync(root + 'evtx-wasm/Cargo.lock', 'utf8')
for (const m of cargo.matchAll(/\[\[package\]\]\nname = "([^"]+)"\nversion = "([^"]+)"\n(?:source = "[^"]+"\n)?(?:checksum = "([0-9a-f]+)")?/g)) {
  if (m[1] === 'evtx-wasm') continue
  const purl = `pkg:cargo/${m[1]}@${m[2]}`
  components.push({ type: 'library', name: m[1], version: m[2], purl, 'bom-ref': purl, hashes: m[3] ? [{ alg: 'SHA-256', content: m[3] }] : undefined, scope: 'required', properties: [{ name: 'triage:ecosystem', value: 'rust (note: Cargo.lock lists the full resolution including host-only build dependencies)' }] })
}
components.sort((a, b) => a.purl.localeCompare(b.purl))
const bom = { bomFormat: 'CycloneDX', specVersion: '1.5', version: 1, metadata: { component: { type: 'application', name: pkg.name, version: pkg.version } }, components }
const out = JSON.stringify(bom, null, 2) + '\n'
if (process.argv.includes('--stdout')) process.stdout.write(out); else { fs.writeFileSync(root + 'sbom.cdx.json', out); console.log(`sbom.cdx.json: ${components.length} components`) }
export { bom }
