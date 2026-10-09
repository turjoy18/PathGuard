import { NavLink, Outlet } from "react-router-dom"
import { FIXTURE_MODES, type FixtureMode } from "./api"

const LINKS = [
  ["/", "Landing"],
  ["/start", "Quick Start"],
  ["/home", "Home"],
  ["/sources", "Sources"],
  ["/shelters", "Shelter Match"],
  ["/shelters/prototype", "Shelter Detail"],
  ["/route", "Route"],
  ["/reroute", "Reroute"],
  ["/profile", "Profile"],
  ["/report", "Report Hazard"],
  ["/typhoon-reference", "Typhoon Shelter Reference"],
] as const

export function Shell({ mode, onMode }: { mode: FixtureMode; onMode: (mode: FixtureMode) => void }) {
  return (
    <div className="app">
      <a className="skip" href="#main">Skip to content</a>
      <header className="top">
        <p className="mark">PathGuard</p>
        <label className="field compact">
          <span>Fixture mode</span>
          <select value={mode} onChange={(event) => onMode(event.target.value as FixtureMode)}>
            {FIXTURE_MODES.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </label>
      </header>
      <nav aria-label="Primary">
        {LINKS.map(([to, label]) => (
          <NavLink key={to} to={to} end={to === "/"}>
            {label}
          </NavLink>
        ))}
      </nav>
      <main id="main">
        <Outlet />
      </main>
    </div>
  )
}
