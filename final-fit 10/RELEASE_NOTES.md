# Fit Together — Final Release Notes

Release status: source package finalized for deployment.

## Completed

- Locked four-tab IA: Home / Plan / Social / Feed.
- Rewards, challenges and shop moved into Profile.
- Friend Code requests, pending requests, groups, join codes and group member picker.
- Membership-scoped conversations/messages with safe co-member RPCs, realtime text chat and per-user unread state.
- Feed posts, photo uploads, likes, expandable comments and pending-request badges.
- Mon–Sun Plan, external calendar status/import, shared busy-block privacy, Best Shared Time and Fit AI Add to Schedule.
- Clearly labeled simulated health/PWA mode and wearable settings.
- Real Strava OAuth server flow and verified activity ingestion.
- Group 100%-participation streak foundation.
- Self-report vs verified activity point tiers and server-controlled challenge/shop rewards.
- PWA manifest, service worker and icons.
- Production browser config targets the authoritative Supabase project and contains no server secret.

## Security hardening

- SECURITY DEFINER RPC execution is explicitly revoked from PUBLIC/anon before narrow grants are applied.
- Internal point/activity helpers are not browser-callable.
- App-table privileges are explicit and least-privilege; anon has no app-table access.
- Conversation/message RLS is membership-scoped; conversation_members SELECT remains self-row only.
- Wearable OAuth tokens are server-only and not selectable by the authenticated browser role.
- University verified state and other server-managed profile fields are not browser-writable.
- Calendar sync rejects private/local targets, revalidates redirects, limits response size and requires an authenticated owner.
- Strava OAuth state uses an HttpOnly SameSite cookie and authorization codes are removed from browser history before exchange.
- Relationship/check constraints protect new writes while NOT VALID preserves compatible legacy rows during migration.

## Validation performed in the release workspace

- `npm run validate`: passed.
- Frontend contract/invariant validation for `src/main.jsx` and backend integration: passed.
- Node syntax checks for backend and Netlify functions: passed.
- Browser/server secret scan: passed.
- `FINAL_MIGRATION.sql`, `SETUP.sql` and `FINALIZATION_MIGRATION.sql`: byte-identical.
- package.json/package-lock root dependency declarations: consistent.
- ZIP integrity: checked after packaging.

## Production build note

The source is configured for `npm run build` on Netlify. A local Vite bundle could not be executed in this workspace because the package registry was unavailable while restoring dependencies; no false build-success claim is made. Netlify should run the authoritative clean install/build from `package-lock.json` during deployment.

## Required deployment order

1. Apply `supabase/FINAL_MIGRATION.sql` to the authoritative Supabase project.
2. Ensure Realtime is enabled for messages (the migration attempts to add it idempotently).
3. Configure Netlify server environment variables listed in README.md.
4. Deploy with build command `npm run build` and publish directory `dist`.
5. In Supabase Auth, enable leaked-password protection if your plan/settings expose it; this is an account setting rather than a SQL migration.


## Final verification hardening pass
- Restricted `profiles` base-table reads to the signed-in user's own row. Cross-user display data now comes from `profiles_card`, which intentionally excludes Friend Codes, points, streaks, timezone, and verification-request metadata.
- Friend Code discovery now uses an authenticated exact-match RPC, preventing bulk Friend Code enumeration through the profile table/view.
- Added a leave-group RPC/UI flow. Leaving immediately removes conversation membership; ownership transfers to the oldest remaining member, and the last member leaving deletes the group.
- Fixed open-chat unread badge over-counting by suppressing global increments for the active conversation and clearing per-conversation unread state when it is read.
- Activity/streak calendar-day boundaries now use each user's stored IANA timezone with UTC fallback instead of hard-coded UTC/current_date.
- Confirmed `@supabase/supabase-js` 2.116.0 is a published release and requires Node 22. The dependency is pinned exactly and Netlify is explicitly pinned to Node 22.


## Final polish patch
- Made `complete_workout` idempotent for training-load and activity side effects: retries/double-calls only finalize metrics/PR/achievement state and do not double-count daily load, sessions, or activity rewards.
- Fixed `Metric` so readiness and other metrics render their supplied unit.
- Added missing `.chips`, `.inlineform`, and `.secondary` styles used by the fitness UI.
- Migrated backend environment names from legacy `SUPABASE_SERVICE_ROLE_KEY` to `SUPABASE_SECRET_KEY` and removed legacy browser-key fallbacks.
- Updated the deployment documentation so `supabase/FINAL_MIGRATION.sql` is the only authoritative migration.
