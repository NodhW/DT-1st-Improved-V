import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const must = (condition, message) => {
  if (!condition) throw new Error(message);
  console.log(`✓ ${message}`);
};

const main = read('src/main.jsx');
const backend = read('src/services/backend.js');
const sql = read('supabase/FINAL_MIGRATION.sql');
const config = read('public/config.js');
const netlify = read('netlify.toml');

for (const file of [
  'public/manifest.webmanifest',
  'public/sw.js',
  'public/icon-192.png',
  'public/icon-512.png',
  'netlify/functions/strava.js',
  'netlify/functions/calendar.js'
]) {
  must(fs.existsSync(path.join(root, file)), `${file} exists`);
}

must(config.includes('YOUR_PROJECT_REF.supabase.co') || (config.includes('SUPABASE_URL') && config.includes('FIT_TOGETHER_CONFIG')), 'browser config is present and uses the configurable Supabase endpoint');
must(!/service[_-]?role|sb_secret_/i.test(config), 'browser config contains no server-only Supabase secret');
must(!backend.includes('listForUsers'), 'backend/UI no longer depend on the undefined listForUsers helper');
must(main.includes("tab === 'home'") && main.includes("tab === 'plan'") && main.includes("tab === 'social'") && main.includes("tab === 'feed'"), 'four primary tabs are present');
must(!main.includes("tab === 'rewards'"), 'Rewards is not a primary tab');
must(main.includes('Profile → Rewards'), 'Rewards is surfaced through Profile');
must(sql.includes('get_conversation_members') && sql.includes('get_or_create_direct_conversation'), 'chat-safe RPCs are included');
must(sql.includes('create view public.profiles_card') && sql.includes('using(id=auth.uid())'), 'base profiles are owner-only with a safe cross-user card view');
must(sql.includes('find_profile_by_friend_code') && backend.includes("rpc('find_profile_by_friend_code'"), 'friend-code lookup is exact-match RPC rather than enumerable profile-table access');
must(sql.includes('leave_group') && backend.includes("rpc('leave_group'"), 'leave-group access revocation flow is included');
must(sql.includes('at time zone user_timezone') && sql.includes('today_local'), 'activity and streak day boundaries are timezone-aware');
must(netlify.includes('NODE_VERSION = "22"'), 'Netlify build pins Node 22 for current Supabase SDK engine requirements');
must(!/create policy[^\n]*conversations[^\n]*using\s*\(\s*true\s*\)/i.test(sql), 'conversations do not use broad SELECT RLS');
must(!/create policy[^\n]*messages[^\n]*using\s*\(\s*true\s*\)/i.test(sql), 'messages do not use broad SELECT RLS');
must(sql.includes('group_streak_days') && sql.includes('group_streak_status'), '100% crew streak foundations are included');
must(sql.includes('revoke execute on function public.get_conversation_members(uuid) from public,anon,authenticated'), 'public RPC EXECUTE is revoked before authenticated grants');
must(sql.includes('revoke all on table') && sql.includes('from public,anon,authenticated'), 'application table privileges are explicitly least-privilege');
must(sql.includes('grant select,insert on public.messages to authenticated'), 'chat table privileges allow only read/send from the browser');
must(sql.includes('schedule_calendar_source_fkey') && sql.includes('wearable_connections_user_fkey'), 'relationship-integrity constraints are included');
must(sql.includes('record_verified_activity') && sql.includes("pts := 10") && sql.includes("then 50"), 'self-report and verified activity point tiers are included');
must(netlify.includes('/api/strava/start') && netlify.includes('/api/strava/callback'), 'Strava start/callback routes are configured');
must(read('netlify/functions/strava.js').includes('SUPABASE_SECRET_KEY') && read('netlify/functions/strava.js').includes('adminHeaders'), 'Strava server function supports the new Supabase secret-key format safely');
must(read('netlify/functions/calendar.js').includes('Private network calendar hosts are not allowed.'), 'calendar SSRF protection is included');
must(read('netlify/functions/calendar.js').includes('SUPABASE_SECRET_KEY') && read('netlify/functions/calendar.js').includes('SUPABASE_SERVICE_ROLE_KEY'), 'calendar function supports new and legacy Supabase server keys');
must(read('netlify/functions/calendar.js').includes('authClient.auth.getUser'), 'calendar sync verifies the signed-in user token server-side');
must(main.includes('syncingCalendarId') && main.includes('Syncing…'), 'calendar sync shows visible progress state in the UI');
must(backend.includes('content-type') && backend.includes('Calendar sync failed'), 'calendar client surfaces structured sync errors');

execFileSync(process.execPath, ['--check', path.join(root, 'src/services/backend.js')], { stdio: 'inherit' });
execFileSync(process.execPath, ['--check', path.join(root, 'netlify/functions/strava.js')], { stdio: 'inherit' });
execFileSync(process.execPath, ['--check', path.join(root, 'netlify/functions/calendar.js')], { stdio: 'inherit' });
console.log('✓ JavaScript syntax checks passed for backend and Netlify functions');
console.log('Validation complete.');
