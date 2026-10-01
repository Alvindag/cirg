interface RangeOption { days: number; label: string }

const defaultRanges: RangeOption[] = [
  { days: 7, label: 'Last 7 days' },
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 90 days' },
]

export function RangePicker({ days, onChange }: { days: number; onChange: (d: number) => void }) {
  return (
    <label className="inline">
      Period{' '}
      <select value={days} onChange={(e) => onChange(Number(e.target.value))} aria-label="Period">
        {defaultRanges.map((r) => <option key={r.days} value={r.days}>{r.label}</option>)}
      </select>
    </label>
  )
}
