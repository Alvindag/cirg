/** Small fuzzy matcher for the command palette: every typed character must appear in order; earlier, tighter and word-start matches score higher. */
export function fuzzyScore(query: string, text: string): number {
  const q = query.trim().toLowerCase()
  if (!q) return 1
  const t = text.toLowerCase()
  const whole = t.indexOf(q)
  if (whole >= 0) return 1000 - whole - (t.length - q.length) * 0.1 + (whole === 0 || t[whole - 1] === ' ' ? 200 : 0)
  let ti = 0
  let score = 0
  let first = -1
  let last = -2
  for (const ch of q) {
    const at = t.indexOf(ch, ti)
    if (at < 0) return 0
    score += 10 - Math.min(9, at - ti) + (at === last + 1 ? 15 : 0) + (at === 0 || t[at - 1] === ' ' ? 10 : 0)
    if (first < 0) first = at
    last = at
    ti = at + 1
  }
  // letters scattered across a long text are not a match: the span must stay close to the query's own length
  if (last - first + 1 > q.length * 2 + 2) return 0
  return score
}
