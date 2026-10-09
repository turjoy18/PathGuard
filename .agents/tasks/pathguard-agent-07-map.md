# PathGuard agent 07 — map/context implementation

## Scope
Implemented the isolated marine map/context route requested for the PathGuard website. The workspace had no existing application shell, package manifest, or Git metadata, so this step does not overwrite or modify another agent's code.

## Files
- `map-context.html` — responsive map/context route available at `/map-context.html` when served from the project root. Includes the marine scope notice, schematic map, legend/layer toggles, map/list text alternative, selected shelter detail, HKO observation cards, advisory overlays, capability status, and source/freshness register.
- `map-context.css` — isolated visual system, responsive layouts, focus states, high-contrast adjustments, and reduced-motion support.
- `map-context.js` — fixture rendering and interaction behavior: marker selection, keyboard activation, list view, layer visibility, narrator/live-region updates, optional speech synthesis, and mobile navigation.

## Data and product boundaries
- The four marine markers are explicitly labelled `Shelters for boats (Marine Department)` and are never presented as destinations for people.
- HKO station observations are labelled provisional and time-fresh.
- Hazard areas are labelled PathGuard app-generated advisory reports and do not alter an official warning or create a pedestrian route.
- Human shelter matching and accessibility-aware pedestrian routing are visibly deferred because the approved source set does not provide the required locations, capacity, accessibility, pedestrian-network, lift, or flood-depth data.
- Schematic coastline/geometry is marked as fixture presentation only, not a basemap or navigable map.

## Accessibility details
- Skip link, landmarks, heading structure, labelled controls, focus-visible styling, keyboard-operable SVG markers, status live region, speech-on-demand control, and a map/list text alternative are included.
- Layer and map/list controls expose state through `aria-pressed`.
- Reduced-motion and increased-contrast preferences are respected in CSS.
- Meaning is repeated with text, not colour alone.

## Validation
- `node --check map-context.js` — passed.
- Local HTTP smoke check using Python `http.server` and `urllib` — passed (`HTTP 200`, `map-context.html` served, 17,264 bytes).
- No project build/test command was available: the workspace contained only `pathguard-plan.md` before this implementation and no `package.json`, test runner, or Git repository.
- No commit created, per instruction.
