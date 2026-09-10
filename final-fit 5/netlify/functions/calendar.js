import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_EVENTS = 1000;

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
  for (let redirect = 0; redirect <= 5; redirect += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    let response;
    try {
      response = await fetch(url, { redirect: 'manual', signal: controller.signal, headers: { 'user-agent': 'FitTogetherCalendarSync/1.0' } });
    } finally {
      clearTimeout(timer);
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (redirect === 5) throw new Error('Calendar redirected too many times.');
      const location = response.headers.get('location');
      if (!location) throw new Error('Calendar redirect was invalid.');
      url = await validateRemoteUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) throw new Error(`Calendar fetch failed: ${response.status}`);
    const length = Number(response.headers.get('content-length') || 0);
    if (length > MAX_BYTES) throw new Error('Calendar is too large to import.');
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_BYTES) throw new Error('Calendar is too large to import.');
    return new TextDecoder().decode(buffer);
  }
  throw new Error('Calendar fetch failed.');
}

export default async req => {
  if (req.method !== 'POST') return new Response('POST required', { status: 405 });
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return new Response('Supabase server configuration is incomplete.', { status: 500 });

  const authorization = req.headers.get('authorization') || '';
  if (!authorization.toLowerCase().startsWith('bearer ')) return new Response('Unauthorized', { status: 401 });
  const bearer = authorization.slice(7);
  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${bearer}` }
  });
  if (!userResponse.ok) return new Response('Unauthorized', { status: 401 });
  const current = await userResponse.json();

  const sourceId = new URL(req.url).searchParams.get('source');
  if (!sourceId) return new Response('Missing calendar source.', { status: 400 });
  const sourceResponse = await fetch(
    `${supabaseUrl}/rest/v1/calendar_sources?id=eq.${encodeURIComponent(sourceId)}&user_id=eq.${encodeURIComponent(current.id)}&select=*`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
  );
  if (!sourceResponse.ok) return new Response('Calendar source lookup failed.', { status: 502 });
  const sources = await sourceResponse.json();
  const source = sources[0];
  if (!source) return new Response('Calendar source not found.', { status: 404 });

  try {
    const text = await safeFetchCalendar(source.url);
    const events = parseICS(text);
    let imported = 0;
    for (const event of events) {
      const payload = {
        creator_id: current.id,
        calendar_source_id: source.id,
        external_uid: event.uid,
        title: event.title || source.name || 'Calendar event',
        event_type: 'calendar',
        location: event.location || null,
        starts_at: event.start,
        ends_at: event.end
      };
      const response = await fetch(`${supabaseUrl}/rest/v1/schedule_events?on_conflict=calendar_source_id,external_uid`, {
        method: 'POST',
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates'
        },
        body: JSON.stringify(payload)
      });
      if (response.ok) imported += 1;
    }

    await fetch(`${supabaseUrl}/rest/v1/calendar_sources?id=eq.${encodeURIComponent(source.id)}`, {
      method: 'PATCH',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ last_synced_at: new Date().toISOString() })
    });

    return Response.json({
      imported,
      scanned: events.length,
      recurringEventsImportedAsFirstOccurrence: events.filter(event => event.recurring).length,
      recurrenceMode: 'first-occurrence-only'
    });
  } catch (error) {
    return new Response(error?.message || 'Calendar sync failed.', { status: 502 });
  }
};
