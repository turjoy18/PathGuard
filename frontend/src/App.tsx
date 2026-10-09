import { useState } from "react"
import { BrowserRouter, Route, Routes } from "react-router-dom"
import { readFixture, type FixtureMode } from "./api"
import {
  Home,
  Landing,
  Profile,
  QuickStart,
  ReportHazard,
  Reroute,
  RoutePage,
  ShelterDetail,
  ShelterMatch,
  Sources,
  TyphoonReference,
} from "./pages"
import { Shell } from "./shell"

export default function App() {
  const [mode, setMode] = useState<FixtureMode>("replay")
  const fixture = readFixture(mode)
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Shell mode={mode} onMode={setMode} />}>
          <Route index element={<Landing />} />
          <Route path="start" element={<QuickStart />} />
          <Route path="home" element={<Home fixture={fixture} />} />
          <Route path="sources" element={<Sources fixture={fixture} />} />
          <Route path="shelters" element={<ShelterMatch />} />
          <Route path="shelters/:id" element={<ShelterDetail />} />
          <Route path="route" element={<RoutePage fixture={fixture} />} />
          <Route path="reroute" element={<Reroute />} />
          <Route path="profile" element={<Profile />} />
          <Route path="report" element={<ReportHazard />} />
          <Route path="typhoon-reference" element={<TyphoonReference fixture={fixture} />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
