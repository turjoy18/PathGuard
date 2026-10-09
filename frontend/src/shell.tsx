import { NavLink, Outlet, useLocation } from "react-router-dom"
import { FIXTURE_MODES, type FixtureMode } from "./api"
import type { CopyKey } from "./i18n"
import { useGuest } from "./journey"
import { OfflineNotice } from "./pwa"

const TABS: [string, CopyKey][] = [
  ["/home", "navHome"],
  ["/shelters", "navMatch"],
  ["/route", "navRoute"],
  ["/profile", "navProfile"],
]

export function Shell({ mode, onMode }: { mode: FixtureMode; onMode: (mode: FixtureMode) => void }) {
  const { t } = useGuest()
  const { pathname } = useLocation()
  const intro = pathname === "/" || pathname === "/start"
  return (
    <div className="app">
      <a className="skip" href="#main">{t("skip")}</a>
      <header className="top">
        <p className="mark"><NavLink to={intro ? "/" : "/home"}>PathGuard</NavLink></p>
        <select className="quiet" aria-label={t("fixture")} value={mode} onChange={(event) => onMode(event.target.value as FixtureMode)}>
          {FIXTURE_MODES.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </header>
      <OfflineNotice />
      <main id="main">
        <Outlet />
      </main>
      {intro ? null : (
        <nav className="tabs" aria-label="Primary">
          {TABS.map(([to, label]) => (
            <NavLink key={to} to={to}>{t(label)}</NavLink>
          ))}
        </nav>
      )}
    </div>
  )
}
