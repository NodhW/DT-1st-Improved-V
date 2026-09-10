import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { createClient } from '@supabase/supabase-js';

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_EVENTS = 1000;
const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 12000;

function jsonError(message, status = 502, details = {}) {
  return Response.json({ error: message, ...details }, { status });
}

function unfold(text) {
  return text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/).filter(Boolean);
}

function property(line) {
  const colon = line.indexOf(':');
  if (colon < 0) return { name: '', params: '', value: '' };
  const head = line.slice(0, colon);
  const semi = head.indexOf(';');
  return {
    name: (semi >= 0 ? head.slice(0, semi) : head).toUpperCase(),
    params: semi >= 0 ? head.slice(semi + 1) : '',
    value: line.slice(colon + 1).trim()
  };
}

function unescapeText(value) {
  return String(value || '')
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

function parseDate(value) {
  const raw = String(value || '').trim();
  if (/^\d{8}T\d{6}Z$/.test(raw)) {
    return new Date(Date.UTC(+raw.slice(0, 4), +raw.slice(4, 6) - 1, +raw.slice(6, 8), +raw.slice(9, 11), +raw.slice(11, 13), +raw.slice(13, 15))).toISOString();
  }
  if (/^\d{8}T\d{6}$/.test(raw)) {
    // Floating/TZID values are treated as UTC in V1; recurrence expansion is intentionally not attempted.
    return new Date(Date.UTC(+raw.slice(0, 4), +raw.slice(4, 6) - 1, +raw.slice(6, 8), +raw.slice(9, 11), +raw.slice(11, 13), +raw.slice(13, 15))).toISOString();
  }
  if (/^\d{8}$/.test(raw)) {
    return new Date(Date.UTC(+raw.slice(0, 4), +raw.slice(4, 6) - 1, +raw.slice(6, 8))).toISOString();
  }
  return null;
}

function parseICS(text) {
  const lines = unfold(text);
  const events = [];
  let current = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      current = {};
      continue;
    }
    if (line === 'END:VEVENT') {
      if (current?.uid && current.start) events.push(current);
      current = null;
      if (events.length >= MAX_EVENTS) break;
      continue;
    }
    if (!current) continue;
    const part = property(line);
    if (part.name === 'UID') current.uid = unescapeText(part.value);
    if (part.name === 'SUMMARY') current.title = unescapeText(part.value);
    if (part.name === 'LOCATION') current.location = unescapeText(part.value);
    if (part.name === 'DTSTART') current.start = parseDate(part.value);
    if (part.name === 'DTEND') current.end = parseDate(part.value);
    if (part.name === 'RRULE') current.recurring = true;
  }
  return events;
}

function privateIPv4(address) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part))) return true;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19));
}

function privateIPv6(address) {
  const normalized = address.toLowerCase();
  return normalized === '::' || normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb');
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
    if ((item.family === 4 && privateIPv4(item.address)) || (item.family === 6 && privateIPv6(item.address))) {
      throw new Error('Private network calendar hosts are not allowed.');
    }
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
      response = await fetch(url, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'user-agent': 'FitTogetherCalendarSync/1.1',
          accept: 'text/calendar,text/plain;q=0.9,*/*;q=0.1'
        }
      });
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('Calendar fetch timed out after 12 seconds.');
      throw new Error(`Calendar fetch failed: ${error?.message || 'network error'}`);
    } finally {
      clearTimeout(timer);
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (redirect === MAX_REDIRECTS) throw new Error('Calendar redirected too many times.');
      const location = response.headers.get('location');
      if (!location) throw new Error('Calendar redirect was invalid.');
      url = await validateRemoteUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) throw new Error(`Calendar fetch failed: HTTP ${response.status}.`);
    const length = Number(response.headers.get('content-length') || 0);
    if (length > MAX_BYTES) throw new Error('Calendar is too large to import.');
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_BYTES) throw new Error('Calendar is too large to import.');
    const text = new TextDecoder().decode(buffer).replace(/^\uFEFF/, '');
    if (!/BEGIN:VCALENDAR/i.test(text) || !/BEGIN:VEVENT/i.test(text)) {
      throw new Error('The URL did not return a valid iCalendar (.ics) feed. In Google Calendar, use the Secret address in iCal format.');
    }
    return text;
  }
  throw new Error('Calendar fetch failed.');
}

function createSupabaseClients() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  const serverKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !publishableKey || !serverKey) {
    throw new Error('Supabase server configuration is incomplete. Set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY (or SUPABASE_ANON_KEY), and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) in Netlify.');
  }
  const options = { auth: { autoRefreshToken: false, persistSession: false } };
  return {
    authClient: createClient(supabaseUrl, publishableKey, options),
    adminClient: createClient(supabaseUrl, serverKey, options)
  };
}

export default async req => {
  if (req.method !== 'POST') return jsonError('POST required.', 405);

  try {
    const { authClient, adminClient } = createSupabaseClients();
    const authorization = req.headers.get('authorization') || '';
    if (!authorization.toLowerCase().startsWith('bearer ')) return jsonError('Unauthorized.', 401);
    const bearer = authorization.slice(7).trim();
    if (!bearer) return jsonError('Unauthorized.', 401);

    const { data: userData, error: userError } = await authClient.auth.getUser(bearer);
    if (userError || !userData?.user?.id) return jsonError('Unauthorized.', 401);
    const userId = userData.user.id;

    const sourceId = new URL(req.url).searchParams.get('source');
    if (!sourceId) return jsonError('Missing calendar source.', 400);

    const { data: source, error: sourceError } = await adminClient
      .from('calendar_sources')
      .select('id,user_id,name,url,provider,last_synced_at')
      .eq('id', sourceId)
      .eq('user_id', userId)
      .maybeSingle();
    if (sourceError) return jsonError(`Calendar source lookup failed: ${sourceError.message}`, 502);
    if (!source) return jsonError('Calendar source not found.', 404);

    const text = await safeFetchCalendar(source.url);
    const events = parseICS(text);
    if (!events.length) {
      return jsonError('The calendar feed was valid, but it contained no importable events.', 422, { imported: 0, scanned: 0 });
    }

    let imported = 0;
    let failed = 0;
    let firstFailure = '';
    for (const event of events) {
      const payload = {
        creator_id: userId,
        calendar_source_id: source.id,
        external_uid: event.uid,
        title: event.title || source.name || 'Calendar event',
        event_type: 'calendar',
        location: event.location || null,
        starts_at: event.start,
        ends_at: event.end
      };
      const { error } = await adminClient
        .from('schedule_events')
        .upsert(payload, { onConflict: 'calendar_source_id,external_uid' });
      if (error) {
        failed += 1;
        if (!firstFailure) firstFailure = error.message;
      } else {
        imported += 1;
      }
    }

    if (failed) {
      return jsonError(`Calendar events could not be saved: ${firstFailure}`, 502, {
        imported,
        scanned: events.length,
        failed
      });
    }

    const syncedAt = new Date().toISOString();
    const { error: updateError } = await adminClient
      .from('calendar_sources')
      .update({ last_synced_at: syncedAt })
      .eq('id', source.id)
      .eq('user_id', userId);
    if (updateError) return jsonError(`Events imported, but sync status could not be updated: ${updateError.message}`, 502, { imported, scanned: events.length });

    return Response.json({
      ok: true,
      imported,
      scanned: events.length,
      failed: 0,
      recurringEventsImportedAsFirstOccurrence: events.filter(event => event.recurring).length,
      recurrenceMode: 'first-occurrence-only',
      syncedAt
    });
  } catch (error) {
    return jsonError(error?.message || 'Calendar sync failed.', 502);
  }
};
