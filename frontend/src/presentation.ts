export type Tri = "yes" | "no" | "unknown"

export type ShelterView = {
  id: string
  name: string
  address: string
  authority: string
  status: "open" | "closed" | "unknown"
  verifiedAt: string | null
  stairsOnly: Tri
  lift: Tri
  stepFree: Tri
  reason: string
}

const SHELTERS: Omit<ShelterView, "reason">[] = [
  {
    id: "pg-proto-central-001",
    name: "Prototype Shelter - Central Community Hall",
    address: "10 Ice House Street, Central, Hong Kong",
    authority: "PathGuard prototype catalogue",
    status: "open",
    verifiedAt: "2026-10-01",
    stairsOnly: "no",
    lift: "yes",
    stepFree: "yes",
  },
  {
    id: "pg-proto-central-002",
    name: "Prototype Shelter - Admiralty Assembly Point",
    address: "1 Tamar Street, Admiralty, Hong Kong",
    authority: "PathGuard prototype catalogue",
    status: "closed",
    verifiedAt: "2026-08-01",
    stairsOnly: "yes",
    lift: "no",
    stepFree: "no",
  },
  {
    id: "pg-proto-central-003",
    name: "Prototype Shelter - Mid-Levels Rest Point",
    address: "80 Robinson Road, Mid-Levels, Hong Kong",
    authority: "PathGuard prototype catalogue",
    status: "unknown",
    verifiedAt: null,
    stairsOnly: "unknown",
    lift: "unknown",
    stepFree: "unknown",
  },
  {
    id: "pg-proto-central-004",
    name: "Prototype Shelter - Queens Road Annex",
    address: "88 Queens Road Central, Central, Hong Kong",
    authority: "PathGuard prototype catalogue",
    status: "open",
    verifiedAt: "2026-10-08",
    stairsOnly: "unknown",
    lift: "unknown",
    stepFree: "unknown",
  },
]

export const CATALOGUE_LABEL = "PathGuard verified prototype/demo catalogue"
export const CATALOGUE_LIMIT = "Central Hong Kong pilot only. Not official citywide coverage. A typhoon shelter is not a destination."

export function presentMatch(mobility: string) {
  const rejected: ShelterView[] = []
  const alternatives: ShelterView[] = []
  let selected: ShelterView | null = null
  for (const shelter of SHELTERS) {
    if (shelter.status === "closed") {
      rejected.push({ ...shelter, reason: "Closed in the prototype catalogue." })
      continue
    }
    if (mobility === "wheelchair" && shelter.stairsOnly === "yes") {
      rejected.push({ ...shelter, reason: "Stairs-only entrance. Excluded for a wheelchair profile." })
      continue
    }
    const verifiedStepFree = shelter.status === "open" && shelter.stepFree === "yes"
    if (!selected && verifiedStepFree) {
      selected = { ...shelter, reason: "Open, with a recorded step-free entrance. Other facts can still be unknown." }
      continue
    }
    alternatives.push({
      ...shelter,
      reason: shelter.status === "unknown" || shelter.stepFree === "unknown"
        ? "Shown as an alternative. Missing access facts stay unknown."
        : "Open alternative. Not the step-free match.",
    })
  }
  return { selected, alternatives, rejected, label: CATALOGUE_LABEL, limitation: CATALOGUE_LIMIT }
}

export function shelterById(id: string) {
  return SHELTERS.find((shelter) => shelter.id === id) ?? null
}

export function presentRoute(mode: string) {
  if (mode === "unavailable") {
    return { available: false as const, steps: [] as string[], limitation: "The route provider is unavailable. No line was drawn." }
  }
  return {
    available: true as const,
    provider: "CSDI pedestrian route",
    accessibility: "not_evaluated" as const,
    distanceMeters: 420,
    steps: [
      "Leave the recorded origin toward Ice House Street.",
      "Continue to the prototype step-free entrance.",
    ],
    hazard: "A pending community report is visible and does not block this fixture route.",
    limitation: "Fixture text steps. Not a live CSDI solve and not an accessibility approval. Map is unavailable.",
  }
}
