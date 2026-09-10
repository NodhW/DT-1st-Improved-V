# Fit Together — Final V4 architecture

Built from V3 and redesigned around the locked 4-tab IA.

## UI
- Home: streak, Today’s Plan, simulated health.
- Plan: Mon–Sun schedule, calendar status, Fit AI shared-time suggestion + Add to Schedule.
- Social: Groups / Chats with real Supabase conversations and realtime messages.
- Feed: community posts, image upload, expandable comments.
- Settings overlay: optional university verification, .ics/webcal calendar sources, wearable settings and Strava OAuth controls.
- Profile overlay: stats and Friend Code.
- One FAB: Log Workout, Post Update, Create Group, Add Friend.

## Backend
- Supabase auth + RLS.
- Friend codes and pending invitations.
- Group join codes and group chat membership.
- Direct and group chat tables.
- Realtime message subscriptions.
- Public post-media storage with user-folder policies.
- Calendar sources use one secret .ics/webcal URL flow for Google, Outlook and university systems.
- Recurring calendar events are intentionally treated as first occurrence only in the sync design.
- Strava uses OAuth entry through a Netlify function. No Strava client secret belongs in browser code.

## Setup
1. Run `supabase/FINAL_MIGRATION.sql` in Supabase SQL Editor.
2. Put the Supabase publishable/anon key into `public/config.js` (`SUPABASE_ANON_KEY`).
3. Put the Strava client ID into `FIT_STRAVA_CLIENT_ID` if using Strava.
4. Deploy to Netlify with build command `npm run build` and publish directory `dist`.
5. For Strava exchange/sync, configure Netlify environment variables `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `STRAVA_CLIENT_ID`, and `STRAVA_CLIENT_SECRET` and deploy the included functions.

Never place a service-role key in `public/config.js`.
