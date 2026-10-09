export type Tri = "unknown" | "yes" | "no"

export type Capability = "unset" | "granted" | "denied" | "dismissed" | "unsupported"

export type LocationState = "unset" | "granted" | "denied" | "dismissed" | "unsupported" | "low-accuracy" | "manual"

export type GuestProfile = {
  mobility: "unknown" | "wheelchair" | "walker" | "walking"
  stairs: "unknown" | "avoid" | "can-use"
  vision: "unknown" | "low" | "typical"
  hearing: "unknown" | "low" | "typical"
  textScale: 100 | 150 | 200
  language: "en" | "zh-Hant"
  guestDataAcknowledged: boolean
  locationState: LocationState
  manualOrigin: string
  permissions: {
    notification: Capability
    camera: Capability
    vibration: Capability
    speech: Capability
    gps: Capability
  }
}

export function emptyProfile(): GuestProfile {
  return {
    mobility: "unknown",
    stairs: "unknown",
    vision: "unknown",
    hearing: "unknown",
    textScale: 100,
    language: "en",
    guestDataAcknowledged: false,
    locationState: "unset",
    manualOrigin: "",
    permissions: { notification: "unset", camera: "unset", vibration: "unset", speech: "unset", gps: "unset" },
  }
}

export function plannerSnapshot(profile: GuestProfile) {
  return {
    mobility: profile.mobility,
    stairs: profile.stairs,
    vision: profile.vision,
    hearing: profile.hearing,
    textScale: profile.textScale,
    language: profile.language,
    locationState: profile.locationState,
    manualOrigin: profile.locationState === "manual" ? profile.manualOrigin : null,
    permissions: profile.permissions,
  }
}
