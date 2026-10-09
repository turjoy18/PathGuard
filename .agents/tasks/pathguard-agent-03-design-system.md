# Agent 03 — PathGuard shared design system

## Status
Implemented the shared visual language as a framework-agnostic stylesheet and wired it into the React app’s existing `src/styles.css` entrypoint. No route/page logic was added or changed.

## Files
- `src/styles/pathguard.css` — shared PathGuard tokens, reset/base styles, responsive layout utilities, and semantic UI primitives.
- `src/styles.css` — imports `pathguard.css` before existing page styles so the primitives are available to the app without replacing route-specific selectors.

## Included primitives
- Calm, high-contrast PathGuard color tokens for light and dark color schemes.
- System typography with an 18px emergency-flow base, readable line heights, scalable headings, and mono text support through tokens.
- 4px spacing scale, radii, shadows, content/readable-width constraints, and touch-target tokens (48px default / 56px primary).
- Buttons (`pg-button` variants), icon buttons, cards, badges, status indicators, alert and emergency banners, tabs, form controls, choice cards, progress indicators, tables, map shells/overlays/markers/legends, bottom navigation, and console navigation.
- Loading skeletons, empty states, stale-data indicators, offline and simulation banners, and non-critical toasts.
- Semantic-friendly focus-visible treatment, skip-link and screen-reader-only utilities, visible non-color status treatments, forced-colors support, and keyboard-sized controls.
- Mobile-first breakpoints: under 480px, 480–767px, 768–1023px map/list split, and 1024px+ console sidebar. Large text can reflow without relying on a fixed layout.
- Reduced-motion handling disables pulse/skeleton/transition motion; emergency pulse is deliberately slow and is replaced by a static treatment when reduced motion is requested.

## Usage
Import `src/styles/pathguard.css` from the app entrypoint. Compose classes with semantic HTML, for example:

```html
<main class="pg-page pg-stack">
  <section class="pg-card" aria-labelledby="status-heading">
    <div class="pg-card__header">
      <h1 id="status-heading">Your area is safe</h1>
      <span class="pg-status pg-status--safe">Safe</span>
    </div>
    <button class="pg-button pg-button--primary">Check my area</button>
  </section>
</main>
```

## Validation
- `npm run build` — blocked by pre-existing scaffold TypeScript errors (`tsc -b` reports 960 JSX/type errors across `src`; no error points to `pathguard.css`).
- `npx vite build` — passed; the shared stylesheet bundled successfully into `dist/assets/index-Cab9aSdz.css`.
- The stylesheet was additionally checked for balanced CSS blocks and a non-empty artifact.
- No route/page logic was changed. The CSS was reviewed against the design requirements in sections 3.5–3.9 and NFR-ACC-01 through NFR-ACC-05 of `pathguard-plan.md`.
