import type { ButtonHTMLAttributes, ReactNode } from "react"

export function Button({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className="button" {...props}>
      {children}
    </button>
  )
}

export function TextLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <a className="button" href={to}>
      {children}
    </a>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  )
}

export function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card">
      <h2>{title}</h2>
      {children}
    </section>
  )
}

export function Banner({ children }: { children: ReactNode }) {
  return <p className="banner" role="status">{children}</p>
}

export function StatusChip({ children }: { children: ReactNode }) {
  return <span className="chip">{children}</span>
}

export function Loading({ label }: { label: string }) {
  return <p className="state" role="status">{label}</p>
}

export function Empty({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="state">
      <h2>{title}</h2>
      <p>{detail}</p>
    </div>
  )
}

export function ErrorState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="state error" role="alert">
      <h2>{title}</h2>
      <p>{detail}</p>
    </div>
  )
}

export function Confirm({
  title,
  detail,
  onConfirm,
  onDismiss,
}: {
  title: string
  detail: string
  onConfirm: () => void
  onDismiss: () => void
}) {
  return (
    <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <h2 id="confirm-title">{title}</h2>
      <p>{detail}</p>
      <div className="row">
        <Button onClick={onConfirm}>Confirm</Button>
        <Button onClick={onDismiss}>Dismiss</Button>
      </div>
    </div>
  )
}
