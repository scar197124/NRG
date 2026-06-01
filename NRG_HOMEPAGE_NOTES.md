# NRG v27.9 — Homepage Landing Notes

## What changed

- Added a separate NRG welcome page as `index.html`.
- Moved the existing simulator to `app.html`.
- Added a bottom-centered `Enter →` button on the welcome page.
- Added a visible `← Welcome` pill button inside the app page.
- Preserved the v27.8.14 simulator logic and UI.
- Preserved the offline-first roadmap direction.
- Updated service worker cache to include both pages.

## Core message

No meter? No problem.  
NRG puts the power back in your hands.

## Testing checklist

1. Open `index.html`.
2. Change each theme and confirm the welcome page updates.
3. Press `Enter →`.
4. Confirm `app.html` opens.
5. Confirm the simulator still works.
6. Press `← Welcome`.
7. Confirm it returns to the landing page.
8. Push to GitHub/Vercel and hard refresh to avoid stale service-worker cache.
