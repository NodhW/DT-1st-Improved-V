# Fit Together — Final 4-tab build

Fit Together is a Vite + React + Supabase social-fitness app with the locked primary navigation: **Home / Plan / Social / Feed**. Rewards, health details, Friend Code, challenges, and shop live inside the Profile overlay rather than a fifth tab.

## Included product behavior

- **Home** — personal streak, Today’s Plan, clearly labeled Simulated Health.
- **Plan** — Mon–Sun selector, external calendar connection status, privacy-preserving shared busy-time calculation, Fit AI Copilot, and inline Add to Schedule.
- **Social** — Groups / Chats sub-tabs, group join codes, friend picker, 1:1 direct messages, group chat, realtime messages, unread counters, and 100%-crew daily streak status.
- **Feed** — community posts, photo upload, likes, search, expandable comments, and pending-friend-request badges.
- **Profile** — private simulated health metrics, Friend Code, personal stats, Rewards / Challenges / Shop.
- **Settings** — optional university verification request flow, private `.ics` / `webcal` calendar connections, simulated wearable control, and real Strava OAuth.
- **Single FAB** — Log Workout, Post Update, Create Group, Add Friend.

## Security and anti-cheat rules

- Browser config contains only the Supabase publishable key.
- Conversation and message RLS is membership-scoped; co-member discovery happens through guarded SECURITY DEFINER RPCs instead of broad `using(true)` policies.
- Self-reported activity is capped at one +10-point award per day.
- Verified Strava/GPS/wearable activity is recorded only by the server and can award +50 points per unique verified activity. Old history imported on first sync does not mint points.
- Challenge rewards are calculated server-side and have a daily completion-reward cap, so clients cannot self-mint arbitrary points.
- `university_verified` is server-managed and cannot be toggled by browser clients.
- Strava OAuth state is validated with an HttpOnly SameSite cookie; refresh tokens remain server-side.
- Calendar sync rejects private/local network targets and validates every redirect to reduce SSRF risk.
- Netlify server functions prefer Supabase `sb_secret_...` keys and never send them as Bearer tokens; legacy `service_role` remains a fallback.
- Wearable OAuth token columns are not selectable by the authenticated browser role.

## Supabase setup

Run `supabase/FINAL_MIGRATION.sql` in the authoritative Supabase project before deploying this client. The migration is idempotent and removes older managed-table policies before installing the final RLS set. `supabase/SETUP.sql` and `supabase/FINALIZATION_MIGRATION.sql` are identical copies for convenience. Historical phase migrations are intentionally excluded from this release so they cannot overwrite finalized RPCs if run out of order.

The migration intentionally leaves unrelated legacy tables such as `event_rsvps` untouched.

## Netlify setup

Build command: `npm run build`  
Publish directory: `dist`

Set these environment variables in Netlify:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `STRAVA_CLIENT_ID`
- `STRAVA_CLIENT_SECRET`

The publishable key is safe for the browser and belongs in `public/config.js`. The secret key and Strava secret are server-only and belong only in Netlify environment variables. Legacy `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` names remain supported as fallbacks during Supabase's 2026 API-key migration.

## Calendar behavior

Calendar sources use a private HTTPS or `webcal://` URL. Google Calendar should use **Settings → Integrate calendar → Secret address in iCal format**. Sync is manual **Sync** in V1 and now reports progress/errors in the UI. Recurring events are intentionally imported as their first occurrence only; true scheduled background polling would require a scheduled server job.

## Local development

```bash
npm install
npm run validate
npm run dev
```

Production build:

```bash
npm run build
```

## PWA

A web app manifest, 192/512 icons, service worker registration, and standalone safe-area styling are included. The service worker uses network-first caching and excludes `/api/` requests.

## Calendar fix deployment note

See `DEPLOY-CALENDAR-FIX.md` for the exact Netlify/Supabase steps. No new SQL migration is required for the calendar fix when `FINAL_MIGRATION.sql` has already been run successfully.
