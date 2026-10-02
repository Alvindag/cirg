import { beforeEach, describe, expect, it } from 'vitest'
import * as L from './layout'

const defs: L.Fallback[] = [{ id: 'a', span: 6 }, { id: 'b', span: 6 }, { id: 'c', span: 12 }]
const ids = (l: L.Slot[]) => l.map((s) => s.id).join('')

describe('dashboard layout', () => {
  beforeEach(() => localStorage.clear())

  it('starts from the defaults', () => expect(ids(L.defaultLayout(defs))).toBe('abc'))

  it('drops widgets that no longer exist, adds new ones, ignores junk and bad widths', () => {
    const out = L.reconcile([{ id: 'c', span: 4, hidden: true }, { id: 'gone', span: 6 }, { id: 'c' }, null, { id: 'a', span: 5 }], defs)
    expect(ids(out)).toBe('cab')
    expect(out[0]).toEqual({ id: 'c', span: 4, hidden: true })
    expect(out[1].span).toBe(6) // 5 is not a width, so the default is used
    expect(L.reconcile('nonsense', defs)).toEqual(L.defaultLayout(defs))
  })

  it('moves a widget to another position', () => {
    const l = L.defaultLayout(defs)
    expect(ids(L.moveTo(l, 'c', 'a'))).toBe('cab')
    expect(ids(L.moveTo(l, 'a', 'c'))).toBe('bca')
    expect(L.moveTo(l, 'a', 'a')).toBe(l)
    expect(L.moveTo(l, 'x', 'a')).toBe(l)
  })

  it('steps past hidden and unavailable widgets, and stops at the ends', () => {
    let l = L.defaultLayout(defs)
    l = L.setHidden(l, 'b', true)
    expect(ids(L.step(l, 'c', -1, () => true))).toBe('cab') // b is hidden, so c steps over it to where a is
    expect(L.step(l, 'a', -1, () => true)).toBe(l)
    expect(L.step(l, 'c', 1, () => true)).toBe(l)
    expect(ids(L.step(L.defaultLayout(defs), 'c', -1, (id) => id !== 'b'))).toBe('cab')
  })

  it('cycles the width and hides or shows', () => {
    expect([4, 6, 8, 12].map((n) => L.nextSpan(n as L.Span))).toEqual([6, 8, 12, 4])
    const l = L.resize(L.defaultLayout(defs), 'a')
    expect(l[0].span).toBe(8)
    expect(L.setHidden(l, 'a', true)[0].hidden).toBe(true)
  })

  it('saves, loads and clears, and survives broken storage', () => {
    const l = L.resize(L.defaultLayout(defs), 'b')
    L.save('k', l)
    expect(L.load('k', defs)).toEqual(l)
    L.clear('k')
    expect(L.load('k', defs)).toEqual(L.defaultLayout(defs))
    localStorage.setItem('k', '{broken')
    expect(L.load('k', defs)).toEqual(L.defaultLayout(defs))
  })
})
