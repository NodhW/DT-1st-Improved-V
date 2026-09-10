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

must(config.includes('swdmiuowjliacsetesfs.supabase.co'), 'browser config targets the authoritative Supabase project');
must(!/service[_-]?role/i.test(config), 'browser config contains no service-role secret');
must(!backend.includes('listForUsers'), 'backend/UI no longer depend on the undefined listForUsers helper');
must(main.includes("tab === 'home'") && main.includes("tab === 'plan'") && main.includes("tab === 'social'") && main.includes("tab === 'feed'"), 'four primary tabs are present');
must(!main.includes("tab === 'rewards'"), 'Rewards is not a primary tab');
must(main.includes('Profile → Rewards'), 'Rewards is surfaced through Profile');
must(sql.includes('get_conversation_members') && sql.includes('get_or_create_direct_conversation'), 'chat-safe RPCs are included');
must(!/create policy[^\n]*conversations[^\n]*using\s*\(\s*true\s*\)/i.test(sql), 'conversations do not use broad SELECT RLS');
must(!/create policy[^\n]*messages[^\n]*using\s*\(\s*true\s*\)/i.test(sql), 'messages do not use broad SELECT RLS');
must(sql.includes('group_streak_days') && sql.includes('group_streak_status'), '100% crew streak foundations are included');
must(sql.includes('revoke execute on function public.get_conversation_members(uuid) from public,anon,authenticated'), 'public RPC EXECUTE is revoked before authenticated grants');
must(sql.includes('revoke all on table') && sql.includes('from public,anon,authenticated'), 'application table privileges are explicitly least-privilege');
must(sql.includes('grant select,insert on public.messages to authenticated'), 'chat table privileges allow only read/send from the browser');
must(sql.includes('schedule_calendar_source_fkey') && sql.includes('wearable_connections_user_fkey'), 'relationship-integrity constraints are included');
must(sql.includes('record_verified_activity') && sql.includes("pts := 10") && sql.includes("then 50"), 'self-report and verified activity point tiers are included');
must(netlify.includes('/api/strava/start') && netlify.includes('/api/strava/callback'), 'Strava start/callback routes are configured');
must(read('netlify/functions/calendar.js').includes('Private network calendar hosts are not allowed.'), 'calendar SSRF protection is included');

execFileSync(process.execPath, ['--check', path.join(root, 'src/services/backend.js')], { stdio: 'inherit' });
execFileSync(process.execPath, ['--check', path.join(root, 'netlify/functions/strava.js')], { stdio: 'inherit' });
execFileSync(process.execPath, ['--check', path.join(root, 'netlify/functions/calendar.js')], { stdio: 'inherit' });
console.log('✓ JavaScript syntax checks passed for backend and Netlify functions');
console.log('Validation complete.');
