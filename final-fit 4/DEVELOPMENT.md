# Fit Together — Development Package

This is the complete editable source package for continuing development of Fit Together.

## Stack
- Vite + React
- Supabase Auth / Database / Realtime / Storage
- Netlify Functions
- Optional Strava OAuth
- Private .ics / webcal calendar URL import

## Project structure
- `src/` — React application
- `src/services/backend.js` — Supabase data/service layer
- `src/lib/supabase.js` — Supabase browser client
- `public/config.js` — browser-safe runtime configuration
- `netlify/functions/` — server-side calendar and Strava functions
- `supabase/FINAL_MIGRATION.sql` — current migration
- `supabase/SETUP.sql` — setup copy of the migration

## Local development
1. Install Node.js 20+.
2. Run `npm install`.
3. Run `npm run dev`.
4. Open the local URL shown by Vite.

## Production build
```bash
npm run build
```

The Netlify configuration publishes `dist/` and uses the SPA redirect in `public/_redirects`.

## Supabase
The browser config contains only the publishable/anon key. Never put a Supabase service-role key in `public/config.js`.

For server-side Netlify functions, configure:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRAVA_CLIENT_ID`
- `STRAVA_CLIENT_SECRET`

## Important database fix included
The migration removes older `conversation_members` RLS policies and recreates non-recursive policies. This addresses PostgreSQL error `42P17: infinite recursion detected in policy for relation "conversation_members"`.

Run the migration in Supabase SQL Editor before testing chat/auth flows if your database already contains the older policies.

## Calendar
The calendar feature accepts a private `.ics` or `webcal` URL and supports manual `Sync Now`. Treat a private calendar URL as secret because possession of the URL can expose calendar data.

Recurring calendar events are intentionally imported as their first occurrence rather than silently expanding every recurrence.
