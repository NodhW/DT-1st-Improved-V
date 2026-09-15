# Fit Together — Source Recovery

Phase 1 restores a real editable React/Vite source tree from the preserved Fit Together development archive.

## Structure

- `src/main.jsx` — React entrypoint
- `src/App.jsx` — recovered application implementation
- `src/styles.css` — application styles
- `src/services/backend.js` — Supabase/backend access layer
- `src/lib/supabase.js` — Supabase client/configuration
- `src/components/` — shared UI component home for the next refactor
- `src/features/` — feature-module home for the next refactor
- `netlify/functions/` — server-side functions, including the current Gemini implementation
- `supabase/` — current SQL migrations/repair scripts
- `scripts/validate.mjs` — source validation

The currently deployable production build is preserved separately under `deploy/fit-workout-fix/` in the outer release package. This phase does not change Strava behavior.
