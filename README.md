# NRG — Home Energy Simulator

NRG is a home energy simulation dashboard for estimating household electricity use from common dwelling presets and user-added devices.

## Current live baseline

**NRG v27.8 — Live Guided Setup Flow**

This GitHub-ready package is the clean deploy version. It excludes old checkpoint files and alternate intro files.

## What is included

- `index.html` — main app
- `manifest.json` — PWA manifest
- `sw.js` — GitHub Pages-safe service worker
- `icon-192.png` / `icon-512.png` — app icons
- `.nojekyll` — keeps GitHub Pages simple/static
- `README.md` — this file

## Key v27.x improvements

- Simplified presets so NRG does not assume every user has a TV, laptop, router, or cable modem.
- Baseline dwelling infrastructure: appliances and lights where appropriate.
- Clear preset guidance: users can remove anything that does not apply.
- Smart chart empty state so the bar chart does not look blank when little data exists.
- Clearer device rows with Edit / Schedule / Remove controls.
- Optional device scheduling for weekly use and time-of-day notes.
- Scroll-contained device list so the page does not grow endlessly.
- Guided setup flow for first-time users.

## GitHub Pages deployment

Upload the files in this folder to the root of the NRG GitHub repository, replacing the previous live files.

Recommended commit message:

```text
Update NRG to v27.8 live guided setup baseline
```

After publishing, test:

1. Home type preset loads devices.
2. Device list scrolls after several devices.
3. Edit / Schedule / Remove buttons work.
4. Donut and bar charts update.
5. Themes remain readable.
6. Save/load still works.

© WePower / EZ (Eazzy E)
