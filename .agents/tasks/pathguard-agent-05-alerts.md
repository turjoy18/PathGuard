# PathGuard agent 05 — alerts

## Scope
Implemented the user-facing alert inbox and emergency alert detail experience from the PathGuard plan's P5/P6 requirements. The workspace includes a Vite shell with an existing `#alerts` navigation route. The route now hands off to `alerts.html`, keeping the feature isolated under `src/alerts/` without replacing the shared shell or adding a second application router.

## Files
- `alerts.html` — minimal browser entry/demo shell with accessible skip link and primary navigation.
- `src/alerts/alerts-data.js` — profile-adapted demo alert data, severity metadata, delivery channels, source/freshness metadata, and replay labels.
- `src/alerts/alert-components.js` — reusable DOM components for the simulation banner, severity badges, inbox cards, profile guidance, delivery status, source metadata, and high-contrast emergency detail view.
- `src/alerts/alerts-app.js` — inbox/detail state, acknowledgement and caregiver-help controls, local persistence, live announcements, and Web Speech API read-aloud behavior.
- `src/app.js` — existing `#alerts` route handoff to the isolated alerts page.
- `vite.config.ts` — preserves the existing main entry and includes `alerts.html` as a deployable second page entry.
- `src/alerts/alerts.css` — responsive visual system, high-contrast severity treatment, focus states, reduced-motion support, large emergency controls, and mobile layout.

## Implemented behavior
- Alert inbox/history cards show severity with icon + text + color, acknowledgement state, replay content labels, and source/update age.
- Full-screen-style detail view places the severity, plain/simplified instruction, affected area/time, `I'm OK`, `I need help`, read-aloud, profile adaptation, channel delivery state, full details, and official-source limitation notice in the reading order.
- `I'm OK` and `I need help` persist per-alert state in local storage and announce the result to assistive technology. Help state explains caregiver notification without claiming emergency dispatch.
- Read aloud uses device speech synthesis when available and provides a text-equivalent note/fallback when unavailable.
- `prefers-reduced-motion` disables the slow (2.2 second) alert pulse; no strobe or rapid flash is used.
- A persistent `SIMULATION / REPLAY` banner and official-warning disclaimer are present so demo content is not presented as an official alert.
- Keyboard focus indicators, skip link, semantic headings/sections, live alert/status regions, responsive controls, and non-color severity cues are included.

## Validation
- `node --check src/alerts/alerts-data.js`
- `node --check src/alerts/alert-components.js`
- `node --check src/alerts/alerts-app.js`
- `npm run build` (includes `tsc -b` and verifies `dist/alerts.html` plus the existing `dist/index.html` output)
- Static HTML entry assertions verified the module path and `main-content` mount point.

The implementation was not committed, per task instruction.
