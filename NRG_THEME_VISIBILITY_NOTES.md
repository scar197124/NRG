# NRG v27.9.1 — Homepage Theme Visibility Polish

This patch updates the separate NRG homepage only.

## Changes

- Theme buttons now use dedicated theme-safe foreground, background, border, and active-state variables.
- Solar and Sunburst theme buttons remain visible when either of those themes is active.
- Homepage backgrounds were altered per theme so each theme has its own clearer color atmosphere.
- Active theme button now receives `aria-pressed="true"` for accessibility and visible state.
- Service worker cache bumped to prevent stale homepage CSS after deployment.

## Preserved

- NRG simulator engine untouched.
- `app.html` unchanged except existing package contents.
- Welcome -> app flow preserved.
