import { useState } from "react"
import { Link, useParams } from "react-router-dom"
import type { FixtureEnvelope } from "./api"
import { GuestForm, useGuest } from "./journey"
import { presentMatch, presentRoute, shelterById } from "./presentation"
import { DeleteSaved, SaveResult, UpdatePrompt } from "./pwa"
import { Banner, Button, Card, Confirm, Empty, ErrorState } from "./ui"

export function Landing() {
  const { t } = useGuest()
  return (
    <section className="hero stack">
      <p className="meta">Central Hong Kong pilot</p>
      <h1>{t("landingTitle")}</h1>
      <p className="lede">{t("landingBody")}</p>
      <Link className="button primary" to="/start">{t("start")}</Link>
    </section>
  )
}

export function QuickStart() {
  const { t } = useGuest()
  return (
    <>
      <GuestForm titleKey="quickTitle" />
      <Link className="button primary" to="/home">{t("continue")}</Link>
    </>
  )
}

export function Home({ fixture }: { fixture: FixtureEnvelope }) {
  const { profile, t } = useGuest()
  const origin = profile.locationState === "manual" && profile.manualOrigin
    ? `${profile.manualOrigin} (manual)`
    : profile.locationState === "unset" ? t("noOrigin") : profile.locationState
  const match = presentMatch(profile.mobility)
  return (
    <div className="stack">
      <div>
        <p className="meta">{t("originLabel")}</p>
        <h1>{origin}</h1>
      </div>
      <Banner>{fixture.limitation}</Banner>
      {fixture.officialStatus === null ? (
        <ErrorState title="Source unavailable" detail="No official status was returned." />
      ) : (
        <Card title="Official status">
          <p>Warning text is unknown in this fixture. Mode {fixture.mode}, freshness {fixture.freshnessState}.</p>
        </Card>
      )}
      <Card title="Shelter match">
        <p>{match.selected ? match.selected.name : "No shelter is selected."}</p>
        <p className="meta">{match.limitation}</p>
        <Link className="button primary" to="/shelters">Review shelters</Link>
      </Card>
      <div className="link-list">
        <Link to="/sources">Sources</Link>
        <Link to="/typhoon-reference">Typhoon shelter reference</Link>
        <Link to="/report">Report a hazard</Link>
      </div>
    </div>
  )
}

export function Sources({ fixture }: { fixture: FixtureEnvelope }) {
  return (
    <div className="stack">
      <h1>Sources</h1>
      <Card title="What this screen uses">
        <p>CSDI pedestrian routes, Hong Kong Observatory warnings, and a separate Marine Department typhoon-shelter reference.</p>
        <p className="meta">Contract {fixture.contractVersion}. Mode {fixture.mode}.</p>
      </Card>
    </div>
  )
}

export function ShelterMatch() {
  const { profile } = useGuest()
  const match = presentMatch(profile.mobility)
  return (
    <div className="stack">
      <div>
        <p className="meta">{match.label}</p>
        <h1>Shelter match</h1>
        <p className="lede">{match.limitation}</p>
      </div>
      {match.selected ? (
        <Card title="Selected">
          <h2>{match.selected.name}</h2>
          <p>{match.selected.address}</p>
          <p>{match.selected.reason}</p>
          <p className="meta">Step-free {match.selected.stepFree}. Lift {match.selected.lift}. Status {match.selected.status}.</p>
          <Link className="button primary" to={`/shelters/${match.selected.id}`}>Why this shelter</Link>
        </Card>
      ) : <Empty title="No selected shelter" detail="The fixture has no verified step-free open shelter for this profile." />}
      {match.alternatives.length > 0 ? (
        <section className="stack">
          <h2>Alternatives</h2>
          {match.alternatives.map((shelter) => (
            <Card key={shelter.id} title={shelter.name}>
              <p>{shelter.reason}</p>
              <Link to={`/shelters/${shelter.id}`}>Details</Link>
            </Card>
          ))}
        </section>
      ) : null}
      {match.rejected.length > 0 ? (
        <section className="stack">
          <h2>Not selected</h2>
          {match.rejected.map((shelter) => (
            <Card key={shelter.id} title={shelter.name}>
              <p>{shelter.reason}</p>
            </Card>
          ))}
        </section>
      ) : null}
    </div>
  )
}

export function ShelterDetail() {
  const { id } = useParams()
  const shelter = shelterById(id ?? "")
  if (!shelter) return <Empty title="Shelter not in the pilot fixture" detail="This identifier is not in the Central Hong Kong prototype catalogue." />
  return (
    <div className="stack">
      <div>
        <p className="meta">{shelter.authority}</p>
        <h1>{shelter.name}</h1>
        <p>{shelter.address}</p>
      </div>
      <Card title="What is recorded">
        <p>Status: {shelter.status}</p>
        <p>Last verification: {shelter.verifiedAt ?? "unknown"}</p>
        <p>Step-free entrance: {shelter.stepFree}</p>
        <p>Lift: {shelter.lift}</p>
        <p>Stairs-only entrance: {shelter.stairsOnly}</p>
        <p className="meta">{CATALOGUE}</p>
      </Card>
      {shelter.status === "open" && shelter.stepFree === "yes" ? <Link className="button primary" to="/route">Show the text route</Link> : <p className="meta">This record is not offered as the selected destination.</p>}
    </div>
  )
}

const CATALOGUE = "Prototype catalogue. Missing values stay unknown. This is not a citywide official list."

export function RoutePage({ fixture }: { fixture: FixtureEnvelope }) {
  const route = presentRoute(fixture.mode)
  const [step, setStep] = useState(0)
  const [position, setPosition] = useState("No manual position yet.")
  if (!route.available) {
    return (
      <div className="stack">
        <h1>Route</h1>
        <ErrorState title="No route" detail={route.limitation} />
      </div>
    )
  }
  const current = route.steps[Math.min(step, route.steps.length - 1)]
  return (
    <div className="stack">
      <div>
        <p className="meta">{route.provider}</p>
        <h1>Text route</h1>
      </div>
      <Banner>{route.limitation}</Banner>
      <p>Accessibility check: {route.accessibility}. Distance in the fixture: {route.distanceMeters} m.</p>
      <Button className="next" onClick={() => setStep((value) => Math.min(value + 1, route.steps.length - 1))}>{current}</Button>
      <ol className="steps">
        {route.steps.map((text) => <li key={text}>{text}</li>)}
      </ol>
      <Card title="Map">
        <p>Map is unavailable. The text steps above remain the route.</p>
      </Card>
      <Card title="Hazard">
        <p>{route.hazard}</p>
      </Card>
      <p className="meta">{position}</p>
      <div className="row">
        <Button onClick={() => setPosition("Manual position recorded. This is not background tracking.")}>I am still on this step</Button>
        <Link className="button" to="/reroute">Changed conditions</Link>
        <Link className="button" to="/report">Report hazard</Link>
      </div>
      <SaveResult fixture={fixture} />
    </div>
  )
}

export function Reroute() {
  const [open, setOpen] = useState(true)
  const [choice, setChoice] = useState("A change is waiting for you. The destination has not moved.")
  return (
    <div className="stack">
      <h1>Check the route</h1>
      <p>{choice}</p>
      {open ? (
        <Confirm
          title="Keep the current destination?"
          detail="Confirming does not pick a new shelter."
          onConfirm={() => { setChoice("Kept. Destination unchanged."); setOpen(false) }}
          onDismiss={() => { setChoice("Dismissed. Destination unchanged."); setOpen(false) }}
        />
      ) : <Link className="button primary" to="/route">Back to the text route</Link>}
    </div>
  )
}

export function Profile() {
  return (
    <div className="stack">
      <GuestForm titleKey="profileTitle" />
      <UpdatePrompt />
      <DeleteSaved />
    </div>
  )
}

export function ReportHazard() {
  return (
    <div className="stack">
      <h1>Report a hazard</h1>
      <Card title="Not sent from this screen">
        <p>A community report stays pending until an operator reviews it. This page does not submit one and does not block the route.</p>
      </Card>
      <Link className="button" to="/route">Back to the route</Link>
    </div>
  )
}

export function TyphoonReference() {
  return (
    <div className="stack">
      <div>
        <p className="meta">Marine Department reference</p>
        <h1>Typhoon shelters</h1>
      </div>
      <Banner>A typhoon shelter is a vessel refuge. It is not a human evacuation shelter, and PathGuard will not route you there.</Banner>
      <Card title="Causeway Bay Typhoon Shelter"><p>Reference only. Capacity and opening status are unknown.</p></Card>
      <Card title="Aberdeen Typhoon Shelter"><p>Reference only. Capacity and opening status are unknown.</p></Card>
      <Link to="/shelters">Back to human shelters</Link>
    </div>
  )
}
