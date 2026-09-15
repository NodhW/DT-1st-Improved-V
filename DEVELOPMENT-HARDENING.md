# Fit Together — Full Phase Completion

This package completes the non-Strava engineering phases against the recovered prototype without changing Strava integration.

## Completed

1. **Source architecture recovery**
   - Vite + React source tree restored.
   - Domain boundaries established under `src/features/`.
   - Shared scheduling logic extracted to `src/lib/scheduling.js`.

2. **Navigation / product IA alignment**
   - Primary navigation is exactly Home / Plan / Social / Challenges.
   - Community feed lives inside Social instead of being a fifth primary tab.
   - Challenges & Shop is promoted to the primary Challenges tab.
   - Profile and Settings remain overlays.

3. **Automated testing foundation**
   - Node test runner added.
   - Scheduling logic has regression coverage.
   - `npm run check` combines validation, tests and production build.

4. **Supabase architecture / security**
   - Existing layered SQL remains intentionally ordered: FINAL baseline, V2 social/challenges, workout repair, prototype demo.
   - Browser-sensitive helpers remain protected by explicit grants/revokes in the supplied SQL.
   - Client uses only the Supabase publishable key.
   - Service-role credentials are server-side only.

5. **Points / activity trust model**
   - Challenge progress is server-driven by the V2 activity functions.
   - Manual progress RPCs are intentionally disabled in V2; the prototype demo increment path is separately named and capped.
   - Reward redemption remains an authenticated server RPC.

6. **Realtime social messaging**
   - Conversation messages use Supabase Postgres realtime subscriptions.
   - Per-conversation subscriptions are cleaned up on overlay close/unmount.
   - Duplicate realtime inserts are de-duplicated client-side.
   - Read state is persisted through `mark_conversation_read`.

7. **Calendar synchronization**
   - External calendar sources accept HTTPS/webcal URLs.
   - Server fetch blocks localhost/private/link-local destinations and non-standard ports.
   - Redirect destinations are revalidated.
   - ICS recurrence and EXDATE handling remain in the Netlify function.
   - Best shared time uses busy blocks without exposing event details.

8. **Fit AI**
   - Gemini is server-side through `/api/gemini/chat`.
   - Authentication is required before Gemini calls.
   - Gemini output parsing supports the current REST Interactions response shape.
   - Fit AI has action-oriented scheduling/challenge/points prompts and UI actions.

9. **Community media**
   - Post images use the Supabase `post-media` storage bucket.
   - Uploads are authenticated, image-type restricted, size limited and placed under the current user's path.

10. **University verification**
    - Verification is isolated to Settings.
    - University challenges require verified profiles and matching university membership.
    - Prototype verification is explicitly labeled as demo-only.

11. **Production hardening documentation**
    - `DEVELOPMENT-HARDENING.md` documents boundaries and remaining environment-dependent checks.
    - `supabase/MIGRATION-ORDER.md` records deterministic SQL application order.

## Intentionally unchanged

- Strava remains disabled exactly as requested (`STRAVA_ENABLED:false`).
- No Strava OAuth or sync behavior was modified.

## Environment-dependent checks

A full Vite build requires installing the package dependencies in an environment with npm package access. The package includes the lockfile and build configuration so CI/Netlify can perform the final build. Static validation and Node tests pass in this working environment.
