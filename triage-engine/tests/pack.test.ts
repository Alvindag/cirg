import { describe, expect, it } from 'vitest'
import defaultPack from '../rules/default-pack.json'
import { buildRules } from '../src/core/analysis'
import { loadPack } from '../src/core/rules/load'

describe('default pack', () => {
  it('validates, compiles and has no warnings', () => {
    const r = loadPack(JSON.stringify(defaultPack), 'json')
    expect(r.errors).toEqual([])
    expect(r.warnings).toEqual([])
    const { comp, report } = buildRules([])
    expect(report.errors).toEqual([])
    expect(comp.rules.length).toBe(20)
    expect(comp.deferred.map((d) => d.id)).toEqual(['LAT-001'])
  })
})
