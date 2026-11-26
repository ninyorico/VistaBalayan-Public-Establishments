# Public recommendation preferences and empty-state revision

## Implemented

- Added public recommendation preferences aligned with the existing stay categories: All stays, Resorts, and Hotels.
- Added a maximum road-distance preference: 2 km, 5 km, 10 km, or any road distance.
- Reused the existing consent boundary. Preferences are saved to browser local storage only when preferences consent is enabled.
- Reused the existing recommendation inputs: searches, viewed listings, category interactions, valid listing coordinates, browser location, and OSRM driving-road distances.
- Applied the selected category and maximum road-distance preference to the existing recommendation ranking rather than creating a second ranking system.
- Added a clear desktop and mobile empty state when no establishment qualifies, including the selected road-distance limit when applicable.
- Added truthful loading and route-error messages instead of presenting a fabricated recommendation.

## Privacy and behavior notes

- No server-side profile or system-wide analytics was added.
- Preferences and behavior remain browser-local and consent-gated through the existing `hasPreferencesConsent()` path.
- When location is unavailable, the interface explains that location is required to apply a road-distance preference.
- Road values are described as driving-road distance, consistent with the existing OSRM route calculation.

## Verification

- `npx tsc --noEmit` passed.
- `npm run build` passed.
- `git diff --check` passed.
- This project has no `test` script in `package.json`; `npm test` is therefore not available.
- Build warnings remain pre-existing/reportable: empty `src/styles/fonts.css`, stale Browserslist data, and a large main bundle.

Legal/privacy text remains a draft and requires qualified privacy-professional review before being treated as a final policy.