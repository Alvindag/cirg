import { NavLink, Outlet } from 'react-router-dom'
import { useApp } from '../context'
import { BrandMark } from './BrandMark'
import { Notifications } from './Notifications'
import { ThemeSwitch } from './ThemeSwitch'
import { canSeeErp, isManager } from '../lib/roles'

export function Layout() {
  const { me, signOut } = useApp()
  const manager = isManager(me.role)
  return (
    <div className="shell">
      <header className="topbar">
        <strong className="brand"><BrandMark />DAS <span className="brand-sub">Engage 360</span></strong>
        <nav aria-label="Main">
          <NavLink to="/" end>Overview</NavLink>
          <NavLink to="/customers">Customers</NavLink>
          <NavLink to="/insights">Insights</NavLink>
          {manager && <NavLink to="/team">Team</NavLink>}
          {manager && <NavLink to="/samples">Samples</NavLink>}
          {canSeeErp(me.role) && <NavLink to="/erp">ERP</NavLink>}
          {manager && <NavLink to="/audit">Audit</NavLink>}
        </nav>
        <div className="who">
          <ThemeSwitch />
          <Notifications />
          <span>{me.fullName} <span className="muted small">({me.role})</span></span>
          <button onClick={signOut}>Sign out</button>
        </div>
      </header>
      <main><Outlet /></main>
    </div>
  )
}
