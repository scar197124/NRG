# NRG — Home Energy Simulator

NRG is a home energy simulation dashboard for estimating household electricity use from common dwelling presets and user-added devices.

## Current GitHub-ready baseline

**NRG v27.8.13 — GitHub Pre-Push Stability Polish**

This is the recommended package to push to GitHub after testing. It keeps the current working device-card, schedule, and AI Advisor systems intact while adding final pre-push version/cache/containment polish.

## What is included

- `index.html` — main app
- `manifest.json` — PWA manifest
- `sw.js` — GitHub Pages-safe service worker
- `icon-192.png` / `icon-512.png` — app icons
- `.nojekyll` — keeps GitHub Pages simple/static
- `README.md` — this file

## v27.8.13 update

- Adds a subtle visible **NRG v27.8.13** release chip so the live version is easy to confirm after deployment.
- Updates the app title and manifest to v27.8.13.
- Updates the service worker cache to `nrg-v27-8-13-cache`.
- Adds final no-horizontal-overflow guards for the AI Advisor, device cards, edit panels, schedule panels, and minimized desktop/mobile layouts.
- Keeps the existing engine and calculations unchanged.
- Keeps the app local/offline-first: no cloud calls, no login, no API dependency.

## Preserved v27.8 features

- Editable device cards using a compact three-dot menu.
- Edit / Schedule / Remove controls stay inside each card.
- Contained Schedule Intelligence Preview inside each device card.
- Local AI Advisor with visible inner borders, summary cards, status tags, Top 3 Energy Drivers, and device badges.
- Theme-safe UI polish for Sunburst, Solar, Ocean, Dark, and Light.
- Responsive containment for full desktop, minimized desktop, and mobile.

## GitHub Pages deployment

Upload the files inside this folder to the root of the NRG GitHub repository, replacing the previous live files.

Recommended commit message:

```text
Update NRG to v27.8.13 GitHub pre-push stability polish
```

## Final test checklist

1. Home preset loads devices.
2. Device cards show the compact three-dot menu.
3. Edit opens inside each card and stays contained.
4. Schedule opens inside each card and shows preview values.
5. Remove still works.
6. AI Advisor shows summary cards, inner borders, Top 3 Energy Drivers, and device badges.
7. Full screen, half/minimized desktop, and mobile preview have no horizontal side-scroll.
8. Sunburst, Solar, Ocean, Dark, and Light themes remain readable.
9. Donut/bar charts and monthly estimates still update.
10. The bottom/right release chip shows **NRG v27.8.13** after deployment.

© WePower / EZ (Eazzy E)
