import { useEffect } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useApp } from '../context'
import { BrandMark } from './BrandMark'
import { CommandPalette } from './CommandPalette'
import { shortcutLabel } from '../lib/platform'
import { Notifications } from './Notifications'
import { ThemeSwitch } from './ThemeSwitch'
import { canSeeErp, isManager } from '../lib/roles'

export function Layout() {
  const { me, signOut } = useApp()
  const manager = isManager(me.role)
  // The page's mood: a faint tint in the background that changes with the section (see styles.css), so you can tell where you are at a glance.
  const section = useLocation().pathname.split('/')[1] || 'overview'
  useEffect(() => {
    document.documentElement.setAttribute('data-section', section)
    return () => document.documentElement.removeAttribute('data-section')
  }, [section])
  return (
    <div className="shell">
      <header className="topbar">
        <strong className="brand"><BrandMark />DAS <span className="brand-sub">Engage 360</span></strong>
        <nav aria-label="Main">
          <NavLink to="/" end>Overview</NavLink>
          <NavLink to="/customers">Customers</NavLink>
          <NavLink to="/insights">Insights</NavLink>
          {manager && <NavLink to="/rtm" aria-label="Route to market" title="Route to market">RTM</NavLink>}
          {manager && <NavLink to="/team">Team</NavLink>}
          {manager && <NavLink to="/samples">Samples</NavLink>}
          {canSeeErp(me.role) && <NavLink to="/erp">ERP</NavLink>}
          {manager && <NavLink to="/audit">Audit</NavLink>}
        </nav>
        <div className="who">
          <button className="cmd-hint" aria-label="Open the command palette" onClick={() => window.dispatchEvent(new Event('das:open-palette'))}><span className="cmd-label">Search </span><kbd>{shortcutLabel()}</kbd></button>
          <ThemeSwitch />
          <Notifications />
          <span>{me.fullName} <span className="muted small">({me.role})</span></span>
          <button onClick={signOut}>Sign out</button>
        </div>
      </header>
      <main><Outlet /></main>
      <CommandPalette />
    </div>
  )
}
