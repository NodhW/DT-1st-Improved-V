# Fit Together — Development Notes

## Architecture

- `src/main.jsx` — app shell and all product UI.
- `src/services/backend.js` — typed-by-convention service layer for Supabase and Netlify endpoints.
- `src/lib/supabase.js` — browser Supabase client.
- `supabase/FINAL_MIGRATION.sql` — complete production schema/RLS/RPC alignment.
- `netlify/functions/strava.js` — Strava OAuth, refresh, sync, verified activity ingestion.
- `netlify/functions/calendar.js` — authenticated private ICS import with SSRF defenses.
- `public/manifest.webmanifest`, `public/sw.js` — PWA shell.

## Locked IA

There are exactly four primary bottom tabs: Home, Plan, Social, Feed. Settings and Profile are overlays. Rewards stay inside Profile. Fit AI stays inside Plan. Social contains Groups and Chats.

## Chat/RLS design

`conversation_members` SELECT is self-row only. The client obtains co-members through `get_conversation_members()`, which checks conversation membership before returning user IDs. `conversations` and `messages` are readable only when `is_conversation_member(...)` succeeds. Direct-conversation creation is atomic through `get_or_create_direct_conversation()` and requires an accepted friendship.

Unread state uses `conversation_members.last_read_at`, not the legacy single `messages.read_at` flag, so group-chat reads are per user.

## Activity / points / streak design

`activity_log` is the source of truth for daily participation. Self-reporting uses `record_activity('self_report')` and is unique per user/day. Server-verified Strava/GPS/wearable activities use `record_verified_activity()` and are unique by external ID.

When an activity is recorded, `refresh_group_streaks_for_user()` checks each group. A `group_streak_days` row is created only when **every current group member has an activity for that date**. `group_streak_status()` exposes completion counts and the current consecutive crew streak without exposing members’ private event details.

## Shared scheduling privacy

Plan does not fetch other members’ full schedules. `get_group_busy_blocks()` returns only start/end busy intervals for group members, and Fit AI calculates the earliest shared opening from those blocks.

## University verification

Signup remains open to any email. Settings can submit a university verification request, but `university_verified` is not browser-writable. A real institutional/admin verification process can set it later.

## Known intentional V1 limitations

- Calendar recurrence: first occurrence only.
- Calendar sync: manual; no scheduled background polling included.
- Chat: text only.
- Simulated Health: clearly labeled synthetic web/PWA data, not medical or device data.
- Non-workout challenge goal types use manual +1 progress as a foundation until device-derived challenge metrics are added.

## Validation

`npm run validate` checks repository invariants and JavaScript syntax for the service/backend functions. `npm run build` remains the authoritative production bundle test.
