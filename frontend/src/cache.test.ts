import { expect, test } from "vitest"
import { deleteGuestCache, memoryStore, readResult, saveResult, type CachedResult } from "./cache"

const RECORD: CachedResult = {
  schemaVersion: 1,
  savedAt: "2026-10-09T06:00:00.000Z",
  mode: "replay",
  freshnessState: "fresh",
  sourceName: "fixture",
  shelterName: null,
  textSteps: [],
  limitation: "Fixture data is not a live provider response and is not a safety approval.",
  readOnly: true,
}

test("saved result round-trips and deletion removes it", async () => {
  const store = memoryStore()
  await saveResult(store, RECORD)
  expect((await readResult(store)).status).toBe("ok")
  await deleteGuestCache(store)
  expect(await readResult(store)).toEqual({ status: "miss" })
})

test("corrupt and old records stay unreadable", async () => {
  const store = memoryStore()
  await store.put({ ...RECORD, schemaVersion: 1, textSteps: "nope" } as unknown as CachedResult)
  expect((await readResult(store)).status).toBe("corrupt")
  await store.put({ ...RECORD, schemaVersion: 0 } as unknown as CachedResult)
  expect((await readResult(store)).status).toBe("upgrade")
})
