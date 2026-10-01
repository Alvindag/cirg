// Browser smoke test: builds the app with dev sign-in enabled, serves it, mocks the API at the network layer,
// and walks the main pages in a real (headless) Chromium. Run with: npm run e2e
import { spawn, execSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright-core'

const PORT = 4179
const shots = process.env.E2E_SHOTS ?? ''
const chrome = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'

execSync('npx vite build --outDir dist-e2e --emptyOutDir', { stdio: 'inherit', env: { ...process.env, VITE_DEV_LOGIN: 'true', VITE_API_BASE_URL: '' } })
const server = spawn('npx', ['vite', 'preview', '--outDir', 'dist-e2e', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
const base = `http://localhost:${PORT}`
for (let i = 0; i < 50; i++) {
  try { if ((await fetch(base)).ok) break } catch { /* not up yet */ }
  await new Promise((r) => setTimeout(r, 200))
}

const users = [
  { id: 'rep-1', tenantId: 't', fullName: 'Kofi Mensah', email: 'k@das.test', role: 'Rep', territoryId: 'terr-1', externalId: 'e1', managerId: 'me', isActive: true },
  { id: 'rep-2', tenantId: 't', fullName: 'Abena Owusu', email: 'a@das.test', role: 'Rep', territoryId: 'terr-1', externalId: 'e2', managerId: 'me', isActive: true },
  { id: 'me', tenantId: 't', fullName: 'Ama Boateng', email: 'ama@das.test', role: 'Admin', territoryId: null, externalId: 'e0', managerId: null, isActive: true },
]
const day = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)
const routes = {
  'GET /me': () => users[2],
  'GET /dashboards/sales': () => ({ callsCompleted: 184, plannedVisits: 215, planAdherencePct: 85.6, coveragePct: 72.4, byRep: [
    { repId: 'rep-1', calls: 96, uniqueCustomers: 61, outsideGeofence: 2 }, { repId: 'rep-2', calls: 88, uniqueCustomers: 55, outsideGeofence: 0 }] }),
  'GET /dashboards/trend': () => Array.from({ length: 30 }, (_, i) => ({ date: day(29 - i), calls: 3 + ((i * 7) % 5) })),
  'GET /dashboards/products': () => [{ productId: 'p1', name: 'Amoxil 500', calls: 72, sampleUnits: 310 }, { productId: 'p2', name: 'Cardiostat', calls: 41, sampleUnits: 120 }],
  'GET /gps/last-known': () => [{ repId: 'rep-1', recordedAt: new Date().toISOString(), latitude: 5.6037, longitude: -0.187 }],
  'GET /admin/users': () => users,
  'GET /admin/territories': () => [{ id: 'terr-1', name: 'Accra Central', region: 'Greater Accra', district: 'Accra' }],
  'GET /admin/products': () => [{ id: 'p1', name: 'Amoxil 500', code: 'AMX' }, { id: 'p2', name: 'Cardiostat', code: 'CRD' }],
  'GET /customers': () => ({ total: 2, page: 1, pageSize: 25, items: [
    { id: 'c1', type: 'Doctor', name: 'Dr Ama Boateng', specialty: 'Cardiology', segment: 'A', territoryId: 'terr-1', phone: null, email: null, city: 'Accra', targetVisitsPerMonth: 4 },
    { id: 'c2', type: 'Pharmacy', name: 'Ernest Chemists Osu', specialty: null, segment: 'B', territoryId: 'terr-1', phone: null, email: null, city: 'Accra', targetVisitsPerMonth: 2 }] }),
  'GET /samples/requests': () => [{ id: 'r1', repId: 'rep-1', productId: 'p1', quantity: 50, approvedQuantity: null, status: 'Pending', notes: 'Launch week', decisionNote: null, createdAt: new Date().toISOString() }],
  'GET /samples/reports/stock': () => [
    { holderId: null, location: 'Warehouse', batchId: 'b1', productId: 'p1', batchNumber: 'AMX-2611', expiryDate: '2027-08-01', daysToExpiry: 300, status: 'Active', quantity: 4200, expired: false, expiringSoon: false, actionRequired: false },
    { holderId: 'rep-2', location: 'Rep', batchId: 'b0', productId: 'p1', batchNumber: 'AMX-2501', expiryDate: '2026-09-01', daysToExpiry: -30, status: 'Active', quantity: 25, expired: true, expiringSoon: false, actionRequired: true }],
  'GET /ai/customers/scores': () => [
    { customerId: 'c1', name: 'Dr Ama Boateng', potential: 90, engagement: 12, overall: 43, status: 'At risk', suggestedSegment: 'B' },
    { customerId: 'c2', name: 'Ernest Chemists Osu', potential: 60, engagement: 80, overall: 72, status: 'Healthy', suggestedSegment: null }],
  'GET /ai/customers/c1/score': () => ({ customerId: 'c1', name: 'Dr Ama Boateng', potential: 90, engagement: 12, overall: 43, status: 'At risk', suggestedSegment: 'B', factors: [
    { name: 'Potential', points: 90, max: 100, explanation: 'A segment, 1 product interest(s).' }, { name: 'Recency', points: 0, max: 35, explanation: 'Last visited 120 day(s) ago.' }] }),
  'GET /admin/audit-logs': () => [{ id: 3, userId: 'me', at: new Date().toISOString(), action: 'create', entityType: 'SampleBatch', entityId: 'b1b1b1b1-0000', changes: null }],
}

const errors = []
const browser = await chromium.launch({ executablePath: chrome, args: ['--no-sandbox'] })
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  await ctx.addInitScript(() => sessionStorage.setItem('das.devToken', 'test-token'))
  await ctx.route('**/api/v1/**', async (route) => {
    const req = route.request()
    const path = new URL(req.url()).pathname.replace('/api/v1', '')
    const handler = routes[`${req.method()} ${path}`]
    if (!handler) { errors.push(`unmocked ${req.method()} ${path}`); return route.fulfill({ status: 404, body: 'not mocked' }) }
    if (req.headers()['authorization'] !== 'Bearer test-token') { errors.push('missing bearer token on ' + path); return route.fulfill({ status: 401, body: '' }) }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(handler()) })
  })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push('page error: ' + e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })
  if (shots) mkdirSync(shots, { recursive: true })
  const shot = async (name) => { if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true }) }
  const expectText = async (text) => page.getByText(text, { exact: false }).first().waitFor({ timeout: 8000 })

  await page.goto(base)
  await expectText('Sales overview')
  await expectText('184')
  await expectText('Kofi Mensah')
  await page.waitForSelector('.recharts-line-curve', { timeout: 8000 })   // the trend chart really rendered
  await page.waitForSelector('.recharts-bar-rectangle', { timeout: 8000 })
  await shot('overview')

  await page.getByRole('link', { name: 'Customers' }).click()
  await expectText('Dr Ama Boateng')
  await shot('customers')

  await page.getByRole('link', { name: 'Team' }).click()
  await expectText('Add a person')
  await shot('team')

  await page.getByRole('link', { name: 'Samples' }).click()
  await expectText('Launch week')
  await page.getByRole('button', { name: 'Approve' }).waitFor()
  await shot('samples-requests')
  await page.getByRole('tab', { name: 'Stock' }).click()
  await expectText('should be recovered')
  await shot('samples-stock')

  await page.getByRole('link', { name: 'Insights' }).click()
  await expectText('At risk')
  await page.getByRole('button', { name: 'Dr Ama Boateng' }).click()
  await expectText('Last visited 120 day(s) ago.')
  await shot('insights')

  await page.getByRole('link', { name: 'Audit' }).click()
  await expectText('SampleBatch')
  await shot('audit')

  // phone width: nothing should overflow horizontally
  await page.setViewportSize({ width: 390, height: 800 })
  await page.getByRole('link', { name: 'Overview' }).click()
  await expectText('184')
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  if (overflow > 1) errors.push(`page scrolls horizontally on a phone (${overflow}px)`)
  await shot('overview-phone')
} catch (e) {
  errors.push('test failed: ' + e.message)
} finally {
  await browser.close()
  server.kill()
}
if (errors.length) { console.error('E2E problems:\n - ' + errors.join('\n - ')); process.exit(1) }
console.log('E2E smoke test passed')
