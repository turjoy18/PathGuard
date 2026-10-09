import { useState } from "react"
import { Link } from "react-router-dom"
import type { FixtureEnvelope } from "./api"
import { GuestForm, useGuest } from "./journey"
import { Banner, Button, Card, Confirm, Empty, ErrorState, Loading, StatusChip } from "./ui"

export function Landing() {
  const { t } = useGuest()
  return (
    <>
      <h1>{t("landingTitle")}</h1>
      <p>{t("landingBody")}</p>
      <Link className="button" to="/start">{t("start")}</Link>
    </>
  )
}

export function QuickStart() {
  const { t } = useGuest()
  return (
    <>
      <GuestForm titleKey="quickTitle" />
      <Link className="button" to="/home">{t("continue")}</Link>
    </>
  )
}

export function Home({ fixture }: { fixture: FixtureEnvelope }) {
  const { profile, t } = useGuest()
  const origin = profile.locationState === "manual" ? profile.manualOrigin : profile.locationState
  return (
    <>
      <h1>{t("navHome")}</h1>
      <p>{t("originLabel")}: {origin === "unset" ? t("noOrigin") : `${origin} (${profile.locationState})`}</p>
      <Banner>{fixture.limitation}</Banner>
      <StatusChip>{fixture.mode}</StatusChip>
      <StatusChip>{fixture.freshnessState}</StatusChip>
      {fixture.officialStatus === null ? <ErrorState title="Source unavailable" detail="No official status was returned." /> : <Card title="Official status"><p>Warning text: unknown in this fixture.</p></Card>}
    </>
  )
}

export function Sources({ fixture }: { fixture: FixtureEnvelope }) {
  return (
    <>
      <h1>Sources</h1>
      <Card title="Official sources">
        <ul>
          <li>CSDI 3D pedestrian route</li>
          <li>Hong Kong Observatory warnings</li>
          <li>Marine Department typhoon-shelter reference</li>
        </ul>
        <p>Contract {fixture.contractVersion}. Mode {fixture.mode}.</p>
      </Card>
    </>
  )
}

export function ShelterMatch() {
  return <Empty title="No shelter match yet" detail="The planner is not connected. No destination was chosen." />
}

export function ShelterDetail() {
  return (
    <Card title="Shelter detail">
      <p>Authority, status, and accessibility are unknown until a human-shelter record is loaded.</p>
    </Card>
  )
}

export function RoutePage({ fixture }: { fixture: FixtureEnvelope }) {
  return (
    <>
      <h1>Route</h1>
      {fixture.route === null ? <Empty title="No route geometry" detail="A missing route stays missing. This screen does not draw a straight line." /> : null}
      <Loading label="Map is not loaded." />
    </>
  )
}

export function Reroute() {
  const [open, setOpen] = useState(false)
  const [choice, setChoice] = useState("No destination change is pending.")
  return (
    <>
      <h1>Reroute</h1>
      <p>{choice}</p>
      <Button onClick={() => setOpen(true)}>Review a confirmation</Button>
      {open ? (
        <Confirm
          title="Keep the current destination?"
          detail="Confirming here does not select a new shelter."
          onConfirm={() => {
            setChoice("Confirmation recorded. Destination unchanged.")
            setOpen(false)
          }}
          onDismiss={() => {
            setChoice("Dismissed. Destination unchanged.")
            setOpen(false)
          }}
        />
      ) : null}
    </>
  )
}

export function Profile() {
  return <GuestForm titleKey="profileTitle" />
}

export function ReportHazard() {
  return <Empty title="Report hazard" detail="Hazard submission stays on the server API. This screen does not accept a report yet." />
}

export function TyphoonReference({ fixture }: { fixture: FixtureEnvelope }) {
  return (
    <>
      <h1>Typhoon Shelter Reference</h1>
      <Banner>A typhoon shelter is a vessel refuge. It is not a human evacuation shelter.</Banner>
      <p>Source mode {fixture.mode}. No recommendation action is on this screen.</p>
    </>
  )
}
