# NRG v27.8 Stable — GitHub Ready

NRG is a home energy simulation dashboard for estimating household electricity use from dwelling presets and user-added devices.

## Current live baseline

**NRG v27.8 Stable — Guided Setup + Mobile Containment**

This is the clean GitHub-ready package. It is based on the working v27.8 line and includes the latest safe polish from v27.8.6.

## Included files

- `index.html` — main app
- `manifest.json` — PWA manifest
- `sw.js` — GitHub Pages-safe service worker
- `icon-192.png` / `icon-512.png` — app icons
- `.nojekyll` — keeps GitHub Pages simple/static
- `README.md` — this file

## Preserved improvements

- Simplified home presets that do not assume personal electronics.
- Baseline appliances and lights where appropriate.
- Clear preset guidance: users can remove anything that does not apply.
- Smart chart empty state for donut/bar chart area.
- Clear device rows with Edit / Schedule / Remove controls.
- Optional device scheduling for weekly use and time-of-day notes.
- Scroll-contained device list.
- Guided setup flow for first-time users.
- Organized dashboard controls and export tools.
- Mobile/narrow-desktop viewport containment.
- Stable device buttons and status cards on smaller screens.

## GitHub Pages deployment

Upload the files in this folder to the root of the NRG GitHub repository, replacing the previous live files.

Recommended commit message:

```text
Update NRG to v27.8 stable GitHub baseline
```

After publishing, test:

1. Choose each home preset.
2. Confirm device cards stay scroll-contained.
3. Test Edit / Schedule / Remove.
4. Confirm donut and bar charts update.
5. Check light mode and every theme for button/chart readability.
6. Narrow the desktop window and confirm nothing goes off-screen.
7. Test Save Profile / Load Profile and export buttons.

© WePower / EZ (Eazzy E)
