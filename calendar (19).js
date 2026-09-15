import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_EVENTS = 1000;
const RECURRENCE_DAYS = 370;
const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 15000;

function unfold(text) {
  return String(text || '').replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/).filter(Boolean);
}

function parseParams(raw) {
  const params = {};
  for (const token of String(raw || '').split(';').filter(Boolean)) {
    const eq = token.indexOf('=');
    if (eq < 0) params[token.toUpperCase()] = '';
    else params[token.slice(0, eq).toUpperCase()] = token.slice(eq + 1).replace(/^"|"$/g, '');
  }
  return params;
}

function property(line) {
  const colon = line.indexOf(':');
  if (colon < 0) return { name: '', params: {}, value: '' };
  const head = line.slice(0, colon);
  const semi = head.indexOf(';');
  return {
    name: (semi >= 0 ? head.slice(0, semi) : head).toUpperCase(),
    params: parseParams(semi >= 0 ? head.slice(semi + 1) : ''),
    value: line.slice(colon + 1).trim()
  };
}

function unescapeText(value) {
  return String(value || '')
    .replace(/\\n/gi, '\n')
    .replace(/\\N/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function partsToDate(parts) {
  const map = Object.fromEntries(parts.map(part => [part.type, Number(part.value)]));
  return new Date(Date.UTC(map.year, map.month - 1, map.day, map.hour || 0, map.minute || 0, map.second || 0));
}

function zonedOffsetMs(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(date);
  return partsToDate(parts).getTime() - date.getTime();
}

function zonedLocalToDate(year, month, day, hour, minute, second, timeZone) {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (!timeZone || timeZone.toUpperCase() === 'UTC' || timeZone.toUpperCase() === 'GMT') return guess;
  try {
    const first = new Date(guess.getTime() - zonedOffsetMs(guess, timeZone));
    const secondOffset = zonedOffsetMs(first, timeZone);
    return new Date(guess.getTime() - secondOffset);
  } catch {
    return guess;
  }
}

function parseDate(value, params = {}) {
  const raw = String(value || '').trim();
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(raw);
  if (dateOnly) {
    const [, y, m, d] = dateOnly.map(Number);
    return { date: new Date(Date.UTC(y, m - 1, d)), allDay: true, tzid: params.TZID || 'UTC', raw };
  }
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(raw);
  if (!match) return null;
  const [, ys, ms, ds, hs, mins, ss, z] = match;
  const y = Number(ys), m = Number(ms), d = Number(ds), h = Number(hs), min = Number(mins), sec = Number(ss);
  const tzid = params.TZID || 'UTC';
  const date = z ? new Date(Date.UTC(y, m - 1, d, h, min, sec)) : zonedLocalToDate(y, m, d, h, min, sec, tzid);
  return { date, allDay: false, tzid, raw };
}

function parseUntil(value, tzid) {
  if (!value) return null;
  return parseDate(value, { TZID: tzid })?.date || null;
}

function parseRRule(value, tzid) {
  const rule = {};
  for (const token of String(value || '').split(';')) {
    const [key, ...rest] = token.split('=');
    if (!key || !rest.length) continue;
    rule[key.toUpperCase()] = rest.join('=').toUpperCase();
  }
  if (!rule.FREQ) return null;
  rule.interval = Math.max(1, Number(rule.INTERVAL || 1));
  rule.count = rule.COUNT ? Math.max(1, Number(rule.COUNT)) : null;
  rule.until = rule.UNTIL ? parseUntil(rule.UNTIL, tzid) : null;
  rule.byday = rule.BYDAY ? rule.BYDAY.split(',').filter(Boolean) : [];
  rule.bymonthday = rule.BYMONTHDAY ? rule.BYMONTHDAY.split(',').map(Number).filter(Number.isFinite) : [];
  return rule;
}

const weekdayMap = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

function localDateParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short'
  }).formatToParts(date);
  return Object.fromEntries(parts.map(p => [p.type, p.value]));
}

function occurrenceMatches(rule, candidate, tzid, start) {
  const p = localDateParts(candidate, tzid);
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
  if (rule.bymonthday.length && !rule.bymonthday.includes(Number(p.day))) return false;
  if (rule.byday.length) {
    const codes = rule.byday.map(x => x.slice(-2));
    if (!codes.some(code => weekdayMap[code] === weekday)) return false;
  }
  const startP = localDateParts(start, tzid);
  const y = Number(p.year), m = Number(p.month) - 1, d = Number(p.day);
  const sy = Number(startP.year), sm = Number(startP.month) - 1, sd = Number(startP.day);
  const dayIndex = Math.floor((Date.UTC(y, m, d) - Date.UTC(sy, sm, sd)) / 86400000);
  if (rule.FREQ === 'DAILY') return dayIndex >= 0 && dayIndex % rule.interval === 0;
  if (rule.FREQ === 'WEEKLY') {
    const weekIndex = Math.floor(dayIndex / 7);
    const expectedWeekdays = rule.byday.length ? rule.byday.map(code => weekdayMap[code.slice(-2)]) : [weekdayMap[startP.weekday.slice(0, 2).toUpperCase()] ?? new Date(Date.UTC(sy, sm, sd)).getUTCDay()];
    return weekIndex >= 0 && weekIndex % rule.interval === 0 && expectedWeekdays.includes(weekday);
  }
  if (rule.FREQ === 'MONTHLY') {
    const monthIndex = (y - sy) * 12 + (m - sm);
    if (monthIndex < 0 || monthIndex % rule.interval !== 0) return false;
    if (rule.bymonthday.length) return rule.bymonthday.includes(d);
    if (rule.byday.length) return rule.byday.some(code => weekdayMap[code.slice(-2)] === weekday);
    return d === sd;
  }
  if (rule.FREQ === 'YEARLY') {
    if (y < sy || (y - sy) % rule.interval !== 0 || m !== sm) return false;
    return d === sd;
  }
  return false;
}

function expandEvent(event) {
  if (!event.rrule) return [{ ...event, occurrenceKey: event.uid }];
  const start = event.start.date;
  const end = event.end?.date;
  const duration = end ? Math.max(0, end.getTime() - start.getTime()) : (event.start.allDay ? 86400000 : 3600000);
  const tzid = event.start.tzid || 'UTC';
  const horizon = new Date(Date.now() + RECURRENCE_DAYS * 86400000);
  const windowStart = new Date(Date.now() - 30 * 86400000);
  const rule = event.rrule;
  const occurrences = [];
  let candidate = new Date(start);
  let generated = 0;
  const hardStop = new Date(Math.min(horizon.getTime(), rule.until?.getTime() || horizon.getTime()));
  while (candidate <= hardStop && occurrences.length < MAX_EVENTS) {
    if (candidate >= windowStart && occurrenceMatches(rule, candidate, tzid, start)) {
      if (rule.count == null || generated < rule.count) {
        const index = generated;
        const occurrenceKey = `${event.uid}::${candidate.toISOString()}`;
        if (!event.exdates.has(candidate.toISOString())) {
          occurrences.push({ ...event, start: { ...event.start, date: candidate }, end: end ? { ...event.end, date: new Date(candidate.getTime() + duration) } : null, occurrenceKey, recurrenceIndex: index });
        }
        generated += 1;
      }
    }
    if (rule.FREQ === 'DAILY') candidate = new Date(candidate.getTime() + 86400000);
    else if (rule.FREQ === 'WEEKLY') candidate = new Date(candidate.getTime() + 86400000);
    else if (rule.FREQ === 'MONTHLY') candidate = new Date(candidate.getTime() + 86400000);
    else if (rule.FREQ === 'YEARLY') candidate = new Date(candidate.getTime() + 86400000);
    else break;
    if (rule.count && generated >= rule.count) break;
  }
  return occurrences;
}

function parseICS(text) {
  const lines = unfold(text);
  const events = [];
  let current = null;
  for (const line of lines) {
    if (line.toUpperCase() === 'BEGIN:VEVENT') { current = { exdates: new Set() }; continue; }
    if (line.toUpperCase() === 'END:VEVENT') {
      if (current?.uid && current.start) {
        if (current.rruleRaw) current.rrule = parseRRule(current.rruleRaw, current.start.tzid);
        if (!current.rrule) events.push({ ...current, occurrenceKey: current.uid });
        else events.push(...expandEvent(current));
      }
      current = null;
      if (events.length >= MAX_EVENTS) break;
      continue;
    }
    if (!current) continue;
    const part = property(line);
    if (part.name === 'UID') current.uid = unescapeText(part.value);
    else if (part.name === 'SUMMARY') current.title = unescapeText(part.value);
    else if (part.name === 'LOCATION') current.location = unescapeText(part.value);
    else if (part.name === 'DTSTART') current.start = parseDate(part.value, part.params);
    else if (part.name === 'DTEND') current.end = parseDate(part.value, part.params);
    else if (part.name === 'RRULE') current.rruleRaw = part.value;
    else if (part.name === 'EXDATE') {
      for (const raw of part.value.split(',')) {
        const parsed = parseDate(raw, part.params);
        if (parsed) current.exdates.add(parsed.date.toISOString());
      }
    }
  }
  return events.slice(0, MAX_EVENTS);
}

function privateIPv4(address) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part))) return true;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19));
}

function privateIPv6(address) {
  const normalized = address.toLowerCase();
  return normalized === '::' || normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') ||
    normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb');
}

async function validateRemoteUrl(raw) {
  const normalized = String(raw || '').replace(/^webcal:\/\//i, 'https://');
  let url;
  try { url = new URL(normalized); } catch { throw new Error('Invalid calendar URL.'); }
  if (url.protocol !== 'https:') throw new Error('Calendar URLs must use HTTPS or webcal.');
  if (url.username || url.password) throw new Error('Calendar URL credentials are not supported.');
  if (url.port && url.port !== '443') throw new Error('Calendar URL must use the standard HTTPS port.');
  const hostname = url.hostname.toLowerCase();
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    throw new Error('Private network calendar hosts are not allowed.');
  }
  const literalType = isIP(hostname);
  const addresses = literalType ? [{ address: hostname, family: literalType }] : await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length) throw new Error('Calendar host could not be resolved.');
  for (const item of addresses) {
    if ((item.family === 4 && privateIPv4(item.address)) || (item.family === 6 && privateIPv6(item.address))) throw new Error('Private network calendar hosts are not allowed.');
  }
  return url;
}

async function safeFetchCalendar(rawUrl) {
  let url = await validateRemoteUrl(rawUrl);
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let response;
    try {
      response = await fetch(url, { redirect: 'manual', signal: controller.signal, headers: { 'user-agent': 'FitTogetherCalendarSync/2.0', accept: 'text/calendar,text/plain;q=0.9,*/*;q=0.1' } });
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('Calendar provider timed out.');
      throw new Error(`Calendar provider could not be reached: ${error?.message || 'network error'}`);
    } finally { clearTimeout(timer); }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (redirect === MAX_REDIRECTS) throw new Error('Calendar redirected too many times.');
      const location = response.headers.get('location');
      if (!location) throw new Error('Calendar redirect was invalid.');
      url = await validateRemoteUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) throw new Error(`Calendar fetch failed: ${response.status}`);
    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (contentType && !/(text\/calendar|text\/plain|application\/ics|application\/octet-stream)/.test(contentType)) {
      throw new Error('The URL did not return an iCalendar (.ics) file.');
    }
    const length = Number(response.headers.get('content-length') || 0);
    if (length > MAX_BYTES) throw new Error('Calendar is too large to import.');
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_BYTES) throw new Error('Calendar is too large to import.');
    const text = new TextDecoder('utf-8', { fatal: false }).decode(buffer).replace(/^\uFEFF/, '');
    if (!/BEGIN:VCALENDAR/i.test(text) || !/BEGIN:VEVENT/i.test(text)) throw new Error('The downloaded file is not a valid iCalendar feed.');
    return text;
  }
  throw new Error('Calendar fetch failed.');
}

function jsonHeaders() { return { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }; }
function responseJson(body, status = 200) { return new Response(JSON.stringify(body), { status, headers: jsonHeaders() }); }

export default async req => {
  if (req.method !== 'POST') return responseJson({ error: 'POST required' }, 405);
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return responseJson({ error: 'Supabase server configuration is incomplete.' }, 500);

  try {
    const authorization = req.headers.get('authorization') || '';
    if (!authorization.toLowerCase().startsWith('bearer ')) return responseJson({ error: 'Unauthorized' }, 401);
    const bearer = authorization.slice(7).trim();
    if (!bearer) return responseJson({ error: 'Unauthorized' }, 401);
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: serviceKey, Authorization: `Bearer ${bearer}` } });
    if (!userResponse.ok) return responseJson({ error: 'Unauthorized' }, 401);
    const current = await userResponse.json();

    const sourceId = new URL(req.url).searchParams.get('source');
    if (!sourceId || !/^[0-9a-f-]{36}$/i.test(sourceId)) return responseJson({ error: 'Invalid calendar source.' }, 400);
    const sourceResponse = await fetch(`${supabaseUrl}/rest/v1/calendar_sources?id=eq.${encodeURIComponent(sourceId)}&user_id=eq.${encodeURIComponent(current.id)}&select=*`, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
    if (!sourceResponse.ok) return responseJson({ error: 'Calendar source lookup failed.' }, 502);
    const sources = await sourceResponse.json();
    const source = sources[0];
    if (!source) return responseJson({ error: 'Calendar source not found.' }, 404);

    const text = await safeFetchCalendar(source.url);
    const events = parseICS(text);
    if (!events.length) throw new Error('No calendar events were found in the feed.');

    // Replace this source's imported rows on each sync. This prevents deleted/cancelled
    // provider events and old recurrence expansions from lingering in the app.
    const deleteResponse = await fetch(`${supabaseUrl}/rest/v1/schedule_events?calendar_source_id=eq.${encodeURIComponent(source.id)}`, {
      method: 'DELETE',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Prefer: 'return=minimal' }
    });
    if (!deleteResponse.ok) throw new Error('Could not refresh imported calendar events.');

    const rows = events.map(event => ({
      creator_id: current.id,
      calendar_source_id: source.id,
      external_uid: event.occurrenceKey || event.uid,
      title: event.title || source.name || 'Calendar event',
      event_type: 'calendar',
      location: event.location || null,
      starts_at: event.start.date.toISOString(),
      ends_at: event.end?.date?.toISOString() || null
    }));

    let imported = 0;
    for (let offset = 0; offset < rows.length; offset += 100) {
      const batch = rows.slice(offset, offset + 100);
      const response = await fetch(`${supabaseUrl}/rest/v1/schedule_events?on_conflict=calendar_source_id,external_uid`, {
        method: 'POST',
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(batch)
      });
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(`Calendar event import failed: ${detail || response.status}`);
      }
      imported += batch.length;
    }

    const patchResponse = await fetch(`${supabaseUrl}/rest/v1/calendar_sources?id=eq.${encodeURIComponent(source.id)}&user_id=eq.${encodeURIComponent(current.id)}`, {
      method: 'PATCH',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ last_synced_at: new Date().toISOString() })
    });
    if (!patchResponse.ok) throw new Error('Calendar imported but sync status could not be updated.');

    return responseJson({
      ok: true,
      imported,
      scanned: events.length,
      recurringEventsExpanded: events.filter(event => event.rrule).length,
      recurrenceMode: 'expanded-next-370-days',
      syncedAt: new Date().toISOString()
    });
  } catch (error) {
    return responseJson({ error: error?.message || 'Calendar sync failed.' }, 502);
  }
};
