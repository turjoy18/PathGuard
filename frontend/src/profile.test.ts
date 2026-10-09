import { expect, test } from "vitest"
import { emptyProfile, plannerSnapshot } from "./profile"

test("unknown profile fields stay unknown in the planner snapshot", () => {
  const snapshot = plannerSnapshot(emptyProfile())
  expect(snapshot.mobility).toBe("unknown")
  expect(snapshot.stairs).toBe("unknown")
  expect(snapshot.manualOrigin).toBeNull()
})

test("language change does not clear mobility", () => {
  const profile = { ...emptyProfile(), mobility: "wheelchair" as const, language: "zh-Hant" as const }
  expect(plannerSnapshot(profile).mobility).toBe("wheelchair")
  expect(profile.language).toBe("zh-Hant")
})