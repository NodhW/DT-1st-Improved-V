# Fit Together — Prototype Improved Build

This package contains the current built Fit Together prototype, including the repaired Fitness Center workout flow, prototype university verification/challenge progress, and server-side Gemini Fit AI integration.

## Workout fixes

- Starting a workout now uses an ownership-checked Supabase RPC (`start_workout`).
- Adding an exercise uses `add_workout_exercise`.
- Adding a set uses `add_workout_set`.
- You can **Remove** a selected exercise while a workout is in progress.
- You can **Delete** an individual set while a workout is in progress.
- Set numbers are normalized after a set is deleted.
- You can **Cancel workout** without completing it; the unfinished workout and its selections are removed.
- Duplicate exercises are blocked in the current workout.
- The service worker cache was bumped so the browser is forced to pick up the hotfixed bundle.

## Database step

Run `supabase/WORKOUT_LOGGING_REPAIR.sql` in the Supabase SQL editor after the existing production migration. It contains the workout RPC repair plus the supplied `set_simulated_health` ambiguity hotfix.

The RPCs enforce the signed-in user's ownership in the database; the browser does not receive service-role credentials.

## Deployment

This is a manual/static Netlify deployment package. Drop the package contents as the site root. `netlify.toml` publishes `.` and keeps API redirects ahead of the SPA fallback.


## Prototype university + challenge demo

Run `supabase/PROTOTYPE_DEMO.sql` after the normal migrations. This adds two deliberately demo-only controls:

- **Simulate university verification** in Settings so university challenges can be demonstrated without real SSO/admin verification.
- **Prototype: add progress +5 pts** on joined challenge cards. The button advances the progress bar and awards small demo points with a daily cap.

These controls are explicitly prototype features and are not a real university verification or anti-cheat system.

## Gemini Fit AI

The existing Fit AI chat can optionally use Google Gemini server-side. Add `GEMINI_API_KEY` to Netlify environment variables. Optionally set `GEMINI_MODEL`; the default is `gemini-3.8-flash`. The browser never receives the Gemini API key. If Gemini is not configured or the request fails, the existing deterministic Fit AI fallback remains available.

Google currently recommends the Gemini Interactions API for new applications; the integration in `netlify/functions/gemini.js` uses the server-side API and `store:false` for this prototype chat.


## Deep code recheck

The package was rechecked on 2026-09-15. JavaScript syntax, manifest parsing, asset references, client RPC names, migration ordering, and the Gemini REST response path were checked. Two concrete issues found during the recheck were corrected: Gemini REST output parsing and university challenge verification enforcement. See `DEEP-CODE-AUDIT.md` for the detailed result.
