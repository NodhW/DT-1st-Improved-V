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
- TypeScript parser syntax pass for `src/main.jsx`, `src/services/backend.js`, `src/lib/supabase.js`: passed.
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
