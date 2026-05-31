# NRG Next Steps Roadmap

## Current baseline

**NRG v27.8.14 — Roadmap Trajectory Lock**

This build continues from **NRG v27.8.13 — GitHub Pre-Push Stability Polish** and preserves the working local/offline app while adding a visible roadmap section for visitors and a project roadmap file for future development.

## Core identity

NRG must remain **offline-first by default**. The app should continue working with manual/local estimates even when there is no login, no cloud connection, no utility account, and no external API.

Key message:

> No meter? No problem. NRG puts the power back in your hands.

## What is stable now

- Editable device cards using the compact three-dot menu.
- Edit / Schedule / Remove controls contained inside each card.
- Schedule Intelligence Preview inside each device card.
- Local AI Advisor with visible inner borders, summary cards, status tags, Top 3 Energy Drivers, and device badges.
- Theme-safe UI across Sunburst, Solar, Ocean, Dark, and Light.
- Responsive containment for full desktop, minimized desktop, and mobile.
- Local/offline-first operation with no required account or API call.

## Future API roadmap

### 1. Electricity Rate API

Optional rate lookup based on user location or selected utility provider. This can improve peak/off-peak pricing, schedule guidance, and bill projections.

### 2. Weather API

Optional weather-aware estimates for heating/cooling context, seasonal usage spikes, and Advisor explanations.

### 3. Smart Plug / Matter Support

Optional connection to smart plugs, smart lights, switches, or Matter-compatible devices so NRG can compare estimated usage with real device usage when users choose to connect.

### 4. AI API Assistant

Optional online assistant for deeper explanations, bill analysis, savings guidance, and natural-language questions. This must never replace the local Advisor; it should be an upgrade path.

### 5. Utility Bill / Usage Import

Optional import of real monthly kWh, billing data, or Green Button-style utility files where supported. This lets NRG compare simulated use against real-world totals.

### 6. Appliance Wattage Lookup

Optional lookup/suggestion system for typical wattage ranges. Example: user types "PS5," "mini fridge," "air fryer," or "router" and NRG suggests a realistic wattage range.

## Required rule before APIs

Before adding any API/cloud feature, build a clear mode system:

- **Offline Mode:** local/manual estimates only. No external calls.
- **Online Assist Mode:** user-approved API features only.

Any online feature must be opt-in, clearly labeled, and easy to turn off.

## Suggested next build when revisiting

**NRG v27.9.0 — Offline / Online Assist Mode Toggle**

Recommended scope:

1. Add a visible mode toggle.
2. Keep Offline Mode as default.
3. Add placeholder locked cards for future APIs.
4. Explain what each online feature would do before enabling it.
5. Do not connect real APIs until the consent/mode structure is stable.

## Do not do next

- Do not add silent API calls.
- Do not require login.
- Do not remove offline/manual functionality.
- Do not redesign the stable device-card controls unless a bug appears.
- Do not bury the Apartment Advantage message.

© WePower / EZ (Eazzy E)
