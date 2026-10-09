export type CachedResult = {
  schemaVersion: 1
  savedAt: string
  mode: string
  freshnessState: string
  sourceName: string
  shelterName: string | null
  textSteps: string[]
  limitation: string
  readOnly: true
}

export type CacheStore = {
  get(): Promise<unknown>
  put(value: CachedResult): Promise<void>
  clear(): Promise<void>
}

export type CacheRead =
  | { status: "ok"; record: CachedResult }
  | { status: "miss" | "corrupt" | "upgrade" }

export function memoryStore(): CacheStore {
  let value: CachedResult | null = null
  return {
    async get() { return value },
    async put(next) { value = next },
    async clear() { value = null },
  }
}

export async function saveResult(store: CacheStore, record: CachedResult) {
  await store.put(record)
}

export async function readResult(store: CacheStore): Promise<CacheRead> {
  const value = await store.get()
  if (value == null) return { status: "miss" }
  if (typeof value !== "object") return { status: "corrupt" }
  const record = value as Partial<CachedResult>
  if (typeof record.schemaVersion === "number" && record.schemaVersion !== 1) return { status: "upgrade" }
  if (record.schemaVersion !== 1 || typeof record.savedAt !== "string" || typeof record.mode !== "string" || !Array.isArray(record.textSteps)) {
    return { status: "corrupt" }
  }
  return { status: "ok", record: { ...record, readOnly: true, textSteps: record.textSteps.map(String) } as CachedResult }
}

export async function deleteGuestCache(store: CacheStore) {
  await store.clear()
}

export function openBrowserStore(): Promise<CacheStore> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("pathguard", 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("results")) request.result.createObjectStore("results")
    }
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      const run = <T,>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) =>
        new Promise<T>((done, fail) => {
          const tx = db.transaction("results", mode)
          const result = action(tx.objectStore("results"))
          result.onsuccess = () => done(result.result)
          result.onerror = () => fail(result.error)
        })
      resolve({
        get: () => run("readonly", (store) => store.get("current")),
        put: (value) => run("readwrite", (store) => store.put(value, "current")).then(() => undefined),
        clear: () => run("readwrite", (store) => store.delete("current")).then(() => undefined),
      })
    }
  })
}
