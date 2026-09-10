# Fit Together — Calendar Sync Fix Deployment

## 1. Supabase

No new SQL migration is required for this fix if `supabase/FINAL_MIGRATION.sql` was already run successfully in the new Supabase project.

The existing migration already contains:
- `calendar_sources`
- `schedule_events`
- the unique `(calendar_source_id, external_uid)` index used for calendar upserts
- the calendar/schedule foreign keys and RLS

Do **not** run the three migration copies again just for this fix.

## 2. Supabase API keys

Use the new API key names where available:

- Publishable key: `sb_publishable_...`
- Secret key: `sb_secret_...`

The secret key must stay server-side. Supabase is migrating away from the legacy `anon` and `service_role` keys during 2026.

## 3. Netlify environment variables

In Site configuration → Environment variables, set these for the production deploy:

- `SUPABASE_URL` = your NEW Supabase project URL
- `SUPABASE_PUBLISHABLE_KEY` = your NEW Supabase publishable key
- `SUPABASE_SECRET_KEY` = your NEW Supabase secret key
- `STRAVA_CLIENT_ID` = your existing Strava client ID, if Strava is enabled
- `STRAVA_CLIENT_SECRET` = your existing Strava client secret, if Strava is enabled

Legacy fallbacks are also supported:
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Keep server-only variables scoped to Functions when your Netlify plan/UI allows it.

After changing environment variables, trigger a new deploy. Netlify applies environment-variable changes to a new deployment.

## 4. Browser Supabase config

This release is already configured with the NEW Supabase project's browser-safe URL and publishable key you supplied.

The file is `public/config.js`. It contains only:
- the NEW Supabase Project URL
- the NEW Supabase publishable key

Never put the `sb_secret_...` key or a service-role key in `public/config.js`.

## 5. Google Calendar

Use Google Calendar's **Secret address in iCal format**, not the normal calendar webpage URL.

In Fit Together:

1. Settings → External calendar
2. Enter a name
3. Paste the secret `.ics` / `webcal://` URL
4. Connect calendar
5. Click Sync

The button will now show `Syncing…` and then display either an import count or a specific error.

## 6. Strava

The callback URL remains:

`https://poetic-cobbler-ad63db.netlify.app/api/strava/callback`

Only configure this if Strava is being used.
