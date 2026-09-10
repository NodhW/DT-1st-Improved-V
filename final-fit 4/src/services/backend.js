import { supabase, isSupabaseConfigured } from '../lib/supabase.js';

const need = () => { if (!supabase) throw new Error('Supabase is not configured. Check public/config.js.'); };
const user = async () => { need(); const { data, error } = await supabase.auth.getUser(); if (error) throw error; if (!data.user) throw new Error('You must be signed in.'); return data.user; };
const code = v => String(v || '').trim().toUpperCase();
const clean = v => String(v || '').trim();
const result = async promise => { const r = await promise; if (r.error) throw r.error; return r.data; };

export const auth = {
  signUp: ({ email, password, displayName }) => { need(); return supabase.auth.signUp({ email: clean(email), password, options: { data: { display_name: clean(displayName) } } }); },
  signIn: ({ email, password }) => { need(); return supabase.auth.signInWithPassword({ email: clean(email), password }); },
  signOut: () => { need(); return supabase.auth.signOut(); },
  google: () => { need(); return supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } }); }
};

export const profile = {
  mine: async () => {
    const u = await user();
    const { data, error } = await supabase.from('profiles').select('*').eq('id', u.id).maybeSingle();
    if (error) throw error;
    if (data) return data;
    // Handles accounts created before the profile trigger was installed.
    const ensured = await result(supabase.rpc('ensure_my_profile'));
    return ensured;
  },
  byId: id => result(supabase.from('profiles').select('id,display_name,avatar_url,friend_code,university,university_verified').eq('id', id).single()),
  updateMine: async values => { const u = await user(); return result(supabase.from('profiles').update(values).eq('id', u.id).select().single()); }
};

async function profilesByIds(ids) {
  const unique = [...new Set((ids || []).filter(Boolean))];
  if (!unique.length) return {};
  const rows = await result(supabase.from('profiles').select('id,display_name,avatar_url,friend_code,university,university_verified').in('id', unique));
  return Object.fromEntries(rows.map(p => [p.id, p]));
}

export const posts = {
  list: async () => {
    const rows = await result(supabase.from('posts').select('*').order('created_at', { ascending: false }));
    const authors = await profilesByIds(rows.map(r => r.author_id));
    return rows.map(r => ({ ...r, author: authors[r.author_id] || null }));
  },
  create: async ({ content, imageUrl = null }) => { const u = await user(); return result(supabase.from('posts').insert({ author_id: u.id, content: clean(content), image_url: imageUrl }).select().single()); },
  comments: async postId => { const rows = await result(supabase.from('comments').select('*').eq('post_id', postId).order('created_at', { ascending: true })); const authors = await profilesByIds(rows.map(r => r.author_id)); return rows.map(r => ({ ...r, author: authors[r.author_id] || null })); },
  comment: async (postId, content) => { const u = await user(); return result(supabase.from('comments').insert({ post_id: postId, author_id: u.id, content: clean(content) }).select().single()); }
};

export async function uploadPostImage(file) {
  const u = await user(); if (!file) return null;
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_'); const path = `${u.id}/${crypto.randomUUID()}-${safe}`;
  await result(supabase.storage.from('post-media').upload(path, file, { upsert: false, contentType: file.type || 'application/octet-stream' }));
  return supabase.storage.from('post-media').getPublicUrl(path).data.publicUrl;
}

export const friends = {
  byCode: c => result(supabase.from('profiles').select('id,display_name,avatar_url,friend_code').eq('friend_code', code(c)).single()),
  requests: async () => { const u = await user(); const rows = await result(supabase.from('friendships').select('id,requester_id,receiver_id,status,created_at').eq('receiver_id', u.id).eq('status','pending').order('created_at',{ascending:false})); const ps = await profilesByIds(rows.map(r=>r.requester_id)); return rows.map(r=>({...r, requester: ps[r.requester_id]})); },
  list: async () => { const u = await user(); const rows = await result(supabase.from('friendships').select('*').eq('status','accepted').or(`requester_id.eq.${u.id},receiver_id.eq.${u.id}`)); const ps = await profilesByIds(rows.flatMap(r=>[r.requester_id,r.receiver_id])); return rows.map(r=>({...r, friend: ps[r.requester_id === u.id ? r.receiver_id : r.requester_id]})); },
  send: async receiverId => { const u = await user(); if (u.id === receiverId) throw new Error('You cannot add yourself.'); return result(supabase.from('friendships').upsert({requester_id:u.id,receiver_id:receiverId,status:'pending'},{onConflict:'requester_id,receiver_id'}).select().single()); },
  respond: async (id,status) => { const u = await user(); return result(supabase.from('friendships').update({status}).eq('id',id).eq('receiver_id',u.id).eq('status','pending').select().single()); }
};

const makeGroupCode = name => `${clean(name).toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6)||'FIT'}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
export const groups = {
  mine: async () => { const u=await user(); const memberships=await result(supabase.from('group_members').select('group_id').eq('user_id',u.id)); const ids=memberships.map(x=>x.group_id); if(!ids.length)return []; return result(supabase.from('groups').select('*').in('id',ids).order('created_at',{ascending:false})); },
  members: async groupId => { const rows=await result(supabase.from('group_members').select('user_id').eq('group_id',groupId)); const ps=await profilesByIds(rows.map(r=>r.user_id)); return rows.map(r=>ps[r.user_id]).filter(Boolean); },
  create: async ({name,description='',memberIds=[]}) => { const u=await user(); let group=null; for(let i=0;i<8;i++){ const r=await supabase.from('groups').insert({owner_id:u.id,name:clean(name),description:clean(description)||null,join_code:makeGroupCode(name)}).select().single(); if(!r.error){group=r.data;break;} if(r.error.code!=='23505')throw r.error; } if(!group)throw new Error('Could not create a unique group code.'); const ids=[...new Set([u.id,...memberIds])]; await result(supabase.from('group_members').insert(ids.map(user_id=>({group_id:group.id,user_id})))); const conv=await result(supabase.from('conversations').insert({kind:'group',created_by:u.id,group_id:group.id}).select().single()); await result(supabase.from('conversation_members').insert(ids.map(user_id=>({conversation_id:conv.id,user_id})))); return group; },
  joinByCode: async c => { const u=await user(); const g=await result(supabase.from('groups').select('*').eq('join_code',code(c)).single()); await result(supabase.from('group_members').upsert({group_id:g.id,user_id:u.id},{onConflict:'group_id,user_id'})); const conv=await result(supabase.from('conversations').select('id').eq('kind','group').eq('group_id',g.id).maybeSingle()); if(conv) await supabase.from('conversation_members').upsert({conversation_id:conv.id,user_id:u.id},{onConflict:'conversation_id,user_id'}); return g; }
};

export const conversations = {
  list: async () => { const u=await user(); const ms=await result(supabase.from('conversation_members').select('conversation_id').eq('user_id',u.id)); const ids=ms.map(x=>x.conversation_id); if(!ids.length)return []; return result(supabase.from('conversations').select('*').in('id',ids).order('created_at',{ascending:false})); },
  members: async conversationId => { const rows=await result(supabase.from('conversation_members').select('user_id').eq('conversation_id',conversationId)); const ps=await profilesByIds(rows.map(r=>r.user_id)); return rows.map(r=>ps[r.user_id]).filter(Boolean); },
  directWith: async other => { const u=await user(); const mine=await result(supabase.from('conversation_members').select('conversation_id').eq('user_id',u.id)); const ids=mine.map(x=>x.conversation_id); if(ids.length){ const cs=await result(supabase.from('conversations').select('id').in('id',ids).eq('kind','direct')); const directIds=cs.map(c=>c.id); if(directIds.length){ const shared=await result(supabase.from('conversation_members').select('conversation_id').eq('user_id',other).in('conversation_id',directIds)); if(shared[0])return {id:shared[0].conversation_id}; }} const c=await result(supabase.from('conversations').insert({kind:'direct',created_by:u.id}).select().single()); await result(supabase.from('conversation_members').insert([{conversation_id:c.id,user_id:u.id},{conversation_id:c.id,user_id:other}])); return c; },
  group: async groupId => result(supabase.from('conversations').select('*').eq('kind','group').eq('group_id',groupId).maybeSingle())
};

export const messages = {
  list: async conversationId => { const rows=await result(supabase.from('messages').select('*').eq('conversation_id',conversationId).order('created_at',{ascending:true})); const ps=await profilesByIds(rows.map(r=>r.sender_id)); return rows.map(r=>({...r,sender:ps[r.sender_id]||null})); },
  send: async (conversationId,content) => { const u=await user(); return result(supabase.from('messages').insert({conversation_id:conversationId,sender_id:u.id,content:clean(content)}).select().single()); },
  markRead: async conversationId => { const u=await user(); return supabase.from('messages').update({read_at:new Date().toISOString()}).eq('conversation_id',conversationId).neq('sender_id',u.id).is('read_at',null); },
  unreadCount: async () => { const u=await user(); const ms=await result(supabase.from('conversation_members').select('conversation_id').eq('user_id',u.id)); const ids=ms.map(x=>x.conversation_id); if(!ids.length)return 0; const rows=await result(supabase.from('messages').select('id').in('conversation_id',ids).neq('sender_id',u.id).is('read_at',null)); return rows.length; },
  subscribe: (conversationId,callback) => { need(); const ch=supabase.channel(`messages:${conversationId}`).on('postgres_changes',{event:'INSERT',schema:'public',table:'messages',filter:`conversation_id=eq.${conversationId}`},payload=>callback(payload.new)).subscribe(); return ch; },
  unsubscribe: ch => { if(ch) supabase.removeChannel(ch); }
};

export const schedule = {
  list: async () => { const u=await user(); const rows=await result(supabase.from('schedule_events').select('*').or(`creator_id.eq.${u.id}`)); return rows; },
  create: async ({title,eventType='workout',location='',startsAt,endsAt=null,groupId=null}) => { const u=await user(); return result(supabase.from('schedule_events').insert({creator_id:u.id,group_id:groupId,title:clean(title),event_type:eventType,location:clean(location)||null,starts_at:startsAt,ends_at:endsAt}).select().single()); },
  // Cross-reference a set of members' events for a given day window (used by the Fit AI shared-time finder).
  listForUsers: async (userIds, dayStartIso, dayEndIso) => { await user(); const ids=[...new Set((userIds||[]).filter(Boolean))]; if(!ids.length) return []; return result(supabase.from('schedule_events').select('*').in('creator_id',ids).gte('starts_at',dayStartIso).lt('starts_at',dayEndIso).order('starts_at',{ascending:true})); }
};

export const calendars = {
  list: async () => { const u=await user(); return result(supabase.from('calendar_sources').select('*').eq('user_id',u.id).order('created_at',{ascending:false})); },
  add: async ({name,url,provider='custom'}) => { const u=await user(); return result(supabase.from('calendar_sources').insert({user_id:u.id,name:clean(name)||provider,url:clean(url),provider}).select().single()); },
  remove: async id => { const u=await user(); return result(supabase.from('calendar_sources').delete().eq('id',id).eq('user_id',u.id)); },
  sync: async id => { need(); const { data: { session } } = await supabase.auth.getSession(); if(!session?.access_token) throw new Error('You must be signed in.'); const r=await fetch(`/api/calendar/sync?source=${encodeURIComponent(id)}`,{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`}}); if(!r.ok) throw new Error(await r.text()); return r.json(); }
};

export const wearables = {
  settings: async () => { const u=await user(); return result(supabase.from('wearable_connections').select('*').eq('user_id',u.id).maybeSingle()); },
  save: async ({provider,enabled=true,accessToken=null}) => { const u=await user(); return result(supabase.from('wearable_connections').upsert({user_id:u.id,provider,enabled,access_token:accessToken,last_synced_at:new Date().toISOString()},{onConflict:'user_id,provider'}).select().single()); }
};

export const strava = {
  startOAuth: () => { const clientId=window.__FIT_STRAVA_CLIENT_ID; const redirect=`${window.location.origin}/api/strava/callback`; if(!clientId) throw new Error('Add FIT_STRAVA_CLIENT_ID to public/config.js first.'); const params=new URLSearchParams({client_id:clientId,response_type:'code',redirect_uri:redirect,approval_prompt:'auto',scope:'read,activity:read'}); window.location.href=`https://www.strava.com/oauth/authorize?${params.toString()}`; },
  syncNow: async () => { need(); const { data: { session } } = await supabase.auth.getSession(); if(!session?.access_token) throw new Error('You must be signed in.'); const r=await fetch('/api/strava/sync',{headers:{Authorization:`Bearer ${session.access_token}`}}); if(!r.ok) throw new Error(await r.text()); return r.json(); }
};

export const points = {
  ledger: async()=>{const u=await user();return result(supabase.from('points_ledger').select('*').eq('user_id',u.id).order('created_at',{ascending:false}).limit(50));},
  recordActivity: async()=>{const u=await user();const {error}=await supabase.rpc('record_daily_activity',{p_user_id:u.id});if(error)throw error;}
};
export const challenges = {
  list: async()=>{await user();const rows=await result(supabase.from('challenges').select('*').order('created_at',{ascending:false}));const parts=await result(supabase.from('challenge_participants').select('*'));return rows.map(c=>({...c,participants:parts.filter(p=>p.challenge_id===c.id)}));},
  create: async({title,description='',tier='personal',groupId=null,goalType='workouts',goalValue=1,pointsReward=50,endDate=null})=>{const u=await user();return result(supabase.from('challenges').insert({creator_id:u.id,group_id:tier==='group'?groupId:null,tier,title:clean(title),description:clean(description)||null,goal_type:goalType,goal_value:goalValue,points_reward:pointsReward,end_date:endDate}).select().single());},
  join: async challengeId=>{const u=await user();return result(supabase.from('challenge_participants').insert({challenge_id:challengeId,user_id:u.id}).select().single());},
  logProgress: async(challengeId,increment=1)=>{const u=await user();const {error}=await supabase.rpc('bump_challenge_progress',{p_challenge_id:challengeId,p_user_id:u.id,p_increment:increment});if(error)throw error;}
};
export const shop = {
  list: async()=>{await user();return result(supabase.from('shop_items').select('*').order('cost_points',{ascending:true}));},
  myRedemptions: async()=>{const u=await user();return result(supabase.from('redemptions').select('*,item:shop_items(name,description,category)').eq('user_id',u.id).order('created_at',{ascending:false}));},
  redeem: async itemId=>{const u=await user();const {data,error}=await supabase.rpc('redeem_shop_item',{p_user_id:u.id,p_item_id:itemId});if(error)throw error;return data;}
};

export { isSupabaseConfigured };