# PathGuard agent 10 — About, trust and source attribution

## Scope
Implemented an accessible About & trust experience for the revised MVP. The page is integrated into the production hash-routed app without changing the existing dashboard, map, alerts, caregiver, profile, or operator experiences.

## Changed files
- `src/about/about-experience.js` — isolated renderer for the About & trust page, including the revised product promise, HKO and Marine Department attribution, source register, freshness/licence verification placeholders, privacy and safety language, current limitations, contact/help content, and glossary.
- `src/about/about.css` — responsive, design-consistent styling for the About experience, including readable source tables, limitation cards, mobile reflow, focus-compatible controls, and reduced-motion handling.
- `src/app.js` — registered the About renderer and stylesheet, added the `about` view, and made `about-*` in-page anchors work with the existing hash router.
- `index.html` — added About & trust links to desktop and mobile navigation.
- `src/about/about-data.ts` and `src/about/about-page.tsx` — created an equivalent typed About module while the app entry was changing between parallel agents; the active production entry uses `about-experience.js`.

## Content decisions
- The MVP promise is limited to personalised typhoon/rainstorm warnings, local HKO weather context, acknowledgement, and consent-based caregiver escalation.
- The page explicitly states that Marine Department typhoon shelters are for boats and never destinations for people.
- The data register covers HKO warnings, observations/rainfall, climate/tropical-cyclone history, and the Marine Department typhoon-shelter dataset.
- HKO and Marine Department source links are preserved. Licence, attribution, and rate-limit status are presented as verification placeholders because the plan marks them unverified.
- “What PathGuard does not yet do” explicitly covers human shelters, pedestrian accessibility routing, lift status, flood depth/blocked paths, and replacing official emergency instructions.
- Privacy language covers sensitive accessibility information, consented location/caregiver sharing, stale data, outages, and no safety guarantee. Contact content warns not to email sensitive health or location data and directs urgent situations to local emergency services.

## Validation
- `npm run build` — passed (`tsc -b && vite build`).
- `node --check src/about/about-experience.js` — passed.
- `node --check src/app.js` — passed.
- Verified required limitation/attribution strings with repository search.
- Verified `data-view="about"` appears in both desktop and mobile navigation.
- No commit made, as requested (the workspace has no Git repository).
