import type { Report } from '../core/report/model'

/**
 * Self-contained, script-free HTML report. All dynamic text goes through React's escaping (renderToStaticMarkup),
 * and the document ships its own CSP that forbids scripts, network access, forms and frames entirely.
 * react-dom/server is loaded lazily so it is not part of the initial bundle.
 */
export async function buildStandaloneHtml(report: Report): Promise<string> {
  const [{ renderToStaticMarkup }, { createElement }, { ReportDocument }, css] = await Promise.all([
    import('react-dom/server'), import('react'), import('./ReportDocument'), import('./report.css?inline'),
  ])
  const body = renderToStaticMarkup(createElement(ReportDocument, { report }))
  const day = report.generatedAt.slice(0, 10)
  // The only interpolated values besides `body` are a fixed string, an ISO date derived from a Date, and CSS from our own bundle.
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'">
<meta name="referrer" content="no-referrer">
<meta name="robots" content="noindex">
<title>Windows Security Triage Report ${day}</title>
<style>${css.default}</style>
</head>
<body>
${body}
</body>
</html>
`
}
