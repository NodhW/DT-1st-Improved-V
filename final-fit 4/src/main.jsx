import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Home, CalendarDays, Users, MessageCircle, UserCircle, Settings, Plus, X, Send, UserPlus, Check, Copy, Heart, MessageSquare, Footprints, Flame, Zap, Watch, Link2, ChevronRight, Sparkles, Dumbbell, Clock3, Search, LogOut, Image as ImageIcon, Trophy, ShoppingBag, Coins, Gift, Target } from 'lucide-react';
import './styles.css';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import { auth, profile, posts, uploadPostImage, friends, groups, conversations, messages, schedule, calendars, wearables, strava, points, challenges, shop } from './services/backend';

const initials = n => (n || '?').trim().slice(0,1).toUpperCase();
const errorText = e => e?.message || 'Something went wrong.';
const dayName = d => new Date(d).toLocaleDateString(undefined,{weekday:'short'});
const time = d => new Date(d).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});

function Auth(){
  const [signup,setSignup]=useState(false),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[name,setName]=useState(''),[busy,setBusy]=useState(false),[msg,setMsg]=useState('');
  const submit=async e=>{e.preventDefault();setBusy(true);setMsg('');try{const r=signup?await auth.signUp({email,password,displayName:name}):await auth.signIn({email,password});if(r.error)throw r.error;if(signup&&!r.data?.session)setMsg('Account created. Check your email if confirmation is enabled.');}catch(x){setMsg(errorText(x));}finally{setBusy(false);}};
  return <div className="auth"><div className="auth-card"><div className="logo"><span>F</span> Fit <b>Together</b></div><h1>{signup?'Create your account':'Welcome back'}</h1><p>Train, connect and stay motivated together.</p>{!isSupabaseConfigured&&<div className="notice">Add your Supabase URL and publishable key in <code>public/config.js</code>.</div>}<form onSubmit={submit}>{signup&&<input value={name} onChange={e=>setName(e.target.value)} placeholder="Display name" required/>}<input value={email} onChange={e=>setEmail(e.target.value)} type="email" placeholder="Email address" required/><input value={password} onChange={e=>setPassword(e.target.value)} type="password" minLength="6" placeholder="Password" required/><button className="primary" disabled={busy||!isSupabaseConfigured}>{busy?'Please wait…':signup?'Create account':'Sign in'}</button></form><div className="or">or</div><button className="ghost wide" onClick={async()=>{try{await auth.google()}catch(x){setMsg(errorText(x));}}} disabled={!isSupabaseConfigured}>Continue with Google</button>{msg&&<div className="notice">{msg}</div>}<button className="text-btn" onClick={()=>setSignup(!signup)}>{signup?'Already have an account? Sign in':'New here? Create an account'}</button></div></div>;
}

function Avatar({p,size=''}){return p?.avatar_url?<img className={`avatar ${size}`} src={p.avatar_url} alt=""/>:<div className={`avatar ${size}`}>{initials(p?.display_name)}</div>}
function PointsPill({value}){return <span className="pointspill"><Coins size={14}/>{Number(value||0).toLocaleString()}</span>}
function StreakPill({value}){return <span className="streakpill"><Flame size={14}/>{value||0}d</span>}
function Overlay({children,onClose}){return <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><div className="sheet"><button className="close" onClick={onClose}><X/></button>{children}</div></div>}

function HomeTab({me,health,wearable,plan,openPlan,openSettings,openRewards}){
  const simOn = wearable?.enabled;
  return <div className="page"><section className="hero"><div><span className="eyebrow">GOOD MORNING</span><h1>Keep the streak going.</h1><p>Small actions, together, add up.</p></div><div className="streak"><Flame/><strong>{me?.current_streak ?? 0}</strong><span>day streak</span></div></section><section className="card plan-card"><div className="card-head"><div><span className="eyebrow">TODAY’S PLAN</span><h2>{plan.title}</h2></div><button className="icon-btn" onClick={openPlan}><ChevronRight/></button></div><div className="plan-row"><div className="plan-icon"><Dumbbell/></div><div><b>{plan.subtitle}</b><small>{plan.time} · {plan.detail}</small></div><span className="pill">Today</span></div></section><button className="card rewards-teaser" onClick={openRewards}><div className="rewards-teaser-icon"><Trophy/></div><div><b>{Number(me?.points_balance||0).toLocaleString()} points</b><small>Challenges & Shop — keep earning</small></div><ChevronRight/></button><section className="card health-card"><div className="card-head"><div><span className="eyebrow">{simOn?'SIMULATED HEALTH':'HEALTH'}</span><h2>{simOn?'Syncing Health Data':'Health Data'}</h2></div><Watch className="muted"/></div><div className="health-grid"><Metric icon={<Footprints/>} label="Steps" value={health.steps.toLocaleString()}/><Metric icon={<Heart/>} label="BPM" value={health.bpm}/><Metric icon={<Zap/>} label="Calories" value={health.calories}/></div>{simOn?<div className="sync-line"><span className="dot live"/>Live simulation · updates periodically</div>:<div className="sync-line muted-text">Simulated Health is off. <button className="text-btn inline" onClick={openSettings}>Turn on in Settings</button></div>}</section></div>;
}
function Metric({icon,label,value}){return <div className="metric"><div>{icon}</div><span>{label}</span><strong>{value}</strong></div>}

// Finds the earliest open slot of `durationMin` minutes today, given a list of
// {starts_at, ends_at} busy blocks. Falls back to a sensible evening default
// when the whole window is booked or no events are supplied.
function findBestSlot(events, durationMin=45, windowStartHour=6, windowEndHour=22){
  const today=new Date(); today.setHours(0,0,0,0);
  const dayStart=new Date(today); dayStart.setHours(windowStartHour,0,0,0);
  const dayEnd=new Date(today); dayEnd.setHours(windowEndHour,0,0,0);
  const busy=(events||[]).map(e=>{const s=new Date(e.starts_at);const en=e.ends_at?new Date(e.ends_at):new Date(s.getTime()+30*60000);return [s,en];}).filter(([s])=>!isNaN(s)).sort((a,b)=>a[0]-b[0]);
  let cursor=dayStart,best=null;
  for(const [s,en] of busy){ if(s-cursor>=durationMin*60000){best=new Date(cursor);break;} if(en>cursor)cursor=en; }
  if(!best && dayEnd-cursor>=durationMin*60000) best=new Date(cursor);
  if(!best){ best=new Date(today); best.setHours(18,30,0,0); }
  return best;
}

function PlanTab({scheduleItems,setScheduleItems,calSources,groupsList,onLoggedActivity,me}){
  const [selected,setSelected]=useState(new Date().toISOString().slice(0,10));
  const [copilot,setCopilot]=useState(false);
  const [highlight,setHighlight]=useState({groupName:null,slot:findBestSlot(scheduleItems)});
  const days=Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()-d.getDay()+1+i);return d});
  const today=scheduleItems.filter(e=>e.starts_at?.slice(0,10)===selected);
  useEffect(()=>{let live=true;(async()=>{try{const primary=groupsList?.[0];if(!primary){if(live)setHighlight({groupName:null,slot:findBestSlot(scheduleItems)});return;}const members=await groups.members(primary.id);const ids=members.map(m=>m.id);const d=new Date();d.setHours(0,0,0,0);const dayStart=d.toISOString();const dayEnd=new Date(d.getTime()+86400000).toISOString();const events=await schedule.listForUsers(ids,dayStart,dayEnd);if(live)setHighlight({groupName:primary.name,slot:findBestSlot(events)});}catch{if(live)setHighlight({groupName:null,slot:findBestSlot(scheduleItems)});}})();return()=>{live=false;};},[groupsList,scheduleItems]);
  const addHighlight=async()=>{try{const end=new Date(highlight.slot.getTime()+45*60000);const ev=await schedule.create({title:highlight.groupName?`Shared workout · ${highlight.groupName}`:'Workout',startsAt:highlight.slot.toISOString(),endsAt:end.toISOString(),eventType:'ai'});setScheduleItems(x=>[...x,ev]);await points.recordActivity().catch(()=>{});await onLoggedActivity?.();}catch(e){alert(errorText(e));}};
  return <div className="page"><section className="page-title"><div><span className="eyebrow">PLAN</span><h1>Your week</h1></div><div className="calendar-status"><CalendarDays/><span>{calSources.length?`${calSources.length} calendar${calSources.length>1?'s':''} synced`:'No calendar synced'}</span></div></section><div className="day-strip">{days.map(d=><button key={d.toISOString()} className={selected===d.toISOString().slice(0,10)?'active':''} onClick={()=>setSelected(d.toISOString().slice(0,10))}><b>{dayName(d)}</b><span>{d.getDate()}</span></button>)}</div><section className="card timeline">{today.length?today.map(e=><div className="timeline-row" key={e.id}><span>{time(e.starts_at)}</span><div><b>{e.title}</b><small>{e.location||e.event_type}</small></div></div>):<div className="empty">No events on this day. Add a workout from the + button.</div>}</section><section className="ai-card"><div className="ai-top"><div className="ai-icon"><Sparkles/></div><div><span className="eyebrow">FIT AI COPILOT</span><h2>{highlight.groupName?`Best shared time for ${highlight.groupName}`:'Best time for you'} · {time(highlight.slot)}</h2><p>{highlight.groupName?"Looks like a good slot everyone in the group is free.":'A good open slot in your day for a workout.'}</p></div></div><div className="ai-actions"><button className="primary compact" onClick={addHighlight}>Add to Schedule</button><button className="ghost compact" onClick={()=>setCopilot(true)}>Ask Fit AI</button></div></section><section className="card"><div className="card-head"><div><span className="eyebrow">CALENDAR SYNC</span><h2>External calendars</h2></div><Link2 className="muted"/></div><p className="muted-text">Google, Outlook, Canvas and Blackboard can use the same secret <b>.ics / webcal URL</b> flow.</p><div className="mini-list">{calSources.map(c=><div key={c.id}><span className="provider">{c.provider}</span><b>{c.name}</b><small>{c.url}</small></div>)}{!calSources.length&&<div className="empty">Connect a calendar in Settings.</div>}</div></section>{copilot&&<FitAiCopilot me={me} groupsList={groupsList||[]} scheduleItems={scheduleItems} onAddEvent={async payload=>{const ev=await schedule.create(payload);setScheduleItems(x=>[...x,ev]);await points.recordActivity().catch(()=>{});await onLoggedActivity?.();}} onClose={()=>setCopilot(false)}/>}</div>;
}

function FitAiCopilot({me,groupsList,scheduleItems,onAddEvent,onClose}){
  const [groupId,setGroupId]=useState(groupsList[0]?.id||'');
  const [busy,setBusy]=useState(false);
  const [input,setInput]=useState('');
  const [msgs,setMsgs]=useState([{role:'ai',text:"Hi, I'm Fit AI 👋 I can find a workout time, protect your streak, check your points, or suggest a group challenge. Try a chip below or just type."}]);
  const groupName=()=>groupsList.find(g=>g.id===groupId)?.name;
  const ask=async prompt=>{
    const text=prompt.trim(); if(!text) return;
    setMsgs(m=>[...m,{role:'user',text}]);setInput('');setBusy(true);
    try{
      if(/streak/i.test(text)){
        const hasToday=scheduleItems.some(e=>e.starts_at?.slice(0,10)===new Date().toISOString().slice(0,10));
        if(hasToday){setMsgs(m=>[...m,{role:'ai',text:"You already have a session on today's schedule — your streak is safe! 🔥"}]);}
        else{const slot=findBestSlot(scheduleItems);setMsgs(m=>[...m,{role:'ai',text:`Nothing logged yet today, and your streak is at ${me?.current_streak||0} days. Grab a quick session at ${time(slot)} to keep it alive.`,slot}]);}
      } else if(/point/i.test(text)){
        setMsgs(m=>[...m,{role:'ai',text:`You've got ${Number(me?.points_balance||0).toLocaleString()} points. You earn 10 for your first logged activity each day, plus challenge rewards — check the Rewards tab to spend them in the Shop.`}]);
      } else if(/challenge/i.test(text)&&/suggest|idea|create|start/i.test(text)){
        const preset=groupId?{title:`${groupName()} · 5 workouts this week`,tier:'group',groupId,goalType:'workouts',goalValue:5,pointsReward:120}:{title:'5 workouts this week',tier:'personal',goalType:'workouts',goalValue:5,pointsReward:80};
        setMsgs(m=>[...m,{role:'ai',text:`How about "${preset.title}" — log ${preset.goalValue} workouts to earn ${preset.pointsReward} points?`,challenge:preset}]);
      } else if(/motivat|tired|don't want|dont want|skip/i.test(text)){
        setMsgs(m=>[...m,{role:'ai',text:`You're ${me?.current_streak||0} days into your streak — even a short 20-minute session keeps it going. Future you will thank you.`}]);
      } else {
        let events=scheduleItems;
        if(groupId){const members=await groups.members(groupId);const ids=members.map(m=>m.id);const d=new Date();d.setHours(0,0,0,0);events=await schedule.listForUsers(ids,d.toISOString(),new Date(d.getTime()+86400000).toISOString());}
        const slot=findBestSlot(events);
        setMsgs(m=>[...m,{role:'ai',text:`${groupId?`Best shared time for ${groupName()}`:'Best time for you'} today looks like ${time(slot)}.`,slot}]);
      }
    }catch(e){setMsgs(m=>[...m,{role:'ai',text:errorText(e)}]);}
    finally{setBusy(false);}
  };
  const addSlot=async slot=>{try{const end=new Date(slot.getTime()+45*60000);await onAddEvent({title:groupId?`Shared workout · ${groupName()}`:'Workout',startsAt:slot.toISOString(),endsAt:end.toISOString(),groupId:groupId||null,eventType:'ai'});setMsgs(m=>[...m,{role:'ai',text:'Added to your schedule ✅'}]);}catch(e){setMsgs(m=>[...m,{role:'ai',text:errorText(e)}]);}};
  const createChallenge=async preset=>{try{const c=await challenges.create(preset);await challenges.join(c.id);setMsgs(m=>[...m,{role:'ai',text:`Created — find it in Rewards → Challenges to log progress. 🎯`}]);}catch(e){setMsgs(m=>[...m,{role:'ai',text:errorText(e)}]);}};
  return <Overlay onClose={onClose}><div className="modal-title"><span className="eyebrow">FIT AI COPILOT</span><h1>Ask Fit AI</h1></div>{groupsList.length>0&&<select className="ai-group-select" value={groupId} onChange={e=>setGroupId(e.target.value)}><option value="">Just me</option>{groupsList.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select>}<div className="chat-log ai-log">{msgs.map((m,i)=><div className={`bubble ${m.role==='user'?'mine':''}`} key={i}><p>{m.text}</p>{m.slot&&<button className="primary compact" onClick={()=>addSlot(m.slot)}>Add to Schedule</button>}{m.challenge&&<button className="primary compact" onClick={()=>createChallenge(m.challenge)}>Create Challenge</button>}</div>)}</div><div className="ai-prompts"><button className="chip" disabled={busy} onClick={()=>ask('Find my best workout time today')}>Best time today</button><button className="chip" disabled={busy} onClick={()=>ask('Protect group streak')}>Protect my streak</button><button className="chip" disabled={busy} onClick={()=>ask('How many points do I have')}>My points</button><button className="chip" disabled={busy} onClick={()=>ask('Suggest a challenge')}>Suggest a challenge</button></div><div className="chat-compose"><input value={input} onChange={e=>setInput(e.target.value)} placeholder="Ask Fit AI…" onKeyDown={e=>e.key==='Enter'&&ask(input)}/><button onClick={()=>ask(input)} disabled={busy||!input.trim()}><Send/></button></div></Overlay>;
}

function SocialTab({groupsList,chatList,onOpenGroup,onOpenFriend,onCreateGroup,onJoinGroup}){
 const [sub,setSub]=useState('groups');
 return <div className="page"><div className="subtabs"><button className={sub==='groups'?'active':''} onClick={()=>setSub('groups')}><Users/>Groups</button><button className={sub==='chats'?'active':''} onClick={()=>setSub('chats')}><MessageCircle/>Chats</button></div>{sub==='groups'?<><div className="section-actions"><h1>Your groups</h1><button className="ghost" onClick={onJoinGroup}>Join with code</button></div>{groupsList.map(g=><button className="list-card" key={g.id} onClick={()=>onOpenGroup(g)}><div className="group-avatar"><Users/></div><div><b>{g.name}</b><small>{g.description||'Workout together'}</small><small>Join code · {g.join_code}</small></div><ChevronRight/></button>)}{!groupsList.length&&<div className="empty">Create your first group with the + button.</div>}</>:<div><h1>Your chats</h1>{chatList.map(c=><button className="list-card" key={c.id} onClick={()=>onOpenFriend(c)}><div className="group-avatar"><MessageCircle/></div><div><b>{c.name}</b><small>{c.preview||'Open conversation'}</small></div><ChevronRight/></button>)}{!chatList.length&&<div className="empty">Add a friend to start a chat.</div>}</div>}</div>;
}

function FeedTab({items,reload,onAddFriend}){
 const [expanded,setExpanded]=useState(null),[comment,setComment]=useState(''),[comments,setComments]=useState({});
 const toggle=async id=>{if(expanded===id){setExpanded(null);return;}setExpanded(id);if(!comments[id]){try{const c=await posts.comments(id);setComments(x=>({...x,[id]:c}));}catch{}}};
 const send=async id=>{if(!comment.trim())return;try{const c=await posts.comment(id,comment);setComments(x=>({...x,[id]:[...(x[id]||[]),c]}));setComment('');}catch(e){alert(errorText(e));}};
 return <div className="page"><div className="feed-head"><div><span className="eyebrow">COMMUNITY</span><h1>Feed</h1></div><button className="icon-btn" onClick={onAddFriend}><UserPlus/></button></div>{items.map(p=><article className="post card" key={p.id}><div className="post-author"><Avatar p={p.author}/><div><b>{p.author?.display_name||'Member'}</b><small>{new Date(p.created_at).toLocaleDateString()}</small></div></div><p>{p.content}</p>{p.image_url&&<img className="post-image" src={p.image_url} alt=""/>}<div className="post-actions"><button><Heart/>Like</button><button onClick={()=>toggle(p.id)}><MessageSquare/>{comments[p.id]?.length??'Comments'}</button></div>{expanded===p.id&&<div className="comments"><div className="comment-list">{(comments[p.id]||[]).map(c=><div className="comment" key={c.id}><Avatar p={c.author}/><div><b>{c.author?.display_name||'Member'}</b><p>{c.content}</p></div></div>)}</div><div className="composer"><input value={comment} onChange={e=>setComment(e.target.value)} placeholder="Write a comment…" onKeyDown={e=>e.key==='Enter'&&send(p.id)}/><button onClick={()=>send(p.id)}><Send/></button></div></div>}</article>)}{!items.length&&<div className="empty">No posts yet. Share a workout update from the + button.</div>}</div>;
}

const TIER_LABEL={personal:'Personal',group:'Group',university:'University'};
function ChallengeCard({c,me,onJoin,onLog}){
  const mine=(c.participants||[]).find(p=>p.user_id===me?.id);
  const pct=mine?Math.min(100,Math.round((mine.progress/Math.max(1,c.goal_value))*100)):0;
  return <div className="card challenge-card">
    <div className="card-head"><div><span className="eyebrow">{TIER_LABEL[c.tier]||c.tier}</span><h2>{c.title}</h2></div><span className="pointspill small"><Coins size={12}/>{c.points_reward}</span></div>
    {c.description&&<p className="muted-text">{c.description}</p>}
    <div className="challenge-goal"><Target size={14}/><span>Goal: {c.goal_value} {c.goal_type}</span></div>
    {mine?<><div className="progress-track"><div className="progress-fill" style={{width:`${pct}%`}}/></div><div className="challenge-actions"><small>{mine.progress}/{c.goal_value} {mine.completed?'· Completed 🎉':''}</small>{!mine.completed&&<button className="ghost compact" onClick={()=>onLog(c.id)}>Log +1</button>}</div></>:<button className="primary compact wide" onClick={()=>onJoin(c.id)}>Join challenge</button>}
  </div>;
}

function CreateChallengeModal({groupsList,onClose,onDone}){
  const [title,setTitle]=useState(''),[description,setDescription]=useState(''),[tier,setTier]=useState('personal'),[groupId,setGroupId]=useState(groupsList[0]?.id||''),[goalType,setGoalType]=useState('workouts'),[goalValue,setGoalValue]=useState(5),[pointsReward,setPointsReward]=useState(100),[msg,setMsg]=useState('');
  const create=async()=>{try{const c=await challenges.create({title,description,tier,groupId:tier==='group'?groupId:null,goalType,goalValue:Number(goalValue),pointsReward:Number(pointsReward)});await challenges.join(c.id);await onDone();onClose();}catch(e){setMsg(errorText(e));}};
  return <Overlay onClose={onClose}><div className="modal-title"><span className="eyebrow">CHALLENGES</span><h1>Create a challenge</h1></div>
    <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Challenge title"/>
    <input value={description} onChange={e=>setDescription(e.target.value)} placeholder="Description (optional)"/>
    <label className="field-label">Visibility</label>
    <select value={tier} onChange={e=>setTier(e.target.value)}><option value="personal">Personal — just me</option><option value="group">Group — my group</option><option value="university">University — everyone</option></select>
    {tier==='group'&&<select value={groupId} onChange={e=>setGroupId(e.target.value)}>{groupsList.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select>}
    <div className="two-col"><div><label className="field-label">Goal type</label><select value={goalType} onChange={e=>setGoalType(e.target.value)}><option value="workouts">Workouts</option><option value="steps">Steps</option><option value="minutes">Minutes</option><option value="streak">Streak days</option></select></div><div><label className="field-label">Goal value</label><input type="number" min="1" value={goalValue} onChange={e=>setGoalValue(e.target.value)}/></div></div>
    <label className="field-label">Points reward</label><input type="number" min="10" step="10" value={pointsReward} onChange={e=>setPointsReward(e.target.value)}/>
    <button className="primary wide" disabled={!title.trim()} onClick={create}>Create challenge</button>{msg&&<div className="notice">{msg}</div>}
  </Overlay>;
}

function ShopItemCard({item,balance,onRedeem}){
  const affordable=balance>=item.cost_points;
  return <div className="card shop-card"><div className="shopicon"><Gift size={22}/></div><div className="shop-info"><b>{item.name}</b><small>{item.description}</small><span className="pointspill"><Coins size={14}/>{item.cost_points}</span></div><button className="primary compact" disabled={!affordable} onClick={()=>onRedeem(item.id)}>{affordable?'Redeem':'Need more points'}</button></div>;
}

function RewardsTab({me,groupsList,reload}){
  const [sub,setSub]=useState('challenges');
  const [list,setList]=useState([]),[items,setItems]=useState([]),[redemptions,setRedemptions]=useState([]);
  const [creating,setCreating]=useState(false);
  const [msg,setMsg]=useState('');
  const loadChallenges=async()=>{try{setList(await challenges.list());}catch(e){setMsg(errorText(e));}};
  const loadShop=async()=>{try{setItems(await shop.list());setRedemptions(await shop.myRedemptions());}catch(e){setMsg(errorText(e));}};
  useEffect(()=>{loadChallenges();loadShop();},[]);
  const join=async id=>{try{await challenges.join(id);await loadChallenges();}catch(e){setMsg(errorText(e));}};
  const log=async id=>{try{await challenges.logProgress(id,1);await loadChallenges();await reload?.();}catch(e){setMsg(errorText(e));}};
  const redeem=async id=>{try{const r=await shop.redeem(id);setMsg(`Redeemed! Code: ${r.redemption_code}`);await loadShop();await reload?.();}catch(e){setMsg(errorText(e));}};
  return <div className="page">
    <div className="page-title"><div><span className="eyebrow">REWARDS</span><h1>Challenges & Shop</h1></div><PointsPill value={me?.points_balance}/></div>
    <div className="subtabs"><button className={sub==='challenges'?'active':''} onClick={()=>setSub('challenges')}><Trophy/>Challenges</button><button className={sub==='shop'?'active':''} onClick={()=>setSub('shop')}><ShoppingBag/>Shop</button></div>
    {sub==='challenges'?<>
      <div className="section-actions"><h1>Active challenges</h1><button className="ghost" onClick={()=>setCreating(true)}>New challenge</button></div>
      {list.map(c=><ChallengeCard key={c.id} c={c} me={me} onJoin={join} onLog={log}/>)}
      {!list.length&&<div className="empty">No challenges yet — start a personal, group or university challenge.</div>}
    </>:<>
      <div className="section-actions"><h1>Spend your points</h1></div>
      {items.map(i=><ShopItemCard key={i.id} item={i} balance={me?.points_balance||0} onRedeem={redeem}/>)}
      {redemptions.length>0&&<><h3>My redemptions</h3>{redemptions.map(r=><div className="result" key={r.id}><div><b>{r.item?.name}</b><small>Code · {r.redemption_code}</small></div></div>)}</>}
    </>}
    {msg&&<div className="notice">{msg}</div>}
    {creating&&<CreateChallengeModal groupsList={groupsList} onClose={()=>setCreating(false)} onDone={loadChallenges}/>}
  </div>;
}

function SettingsModal({me,onClose,onSaved}){const [name,setName]=useState(me?.display_name||''),[uni,setUni]=useState(me?.university||''),[verified,setVerified]=useState(!!me?.university_verified),[sources,setSources]=useState([]),[calName,setCalName]=useState(''),[url,setUrl]=useState(''),[wear,setWear]=useState(null),[msg,setMsg]=useState('');useEffect(()=>{(async()=>{try{setSources(await calendars.list());setWear(await wearables.settings());}catch(e){setMsg(errorText(e));}})();},[]);const save=async()=>{try{await profile.updateMine({display_name:name,university:uni,university_verified:verified});onSaved();setMsg('Profile saved.');}catch(e){setMsg(errorText(e));}};const addCal=async()=>{try{const c=await calendars.add({name:calName,url,provider:'custom'});setSources(x=>[c,...x]);setCalName('');setUrl('');}catch(e){setMsg(errorText(e));}};return <Overlay onClose={onClose}><div className="modal-title"><span className="eyebrow">SETTINGS</span><h1>Connections</h1></div><section className="setting"><h3>University verification</h3><p>Optional. Add your university and mark it verified when you have completed your institution's verification flow.</p><input value={uni} onChange={e=>setUni(e.target.value)} placeholder="University"/><label className="switch"><input type="checkbox" checked={verified} onChange={e=>setVerified(e.target.checked)}/><span/>Verified</label></section><section className="setting"><h3>External calendar</h3><p>Paste a secret <b>.ics / webcal</b> URL. Recurring events are imported as their first occurrence only.</p><input value={calName} onChange={e=>setCalName(e.target.value)} placeholder="Calendar name"/><input value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://…/calendar.ics"/><button className="primary" onClick={addCal}>Connect calendar</button>{sources.map(c=><div className="connection" key={c.id}><span><b>{c.name}</b><small>{c.provider}</small></span><button onClick={async()=>{try{const r=await calendars.sync(c.id);setMsg(`Imported ${r.imported} event${r.imported===1?'':'s'}.`);}catch(e){setMsg(errorText(e));}}}>Sync</button><button onClick={async()=>{await calendars.remove(c.id);setSources(x=>x.filter(s=>s.id!==c.id));}}><X/></button></div>)}</section><section className="setting"><h3>Fitness & wearables</h3><p>Simulated health works in the web/PWA. Strava uses OAuth; Sync now runs through a secure Netlify function when configured.</p><button className="connection" onClick={async()=>{try{const w=await wearables.save({provider:'simulated',enabled:!(wear?.enabled)});setWear(w);await onSaved();}catch(e){setMsg(errorText(e));}}}><span><b>Simulated Health</b><small>{wear?.enabled?'Connected · updating on Home':'Off'}</small></span><span className="pill">{wear?.enabled?'ON':'OFF'}</span></button><button className="ghost wide" onClick={()=>{try{strava.startOAuth()}catch(e){setMsg(errorText(e));}}}>Connect Strava</button><button className="ghost wide" onClick={async()=>{try{await strava.syncNow();setMsg('Strava sync complete.')}catch(e){setMsg(errorText(e));}}}>Sync Strava now</button></section><section className="setting"><h3>Account</h3><input value={name} onChange={e=>setName(e.target.value)} placeholder="Display name"/><button className="primary" onClick={save}>Save changes</button><button className="ghost wide" onClick={async()=>{await auth.signOut();}}>Sign out</button></section>{msg&&<div className="notice">{msg}</div>}</Overlay>}

function Profile({me,onClose}){return <Overlay onClose={onClose}><div className="profile-top"><Avatar p={me} size="large"/><h1>{me?.display_name||'Member'}</h1><p>{me?.university||'University not added'}</p></div><div className="stats"><div><strong>{me?.current_streak||0}</strong><span>streak</span></div><div><strong>{me?.longest_streak||0}</strong><span>best streak</span></div><div><strong>{Number(me?.points_balance||0).toLocaleString()}</strong><span>points</span></div></div><div className="code-box"><span>Your Friend Code</span><b>{me?.friend_code||'Generating…'}</b><button onClick={()=>navigator.clipboard?.writeText(me?.friend_code||'')}><Copy/></button></div></Overlay>}

function Fab({onAction}){const [open,setOpen]=useState(false);return <div className="fab-wrap">{open&&<div className="fab-menu"><button onClick={()=>onAction('workout')}><Dumbbell/>Log Workout</button><button onClick={()=>onAction('post')}><ImageIcon/>Post Update</button><button onClick={()=>onAction('group')}><Users/>Create Group</button><button onClick={()=>onAction('friend')}><UserPlus/>Add Friend</button></div>}<button className={`fab ${open?'open':''}`} onClick={()=>setOpen(!open)}>{open?<X/>:<Plus/>}</button></div>}

function Chat({target,onClose}){const [items,setItems]=useState([]),[text,setText]=useState(''),[conv,setConv]=useState(null);useEffect(()=>{let ch; (async()=>{try{const c=target.kind==='group'?await conversations.group(target.id):await conversations.directWith(target.id);setConv(c);const m=await messages.list(c.id);setItems(m);await messages.markRead(c.id);ch=messages.subscribe(c.id,async row=>{const s=await profile.byId(row.sender_id).catch(()=>null);setItems(x=>[...x,{...row,sender:s}]);});}catch(e){console.error(e);}})();return()=>messages.unsubscribe(ch);},[target]);const send=async()=>{if(!text.trim()||!conv)return;try{const m=await messages.send(conv.id,text);const s=await profile.mine();setItems(x=>[...x,{...m,sender:s}]);setText('');}catch(e){alert(errorText(e));}};return <Overlay onClose={onClose}><div className="chat-head"><div><span className="eyebrow">{target.kind==='group'?'GROUP CHAT':'DIRECT MESSAGE'}</span><h1>{target.name}</h1></div></div><div className="chat-log">{items.map(m=><div className={`bubble ${m.sender_id===target.currentUser?'mine':''}`} key={m.id}><b>{m.sender?.display_name||'Member'}</b><p>{m.content}</p><small>{time(m.created_at)}</small></div>)}</div><div className="chat-compose"><input value={text} onChange={e=>setText(e.target.value)} placeholder="Message…" onKeyDown={e=>e.key==='Enter'&&send()}/><button onClick={send}><Send/></button></div></Overlay>}

function App(){
 const [session,setSession]=useState(null),[authReady,setAuthReady]=useState(false),[me,setMe]=useState(null),[tab,setTab]=useState('home'),[overlay,setOverlay]=useState(null),[feed,setFeed]=useState([]),[groupsList,setGroupsList]=useState([]),[friendsList,setFriendsList]=useState([]),[chatList,setChatList]=useState([]),[calSources,setCalSources]=useState([]),[scheduleItems,setScheduleItems]=useState([]),[health,setHealth]=useState({steps:6842,bpm:72,calories:412}),[wearable,setWearable]=useState(null),[chat,setChat]=useState(null),[notice,setNotice]=useState('');
 useEffect(()=>{
   if(!supabase){setAuthReady(true);setSession(null);return;}
   let alive=true;
   (async()=>{const {data}=await supabase.auth.getSession();if(alive){setSession(data.session||null);setAuthReady(true);}})();
   const {data}=supabase.auth.onAuthStateChange((_e,s)=>{if(alive){setSession(s||null);if(!s){setMe(null);}}});
   return()=>{alive=false;data.subscription.unsubscribe();};
 },[]);
 const load=async()=>{
   if(!session)return false;
   try{
     const m=await profile.mine();
     if(!m){
       await auth.signOut();
       setMe(null);setSession(null);setNotice('Your account profile was missing, so you were signed out. Please sign in again.');
       return false;
     }
     const [p,g,f,c,cs,se,w]=await Promise.all([posts.list(),groups.mine(),friends.list(),conversations.list(),calendars.list(),schedule.list(),wearables.settings()]);
     setMe(m);setFeed(p);setGroupsList(g);setFriendsList(f);setCalSources(cs);setScheduleItems(se);setWearable(w||{enabled:true,provider:'simulated'});
     const chats=[];
     for(const x of c.filter(v=>v.kind==='direct')){const mm=await conversations.members(x.id);const other=mm.find(v=>v.id!==m.id);if(other)chats.push({id:other.id,name:other.display_name,preview:'Direct chat'});}
     for(const x of c.filter(v=>v.kind==='group')){const gr=g.find(z=>z.id===x.group_id);if(gr)chats.push({id:gr.id,name:gr.name,preview:'Group chat',kind:'group'});}
     setChatList(chats);return true;
   }catch(e){
     setMe(null);
     // A persisted Supabase session is not enough to enter the app: a usable profile must load too.
     try{await auth.signOut();}catch{}
     setSession(null);setNotice(errorText(e));return false;
   }
 };
 useEffect(()=>{
   if(!session)return;
   load();
   const params=new URLSearchParams(window.location.search);const code=params.get('strava_code');
   if(code){(async()=>{try{const token=session.access_token;const r=await fetch('/api/strava/exchange',{method:'POST',headers:{'content-type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({code})});if(!r.ok)throw new Error(await r.text());setNotice('Strava connected.');window.history.replaceState({},'',window.location.pathname);}catch(e){setNotice(errorText(e));}})();}
 },[session]);
 useEffect(()=>{if(!wearable?.enabled)return;const t=setInterval(()=>setHealth(h=>({steps:Math.max(0,h.steps+Math.floor(Math.random()*121)-60),bpm:Math.max(58,Math.min(105,h.bpm+Math.floor(Math.random()*7)-3)),calories:Math.max(0,h.calories+Math.floor(Math.random()*13)-4)})),3500);return()=>clearInterval(t);},[wearable?.enabled]);
 if(!authReady)return <div className="auth"><div className="auth-card"><div className="logo"><span>F</span> Fit <b>Together</b></div><p>Checking your sign-in…</p></div></div>;
 if(!session || !me)return <Auth/>;
 const action=async type=>{if(type==='post')setOverlay('post');if(type==='friend')setOverlay('friend');if(type==='group')setOverlay('group');if(type==='workout'){try{const now=new Date();const end=new Date(now.getTime()+45*60000);await schedule.create({title:'Workout',startsAt:now.toISOString(),endsAt:end.toISOString()});await points.recordActivity().catch(()=>{});await load();setTab('plan');}catch(e){setNotice(errorText(e));}}};
 return <div className="app"><header><button className="brand-btn" onClick={()=>setTab('home')}><span>F</span><b>Fit Together</b></button><div className="header-actions"><PointsPill value={me?.points_balance}/><StreakPill value={me?.current_streak}/><button className="icon-btn" onClick={()=>setOverlay('settings')}><Settings/></button><button className="avatar-btn" onClick={()=>setOverlay('profile')}><Avatar p={me}/></button></div></header><main>{tab==='home'&&<HomeTab me={me} health={health} wearable={wearable} plan={{title:'Full-body strength',subtitle:'45 min · moderate',time:'6:30 PM',detail:'Gym'}} openPlan={()=>setTab('plan')} openSettings={()=>setOverlay('settings')} openRewards={()=>setTab('rewards')}/>} {tab==='plan'&&<PlanTab scheduleItems={scheduleItems} setScheduleItems={setScheduleItems} calSources={calSources} groupsList={groupsList} onLoggedActivity={load} me={me}/>} {tab==='social'&&<SocialTab groupsList={groupsList} chatList={chatList} onOpenGroup={g=>setChat({kind:'group',id:g.id,name:g.name,currentUser:me.id})} onOpenFriend={c=>setChat({kind:c.kind||'direct',id:c.id,name:c.name,currentUser:me.id})} onCreateGroup={()=>setOverlay('group')} onJoinGroup={()=>setOverlay('join')}/>} {tab==='feed'&&<FeedTab items={feed} reload={load} onAddFriend={()=>setOverlay('friend')}/>} {tab==='rewards'&&<RewardsTab me={me} groupsList={groupsList} reload={load}/>}</main><Fab onAction={action}/><nav><button className={tab==='home'?'active':''} onClick={()=>setTab('home')}><Home/><span>Home</span></button><button className={tab==='plan'?'active':''} onClick={()=>setTab('plan')}><CalendarDays/><span>Plan</span></button><button className={tab==='social'?'active':''} onClick={()=>setTab('social')}><Users/><span>Social</span></button><button className={tab==='feed'?'active':''} onClick={()=>setTab('feed')}><MessageSquare/><span>Feed</span></button><button className={tab==='rewards'?'active':''} onClick={()=>setTab('rewards')}><Trophy/><span>Rewards</span></button></nav>{notice&&<div className="toast" onClick={()=>setNotice('')}>{notice}</div>}{overlay==='settings'&&<SettingsModal me={me} onClose={()=>setOverlay(null)} onSaved={async()=>{await load();}}/>}{overlay==='profile'&&<Profile me={me} onClose={()=>setOverlay(null)}/>} {overlay==='friend'&&<FriendModal onClose={()=>setOverlay(null)} onDone={load}/>} {overlay==='group'&&<GroupModal friendsList={friendsList} onClose={()=>setOverlay(null)} onDone={load}/>} {overlay==='join'&&<JoinModal onClose={()=>setOverlay(null)} onDone={load}/>} {overlay==='post'&&<PostModal onClose={()=>setOverlay(null)} onDone={load}/>} {chat&&<Chat target={chat} onClose={()=>{setChat(null);load();}}/>}</div>;
}

function FriendModal({onClose,onDone}){const [c,setC]=useState(''),[found,setFound]=useState(null),[req,setReq]=useState([]),[msg,setMsg]=useState('');useEffect(()=>{friends.requests().then(setReq).catch(()=>{});},[]);const find=async()=>{try{setFound(await friends.byCode(c));setMsg('');}catch(e){setFound(null);setMsg('No member found for that code.');}};const send=async()=>{try{await friends.send(found.id);setMsg('Friend request sent.');}catch(e){setMsg(errorText(e));}};return <Overlay onClose={onClose}><div className="modal-title"><span className="eyebrow">FRIENDS</span><h1>Add by Friend Code</h1></div><div className="code-input"><input value={c} onChange={e=>setC(e.target.value.toUpperCase())} placeholder="PLOY-4X9K"/><button className="primary" onClick={find}>Find</button></div>{found&&<div className="result"><Avatar p={found}/><div><b>{found.display_name}</b><small>{found.friend_code}</small></div><button className="primary" onClick={send}>Add</button></div>}<h3>Pending invitations</h3>{req.map(r=><div className="result" key={r.id}><Avatar p={r.requester}/><div><b>{r.requester?.display_name}</b><small>{r.requester?.friend_code}</small></div><button onClick={async()=>{await friends.respond(r.id,'accepted');await onDone();setReq(x=>x.filter(v=>v.id!==r.id));}}><Check/></button><button onClick={async()=>{await friends.respond(r.id,'declined');setReq(x=>x.filter(v=>v.id!==r.id));}}><X/></button></div>)}{msg&&<div className="notice">{msg}</div>}</Overlay>}
function GroupModal({friendsList,onClose,onDone}){const [name,setName]=useState(''),[desc,setDesc]=useState(''),[members,setMembers]=useState([]);return <Overlay onClose={onClose}><div className="modal-title"><span className="eyebrow">GROUPS</span><h1>Create a group</h1></div><input value={name} onChange={e=>setName(e.target.value)} placeholder="Group name"/><input value={desc} onChange={e=>setDesc(e.target.value)} placeholder="Description (optional)"/><div className="picker">{friendsList.map(f=><label key={f.friend.id}><input type="checkbox" checked={members.includes(f.friend.id)} onChange={e=>setMembers(e.target.checked?[...members,f.friend.id]:members.filter(id=>id!==f.friend.id))}/><Avatar p={f.friend}/><span>{f.friend.display_name}</span></label>)}</div><button className="primary wide" onClick={async()=>{try{await groups.create({name,description:desc,memberIds:members});await onDone();onClose();}catch(e){alert(errorText(e));}}}>Create group</button></Overlay>}
function JoinModal({onClose,onDone}){const [c,setC]=useState('');return <Overlay onClose={onClose}><div className="modal-title"><span className="eyebrow">GROUPS</span><h1>Join with code</h1></div><input value={c} onChange={e=>setC(e.target.value.toUpperCase())} placeholder="FITNESS-8K2Q"/><button className="primary wide" onClick={async()=>{try{await groups.joinByCode(c);await onDone();onClose();}catch(e){alert(errorText(e));}}}>Join group</button></Overlay>}
function PostModal({onClose,onDone}){const [text,setText]=useState(''),[file,setFile]=useState(null),[busy,setBusy]=useState(false);return <Overlay onClose={onClose}><div className="modal-title"><span className="eyebrow">COMMUNITY</span><h1>Post an update</h1></div><textarea value={text} onChange={e=>setText(e.target.value)} placeholder="Share your workout, win or motivation…"/><input type="file" accept="image/*" onChange={e=>setFile(e.target.files?.[0]||null)}/><button className="primary wide" disabled={busy||!text.trim()} onClick={async()=>{setBusy(true);try{const imageUrl=file?await uploadPostImage(file):null;await posts.create({content:text,imageUrl});await points.recordActivity().catch(()=>{});await onDone();onClose();}catch(e){alert(errorText(e));}finally{setBusy(false);}}}>{busy?'Posting…':'Publish'}</button></Overlay>}

createRoot(document.getElementById('root')).render(<App/>);
