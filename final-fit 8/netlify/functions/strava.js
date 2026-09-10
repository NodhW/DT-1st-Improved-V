const json = (value, init = {}) => Response.json(value, init);

function cookieValue(header, name) {
  const parts = String(header || '').split(';').map(part => part.trim());
  const hit = parts.find(part => part.startsWith(`${name}=`));
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : null;
}

function stateCookie(value, maxAge = 600) {
  return `fit_strava_state=${encodeURIComponent(value)}; Path=/api/strava; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function adminHeaders(serverKey, extra = {}) {
  const headers = { apikey: serverKey, ...extra };
  // New sb_secret_* keys must never be sent as Bearer tokens. Legacy service_role JWTs still need the Bearer header for direct REST calls.
  if (!serverKey.startsWith('sb_secret_')) headers.Authorization = `Bearer ${serverKey}`;
  return headers;
}

async function currentUser(supabaseUrl, publishableKey, accessToken) {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: publishableKey, Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) return null;
  return response.json();
}

async function exchangeToken({ clientId, secret, code }) {
  const response = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: secret,
      code,
      grant_type: 'authorization_code'
    })
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.message || 'Strava token exchange failed.');
  return body;
}

async function refreshToken({ clientId, secret, refreshToken }) {
  const response = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: secret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.message || 'Strava token refresh failed.');
  return body;
}

async function saveConnection({ supabaseUrl, serviceKey, userId, token, existingMetadata = {} }) {
  const metadata = {
    ...existingMetadata,
    athlete: token.athlete || existingMetadata.athlete || null,
    refresh_token: token.refresh_token || existingMetadata.refresh_token || null,
    expires_at: token.expires_at || existingMetadata.expires_at || null
  };
  const response = await fetch(`${supabaseUrl}/rest/v1/wearable_connections?on_conflict=user_id,provider`, {
    method: 'POST',
    headers: adminHeaders(serviceKey, {
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation'
    }),
    body: JSON.stringify({
      user_id: userId,
      provider: 'strava',
      enabled: true,
      access_token: token.access_token,
      last_synced_at: new Date().toISOString(),
      metadata
    })
  });
  if (!response.ok) throw new Error(await response.text());
  const rows = await response.json();
  return rows[0] || null;
}

async function getConnection({ supabaseUrl, serviceKey, userId }) {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/wearable_connections?user_id=eq.${encodeURIComponent(userId)}&provider=eq.strava&select=*`,
    { headers: adminHeaders(serviceKey) }
  );
  if (!response.ok) throw new Error(await response.text());
  const rows = await response.json();
  return rows[0] || null;
}

async function recordVerifiedActivity({ supabaseUrl, serviceKey, userId, activity }) {
  const occurredAt = activity.start_date || activity.start_date_local;
  if (!activity.id || !occurredAt) return null;
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/record_verified_activity`, {
    method: 'POST',
    headers: adminHeaders(serviceKey, {
      'Content-Type': 'application/json'
    }),
    body: JSON.stringify({
      p_user_id: userId,
      p_source: 'strava',
      p_external_id: String(activity.id),
      p_occurred_at: occurredAt
    })
  });
  if (!response.ok) throw new Error(await response.text());
  return Number(await response.json());
}

export default async req => {
  const url = new URL(req.url);
  const action = url.searchParams.get('action') || 'callback';
  const supabaseUrl = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const clientId = process.env.STRAVA_CLIENT_ID;
  const secret = process.env.STRAVA_CLIENT_SECRET;

  if (!supabaseUrl || !publishableKey || !serviceKey || !clientId || !secret) {
    return new Response('Strava server configuration is incomplete. Set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY (or SUPABASE_ANON_KEY), SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY), STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET in Netlify.', { status: 500 });
  }

  if (action === 'start') {
    const state = crypto.randomUUID();
    const redirectUri = `${url.origin}/api/strava/callback`;
    const authorize = new URL('https://www.strava.com/oauth/authorize');
    authorize.search = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      approval_prompt: 'auto',
      scope: 'read,activity:read',
      state
    }).toString();
    return new Response(null, {
      status: 302,
      headers: { Location: authorize.toString(), 'Set-Cookie': stateCookie(state) }
    });
  }

  if (action === 'callback') {
    const code = url.searchParams.get('code');
    const returnedState = url.searchParams.get('state');
    const expectedState = cookieValue(req.headers.get('cookie'), 'fit_strava_state');
    const clearCookie = stateCookie('', 0);
    if (!code) {
      return new Response(null, { status: 302, headers: { Location: `${url.origin}/?strava_error=missing_code`, 'Set-Cookie': clearCookie } });
    }
    if (!returnedState || !expectedState || returnedState !== expectedState) {
      return new Response(null, { status: 302, headers: { Location: `${url.origin}/?strava_error=invalid_state`, 'Set-Cookie': clearCookie } });
    }
    return new Response(null, {
      status: 302,
      headers: { Location: `${url.origin}/?strava_code=${encodeURIComponent(code)}`, 'Set-Cookie': clearCookie }
    });
  }

  const authorization = req.headers.get('authorization') || '';
  if (!authorization.toLowerCase().startsWith('bearer ')) return new Response('Unauthorized', { status: 401 });
  const accessToken = authorization.slice(7);
  const current = await currentUser(supabaseUrl, publishableKey, accessToken);
  if (!current?.id) return new Response('Unauthorized', { status: 401 });

  try {
    if (action === 'exchange') {
      if (req.method !== 'POST') return new Response('POST required', { status: 405 });
      const body = await req.json();
      if (!body?.code) return new Response('Missing authorization code.', { status: 400 });
      const token = await exchangeToken({ clientId, secret, code: body.code });
      await saveConnection({ supabaseUrl, serviceKey, userId: current.id, token });
      return json({ connected: true, athlete: token.athlete || null });
    }

    if (action === 'sync') {
      let connection = await getConnection({ supabaseUrl, serviceKey, userId: current.id });
      if (!connection?.access_token) return new Response('Strava is not connected.', { status: 404 });

      const metadata = connection.metadata || {};
      if (metadata.expires_at && Number(metadata.expires_at) <= Math.floor(Date.now() / 1000) + 60) {
        if (!metadata.refresh_token) return new Response('Strava connection needs to be reconnected.', { status: 401 });
        const refreshed = await refreshToken({ clientId, secret, refreshToken: metadata.refresh_token });
        connection = await saveConnection({
          supabaseUrl,
          serviceKey,
          userId: current.id,
          token: refreshed,
          existingMetadata: metadata
        });
      }

      const activitiesResponse = await fetch('https://www.strava.com/api/v3/athlete/activities?per_page=20', {
        headers: { Authorization: `Bearer ${connection.access_token}` }
      });
      const activities = await activitiesResponse.json();
      if (!activitiesResponse.ok) return json(activities, { status: activitiesResponse.status });

      let recordedActivities = 0;
      let pointsAwarded = 0;
      for (const activity of activities) {
        const result = await recordVerifiedActivity({ supabaseUrl, serviceKey, userId: current.id, activity });
        if (result !== null && result >= 0) {
          recordedActivities += 1;
          pointsAwarded += result;
        }
      }

      const updatedMetadata = {
        ...(connection.metadata || {}),
        recent_activities: activities.slice(0, 20).map(activity => ({
          id: activity.id,
          name: activity.name,
          type: activity.type,
          start_date: activity.start_date,
          elapsed_time: activity.elapsed_time,
          distance: activity.distance
        }))
      };
      await fetch(`${supabaseUrl}/rest/v1/wearable_connections?id=eq.${encodeURIComponent(connection.id)}`, {
        method: 'PATCH',
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ last_synced_at: new Date().toISOString(), metadata: updatedMetadata })
      });

      return json({
        synced: true,
        activitiesFetched: activities.length,
        recordedActivities,
        pointsAwarded
      });
    }
  } catch (error) {
    return new Response(error?.message || 'Strava request failed.', { status: 502 });
  }

  return new Response('Unknown action', { status: 400 });
};
