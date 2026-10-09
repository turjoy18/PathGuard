import { expect, test } from "vitest"
import { readFixture } from "./api"

test("unavailable fixture does not invent a route or warning", () => {
  const body = readFixture("unavailable")
  expect(body.route).toBeNull()
  expect(body.officialStatus).toBeNull()
  expect(body.freshnessState).toBe("unavailable")
})
