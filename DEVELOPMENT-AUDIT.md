# Fit Together — Technical Audit

*Audit only, per your instructions. No files were modified. Two live Supabase checks were run (**`list_tables`**,* *`list_migrations`**,* *`get_advisors`**) to verify the database against the repo, since I won't guess about schema state.*

## 1. Architecture Map

```
final-fit 4/
├── index.html, public/config.js, public/_redirects
├── src/
│   ├── main.jsx            — entire UI: Auth, App shell, 4 tabs, Fab, Overlays, Chat (single file, ~9k tokens)
│   ├── lib/supabase.js     — browser Supabase client, reads window.FIT_TOGETHER_CONFIG
│   ├── services/backend.js — all Supabase queries/RPCs (auth, profile, posts, friends, groups, conversations, messages, schedule, calendars, wearables, strava, points, challenges, shop)
│   └── styles.css          — single global stylesheet
├── netlify/functions/
│   ├── strava.js           — OAuth callback/exchange/sync (service-role, server-side)
│   └── calendar.js         — ICS fetch + parse + upsert into schedule_events
├── netlify.toml            — SPA redirects + function routing
└── supabase/FINAL_MIGRATION.sql / SETUP.sql — identical full schema+RLS+seed script

```

Build: Vite 6 + React 18, `@supabase/supabase-js` v2, `lucide-react`. Single-page, tab-state-driven (no router).

## 2. Critical Finding — Wrong Supabase Project Is Wired Up

This is the most important thing in this audit.

- `public/config.js` (the file actually shipped/loaded by `index.html`) points at **`aymsmrdsvxyyjhlafuiz`** ("DT FT Prototype").
- Your operating instructions name **`swdmiuowjliacsetesfs`** ("DT FT V3") as the current production project.
- I queried both projects directly:

| Table `aymsmrdsvxyyjhlafuiz` (wired in code) `swdmiuowjliacsetesfs` (named as prod)                            |                   |                          |
| -------------------------------------------------------------------------------------------------------------- | ----------------- | ------------------------ |
| profiles, posts, comments, friendships, groups, group\_members, conversations, conversation\_members, messages | ✅ present         | ✅ present                |
| `schedule_events`                                                                                              | ❌ missing         | ✅ present (6 rows)       |
| `calendar_sources`                                                                                             | ❌ missing         | ✅ present (2 rows)       |
| `wearable_connections`                                                                                         | ❌ missing         | ✅ present                |
| `points_ledger`, `challenges`, `challenge_participants`                                                        | ❌ missing         | ✅ present                |
| `shop_items`, `redemptions`                                                                                    | ❌ missing         | ✅ present (6 shop items) |
| `post_likes` (not referenced anywhere in `backend.js`)                                                         | ✅ present, unused | —                        |
| `event_rsvps` (not referenced anywhere in `backend.js`)                                                        | —                 | ✅ present, unused        |

**Consequence:** as currently configured, the deployed app talks to a database that is missing every table backing Plan (schedule/calendar), Rewards (points/challenges/shop), and wearables. `PlanTab`, `RewardsTab`, `SettingsModal`'s calendar/wearable sections, and `points.recordActivity()` would all throw Postgres "relation does not exist" errors in production right now. This isn't a code bug — the code and the `FINAL_MIGRATION.sql` schema agree with each other; it's a **configuration/environment mismatch**. It needs a decision from you (point config.js at `swdmiuowjliacsetesfs`, or re-run `FINAL_MIGRATION.sql` against `aymsmrdsvxyyjhlafuiz` and decide what to do about the stray `post_likes`/`event_rsvps` tables) before anything else is worth building on top of.

I have not changed `public/config.js`. Flagging only.

## 3. Live Security Advisor Findings (on `swdmiuowjliacsetesfs`)

Ran Supabase's security linter against the project named as production:

- **`award_points`****,** **`record_daily_activity`****,** **`bump_challenge_progress`****,** **`redeem_shop_item`****,** **`ensure_my_profile`****,** **`generate_friend_code`****,** **`handle_new_user`** are all `SECURITY DEFINER` and, per the linter, callable directly via `/rest/v1/rpc/...` by both `anon` and `authenticated` roles.
- Of these, **`award_points`****,** **`record_daily_activity`****, and** **`bump_challenge_progress`****/****`redeem_shop_item`** **(indirectly) all accept an arbitrary** **`p_user_id`** **argument with no check that** **`p_user_id = auth.uid()`****.** Reading the SQL in `FINAL_MIGRATION.sql` confirms this — there is no `auth.uid()` guard inside `award_points` or `record_daily_activity`. Today, any authenticated (or possibly anonymous) client could call `supabase.rpc('award_points', {p_user_id: <victim>, p_amount: 999999, p_reason:'x'})` directly against PostgREST and inflate/drain any user's `points_balance`, independent of the frontend. The frontend itself never calls `award_points` with an arbitrary id (it only calls `record_daily_activity`/`bump_challenge_progress`/`redeem_shop_item` for the signed-in user), so the **UI path is fine**, but the **RPC surface is not access-controlled** — this is a backend/DB fix, not a frontend one.
- `auth_leaked_password_protection` is disabled (HaveIBeenPwned check) — minor, easy Supabase Auth setting.

This should be near the top of Phase 1, since it's a real exploitable hole in the currently-live schema, not a hypothetical.

## 4. Features — Implemented, Working (by inspection)

- **Auth**: email/password + Google OAuth, session restore, profile self-repair via `ensure_my_profile()` if a profile is missing (`App.load()` correctly signs the user back out if repair fails — matches your "must not show app without valid session + profile" rule).
- **4-tab IA**: Home / Plan / Social / Feed matches spec exactly, with a 5th "Rewards" tab bolted on (see §6).
- **FAB**: single FAB, 4 actions (Log Workout, Post Update, Create Group, Add Friend) — matches spec.
- **Settings & Profile**: both are overlays (`Overlay`/`sheet`), not tabs — matches spec.
- **Friend system**: 8-char `friend_code`, pending-request flow via `friendships.status`, accept/decline — matches spec.
- **Groups**: join codes, member picker from friends list, auto-created group `conversations` row on create/join — matches spec.
- **Chat**: 1:1 + group, realtime via `postgres_changes` subscription, `read_at` unread tracking, non-recursive `conversation_members` policies (the migration explicitly drops and rebuilds these to fix `42P17` — this was clearly already debugged once).
- **Feed**: posts with image upload to `post-media` bucket (spec says `feed_photos` — see §6), expandable comment tray, `author_id` correctly set from `auth.uid()` on every insert.
- **Plan / Calendar**: ICS import via Netlify function (server-side, service-role, correctly keeps secrets out of the browser), "first occurrence only" for recurring events (documented behavior, matches spec's stated limitation).
- **Fit AI Copilot**: `findBestSlot()` scans a group's members' `schedule_events` for the day and proposes/adds a slot — matches spec (lives inside Plan, not a separate tab).
- **Strava**: OAuth flow fully server-side through `netlify/functions/strava.js`; client secret never touches the browser.
- **Points/Streaks/Challenges/Shop**: `record_daily_activity`, `bump_challenge_progress`, `redeem_shop_item` RPCs exist and are wired from the UI.

## 5. Partially Implemented

- **Shared/group streak rule** ("100% of crew before midnight"): **not implemented anywhere.** `current_streak`/`longest_streak` in `record_daily_activity()` are purely **individual** — a solo user logging one activity/day increments their own streak with no reference to group membership or other members' activity. There is no scheduled job, cron, or check-all-members logic. This is the app's core stated mechanic and it does not exist yet in the DB or frontend.
- **Anti-cheat verification tiers** (smartwatch/GPS = +50pts, self-report capped): spec calls for differentiated point awards by verification method; current `record_daily_activity` awards a flat `10` points regardless of source, and `points.recordActivity()` is called identically whether triggered by manual "Log Workout," a post, or the AI copilot's "Add to Schedule." No verification/anti-cheat logic exists.
- **University verification**: `university`/`university_verified` fields exist and are editable in Settings, but it's a self-reported checkbox — no actual SSO/verification flow, which is consistent with spec ("optional... belongs in Settings") but worth naming as stub-only.
- **Photo bucket naming**: spec says posts use bucket `feed_photos`; code/migration use `post-media`. Functionally fine (bucket is public, policies scoped to `auth.uid()/folder`), just a naming mismatch vs. spec — not a bug, flagging for consistency only.

## 6. Deviations from Spec / Missing

- **Rewards is a 5th bottom tab** (`nav` renders Home/Plan/Social/Feed/Rewards). Spec is explicit: rewards/shop/challenges belong inside **Profile**, and there should be exactly 4 primary tabs. Currently there are 5, plus a "rewards-teaser" card on Home linking to the same tab. This is the single largest navigation deviation from your Section 4/16 requirements.
- **Feed header** in spec should include a pending-friend-request indicator; current `FeedTab` only has a plain "add friend" icon button with no unread/pending badge.
- **`post_likes`** **/** **`event_rsvps`** **tables**: exist in the two databases respectively but are dead weight — no code references them. Not harmful, just unused schema.
- **Simulated health labeling**: UI does label it "SIMULATED HEALTH" / "Simulated Health is off" appropriately — spec's "must not present as real data" requirement is satisfied.

## 7. Broken / At-Risk Functionality

1. **Wrong Supabase project wired (§2)** — highest severity, blocks Plan/Rewards/Calendar/Wearables entirely if deployed as-is against `aymsmrdsvxyyjhlafuiz`.
2. **Unauthenticated/cross-user RPC exposure (§3)** — `award_points`/`record_daily_activity` accept arbitrary `p_user_id`.
3. **`public/config.js`** ships an empty `SUPABASE_ANON_KEY` — app will show the "not configured" notice on a fresh checkout until someone pastes a key in; this is expected local-dev behavior but worth confirming Netlify's deployed copy has a real key (I did not check the live Netlify site's served `config.js` — would need to fetch it if you want that verified).
4. **`schedule.list()`** in `backend.js` only ever filters `creator_id.eq.${u.id}` — a user's Plan tab never shows events other people created for a shared group session unless that same user is also the creator. This likely doesn't break anything today (nothing currently writes group-shared events with a different creator) but would silently under-show data once/if group-authored events are introduced.

## 8. Database / Schema Risks

- Migration script is safe/idempotent (`create table if not exists` + `add column if not exists` + policy drop/recreate), consistent with your "no invented ALTERs" rule — good practice already in place.
- `points_ledger`, `challenges`, `challenge_participants`, `schedule_events`, `calendar_sources`, `wearable_connections`, `shop_items`, `redemptions` simply **do not exist** on the project the app is actually pointed at (§2) — not a migration bug, an environment-pointer bug.

## 9. RLS / Security Risks

- `conversation_members` policies are correctly non-recursive (`user_id = auth.uid()` only) — matches your explicit historical-lesson requirement, already fixed once, don't touch without care.
- `challenges_select` policy does reference `group_members` (not itself) to gate group-tier visibility — that's fine, not recursive.
- SECURITY DEFINER RPC exposure (§3) is the open item.

## 10. Auth Risks

- None found beyond the RPC issue above. Sign-in/sign-up/session-restore/profile-repair flow looks correctly defensive (`App.load()` force-signs-out on missing profile or query failure rather than half-rendering the app).

## 11. Build / Deployment Risks

- `package.json`/`vite.config` weren't shown but referenced (`vite`, `@vitejs/plugin-react`) — nothing anomalous in `package-lock.json`. I have not run `npm install && npm run build` yet since this is audit-only and no sandboxed copy of the repo exists in my container (only the document contents) — I'd need you to confirm you want me to materialize the repo into the container to actually run a build, per your "never claim tested" rule.
- `netlify.toml` redirects for `/api/strava/*` and `/api/calendar/sync` look correctly scoped and match `backend.js`'s fetch URLs.

## 12. Integration Risks

- Strava: correctly server-side; depends on `STRAVA_CLIENT_ID`/`STRAVA_CLIENT_SECRET`/`SUPABASE_SERVICE_ROLE_KEY` being set in Netlify env — not verified live (would need Netlify env read, which I can do if you want).
- Calendar: private ICS URL stored in plaintext in `calendar_sources.url`, readable only by the owning user under RLS — acceptable per spec's "treat as secret, not necessarily encrypted" framing, but worth noting it is not encrypted at rest.

## Summary

**Current state:** A largely spec-compliant, previously-debugged app (chat recursion already fixed once, secrets already kept server-side) that is currently pointed at a Supabase project missing most of its schema, undermined by an unguarded points-award RPC, and carrying one real IA deviation (5-tab nav instead of 4 with Rewards inside Profile) plus one unbuilt core mechanic (100%-group streak).

**Working:** Auth, friends, groups, chat/realtime, feed/comments/images, calendar ICS import, Fit AI slot-finder, Strava OAuth plumbing, points/challenges/shop RPCs (functionally, against the correct DB).

**Broken (as deployed today):** Plan, Rewards, Settings→calendar/wearables — all will error against the currently-configured Supabase project.

**Missing:** Group 100%-participation streak logic, verification-tiered point awards, pending-friend-request badge on Feed header.

**Critical risks:** (1) Supabase project mismatch, (2) unauthenticated/cross-user `award_points`/`record_daily_activity` RPC calls.

**Recommended next task:** Phase 1 — resolve the Supabase project mismatch (your call on which project is authoritative) and lock down the SECURITY DEFINER RPCs with `auth.uid()` checks, before touching any UI/navigation work.

Waiting for your instruction on how to proceed.

## Current hotfix additions

- Workout history now uses an ownership-checked RPC and includes in-progress sessions.
- Fitness Center refreshes history immediately when a session starts.
- Settings includes an explicitly labelled prototype university verification control.
- Challenge cards include a prototype progress control with capped demo points.
- Fit AI can call the Gemini server function when `GEMINI_API_KEY` is configured, with the existing deterministic behavior as fallback.
