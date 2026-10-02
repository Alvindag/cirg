import type { ReactNode } from 'react'
import { useCountUp } from '../lib/motion'

/** A shimmering placeholder (the words stay for screen readers). */
export function Loading({ what = 'Loading' }: { what?: string }) {
  return (
    <div className="skeleton" role="status">
      <span className="sr-only">{what}…</span>
      <i /><i /><i />
    </div>
  )
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error" role="alert">
      {message}
      {onRetry && <button className="link" onClick={onRetry}>Try again</button>}
    </div>
  )
}

/** A headline number. Pass `num` and `format` to have it count up (and re-count when it changes); `value` is the text without motion. */
export function Kpi({ label, value, hint, tone, num, format }: { label: string; value: string; hint?: string; tone?: 'good' | 'warn' | 'bad'; num?: number; format?: (n: number) => string }) {
  const counted = useCountUp(num ?? 0)
  const counting = num !== undefined && format !== undefined && counted !== num
  return (
    <div className={`kpi ${tone ?? ''}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">
        {counting ? <><span aria-hidden="true">{format(counted)}</span><span className="sr-only">{value}</span></> : value}
      </div>
      {hint && <div className="kpi-hint">{hint}</div>}
    </div>
  )
}

export function Section({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="card">
      <div className="card-head">
        <h2>{title}</h2>
        <div>{actions}</div>
      </div>
      {children}
    </section>
  )
}

export function Badge({ tone, children }: { tone?: 'good' | 'warn' | 'bad' | 'muted'; children: ReactNode }) {
  return <span className={`badge ${tone ?? 'muted'}`}>{children}</span>
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="muted">{children}</p>
}
