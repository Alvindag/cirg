import { NavLink, Outlet } from 'react-router-dom'
import { useApp } from '../context'
import { isManager } from '../lib/roles'

export function Layout() {
  const { me, signOut } = useApp()
  const manager = isManager(me.role)
  return (
    <div className="shell">
      <header className="topbar">
        <strong className="brand">DAS Engage 360</strong>
        <nav aria-label="Main">
          <NavLink to="/" end>Overview</NavLink>
          <NavLink to="/customers">Customers</NavLink>
          {manager && <NavLink to="/team">Team</NavLink>}
          {manager && <NavLink to="/samples">Samples</NavLink>}
          {manager && <NavLink to="/audit">Audit</NavLink>}
        </nav>
        <div className="who">
          <span>{me.fullName} <span className="muted small">({me.role})</span></span>
          <button onClick={signOut}>Sign out</button>
        </div>
      </header>
      <main><Outlet /></main>
    </div>
  )
}
