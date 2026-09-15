import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('workout client uses ownership-checked RPC mutations', () => {
  const backend = read('src/services/backend.js');
  for (const rpc of ['start_workout', 'add_workout_exercise', 'add_workout_set', 'delete_workout_set', 'delete_workout_exercise', 'cancel_workout', 'get_my_workout_history']) {
    assert.match(backend, new RegExp(`rpc\\(['"]${rpc}['"]`));
  }
  assert.doesNotMatch(backend, /from\(['"]workouts['"]\)\.insert/);
  assert.doesNotMatch(backend, /from\(['"]workout_exercises['"]\)\.insert/);
  assert.doesNotMatch(backend, /from\(['"]workout_sets['"]\)\.insert/);
});

test('challenge UI does not call the disabled manual progress RPC', () => {
  const app = read('src/App.jsx');
  assert.doesNotMatch(app, /logProgress/);
  assert.doesNotMatch(app, /onLog/);
  assert.match(app, /Progress updates from logged activity/);
});

test('SQL exposes workout RPCs only to authenticated users', () => {
  const sql = read('supabase/WORKOUT_LOGGING_REPAIR.sql');
  for (const rpc of ['start_workout(text,uuid)', 'add_workout_exercise(uuid,uuid,integer)', 'add_workout_set(uuid,integer,integer,numeric,integer,numeric)', 'delete_workout_set(uuid)', 'delete_workout_exercise(uuid)', 'cancel_workout(uuid)', 'get_my_workout_history(integer)']) {
    assert.match(sql, new RegExp(`grant execute on function public\\.${rpc.replace(/[()]/g, m => `\\${m}`)} to authenticated`, 'i'));
  }
});

test('Gemini output parsing handles REST model_output steps and has a public route', () => {
  const fn = read('netlify/functions/gemini.js');
  const netlify = read('netlify.toml');
  const backend = read('src/services/backend.js');
  assert.match(netlify, /from = \"\/api\/gemini\/chat\"/);
  assert.match(netlify, /to = \"\/.netlify\/functions\/gemini\"/);
  assert.match(backend, /fetch\(\'\/api\/gemini\/chat\'/);
  assert.match(fn, /result\?\.steps/);
  assert.match(fn, /type === 'model_output'/);
  assert.match(fn, /block\?\.type === 'text'/);
  assert.match(fn, /store: false/);
});

test('calendar endpoint retains SSRF and size protections', () => {
  const fn = read('netlify/functions/calendar.js');
  assert.match(fn, /MAX_BYTES = 5 \* 1024 \* 1024/);
  assert.match(fn, /privateIPv4/);
  assert.match(fn, /privateIPv6/);
  assert.match(fn, /MAX_REDIRECTS = 5/);
  assert.match(fn, /FETCH_TIMEOUT_MS = 15000/);
});

test('browser config keeps secrets server-side and Strava disabled', () => {
  const config = read('public/config.js');
  assert.match(config, /jaesndcamjdcokhxyqpl\.supabase\.co/);
  assert.doesNotMatch(config, /service[_-]?role/i);
  assert.doesNotMatch(config, /STRAVA_ENABLED:\s*true/);
});
