import { describe, expect, it } from 'vitest'
import { canApproveSamples, canImportCustomers, canUseDashboard, isAdmin, isManager } from './roles'
import { fmtDate, fmtInt, fmtPct, rangeLastDays, shortId } from './format'

describe('roles', () => {
  it('matches the API permission groups', () => {
    expect(isManager('AreaManager')).toBe(true)
    expect(isManager('Executive')).toBe(true)
    expect(isManager('Rep')).toBe(false)
    expect(isManager('Marketing')).toBe(false)
    expect(isAdmin('Admin')).toBe(true)
    expect(isAdmin('NationalSalesManager')).toBe(true)
    expect(isAdmin('RegionalManager')).toBe(false)
    expect(canApproveSamples('Executive')).toBe(false)
    expect(canApproveSamples('AreaManager')).toBe(true)
    expect(canImportCustomers('Rep')).toBe(false)
    expect(canUseDashboard('Rep')).toBe(false)
    expect(canUseDashboard('Marketing')).toBe(true)
  })
})

describe('format', () => {
  it('formats numbers and ids', () => {
    expect(fmtInt(12345)).toBe('12,345')
    expect(fmtPct(83.456)).toBe('83.5%')
    expect(shortId('abcdef1234567')).toBe('abcdef12')
  })
  it('formats dates and tolerates bad input', () => {
    expect(fmtDate('2026-10-01')).toMatch(/01 Oct 2026/)
    expect(fmtDate('not a date')).toBe('not a date')
  })
  it('builds a UTC range ending tomorrow', () => {
    const r = rangeLastDays(7, new Date('2026-10-10T15:30:00Z'))
    expect(r.from).toBe('2026-10-04T00:00:00.000Z')
    expect(r.to).toBe('2026-10-11T00:00:00.000Z')
  })
})
