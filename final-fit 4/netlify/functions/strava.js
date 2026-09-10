export default async (req) => {
  const url = new URL(req.url);
  const action = url.searchParams.get('action') || 'callback';
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const clientId = process.env.STRAVA_CLIENT_ID;
  const secret = process.env.STRAVA_CLIENT_SECRET;
  if (!supabaseUrl || !serviceKey || !clientId || !secret) return new Response('Strava server configuration is incomplete.', {status:500});
  if (action === 'callback') {
    const code = url.searchParams.get('code');
    if (!code) return Response.redirect(`${url.origin}/?strava_error=missing_code`,302);
    return Response.redirect(`${url.origin}/?strava_code=${encodeURIComponent(code)}`,302);
  }
  const auth = req.headers.get('authorization') || '';
  if (!auth.toLowerCase().startsWith('bearer ')) return new Response('Unauthorized',{status:401});
  const accessToken = auth.slice(7);
  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {headers:{apikey:serviceKey,Authorization:`Bearer ${accessToken}`}});
  if (!userRes.ok) return new Response('Unauthorized',{status:401});
  const current = await userRes.json();
  if (action === 'exchange') {
    const body = await req.json();
    const tokenRes = await fetch('https://www.strava.com/oauth/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientId,client_secret:secret,code:body.code,grant_type:'authorization_code'})});
    const token = await tokenRes.json(); if(!tokenRes.ok)return Response.json(token,{status:tokenRes.status});
    const db = await fetch(`${supabaseUrl}/rest/v1/wearable_connections?on_conflict=user_id,provider`,{method:'POST',headers:{apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,'Content-Type':'application/json','Prefer':'resolution=merge-duplicates,return=representation'},body:JSON.stringify({user_id:current.id,provider:'strava',enabled:true,access_token:token.access_token,last_synced_at:new Date().toISOString(),metadata:{athlete:token.athlete||null,refresh_token:token.refresh_token||null,expires_at:token.expires_at||null}})});
    if(!db.ok)return new Response(await db.text(),{status:500}); return Response.json({connected:true,athlete:token.athlete||null});
  }
  if (action === 'sync') {
    const db = await fetch(`${supabaseUrl}/rest/v1/wearable_connections?user_id=eq.${current.id}&provider=eq.strava&select=*`,{headers:{apikey:serviceKey,Authorization:`Bearer ${serviceKey}`}}); const rows=await db.json(); const connection=rows[0]; if(!connection?.access_token)return new Response('Strava is not connected.',{status:404});
    const acts=await fetch('https://www.strava.com/api/v3/athlete/activities?per_page=20',{headers:{Authorization:`Bearer ${connection.access_token}`}}); const data=await acts.json(); if(!acts.ok)return Response.json(data,{status:acts.status});
    await fetch(`${supabaseUrl}/rest/v1/wearable_connections?id=eq.${connection.id}`,{method:'PATCH',headers:{apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,'Content-Type':'application/json'},body:JSON.stringify({last_synced_at:new Date().toISOString(),metadata:{...(connection.metadata||{}),recent_activities:data}})});
    return Response.json({synced:true,activities:data});
  }
  return new Response('Unknown action',{status:400});
};
