import { useState, type DragEvent, type ReactNode } from 'react'
import * as L from '../lib/layout'

export interface Widget { id: string; title: string; span: L.Span; node: ReactNode; /** false hides it everywhere (for example no data yet, or not for this role) */ available?: boolean }

const WIDTH: Record<L.Span, string> = { 4: 'Small', 6: 'Medium', 8: 'Wide', 12: 'Full width' }

/** A dashboard grid people can rearrange: drag a card (or use its buttons), make it wider or narrower, hide it. The layout is remembered per person on this device. */
export function Bento({ storageKey, widgets, toolbar }: { storageKey: string; widgets: Widget[]; toolbar?: ReactNode }) {
  const defaults = widgets.map((w) => ({ id: w.id, span: w.span }))
  const [layout, setLayout] = useState(() => L.load(storageKey, defaults))
  const [editing, setEditing] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const byId = new Map(widgets.map((w) => [w.id, w]))
  const shown = (id: string) => byId.get(id)?.available !== false

  const change = (next: L.Slot[]) => { setLayout(next); L.save(storageKey, next) }
  const visible = layout.filter((s) => !s.hidden && shown(s.id) && byId.has(s.id))
  const hidden = layout.filter((s) => s.hidden && shown(s.id) && byId.has(s.id))

  const onDrop = (e: DragEvent, targetId: string) => {
    e.preventDefault()
    if (dragId) change(L.moveTo(layout, dragId, targetId))
    setDragId(null); setOverId(null)
  }

  return (
    <>
      <div className="bento-bar">
        {toolbar}
        {editing && <button className="link" onClick={() => { L.clear(storageKey); setLayout(L.defaultLayout(defaults)) }}>Reset layout</button>}
        <button className={editing ? 'primary' : ''} aria-pressed={editing} onClick={() => setEditing(!editing)}>{editing ? 'Done' : 'Customise'}</button>
      </div>
      {editing && <p className="muted note" role="note">Drag a card to move it, or use its buttons. Your layout is saved on this device.</p>}

      <div className={`bento ${editing ? 'editing' : ''}`}>
        {visible.map((s) => {
          const w = byId.get(s.id)!
          return (
            <div
              key={s.id}
              className={`bento-cell ${dragId === s.id ? 'dragging' : ''} ${overId === s.id && dragId !== s.id ? 'over' : ''}`}
              style={{ ['--span' as string]: s.span }}
              data-widget={s.id}
              draggable={editing}
              onDragStart={(e) => { setDragId(s.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', s.id) }}
              onDragOver={(e) => { if (editing && dragId) { e.preventDefault(); setOverId(s.id) } }}
              onDragLeave={() => setOverId((o) => (o === s.id ? null : o))}
              onDrop={(e) => onDrop(e, s.id)}
              onDragEnd={() => { setDragId(null); setOverId(null) }}
            >
              {editing && (
                <div className="bento-tools" role="group" aria-label={`Arrange ${w.title}`}>
                  <span className="bento-grip" aria-hidden="true">⠿</span>
                  <b>{w.title}</b>
                  <button aria-label={`Move ${w.title} earlier`} onClick={() => change(L.step(layout, s.id, -1, shown))}>↑</button>
                  <button aria-label={`Move ${w.title} later`} onClick={() => change(L.step(layout, s.id, 1, shown))}>↓</button>
                  <button aria-label={`Change width of ${w.title} (now ${WIDTH[s.span]})`} onClick={() => change(L.resize(layout, s.id))}>{WIDTH[s.span]}</button>
                  <button aria-label={`Hide ${w.title}`} onClick={() => change(L.setHidden(layout, s.id, true))}>Hide</button>
                </div>
              )}
              {w.node}
            </div>
          )
        })}
      </div>

      {editing && hidden.length > 0 && (
        <div className="bento-tray" role="group" aria-label="Hidden widgets">
          <span className="muted">Hidden:</span>
          {hidden.map((s) => <button key={s.id} onClick={() => change(L.setHidden(layout, s.id, false))}>Show {byId.get(s.id)!.title}</button>)}
        </div>
      )}
    </>
  )
}
