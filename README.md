# NRG v27.9.1 — Homepage Theme Visibility Polish

This package keeps the v27.8.14 NRG simulator engine intact, preserves the separate welcome/homepage flow, and fixes homepage theme visibility/background contrast.

## Structure

- `index.html` — NRG welcome / landing page
- `app.html` — the existing NRG simulator
- `sw.js` — caches both pages for PWA/offline behavior
- `NRG_HOMEPAGE_NOTES.md` — notes for the landing-page pass
- `NRG_THEME_VISIBILITY_NOTES.md` — notes for the homepage theme visibility polish

## Push note

Push the full contents of this folder to GitHub Pages/Vercel. The landing page is now the front door, and the simulator opens through the bottom `Enter →` button.

---

# NRG — Home Energy Simulator

NRG is a home energy simulation dashboard for estimating household electricity use from common dwelling presets and user-added devices.

## Current GitHub-ready baseline

**NRG v27.8.14 — Roadmap Trajectory Lock**

This package continues from **v27.8.13 GitHub Pre-Push Stability Polish** and adds a visible roadmap/trajectory section inside the app, plus a dedicated roadmap file for future development.

## What is included

- `index.html` — main app
- `manifest.json` — PWA manifest
- `sw.js` — GitHub Pages-safe service worker
- `icon-192.png` / `icon-512.png` — app icons
- `.nojekyll` — keeps GitHub Pages simple/static
- `README.md` — this file
- `NRG_NEXT_STEPS_ROADMAP.md` — future development roadmap/protocol

## v27.8.14 update

- Adds a visible **NRG Roadmap / Trajectory** section inside the app for visitors.
- Documents the future path: electricity rate API, weather API, smart plug/Matter support, AI API assistant, utility import, and appliance wattage lookup.
- Preserves the required rule: NRG remains **Offline Mode by default** and any API/cloud feature must be optional through **Online Assist Mode**.
- Updates the app title and manifest to v27.8.14.
- Updates the service worker cache to `nrg-v27-8-14-cache`.
- Keeps all v27.8.13 stable systems intact.

## Preserved v27.8 features

- Editable device cards using a compact three-dot menu.
- Edit / Schedule / Remove controls stay inside each card.
- Contained Schedule Intelligence Preview inside each device card.
- Local AI Advisor with visible inner borders, summary cards, status tags, Top 3 Energy Drivers, and device badges.
- Theme-safe UI polish for Sunburst, Solar, Ocean, Dark, and Light.
- Responsive containment for full desktop, minimized desktop, and mobile.
- Local/offline-first behavior with no required login or API call.

## GitHub Pages deployment

Upload the files inside this folder to the root of the NRG GitHub repository, replacing the previous live files.

Recommended commit message:

```text
Update NRG to v27.8.14 roadmap trajectory lock
```

## Final test checklist

1. Home preset loads devices.
2. Device cards show the compact three-dot menu.
3. Edit opens inside each card and stays contained.
4. Schedule opens inside each card and shows preview values.
5. Remove still works.
6. AI Advisor shows summary cards, inner borders, Top 3 Energy Drivers, and device badges.
7. The new Roadmap / Trajectory section appears near the bottom of the app.
8. Full screen, half/minimized desktop, and mobile preview have no horizontal side-scroll.
9. Sunburst, Solar, Ocean, Dark, and Light themes remain readable.
10. The release chip shows **NRG v27.8.14** after deployment.

© WePower / EZ (Eazzy E)


## v27.9.2 Homepage Contrast + Border Lift

Fixes homepage theme button visibility in Light mode and strengthens homepage borders so the welcome screen structure is clearer. Simulator engine unchanged.
