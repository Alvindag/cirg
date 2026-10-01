import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { ErrorBox, Loading } from './components/ui'
import { useApp } from './context'
import { canUseDashboard } from './lib/roles'

// Each page is its own chunk, so the charting library only loads when the overview is opened.
const Overview = lazy(() => import('./pages/Overview').then((m) => ({ default: m.Overview })))
const Customers = lazy(() => import('./pages/Customers').then((m) => ({ default: m.Customers })))
const Team = lazy(() => import('./pages/Team').then((m) => ({ default: m.Team })))
const Samples = lazy(() => import('./pages/Samples').then((m) => ({ default: m.Samples })))
const Insights = lazy(() => import('./pages/Insights').then((m) => ({ default: m.Insights })))
const Erp = lazy(() => import('./pages/Erp').then((m) => ({ default: m.Erp })))
const Audit = lazy(() => import('./pages/Audit').then((m) => ({ default: m.Audit })))

export function App() {
  const { me } = useApp()
  if (!canUseDashboard(me.role)) {
    return (
      <main className="center">
        <h1>DAS Engage 360</h1>
        <p>The web dashboard is for managers and the commercial team. Sales representatives work in the DAS Engage mobile app.</p>
      </main>
    )
  }
  return (
    <Suspense fallback={<Loading />}>
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Overview />} />
        <Route path="customers" element={<Customers />} />
        <Route path="team" element={<Team />} />
        <Route path="samples" element={<Samples />} />
        <Route path="insights" element={<Insights />} />
        <Route path="erp" element={<Erp />} />
        <Route path="audit" element={<Audit />} />
        <Route path="*" element={<ErrorBox message="Page not found." />} />
      </Route>
    </Routes>
    </Suspense>
  )
}
