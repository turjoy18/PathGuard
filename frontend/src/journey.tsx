import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { STRINGS, type CopyKey } from "./i18n"
import { emptyProfile, type Capability, type GuestProfile } from "./profile"
import { Button, Field } from "./ui"

type GuestValue = {
  profile: GuestProfile
  patch: (next: Partial<GuestProfile>) => void
  t: (key: CopyKey) => string
}

const GuestContext = createContext<GuestValue | null>(null)

export function GuestProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState(emptyProfile)
  useEffect(() => {
    document.documentElement.lang = profile.language === "zh-Hant" ? "zh-Hant" : "en"
    document.documentElement.style.fontSize = `${profile.textScale}%`
  }, [profile.language, profile.textScale])
  const value: GuestValue = {
    profile,
    patch: (next) => setProfile((current) => ({ ...current, ...next })),
    t: (key) => STRINGS[profile.language][key],
  }
  return <GuestContext.Provider value={value}>{children}</GuestContext.Provider>
}

export function useGuest() {
  const value = useContext(GuestContext)
  if (value === null) throw new Error("GuestProvider is missing")
  return value
}

export function GuestForm({ titleKey }: { titleKey: "quickTitle" | "profileTitle" }) {
  const { profile, patch, t } = useGuest()
  return (
    <form onSubmit={(event) => event.preventDefault()}>
      <h1>{t(titleKey)}</h1>
      <Field label={t("language")}>
        <select value={profile.language} onChange={(event) => patch({ language: event.target.value as GuestProfile["language"] })}>
          <option value="en">English</option>
          <option value="zh-Hant">繁體中文</option>
        </select>
      </Field>
      <Choice label={t("mobility")} value={profile.mobility} onChange={(mobility) => patch({ mobility: mobility as GuestProfile["mobility"] })} options={[["unknown", t("unknown")], ["wheelchair", t("wheelchair")], ["walker", t("walker")], ["walking", t("walking")]]} />
      <Choice label={t("stairs")} value={profile.stairs} onChange={(stairs) => patch({ stairs: stairs as GuestProfile["stairs"] })} options={[["unknown", t("unknown")], ["avoid", t("avoidStairs")], ["can-use", t("canUseStairs")]]} />
      <Choice label={t("vision")} value={profile.vision} onChange={(vision) => patch({ vision: vision as GuestProfile["vision"] })} options={[["unknown", t("unknown")], ["low", t("low")], ["typical", t("typical")]]} />
      <Choice label={t("hearing")} value={profile.hearing} onChange={(hearing) => patch({ hearing: hearing as GuestProfile["hearing"] })} options={[["unknown", t("unknown")], ["low", t("low")], ["typical", t("typical")]]} />
      <Field label={t("textSize")}>
        <select value={profile.textScale} onChange={(event) => patch({ textScale: Number(event.target.value) as GuestProfile["textScale"] })}>
          <option value={100}>100%</option>
          <option value={150}>150%</option>
          <option value={200}>200%</option>
        </select>
      </Field>
      <p>{t("guestData")}</p>
      <label className="field">
        <span>{t("acknowledge")}</span>
        <input type="checkbox" checked={profile.guestDataAcknowledged} onChange={(event) => patch({ guestDataAcknowledged: event.target.checked })} />
      </label>
      <h2>{t("location")}</h2>
      <div className="row">
        <Button onClick={() => askLocation(profile, patch)}>{t("useLocation")}</Button>
        <Button onClick={() => patch({ locationState: "denied", permissions: { ...profile.permissions, gps: "denied" } })}>{t("denyLocation")}</Button>
        <Button onClick={() => patch({ locationState: "dismissed" })}>{t("dismissLocation")}</Button>
      </div>
      <p>{t("originLabel")}: {originText(profile, t("noOrigin"))}</p>
      <Field label={t("manual")}>
        <input
          value={profile.manualOrigin}
          placeholder={t("manualHint")}
          onChange={(event) => patch({ manualOrigin: event.target.value, locationState: event.target.value ? "manual" : profile.locationState })}
        />
      </Field>
      <h2>{t("permissions")}</h2>
      <p>{t("speechLimit")}</p>
      <p>{t("notificationLimit")}</p>
      <CapabilityButton label={t("notification")} state={profile.permissions.notification} onClick={() => askNotification(profile, patch)} />
      <CapabilityButton label={t("camera")} state={profile.permissions.camera} onClick={() => askCamera(profile, patch)} />
      <CapabilityButton label={t("vibration")} state={profile.permissions.vibration} onClick={() => askVibration(profile, patch)} />
      <CapabilityButton label={t("speech")} state={profile.permissions.speech} onClick={() => askSpeech(profile, patch)} />
    </form>
  )
}

function Choice({ label, value, options, onChange }: { label: string; value: string; options: string[][]; onChange: (value: string) => void }) {
  return (
    <Field label={label}>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map(([option, text]) => <option key={option} value={option}>{text}</option>)}
      </select>
    </Field>
  )
}

function CapabilityButton({ label, state, onClick }: { label: string; state: Capability; onClick: () => void }) {
  return <Button onClick={onClick}>{label}: {state}</Button>
}

function originText(profile: GuestProfile, empty: string) {
  if (profile.locationState === "manual" && profile.manualOrigin) return `${profile.manualOrigin} (manual)`
  if (profile.locationState === "unset") return empty
  return profile.locationState
}

function askLocation(profile: GuestProfile, patch: GuestValue["patch"]) {
  if (!navigator.geolocation) {
    patch({ locationState: "unsupported", permissions: { ...profile.permissions, gps: "unsupported" } })
    return
  }
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const low = position.coords.accuracy > 100
      patch({ locationState: low ? "low-accuracy" : "granted", permissions: { ...profile.permissions, gps: "granted" } })
    },
    (error) => patch({ locationState: error.code === error.PERMISSION_DENIED ? "denied" : "dismissed", permissions: { ...profile.permissions, gps: "denied" } }),
    { enableHighAccuracy: false, timeout: 4000 },
  )
}

async function askNotification(profile: GuestProfile, patch: GuestValue["patch"]) {
  if (typeof Notification === "undefined") {
    setCapability(profile, patch, "notification", "unsupported")
    return
  }
  const result = await Notification.requestPermission()
  setCapability(profile, patch, "notification", result === "granted" ? "granted" : result === "denied" ? "denied" : "dismissed")
}

async function askCamera(profile: GuestProfile, patch: GuestValue["patch"]) {
  if (!navigator.mediaDevices?.getUserMedia) {
    setCapability(profile, patch, "camera", "unsupported")
    return
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true })
    stream.getTracks().forEach((track) => track.stop())
    setCapability(profile, patch, "camera", "granted")
  } catch {
    setCapability(profile, patch, "camera", "denied")
  }
}

function askVibration(profile: GuestProfile, patch: GuestValue["patch"]) {
  if (typeof navigator.vibrate !== "function") {
    setCapability(profile, patch, "vibration", "unsupported")
    return
  }
  setCapability(profile, patch, "vibration", navigator.vibrate(40) ? "granted" : "unsupported")
}

function askSpeech(profile: GuestProfile, patch: GuestValue["patch"]) {
  setCapability(profile, patch, "speech", "speechSynthesis" in window ? "granted" : "unsupported")
}

function setCapability(profile: GuestProfile, patch: GuestValue["patch"], key: keyof GuestProfile["permissions"], state: Capability) {
  patch({ permissions: { ...profile.permissions, [key]: state } })
}
