import { supabase, isSupabaseConfigured } from '../lib/supabase.js';

const need = () => {
  if (!supabase) throw new Error('Supabase is not configured. Check public/config.js.');
};

const user = async () => {
  need();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error('You must be signed in.');
  return data.user;
};

const result = async promise => {
  const response = await promise;
  if (response.error) throw response.error;
  return response.data;
};

const clean = value => String(value || '').trim();
const normalizeCode = value => clean(value).toUpperCase();
const PROFILE_PUBLIC_COLUMNS = 'id,display_name,username,avatar_url,friend_code,university,university_verified,university_verification_requested_at,timezone,current_streak,longest_streak,last_activity_date,points_balance,created_at,updated_at';
const PROFILE_CARD_COLUMNS = 'id,display_name,avatar_url,university,university_verified';
const WEARABLE_SAFE_COLUMNS = 'id,user_id,provider,enabled,last_synced_at';

export const auth = {
  signUp: ({ email, password, displayName }) => {
    need();
    return supabase.auth.signUp({
      email: clean(email),
      password,
      options: {
        data: {
          display_name: clean(displayName),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
        }
      }
    });
  },
  signIn: ({ email, password }) => {
    need();
    return supabase.auth.signInWithPassword({ email: clean(email), password });
  },
  signOut: () => {
    need();
    return supabase.auth.signOut();
  },
  google: () => {
    need();
    return supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin }
    });
  }
};

export const profile = {
  mine: async () => {
    const current = await user();
    const { data, error } = await supabase.from('profiles').select(PROFILE_PUBLIC_COLUMNS).eq('id', current.id).maybeSingle();
    if (error) throw error;
    if (data) return data;
    return result(supabase.rpc('ensure_my_profile'));
  },
  byId: id => result(supabase.from('profiles_card').select(PROFILE_CARD_COLUMNS).eq('id', id).single()),
  updateMine: async values => {
    const current = await user();
    const allowed = ['display_name', 'username', 'avatar_url', 'timezone'];
    const safe = Object.fromEntries(Object.entries(values || {}).filter(([key]) => allowed.includes(key)));
    safe.updated_at = new Date().toISOString();
    if (Object.keys(safe).length === 1) return profile.mine();
    return result(supabase.from('profiles').update(safe).eq('id', current.id).select(PROFILE_PUBLIC_COLUMNS).single());
  },
  requestUniversityVerification: async university => {
    await user();
    return result(supabase.rpc('request_university_verification', { p_university: clean(university) }));
  }
};

async function profilesByIds(ids) {
  const unique = [...new Set((ids || []).filter(Boolean))];
  if (!unique.length) return {};
  const rows = await result(supabase.from('profiles_card').select(PROFILE_CARD_COLUMNS).in('id', unique));
  return Object.fromEntries(rows.map(row => [row.id, row]));
}

export const posts = {
  list: async () => {
    const current = await user();
    const [rows, likeRows] = await Promise.all([
      result(supabase.from('posts').select('*').order('created_at', { ascending: false })),
      result(supabase.from('post_likes').select('post_id,user_id'))
    ]);
    const authors = await profilesByIds(rows.map(row => row.author_id));
    const counts = {};
    const likedByMe = new Set();
    for (const like of likeRows) {
      counts[like.post_id] = (counts[like.post_id] || 0) + 1;
      if (like.user_id === current.id) likedByMe.add(like.post_id);
    }
    return rows.map(row => ({
      ...row,
      author: authors[row.author_id] || null,
      like_count: counts[row.id] || 0,
      liked_by_me: likedByMe.has(row.id)
    }));
  },
  create: async ({ content, imageUrl = null }) => {
    const current = await user();
    const text = clean(content);
    if (!text && !imageUrl) throw new Error('Add a message or photo before posting.');
    return result(
      supabase
        .from('posts')
        .insert({ author_id: current.id, content: text, image_url: imageUrl })
        .select()
        .single()
    );
  },
  comments: async postId => {
    const rows = await result(
      supabase.from('comments').select('*').eq('post_id', postId).order('created_at', { ascending: true })
    );
    const authors = await profilesByIds(rows.map(row => row.author_id));
    return rows.map(row => ({ ...row, author: authors[row.author_id] || null }));
  },
  comment: async (postId, content) => {
    const current = await user();
    const text = clean(content);
    if (!text) throw new Error('Write a comment first.');
    const created = await result(
      supabase
        .from('comments')
        .insert({ post_id: postId, author_id: current.id, content: text })
        .select()
        .single()
    );
    return { ...created, author: await profile.byId(current.id).catch(() => null) };
  },
  toggleLike: async (postId, currentlyLiked) => {
    const current = await user();
    if (currentlyLiked) {
      await result(supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', current.id));
      return false;
    }
    await result(
      supabase
        .from('post_likes')
        .upsert({ post_id: postId, user_id: current.id }, { onConflict: 'post_id,user_id' })
    );
    return true;
  }
};

export async function uploadPostImage(file) {
  const current = await user();
  if (!file) return null;
  if (!String(file.type || '').startsWith('image/')) throw new Error('Please choose an image file.');
  if (file.size > 8 * 1024 * 1024) throw new Error('Images must be 8 MB or smaller.');
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${current.id}/${crypto.randomUUID()}-${safeName}`;
  await result(
    supabase.storage.from('post-media').upload(path, file, {
      upsert: false,
      contentType: file.type || 'application/octet-stream'
    })
  );
  return supabase.storage.from('post-media').getPublicUrl(path).data.publicUrl;
}

export const friends = {
  byCode: code => result(
    supabase
      .rpc('find_profile_by_friend_code', { p_friend_code: normalizeCode(code) })
      .single()
  ),
  requests: async () => {
    const current = await user();
    const rows = await result(
      supabase
        .from('friendships')
        .select('id,requester_id,receiver_id,status,created_at')
        .eq('receiver_id', current.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
    );
    const people = await profilesByIds(rows.map(row => row.requester_id));
    return rows.map(row => ({ ...row, requester: people[row.requester_id] || null }));
  },
  list: async () => {
    const current = await user();
    const rows = await result(
      supabase
        .from('friendships')
        .select('*')
        .eq('status', 'accepted')
        .or(`requester_id.eq.${current.id},receiver_id.eq.${current.id}`)
    );
    const people = await profilesByIds(rows.flatMap(row => [row.requester_id, row.receiver_id]));
    return rows.map(row => ({
      ...row,
      friend: people[row.requester_id === current.id ? row.receiver_id : row.requester_id] || null
    }));
  },
  send: async receiverId => {
    await user();
    return result(supabase.rpc('send_friend_request', { p_receiver_id: receiverId }));
  },
  respond: async (id, status) => {
    const current = await user();
    if (!['accepted', 'declined'].includes(status)) throw new Error('Invalid friend request response.');
    return result(
      supabase
        .from('friendships')
        .update({ status })
        .eq('id', id)
        .eq('receiver_id', current.id)
        .eq('status', 'pending')
        .select()
        .single()
    );
  }
};

export const groups = {
  mine: async () => {
    const current = await user();
    const memberships = await result(supabase.from('group_members').select('group_id').eq('user_id', current.id));
    const ids = memberships.map(row => row.group_id);
    if (!ids.length) return [];
    return result(supabase.from('groups').select('*').in('id', ids).order('created_at', { ascending: false }));
  },
  members: async groupId => {
    const rows = await result(supabase.from('group_members').select('user_id').eq('group_id', groupId));
    const people = await profilesByIds(rows.map(row => row.user_id));
    return rows.map(row => people[row.user_id]).filter(Boolean);
  },
  create: async ({ name, description = '', memberIds = [] }) => {
    await user();
    return result(
      supabase.rpc('create_group', {
        p_name: clean(name),
        p_description: clean(description) || null,
        p_member_ids: [...new Set(memberIds || [])]
      })
    );
  },
  joinByCode: async joinCode => {
    await user();
    return result(supabase.rpc('join_group_by_code', { p_join_code: normalizeCode(joinCode) }));
  },
  streakStatus: async groupId => {
    await user();
    return result(supabase.rpc('group_streak_status', { p_group_id: groupId }));
  },
  leave: async groupId => {
    await user();
    await result(supabase.rpc('leave_group', { p_group_id: groupId }));
    return true;
  }
};

export const conversations = {
  list: async () => {
    const current = await user();
    const memberships = await result(
      supabase
        .from('conversation_members')
        .select('conversation_id,last_read_at')
        .eq('user_id', current.id)
    );
    const ids = memberships.map(row => row.conversation_id);
    if (!ids.length) return [];
    const rows = await result(
      supabase.from('conversations').select('*').in('id', ids).order('created_at', { ascending: false })
    );
    const byId = Object.fromEntries(memberships.map(row => [row.conversation_id, row]));
    return rows.map(row => ({ ...row, membership: byId[row.id] || null }));
  },
  members: async conversationId => {
    await user();
    const rows = await result(supabase.rpc('get_conversation_members', { p_conversation_id: conversationId }));
    const people = await profilesByIds((rows || []).map(row => row.user_id));
    return (rows || []).map(row => people[row.user_id]).filter(Boolean);
  },
  directWith: async otherUserId => {
    await user();
    const id = await result(
      supabase.rpc('get_or_create_direct_conversation', { p_other_user_id: otherUserId })
    );
    return { id };
  },
  group: async groupId => {
    await user();
    return result(
      supabase.from('conversations').select('*').eq('kind', 'group').eq('group_id', groupId).maybeSingle()
    );
  }
};

export const messages = {
  list: async conversationId => {
    const rows = await result(
      supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
    );
    const people = await profilesByIds(rows.map(row => row.sender_id));
    return rows.map(row => ({ ...row, sender: people[row.sender_id] || null }));
  },
  send: async (conversationId, content) => {
    const current = await user();
    const text = clean(content);
    if (!text) throw new Error('Type a message first.');
    return result(
      supabase
        .from('messages')
        .insert({ conversation_id: conversationId, sender_id: current.id, content: text })
        .select()
        .single()
    );
  },
  markRead: async conversationId => {
    await user();
    await result(supabase.rpc('mark_conversation_read', { p_conversation_id: conversationId }));
  },
  unreadCounts: async () => {
    await user();
    const rows = await result(supabase.rpc('conversation_unread_counts'));
    return Object.fromEntries((rows || []).map(row => [row.conversation_id, Number(row.unread_count || 0)]));
  },
  unreadCount: async () => {
    const counts = await messages.unreadCounts();
    return Object.values(counts).reduce((sum, value) => sum + value, 0);
  },
  subscribe: (conversationId, callback) => {
    need();
    return supabase
      .channel(`messages:${conversationId}:${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        payload => callback(payload.new)
      )
      .subscribe();
  },
  subscribeAll: callback => {
    need();
    return supabase
      .channel(`messages:all:${crypto.randomUUID()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => callback(payload.new))
      .subscribe();
  },
  unsubscribe: channel => {
    if (channel) supabase.removeChannel(channel);
  }
};

export const schedule = {
  list: async () => {
    await user();
    return result(supabase.from('schedule_events').select('*').order('starts_at', { ascending: true }));
  },
  create: async ({ title, eventType = 'workout', location = '', startsAt, endsAt = null, groupId = null }) => {
    const current = await user();
    const eventTitle = clean(title);
    if (!eventTitle) throw new Error('Enter an event title.');
    if (!startsAt) throw new Error('Choose a start time.');
    return result(
      supabase
        .from('schedule_events')
        .insert({
          creator_id: current.id,
          group_id: groupId || null,
          title: eventTitle,
          event_type: eventType,
          location: clean(location) || null,
          starts_at: startsAt,
          ends_at: endsAt
        })
        .select()
        .single()
    );
  },
  sharedBusy: async (groupId, dayStartIso, dayEndIso) => {
    await user();
    return result(
      supabase.rpc('get_group_busy_blocks', {
        p_group_id: groupId,
        p_day_start: dayStartIso,
        p_day_end: dayEndIso
      })
    );
  }
};

export const calendars = {
  list: async () => {
    const current = await user();
    return result(
      supabase
        .from('calendar_sources')
        .select('*')
        .eq('user_id', current.id)
        .order('created_at', { ascending: false })
    );
  },
  add: async ({ name, url, provider = 'custom' }) => {
    const current = await user();
    const raw = clean(url);
    if (!/^(https:\/\/|webcal:\/\/)/i.test(raw)) {
      throw new Error('Use a private https:// or webcal:// calendar URL.');
    }
    return result(
      supabase
        .from('calendar_sources')
        .insert({ user_id: current.id, name: clean(name) || provider, url: raw, provider })
        .select()
        .single()
    );
  },
  remove: async id => {
    const current = await user();
    await result(supabase.from('calendar_sources').delete().eq('id', id).eq('user_id', current.id));
  },
  sync: async id => {
    need();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('You must be signed in.');
    const response = await fetch(`/api/calendar/sync?source=${encodeURIComponent(id)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` }
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }
};

export const wearables = {
  settings: async () => {
    const current = await user();
    return result(
      supabase
        .from('wearable_connections')
        .select(WEARABLE_SAFE_COLUMNS)
        .eq('user_id', current.id)
        .eq('provider', 'simulated')
        .maybeSingle()
    );
  },
  connection: async providerName => {
    const current = await user();
    return result(
      supabase
        .from('wearable_connections')
        .select(WEARABLE_SAFE_COLUMNS)
        .eq('user_id', current.id)
        .eq('provider', providerName)
        .maybeSingle()
    );
  },
  save: async ({ provider, enabled = true }) => {
    await user();
    if (provider !== 'simulated') throw new Error('Only simulated health can be changed in the browser.');
    const rows = await result(supabase.rpc('set_simulated_health', { p_enabled: Boolean(enabled) }));
    return Array.isArray(rows) ? rows[0] || null : rows;
  }
};

export const strava = {
  startOAuth: () => {
    need();
    window.location.assign('/api/strava/start');
  },
  syncNow: async () => {
    need();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('You must be signed in.');
    const response = await fetch('/api/strava/sync', {
      headers: { Authorization: `Bearer ${session.access_token}` }
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }
};

export const points = {
  ledger: async () => {
    const current = await user();
    return result(
      supabase
        .from('points_ledger')
        .select('*')
        .eq('user_id', current.id)
        .order('created_at', { ascending: false })
        .limit(50)
    );
  },
  recordActivity: async () => {
    await user();
    return result(supabase.rpc('record_activity', { p_source: 'self_report' }));
  }
};

export const challenges = {
  list: async () => {
    await user();
    const [rows, participants] = await Promise.all([
      result(supabase.from('challenges').select('*').order('created_at', { ascending: false })),
      result(supabase.from('challenge_participants').select('*'))
    ]);
    return rows.map(challenge => ({
      ...challenge,
      participants: participants.filter(row => row.challenge_id === challenge.id)
    }));
  },
  create: async ({ title, description = '', tier = 'personal', groupId = null, goalType = 'workouts', goalValue = 1, endDate = null }) => {
    await user();
    return result(
      supabase.rpc('create_challenge', {
        p_title: clean(title),
        p_description: clean(description) || null,
        p_tier: tier,
        p_group_id: tier === 'group' ? groupId : null,
        p_goal_type: goalType,
        p_goal_value: Math.max(1, Number(goalValue) || 1),
        p_end_date: endDate || null
      })
    );
  },
  join: async challengeId => {
    await user();
    return result(supabase.rpc('join_challenge', { p_challenge_id: challengeId }));
  },
  logProgress: async challengeId => {
    await user();
    return result(
      supabase.rpc('log_challenge_progress', {
        p_challenge_id: challengeId,
        p_increment: 1
      })
    );
  }
};

export const shop = {
  list: async () => {
    await user();
    return result(supabase.from('shop_items').select('*').order('cost_points', { ascending: true }));
  },
  myRedemptions: async () => {
    const current = await user();
    return result(
      supabase
        .from('redemptions')
        .select('*,item:shop_items(name,description,category)')
        .eq('user_id', current.id)
        .order('created_at', { ascending: false })
    );
  },
  redeem: async itemId => {
    const current = await user();
    return result(
      supabase.rpc('redeem_shop_item', {
        p_user_id: current.id,
        p_item_id: itemId
      })
    );
  }
};

export { isSupabaseConfigured };

export const fitness = {
  profile: async () => {
    const current = await user();
    return result(supabase.from('fitness_profiles').select('*').eq('user_id', current.id).maybeSingle());
  },
  saveProfile: async values => {
    const current = await user();
    const safe = {
      user_id: current.id,
      goal: clean(values.goal) || 'general_fitness',
      experience: clean(values.experience) || 'beginner',
      training_days: Math.max(1, Math.min(7, Number(values.training_days) || 3)),
      session_minutes: Math.max(15, Math.min(180, Number(values.session_minutes) || 45)),
      equipment: Array.isArray(values.equipment) ? values.equipment : [],
      preferred_training: clean(values.preferred_training) || 'strength',
      injuries_notes: clean(values.injuries_notes) || null,
      unit: values.unit === 'lb' ? 'lb' : 'kg',
      updated_at: new Date().toISOString()
    };
    return result(supabase.from('fitness_profiles').upsert(safe,{onConflict:'user_id'}).select().single());
  },
  exercises: async search => {
    let q = supabase.from('exercises').select('*').order('name');
    if (clean(search)) q = q.ilike('name', `%${clean(search)}%`);
    return result(q.limit(100));
  },
  startWorkout: async ({title='Workout', planWorkoutId=null}={}) => {
    const current = await user();
    return result(supabase.from('workouts').insert({user_id:current.id,title,plan_workout_id:planWorkoutId}).select().single());
  },
  addExercise: async ({workoutId,exerciseId,position=0}) => {
    await user();
    return result(supabase.from('workout_exercises').insert({workout_id:workoutId,exercise_id:exerciseId,position}).select().single());
  },
  addSet: async ({workoutExerciseId,setNumber,reps=null,weight=null,durationSeconds=null,rpe=null}) => {
    await user();
    return result(supabase.from('workout_sets').insert({workout_exercise_id:workoutExerciseId,set_number:setNumber,reps,weight,duration_seconds:durationSeconds,rpe,completed:true}).select().single());
  },
  completeWorkout: async workoutId => result(supabase.rpc('complete_workout',{p_workout_id:workoutId})),
  history: async (limit=20) => {
    const current=await user();
    return result(supabase.from('workouts').select('*').eq('user_id',current.id).order('started_at',{ascending:false}).limit(limit));
  },
  records: async () => {
    const current=await user();
    const rows=await result(supabase.from('personal_records').select('*').eq('user_id',current.id).order('achieved_at',{ascending:false}));
    const ids=[...new Set(rows.map(r=>r.exercise_id))];
    const ex=ids.length?await result(supabase.from('exercises').select('id,name').in('id',ids)):[];
    const map=Object.fromEntries(ex.map(x=>[x.id,x]));
    return rows.map(r=>({...r,exercise:map[r.exercise_id]}));
  },
  load: async (days=28) => {
    const current=await user();
    return result(supabase.from('training_load_daily').select('*').eq('user_id',current.id).gte('date',new Date(Date.now()-days*86400000).toISOString().slice(0,10)).order('date'));
  },
  readiness: async date => {
    const current=await user();
    return result(supabase.rpc('fitness_readiness_score',{p_user_id:current.id,p_date:date||new Date().toISOString().slice(0,10)}));
  },
  recovery: async ({date,sleep_hours,sleep_quality,soreness,stress,energy,hrv,resting_hr,source='self_report'}) => {
    const current=await user();
    return result(supabase.from('recovery_logs').upsert({user_id:current.id,date:date||new Date().toISOString().slice(0,10),sleep_hours,sleep_quality,soreness,stress,energy,hrv,resting_hr,source},{onConflict:'user_id,date'}).select().single());
  },
  achievements: async () => {
    const current=await user();
    const [all,earned]=await Promise.all([result(supabase.from('achievements').select('*').order('points')),result(supabase.from('user_achievements').select('achievement_id,earned_at').eq('user_id',current.id))]);
    const map=Object.fromEntries(earned.map(x=>[x.achievement_id,x]));
    return all.map(a=>({...a,earned:!!map[a.id],earned_at:map[a.id]?.earned_at||null}));
  },
  plans: async () => {
    const current=await user();
    const plans=await result(supabase.from('training_plans').select('*').eq('user_id',current.id).eq('active',true).order('created_at',{ascending:false}));
    if(!plans.length) return [];
    const workouts=await result(supabase.from('plan_workouts').select('*').in('plan_id',plans.map(p=>p.id)).order('weekday'));
    return plans.map(p=>({...p,workouts:workouts.filter(w=>w.plan_id===p.id)}));
  },
  createPlan: async ({name,goal='general_fitness'}) => {
    const current=await user();
    return result(supabase.from('training_plans').insert({user_id:current.id,name,goal}).select().single());
  },
  addPlanWorkout: async ({planId,weekday,title,focus,durationMinutes=45}) => {
    await user();
    return result(supabase.from('plan_workouts').insert({plan_id:planId,weekday,title,focus,duration_minutes:durationMinutes}).select().single());
  },
  nutrition: async values => { const current=await user(); return result(supabase.from('nutrition_logs').upsert({user_id:current.id,date:values.date||new Date().toISOString().slice(0,10),protein_g:values.protein_g,carbs_g:values.carbs_g,fat_g:values.fat_g,calories:values.calories,water_ml:values.water_ml,notes:values.notes},{onConflict:'user_id,date'}).select().single()); },
  lifestyle: async values => { const current=await user(); return result(supabase.from('lifestyle_logs').upsert({user_id:current.id,date:values.date||new Date().toISOString().slice(0,10),sleep_hours:values.sleep_hours,water_ml:values.water_ml,steps:values.steps,mood:values.mood,note:values.note},{onConflict:'user_id,date'}).select().single()); }
};
