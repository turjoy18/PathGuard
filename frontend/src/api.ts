export const FIXTURE_MODES = [
  "live",
  "snapshot",
  "replay",
  "offline",
  "stale",
  "unknown",
  "unavailable",
] as const

export type FixtureMode = (typeof FIXTURE_MODES)[number]

export type FixtureEnvelope = {
  contractVersion: "official-source-contracts.v1"
  mode: FixtureMode
  freshnessState: "fresh" | "stale" | "unknown" | "unavailable"
  officialStatus: { state: "known" | "unknown" | "unavailable"; text: null } | null
  route: null
  limitation: string
}

const FRESHNESS: Record<FixtureMode, FixtureEnvelope["freshnessState"]> = {
  live: "fresh",
  snapshot: "fresh",
  replay: "fresh",
  offline: "unknown",
  stale: "stale",
  unknown: "unknown",
  unavailable: "unavailable",
}

export function readFixture(mode: FixtureMode): FixtureEnvelope {
  if (mode === "unavailable") {
    return {
      contractVersion: "official-source-contracts.v1",
      mode,
      freshnessState: "unavailable",
      officialStatus: null,
      route: null,
      limitation: "The fixture source is unavailable. No status or route was invented.",
    }
  }
  return {
    contractVersion: "official-source-contracts.v1",
    mode,
    freshnessState: FRESHNESS[mode],
    officialStatus: {
      state: mode === "unknown" ? "unknown" : "unavailable",
      text: null,
    },
    route: null,
    limitation: "Fixture data is not a live provider response and is not a safety approval.",
  }
}
