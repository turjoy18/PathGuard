import { expect, test } from "vitest"
import { presentMatch, presentRoute } from "./presentation"

test("wheelchair match excludes the closed stairs-only shelter", () => {
  const match = presentMatch("wheelchair")
  expect(match.selected?.id).toBe("pg-proto-central-001")
  expect(match.rejected.map((item) => item.id)).toContain("pg-proto-central-002")
  expect(match.alternatives.every((item) => item.stepFree !== "yes" || item.status !== "open")).toBe(true)
})

test("unavailable route fixture draws no steps", () => {
  expect(presentRoute("unavailable").steps).toEqual([])
  expect(presentRoute("replay").limitation).toContain("Not a live CSDI")
})
