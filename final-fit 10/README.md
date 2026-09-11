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
- Wearable OAuth token columns are not selectable by the authenticated browser role.

## Supabase setup

Run `supabase/FINAL_MIGRATION.sql` in the authoritative Supabase project before deploying this client. This is the **only authoritative database migration in this release** and includes the complete schema, RLS, fitness engine, wellness tables, RPCs, and finalized security grants. Do not run `SETUP.sql`, `FINALIZATION_MIGRATION.sql`, or older phase migrations; they are retained only as historical reference and must not be used for deployment.

The migration intentionally leaves unrelated legacy tables such as `event_rsvps` untouched.

## Netlify setup

Build command: `npm run build`  
Publish directory: `dist`

Set these environment variables in Netlify:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY` — browser/public key
- `SUPABASE_SECRET_KEY` — server-only Netlify Function secret
- `STRAVA_CLIENT_ID`
- `STRAVA_CLIENT_SECRET`

The service-role key and Strava secret are server-only. Never add them to `public/config.js`.

## Calendar behavior

Calendar sources use a private HTTPS or `webcal://` URL. Sync is **manual “Sync now” in V1**. Recurring events are intentionally imported as their first occurrence only; true scheduled background polling would require a scheduled server job.

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

## Fitness Engine — complete roadmap implementation
The current build includes the fitness foundation and the expanded fitness engine: fitness profile, exercise library, workout logging, sets/reps/weight/RPE, PR detection, training load, recovery/readiness, training plans, achievements, nutrition/lifestyle foundations, group streak foundations, verification-aware activity points, Strava sync plumbing, challenges/rewards foundations, and the four-tab social/feed shell.

The fitness engine is already included in `supabase/FINAL_MIGRATION.sql`. Do not run a separate fitness migration against the authoritative project.
