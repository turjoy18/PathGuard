import { NavLink, Outlet } from "react-router-dom"
import { FIXTURE_MODES, type FixtureMode } from "./api"
import type { CopyKey } from "./i18n"
import { useGuest } from "./journey"
import { OfflineNotice, UpdatePrompt } from "./pwa"

const LINKS: [string, CopyKey][] = [
  ["/", "navLanding"],
  ["/start", "navStart"],
  ["/home", "navHome"],
  ["/sources", "navSources"],
  ["/shelters", "navMatch"],
  ["/shelters/prototype", "navDetail"],
  ["/route", "navRoute"],
  ["/reroute", "navReroute"],
  ["/profile", "navProfile"],
  ["/report", "navReport"],
  ["/typhoon-reference", "navTyphoon"],
]

export function Shell({ mode, onMode }: { mode: FixtureMode; onMode: (mode: FixtureMode) => void }) {
  const { t } = useGuest()
  return (
    <div className="app">
      <a className="skip" href="#main">{t("skip")}</a>
      <header className="top">
        <p className="mark">PathGuard</p>
        <label className="field compact">
          <span>{t("fixture")}</span>
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
            {t(label)}
          </NavLink>
        ))}
      </nav>
      <OfflineNotice />
      <UpdatePrompt />
      <main id="main">
        <Outlet />
      </main>
    </div>
  )
}
