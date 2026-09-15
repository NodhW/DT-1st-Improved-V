# Fit Together — Deep Code Recheck

Date: 2026-09-15

## Scope

Reviewed the current `FitTogether-PROTOTYPE-IMPROVED` package, including the built browser bundle, Netlify functions, deployment configuration, service worker, and all four Supabase migrations in execution order:

1. `FINAL_MIGRATION.sql`
2. `V2_SOCIAL_CHALLENGES.sql`
3. `WORKOUT_LOGGING_REPAIR.sql`
4. `PROTOTYPE_DEMO.sql`

## Automated checks run

- `node --check` passed for the built browser bundle.
- `node --check` passed for `calendar.js`, `strava.js`, and `gemini.js`.
- `manifest.webmanifest` parses as JSON.
- HTML asset references were checked against the package contents.
- Client RPC names were compared against the SQL function definitions.
- Migration ordering and overridden function definitions were inspected.
- Gemini was integration-tested with a mocked Interactions API response.

## Bugs found and corrected

### 1. Gemini REST response parsing — fixed

The Gemini server function was reading `result.output_text`. That property is an SDK convenience property; the REST Interactions API returns generated text under `steps[].content[]`. The function now extracts `model_output` text blocks from the REST response and returns a 502 if no text is produced.

### 2. University challenge access — hardened

University challenge visibility, participant visibility, and joining now require both:
- matching university, and
- `university_verified = true`.

This keeps the prototype's simulated verification control consistent with the challenge access rules.

## Important remaining limitations / environment checks

- A full Vite source rebuild cannot be performed from this deploy package because it intentionally contains the already-built application rather than the original source repository/package manifest. Static JavaScript syntax checks pass.
- Live Supabase connectivity and live Netlify environment variables cannot be verified from this package alone. The configured browser Supabase URL is `jaesndcamjdcokhxyqpl.supabase.co`; the deployed database must have all migrations applied to that project.
- Gemini requires the Netlify `GEMINI_API_KEY` secret. The key is not bundled in the browser.
- Gemini chat is currently stateless (`store:false`); the UI retains its visible chat messages, but Gemini does not receive previous turns unless they are explicitly included in a later request.
- Strava remains disabled by `STRAVA_ENABLED: false` in the shipped configuration until its server environment is configured.

## Security review notes

- Browser code contains the Supabase publishable key only.
- Gemini, Strava client secrets, and Supabase server secrets are referenced only through server-side environment variables.
- Workout mutation RPCs enforce `auth.uid()` ownership.
- The sensitive `award_points` helper is revoked from browser roles; user-facing activity/prototype RPCs are auth-bound.
- The prototype university verification is explicitly demo-only and does not constitute real identity verification.

## Result

The current package passes the static code checks performed here, and two concrete correctness issues found during this deep recheck have been fixed. Live database/deployment behavior still depends on the correct Supabase migrations and Netlify environment variables being deployed.
