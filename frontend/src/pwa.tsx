import { useEffect, useState } from "react"
import type { FixtureEnvelope } from "./api"
import { deleteGuestCache, openBrowserStore, readResult, saveResult, type CachedResult } from "./cache"
import { Button } from "./ui"

function rememberFixture(fixture: FixtureEnvelope, savedAt: string): CachedResult {
  return {
    schemaVersion: 1,
    savedAt,
    mode: fixture.mode,
    freshnessState: fixture.freshnessState,
    sourceName: "fixture",
    shelterName: null,
    textSteps: [],
    limitation: fixture.limitation,
    readOnly: true,
  }
}

export function OfflineNotice() {
  const [online, setOnline] = useState(navigator.onLine)
  const [detail, setDetail] = useState("Nothing is saved on this device.")
  useEffect(() => {
    const refresh = () => setOnline(navigator.onLine)
    window.addEventListener("online", refresh)
    window.addEventListener("offline", refresh)
    openBrowserStore().then(readResult).then((result) => {
      if (result.status === "ok") {
        setDetail(`Saved ${result.record.savedAt}. Mode ${result.record.mode}. Read only. ${result.record.limitation}`)
      } else if (result.status === "corrupt") {
        setDetail("Saved information could not be read.")
      } else if (result.status === "upgrade") {
        setDetail("Saved information is from an older app version.")
      }
    }).catch(() => setDetail("Saved information could not be read."))
    return () => {
      window.removeEventListener("online", refresh)
      window.removeEventListener("offline", refresh)
    }
  }, [])
  if (online) return null
  return (
    <p className="banner" role="status">
      Offline — showing cached information. {detail}
    </p>
  )
}

export function UpdatePrompt() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null)
  const [install, setInstall] = useState<BeforeInstallPromptEvent | null>(null)
  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault()
      setInstall(event as BeforeInstallPromptEvent)
    }
    window.addEventListener("beforeinstallprompt", onPrompt)
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistration().then((registration) => {
        if (registration?.waiting) setWaiting(registration.waiting)
        registration?.addEventListener("updatefound", () => {
          const worker = registration.installing
          worker?.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) setWaiting(worker)
          })
        })
      })
    }
    return () => window.removeEventListener("beforeinstallprompt", onPrompt)
  }, [])
  return (
    <div className="row">
      <p>Install PathGuard from the browser menu when the device offers it. An update waits until you choose it.</p>
      {install ? <Button onClick={() => install.prompt()}>Install</Button> : null}
      {waiting ? <Button onClick={() => waiting.postMessage({ type: "skip-waiting" })}>Update</Button> : null}
    </div>
  )
}

export function SaveResult({ fixture }: { fixture: FixtureEnvelope }) {
  const [message, setMessage] = useState("")
  return (
    <>
      <Button onClick={async () => {
        try {
          await saveResult(await openBrowserStore(), rememberFixture(fixture, new Date().toISOString()))
          setMessage("Saved on this device. Cached steps stay empty when the fixture has no route.")
        } catch (error) {
          const quota = error instanceof DOMException && error.name === "QuotaExceededError"
          setMessage(quota ? "This device has no room to save the result." : "The result could not be saved.")
        }
      }}>Keep this result on this device</Button>
      {message ? <p role="status">{message}</p> : null}
    </>
  )
}

export function DeleteSaved() {
  const [message, setMessage] = useState("")
  return (
    <>
      <Button onClick={async () => {
        await deleteGuestCache(await openBrowserStore())
        setMessage("Saved result deleted from this device.")
      }}>Delete saved result</Button>
      {message ? <p role="status">{message}</p> : null}
    </>
  )
}

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void> }
