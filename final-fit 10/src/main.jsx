import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  CalendarDays,
  Check,
  ChevronRight,
  Coins,
  Copy,
  Dumbbell,
  Flame,
  Footprints,
  Gift,
  Heart,
  Image as ImageIcon,
  Link2,
  MessageCircle,
  MessageSquare,
  Plus,
  Search,
  Send,
  Settings,
  ShoppingBag,
  Sparkles,
  Target,
  Trophy,
  UserCircle,
  UserPlus,
  Users,
  Watch,
  X,
  Zap,
  Home
} from 'lucide-react';
import './styles.css';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import {
  auth,
  profile,
  posts,
  uploadPostImage,
  friends,
  groups,
  conversations,
  messages,
  schedule,
  calendars,
  wearables,
  strava,
  points,
  challenges,
  shop,
  fitness
} from './services/backend';

const errorText = error => error?.message || 'Something went wrong.';
const initials = name => (name || '?').trim().slice(0, 1).toUpperCase();
const pad = value => String(value).padStart(2, '0');
const localDateKey = value => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};
const dateFromKey = key => {
  const [year, month, day] = String(key).split('-').map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
};
const dayName = date => date.toLocaleDateString(undefined, { weekday: 'short' });
const time = value => new Date(value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const isToday = value => localDateKey(value) === localDateKey(new Date());
const activeStreak = me => {
  if (!me?.last_activity_date) return 0;
  const last = dateFromKey(me.last_activity_date);
  const today = dateFromKey(localDateKey(new Date()));
  const days = Math.round((today - last) / 86400000);
  return days <= 1 ? Number(me.current_streak || 0) : 0;
};

function Auth() {
  const [signup, setSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const submit = async event => {
    event.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      const response = signup
        ? await auth.signUp({ email, password, displayName: name })
        : await auth.signIn({ email, password });
      if (response.error) throw response.error;
      if (signup && !response.data?.session) {
        setMsg('Account created. Check your email if confirmation is enabled.');
      }
    } catch (error) {
      setMsg(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth-card">
        <div className="logo"><span>F</span> Fit <b>Together</b></div>
        <h1>{signup ? 'Create your account' : 'Welcome back'}</h1>
        <p>Train, connect and stay motivated together.</p>
        {!isSupabaseConfigured && (
          <div className="notice">Add your Supabase URL and publishable key in <code>public/config.js</code>.</div>
        )}
        <form onSubmit={submit}>
          {signup && (
            <input value={name} onChange={event => setName(event.target.value)} placeholder="Display name" required />
          )}
          <input value={email} onChange={event => setEmail(event.target.value)} type="email" placeholder="Email address" required />
          <input value={password} onChange={event => setPassword(event.target.value)} type="password" minLength="6" placeholder="Password" required />
          <button className="primary" disabled={busy || !isSupabaseConfigured}>
            {busy ? 'Please wait…' : signup ? 'Create account' : 'Sign in'}
          </button>
        </form>
        <div className="or">or</div>
        <button
          className="ghost wide"
          onClick={async () => {
            try { await auth.google(); } catch (error) { setMsg(errorText(error)); }
          }}
          disabled={!isSupabaseConfigured}
        >
          Continue with Google
        </button>
        {msg && <div className="notice">{msg}</div>}
        <button className="text-btn" onClick={() => setSignup(value => !value)}>
          {signup ? 'Already have an account? Sign in' : 'New here? Create an account'}
        </button>
      </div>
    </div>
  );
}

function Avatar({ p, size = '' }) {
  return p?.avatar_url
    ? <img className={`avatar ${size}`} src={p.avatar_url} alt="" />
    : <div className={`avatar ${size}`}>{initials(p?.display_name)}</div>;
}

function PointsPill({ value }) {
  return <span className="pointspill"><Coins size={14} />{Number(value || 0).toLocaleString()}</span>;
}

function StreakPill({ value }) {
  return <span className="streakpill"><Flame size={14} />{value || 0}d</span>;
}

function Badge({ value }) {
  if (!value) return null;
  return <span className="nav-badge">{value > 99 ? '99+' : value}</span>;
}

function Overlay({ children, onClose }) {
  return (
    <div className="overlay" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <div className="sheet">
        <button className="close" onClick={onClose} aria-label="Close"><X /></button>
        {children}
      </div>
    </div>
  );
}

function Metric({ icon, label, value, unit }) {
  return <div className="metric"><div>{icon}</div><span>{label}</span><strong>{value}{unit ? <small style={{fontWeight:600}}> {unit}</small> : null}</strong></div>;
}

function HomeTab({ me, health, wearable, plan, readiness, openPlan, openSettings, openFitness }) {
  const simOn = Boolean(wearable?.enabled);
  return (
    <div className="page">
      <section className="hero">
        <div>
          <span className="eyebrow">TODAY</span>
          <h1>Keep the streak going.</h1>
          <p>Small actions, together, add up.</p>
        </div>
        <div className="streak"><Flame /><strong>{activeStreak(me)}</strong><span>day streak</span></div>
      </section>

      <section className="card health-card"><div className="card-head"><div><span className="eyebrow">TRAINING READINESS</span><h2>{readiness?.score ?? '—'} / 100 · {readiness?.recommendation || 'Check in'}</h2></div><Zap /></div><p className="muted-text">{readiness?.recommendation === 'Recover' ? 'Recovery is the priority today.' : readiness?.recommendation === 'Pace Yourself' ? 'Keep intensity controlled today.' : 'Your readiness supports training today.'}</p><button className="ghost wide" onClick={openFitness}>Open Fitness Center</button></section>

      <section className="card plan-card">
        <div className="card-head">
          <div><span className="eyebrow">TODAY’S PLAN</span><h2>{plan.title}</h2></div>
          <button className="icon-btn" onClick={openPlan} aria-label="Open plan"><ChevronRight /></button>
        </div>
        <div className="plan-row">
          <div className="plan-icon"><Dumbbell /></div>
          <div><b>{plan.subtitle}</b><small>{plan.time} · {plan.detail}</small></div>
          <span className="pill">Today</span>
        </div>
      </section>

      <section className="card health-card">
        <div className="card-head">
          <div><span className="eyebrow">SIMULATED HEALTH</span><h2>{simOn ? 'Health simulation on' : 'Health simulation off'}</h2></div>
          <Watch className="muted" />
        </div>
        <div className="health-grid">
          <Metric icon={<Footprints />} label="Steps" value={health.steps.toLocaleString()} />
          <Metric icon={<Heart />} label="BPM" value={health.bpm} />
          <Metric icon={<Zap />} label="Calories" value={health.calories} />
        </div>
        {simOn
          ? <div className="sync-line"><span className="dot live" />Simulated web/PWA data · updates periodically</div>
          : <div className="sync-line muted-text">Simulation is off. <button className="text-btn inline" onClick={openSettings}>Turn it on in Settings</button></div>}
      </section>
    </div>
  );
}

function findBestSlot(events, durationMin = 45, windowStartHour = 6, windowEndHour = 22, baseDate = new Date()) {
  const base = new Date(baseDate);
  base.setHours(0, 0, 0, 0);
  const dayStart = new Date(base);
  dayStart.setHours(windowStartHour, 0, 0, 0);
  const dayEnd = new Date(base);
  dayEnd.setHours(windowEndHour, 0, 0, 0);
  let cursor = dayStart;

  if (localDateKey(base) === localDateKey(new Date())) {
    const now = new Date();
    const rounded = new Date(now);
    rounded.setSeconds(0, 0);
    rounded.setMinutes(Math.ceil(rounded.getMinutes() / 15) * 15);
    if (rounded > cursor) cursor = rounded;
  }

  const busy = (events || [])
    .map(event => {
      const start = new Date(event.starts_at);
      const end = event.ends_at ? new Date(event.ends_at) : new Date(start.getTime() + 30 * 60000);
      return [start, end];
    })
    .filter(([start, end]) => !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()))
    .sort((a, b) => a[0] - b[0]);

  for (const [start, end] of busy) {
    if (start - cursor >= durationMin * 60000) return new Date(cursor);
    if (end > cursor) cursor = end;
  }
  if (dayEnd - cursor >= durationMin * 60000) return new Date(cursor);

  const fallback = new Date(base);
  fallback.setHours(18, 30, 0, 0);
  return fallback;
}

function PlanTab({ scheduleItems, setScheduleItems, calSources, groupsList, me }) {
  const [selected, setSelected] = useState(localDateKey(new Date()));
  const [copilot, setCopilot] = useState(false);
  const [highlight, setHighlight] = useState({ groupId: null, groupName: null, slot: findBestSlot(scheduleItems) });
  const [slotLoading, setSlotLoading] = useState(false);

  const days = useMemo(() => {
    const today = new Date();
    const monday = new Date(today);
    const offset = (today.getDay() + 6) % 7;
    monday.setDate(today.getDate() - offset);
    monday.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + index);
      return date;
    });
  }, []);

  const selectedEvents = scheduleItems.filter(event => localDateKey(event.starts_at) === selected);

  useEffect(() => {
    let alive = true;
    (async () => {
      setSlotLoading(true);
      try {
        const base = dateFromKey(selected);
        const dayStart = new Date(base);
        const dayEnd = new Date(base);
        dayEnd.setDate(dayEnd.getDate() + 1);
        const primary = groupsList?.[0];
        if (primary) {
          const busy = await schedule.sharedBusy(primary.id, dayStart.toISOString(), dayEnd.toISOString());
          if (alive) {
            setHighlight({
              groupId: primary.id,
              groupName: primary.name,
              slot: findBestSlot(busy, 45, 6, 22, base)
            });
          }
        } else if (alive) {
          setHighlight({
            groupId: null,
            groupName: null,
            slot: findBestSlot(selectedEvents, 45, 6, 22, base)
          });
        }
      } catch {
        if (alive) {
          const base = dateFromKey(selected);
          setHighlight({ groupId: null, groupName: null, slot: findBestSlot(selectedEvents, 45, 6, 22, base) });
        }
      } finally {
        if (alive) setSlotLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [selected, groupsList, scheduleItems]);

  const addHighlight = async () => {
    try {
      const end = new Date(highlight.slot.getTime() + 45 * 60000);
      const event = await schedule.create({
        title: highlight.groupName ? `Shared workout · ${highlight.groupName}` : 'Workout',
        startsAt: highlight.slot.toISOString(),
        endsAt: end.toISOString(),
        eventType: 'ai',
        groupId: highlight.groupId
      });
      setScheduleItems(items => [...items, event]);
    } catch (error) {
      alert(errorText(error));
    }
  };

  return (
    <div className="page">
      <section className="page-title">
        <div><span className="eyebrow">PLAN</span><h1>Your week</h1></div>
        <div className="calendar-status"><CalendarDays /><span>{calSources.length ? `${calSources.length} calendar${calSources.length > 1 ? 's' : ''} connected` : 'No calendar connected'}</span></div>
      </section>

      <div className="day-strip">
        {days.map(date => (
          <button key={localDateKey(date)} className={selected === localDateKey(date) ? 'active' : ''} onClick={() => setSelected(localDateKey(date))}>
            <b>{dayName(date)}</b><span>{date.getDate()}</span>
          </button>
        ))}
      </div>

      <section className="card timeline">
        {selectedEvents.length
          ? selectedEvents.map(event => (
            <div className="timeline-row" key={event.id}>
              <span>{time(event.starts_at)}</span>
              <div><b>{event.title}</b><small>{event.location || event.event_type}</small></div>
            </div>
          ))
          : <div className="empty">No events on this day. Add a workout from the + button.</div>}
      </section>

      <section className="ai-card">
        <div className="ai-top">
          <div className="ai-icon"><Sparkles /></div>
          <div>
            <span className="eyebrow">FIT AI COPILOT</span>
            <h2>{slotLoading ? 'Checking shared availability…' : `${highlight.groupName ? `Best shared time for ${highlight.groupName}` : 'Best time for you'} · ${time(highlight.slot)}`}</h2>
            <p>{highlight.groupName ? 'Calculated from busy blocks for everyone in the group without exposing their event details.' : 'A useful open slot in your selected day.'}</p>
          </div>
        </div>
        <div className="ai-actions">
          <button className="primary compact" disabled={slotLoading} onClick={addHighlight}>Add to Schedule</button>
          <button className="ghost compact" onClick={() => setCopilot(true)}>Ask Fit AI</button>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <div><span className="eyebrow">CALENDAR SYNC</span><h2>External calendars</h2></div>
          <Link2 className="muted" />
        </div>
        <p className="muted-text">Google, Outlook and university systems use the same private .ics / webcal URL flow. Sync is manual in V1.</p>
        <div className="mini-list">
          {calSources.map(source => (
            <div key={source.id}>
              <span className="provider">{source.provider}</span>
              <b>{source.name}</b>
              <small>{source.last_synced_at ? `Last synced ${new Date(source.last_synced_at).toLocaleString()}` : 'Private URL stored · not synced yet'}</small>
            </div>
          ))}
          {!calSources.length && <div className="empty">Connect a calendar in Settings.</div>}
        </div>
      </section>

      {copilot && (
        <FitAiCopilot
          me={me}
          groupsList={groupsList || []}
          scheduleItems={scheduleItems}
          onAddEvent={async payload => {
            const event = await schedule.create(payload);
            setScheduleItems(items => [...items, event]);
          }}
          onClose={() => setCopilot(false)}
        />
      )}
    </div>
  );
}

function FitAiCopilot({ me, groupsList, scheduleItems, onAddEvent, onClose }) {
  const [groupId, setGroupId] = useState(groupsList[0]?.id || '');
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState('');
  const [msgs, setMsgs] = useState([
    { role: 'ai', text: "Hi, I'm Fit AI 👋 I can find a workout time, check a crew streak, check your points, or suggest a challenge." }
  ]);

  const groupName = () => groupsList.find(group => group.id === groupId)?.name;
  const addAiMessage = message => setMsgs(items => [...items, { role: 'ai', ...message }]);

  const groupBusyToday = async () => {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    return schedule.sharedBusy(groupId, dayStart.toISOString(), dayEnd.toISOString());
  };

  const ask = async prompt => {
    const textValue = prompt.trim();
    if (!textValue) return;
    setMsgs(items => [...items, { role: 'user', text: textValue }]);
    setInput('');
    setBusy(true);
    try {
      if (/streak/i.test(textValue) && groupId) {
        const status = await groups.streakStatus(groupId);
        if (status.completed_today) {
          addAiMessage({ text: `${groupName()} is complete today — ${status.completed_members_today}/${status.total_members} members checked in. Crew streak: ${status.current_streak} day${status.current_streak === 1 ? '' : 's'} 🔥` });
        } else {
          const busyBlocks = await groupBusyToday();
          const slot = findBestSlot(busyBlocks);
          addAiMessage({
            text: `${status.completed_members_today}/${status.total_members} members are done today. ${status.my_completed_today ? 'You have already checked in.' : 'You still need an activity.'} A shared opening is around ${time(slot)}.`,
            slot
          });
        }
      } else if (/streak/i.test(textValue)) {
        const hasToday = scheduleItems.some(event => isToday(event.starts_at));
        if (hasToday) addAiMessage({ text: `You have a session scheduled today. Your active personal streak is ${activeStreak(me)} day${activeStreak(me) === 1 ? '' : 's'}.` });
        else {
          const slot = findBestSlot(scheduleItems.filter(event => isToday(event.starts_at)));
          addAiMessage({ text: `Nothing is scheduled yet today. A quick session around ${time(slot)} would give you a clear place to start.`, slot });
        }
      } else if (/point/i.test(textValue)) {
        addAiMessage({ text: `You have ${Number(me?.points_balance || 0).toLocaleString()} points. Self-reported activity earns up to 10 points per day; verified GPS/wearable activity earns 50 points per verified activity. Rewards are in Profile → Rewards.` });
      } else if (/challenge/i.test(textValue) && /suggest|idea|create|start/i.test(textValue)) {
        const preset = groupId
          ? { title: `${groupName()} · 5 workouts this week`, tier: 'group', groupId, goalType: 'workouts', goalValue: 5 }
          : { title: '5 workouts this week', tier: 'personal', goalType: 'workouts', goalValue: 5 };
        addAiMessage({ text: `Try “${preset.title}.” The server calculates the reward from the goal and tier so challenge rewards cannot be self-minted.`, challenge: preset });
      } else {
        const events = groupId ? await groupBusyToday() : scheduleItems.filter(event => isToday(event.starts_at));
        const slot = findBestSlot(events);
        addAiMessage({ text: `${groupId ? `Best shared time for ${groupName()}` : 'Best time for you'} today looks like ${time(slot)}.`, slot });
      }
    } catch (error) {
      addAiMessage({ text: errorText(error) });
    } finally {
      setBusy(false);
    }
  };

  const addSlot = async slot => {
    try {
      const end = new Date(slot.getTime() + 45 * 60000);
      await onAddEvent({
        title: groupId ? `Shared workout · ${groupName()}` : 'Workout',
        startsAt: slot.toISOString(),
        endsAt: end.toISOString(),
        groupId: groupId || null,
        eventType: 'ai'
      });
      addAiMessage({ text: 'Added to your schedule ✅ Scheduling alone does not award workout points.' });
    } catch (error) {
      addAiMessage({ text: errorText(error) });
    }
  };

  const createChallenge = async preset => {
    try {
      const challenge = await challenges.create(preset);
      await challenges.join(challenge.id);
      addAiMessage({ text: `Created. Open Profile → Rewards → Challenges to track it. Reward: ${challenge.points_reward} points. 🎯` });
    } catch (error) {
      addAiMessage({ text: errorText(error) });
    }
  };

  return (
    <Overlay onClose={onClose}>
      <div className="modal-title"><span className="eyebrow">FIT AI COPILOT</span><h1>Ask Fit AI</h1></div>
      {groupsList.length > 0 && (
        <select className="ai-group-select" value={groupId} onChange={event => setGroupId(event.target.value)}>
          <option value="">Just me</option>
          {groupsList.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
        </select>
      )}
      <div className="chat-log ai-log">
        {msgs.map((message, index) => (
          <div className={`bubble ${message.role === 'user' ? 'mine' : ''}`} key={`${message.role}-${index}`}>
            <p>{message.text}</p>
            {message.slot && <button className="primary compact" onClick={() => addSlot(message.slot)}>Add to Schedule</button>}
            {message.challenge && <button className="primary compact" onClick={() => createChallenge(message.challenge)}>Create Challenge</button>}
          </div>
        ))}
      </div>
      <div className="ai-prompts">
        <button className="chip" disabled={busy} onClick={() => ask('Find my best workout time today')}>Best time today</button>
        <button className="chip" disabled={busy} onClick={() => ask('Protect group streak')}>Protect my streak</button>
        <button className="chip" disabled={busy} onClick={() => ask('How many points do I have')}>My points</button>
        <button className="chip" disabled={busy} onClick={() => ask('Suggest a challenge')}>Suggest a challenge</button>
      </div>
      <div className="chat-compose">
        <input value={input} onChange={event => setInput(event.target.value)} placeholder="Ask Fit AI…" onKeyDown={event => event.key === 'Enter' && ask(input)} />
        <button onClick={() => ask(input)} disabled={busy || !input.trim()} aria-label="Send"><Send /></button>
      </div>
    </Overlay>
  );
}

function SocialTab({ groupsList, chatList, friendsList, onOpenGroup, onOpenFriend, onCreateGroup, onJoinGroup, onLeaveGroup, onFriends }) {
  const [sub, setSub] = useState('groups');
  const [streaks, setStreaks] = useState({});

  useEffect(() => {
    let alive = true;
    (async () => {
      const entries = await Promise.all(
        groupsList.map(async group => {
          try { return [group.id, await groups.streakStatus(group.id)]; }
          catch { return [group.id, null]; }
        })
      );
      if (alive) setStreaks(Object.fromEntries(entries));
    })();
    return () => { alive = false; };
  }, [groupsList]);

  return (
    <div className="page">
      <div className="subtabs">
        <button className={sub === 'groups' ? 'active' : ''} onClick={() => setSub('groups')}><Users />Groups</button>
        <button className={sub === 'chats' ? 'active' : ''} onClick={() => setSub('chats')}><MessageCircle />Chats</button>
      </div>

      {sub === 'groups' ? (
        <>
          <div className="section-actions">
            <h1>Your groups</h1>
            <div className="inline-actions"><button className="ghost" onClick={onFriends}>Friends{friendsList?.length ? ` · ${friendsList.length}` : ''}</button><button className="ghost" onClick={onJoinGroup}>Join code</button><button className="ghost" onClick={onCreateGroup}>Create</button></div>
          </div>
          {groupsList.map(group => {
            const status = streaks[group.id];
            return (
              <div className="list-card group-list-card" key={group.id}>
                <button className="group-open" onClick={() => onOpenGroup(group)}>
                  <div className="group-avatar"><Users /></div>
                  <div>
                    <b>{group.name}</b>
                    <small>{group.description || 'Workout together'}</small>
                    <small>{status ? `${status.completed_members_today}/${status.total_members} done today · ${status.current_streak}d crew streak` : `Join code · ${group.join_code}`}</small>
                  </div>
                  <ChevronRight />
                </button>
                <button className="leave-group" onClick={() => onLeaveGroup(group)} aria-label={`Leave ${group.name}`}>Leave</button>
              </div>
            );
          })}
          {!groupsList.length && <div className="empty">Create your first group with the + button.</div>}
        </>
      ) : (
        <div>
          <h1>Your chats</h1>
          {chatList.map(chat => (
            <button className="list-card" key={chat.conversationId || `${chat.kind}-${chat.id}`} onClick={() => onOpenFriend(chat)}>
              <div className="group-avatar"><MessageCircle /></div>
              <div><b>{chat.name}</b><small>{chat.preview || 'Open conversation'}</small></div>
              <Badge value={chat.unread} />
              <ChevronRight />
            </button>
          ))}
          {!chatList.length && <div className="empty">Add a friend to start a chat.</div>}
        </div>
      )}
    </div>
  );
}

function FeedTab({ items, reload, onAddFriend, pendingCount }) {
  const [expanded, setExpanded] = useState(null);
  const [comment, setComment] = useState('');
  const [comments, setComments] = useState({});
  const [search, setSearch] = useState('');
  const [liking, setLiking] = useState(null);

  const filtered = items.filter(post => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return `${post.content || ''} ${post.author?.display_name || ''}`.toLowerCase().includes(query);
  });

  const toggleComments = async id => {
    if (expanded === id) {
      setExpanded(null);
      return;
    }
    setExpanded(id);
    if (!comments[id]) {
      try {
        const rows = await posts.comments(id);
        setComments(value => ({ ...value, [id]: rows }));
      } catch {
        setComments(value => ({ ...value, [id]: [] }));
      }
    }
  };

  const sendComment = async id => {
    if (!comment.trim()) return;
    try {
      const created = await posts.comment(id, comment);
      setComments(value => ({ ...value, [id]: [...(value[id] || []), created] }));
      setComment('');
    } catch (error) {
      alert(errorText(error));
    }
  };

  const toggleLike = async post => {
    setLiking(post.id);
    try {
      await posts.toggleLike(post.id, post.liked_by_me);
      await reload();
    } catch (error) {
      alert(errorText(error));
    } finally {
      setLiking(null);
    }
  };

  return (
    <div className="page">
      <div className="feed-head">
        <div><span className="eyebrow">COMMUNITY</span><h1>Feed</h1></div>
        <button className="icon-btn badged" onClick={onAddFriend} aria-label="Add friend"><UserPlus /><Badge value={pendingCount} /></button>
      </div>
      <div className="feed-search"><Search /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search people or posts" /></div>

      {filtered.map(post => (
        <article className="post card" key={post.id}>
          <div className="post-author"><Avatar p={post.author} /><div><b>{post.author?.display_name || 'Member'}</b><small>{new Date(post.created_at).toLocaleString()}</small></div></div>
          {post.content && <p>{post.content}</p>}
          {post.image_url && <img className="post-image" src={post.image_url} alt="Community post" loading="lazy" />}
          <div className="post-actions">
            <button className={post.liked_by_me ? 'liked' : ''} disabled={liking === post.id} onClick={() => toggleLike(post)}><Heart />{post.like_count || 0} Like{post.like_count === 1 ? '' : 's'}</button>
            <button onClick={() => toggleComments(post.id)}><MessageSquare />{comments[post.id] ? `${comments[post.id].length} Comments` : 'Comments'}</button>
          </div>
          {expanded === post.id && (
            <div className="comments">
              <div className="comment-list">
                {(comments[post.id] || []).map(item => (
                  <div className="comment" key={item.id}><Avatar p={item.author} /><div><b>{item.author?.display_name || 'Member'}</b><p>{item.content}</p></div></div>
                ))}
              </div>
              <div className="composer">
                <input value={comment} onChange={event => setComment(event.target.value)} placeholder="Write a comment…" onKeyDown={event => event.key === 'Enter' && sendComment(post.id)} />
                <button onClick={() => sendComment(post.id)} aria-label="Send comment"><Send /></button>
              </div>
            </div>
          )}
        </article>
      ))}
      {!filtered.length && <div className="empty">{search ? 'No matching posts.' : 'No posts yet. Share a workout update from the + button.'}</div>}
    </div>
  );
}

const TIER_LABEL = { personal: 'Personal', group: 'Group', university: 'University' };

function ChallengeCard({ challenge, me, onJoin, onLog }) {
  const mine = (challenge.participants || []).find(row => row.user_id === me?.id);
  const pct = mine ? Math.min(100, Math.round((mine.progress / Math.max(1, challenge.goal_value)) * 100)) : 0;
  return (
    <div className="card challenge-card">
      <div className="card-head">
        <div><span className="eyebrow">{TIER_LABEL[challenge.tier] || challenge.tier}</span><h2>{challenge.title}</h2></div>
        <span className="pointspill small"><Coins size={12} />{challenge.points_reward}</span>
      </div>
      {challenge.description && <p className="muted-text">{challenge.description}</p>}
      <div className="challenge-goal"><Target size={14} /><span>Goal: {challenge.goal_value} {challenge.goal_type}</span></div>
      {mine ? (
        <>
          <div className="progress-track"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
          <div className="challenge-actions">
            <small>{mine.progress}/{challenge.goal_value} {mine.completed ? '· Completed 🎉' : ''}</small>
            {!mine.completed && <button className="ghost compact" onClick={() => onLog(challenge.id)}>Log +1</button>}
          </div>
        </>
      ) : <button className="primary compact wide" onClick={() => onJoin(challenge.id)}>Join challenge</button>}
    </div>
  );
}

function CreateChallengeModal({ me, groupsList, onClose, onDone }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tier, setTier] = useState('personal');
  const [groupId, setGroupId] = useState(groupsList[0]?.id || '');
  const [goalType, setGoalType] = useState('workouts');
  const [goalValue, setGoalValue] = useState(5);
  const [msg, setMsg] = useState('');

  const create = async () => {
    try {
      const created = await challenges.create({
        title,
        description,
        tier,
        groupId: tier === 'group' ? groupId : null,
        goalType,
        goalValue: Number(goalValue)
      });
      await challenges.join(created.id);
      await onDone();
      onClose();
    } catch (error) {
      setMsg(errorText(error));
    }
  };

  return (
    <Overlay onClose={onClose}>
      <div className="modal-title"><span className="eyebrow">CHALLENGES</span><h1>Create a challenge</h1></div>
      <input value={title} onChange={event => setTitle(event.target.value)} placeholder="Challenge title" />
      <input value={description} onChange={event => setDescription(event.target.value)} placeholder="Description (optional)" />
      <label className="field-label">Visibility</label>
      <select value={tier} onChange={event => setTier(event.target.value)}>
        <option value="personal">Personal — just me</option>
        <option value="group" disabled={!groupsList.length}>Group — my group</option>
        <option value="university" disabled={!me?.university_verified}>University — verified profiles only to create</option>
      </select>
      {tier === 'group' && (
        <select value={groupId} onChange={event => setGroupId(event.target.value)}>
          {groupsList.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
        </select>
      )}
      <div className="two-col">
        <div>
          <label className="field-label">Goal type</label>
          <select value={goalType} onChange={event => setGoalType(event.target.value)}>
            <option value="workouts">Workouts</option><option value="steps">Steps</option><option value="minutes">Minutes</option><option value="streak">Streak days</option>
          </select>
        </div>
        <div><label className="field-label">Goal value</label><input type="number" min="1" value={goalValue} onChange={event => setGoalValue(event.target.value)} /></div>
      </div>
      <p className="muted-text">Reward points are calculated server-side from the tier and goal. A daily completion cap prevents self-minted points.</p>
      <button className="primary wide" disabled={!title.trim() || (tier === 'group' && !groupId)} onClick={create}>Create challenge</button>
      {msg && <div className="notice">{msg}</div>}
    </Overlay>
  );
}

function ShopItemCard({ item, balance, onRedeem }) {
  const affordable = balance >= item.cost_points;
  return (
    <div className="card shop-card">
      <div className="shopicon"><Gift size={22} /></div>
      <div className="shop-info"><b>{item.name}</b><small>{item.description}</small><span className="pointspill"><Coins size={14} />{item.cost_points}</span></div>
      <button className="primary compact" disabled={!affordable} onClick={() => onRedeem(item.id)}>{affordable ? 'Redeem' : 'Need more points'}</button>
    </div>
  );
}

function RewardsTab({ me, groupsList, reload }) {
  const [sub, setSub] = useState('challenges');
  const [list, setList] = useState([]);
  const [items, setItems] = useState([]);
  const [redemptions, setRedemptions] = useState([]);
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState('');

  const loadChallenges = async () => {
    try { setList(await challenges.list()); } catch (error) { setMsg(errorText(error)); }
  };
  const loadShop = async () => {
    try {
      setItems(await shop.list());
      setRedemptions(await shop.myRedemptions());
    } catch (error) { setMsg(errorText(error)); }
  };

  useEffect(() => { loadChallenges(); loadShop(); }, []);

  const join = async id => {
    try { await challenges.join(id); await loadChallenges(); } catch (error) { setMsg(errorText(error)); }
  };
  const log = async id => {
    try { await challenges.logProgress(id); await loadChallenges(); await reload?.(); } catch (error) { setMsg(errorText(error)); }
  };
  const redeem = async id => {
    try {
      const redemption = await shop.redeem(id);
      setMsg(`Redeemed. Code: ${redemption.redemption_code}`);
      await loadShop();
      await reload?.();
    } catch (error) { setMsg(errorText(error)); }
  };

  return (
    <div className="rewards-panel">
      <div className="page-title"><div><span className="eyebrow">REWARDS</span><h1>Challenges & Shop</h1></div><PointsPill value={me?.points_balance} /></div>
      <div className="subtabs">
        <button className={sub === 'challenges' ? 'active' : ''} onClick={() => setSub('challenges')}><Trophy />Challenges</button>
        <button className={sub === 'shop' ? 'active' : ''} onClick={() => setSub('shop')}><ShoppingBag />Shop</button>
      </div>
      {sub === 'challenges' ? (
        <>
          <div className="section-actions"><h2>Active challenges</h2><button className="ghost" onClick={() => setCreating(true)}>New challenge</button></div>
          {list.map(challenge => <ChallengeCard key={challenge.id} challenge={challenge} me={me} onJoin={join} onLog={log} />)}
          {!list.length && <div className="empty">No challenges yet.</div>}
        </>
      ) : (
        <>
          <div className="section-actions"><h2>Spend your points</h2></div>
          {items.map(item => <ShopItemCard key={item.id} item={item} balance={me?.points_balance || 0} onRedeem={redeem} />)}
          {redemptions.length > 0 && (
            <><h3>My redemptions</h3>{redemptions.map(redemption => <div className="result" key={redemption.id}><div><b>{redemption.item?.name}</b><small>Code · {redemption.redemption_code}</small></div></div>)}</>
          )}
        </>
      )}
      {msg && <div className="notice">{msg}</div>}
      {creating && <CreateChallengeModal me={me} groupsList={groupsList} onClose={() => setCreating(false)} onDone={loadChallenges} />}
    </div>
  );
}

function SettingsModal({ me, onClose, onSaved }) {
  const [name, setName] = useState(me?.display_name || '');
  const [uni, setUni] = useState(me?.university || '');
  const [sources, setSources] = useState([]);
  const [calName, setCalName] = useState('');
  const [url, setUrl] = useState('');
  const [wear, setWear] = useState(null);
  const [stravaConnection, setStravaConnection] = useState(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const refreshConnections = async () => {
    const [calendarRows, simulated, stravaRow] = await Promise.all([
      calendars.list(),
      wearables.settings(),
      wearables.connection('strava')
    ]);
    setSources(calendarRows);
    setWear(simulated);
    setStravaConnection(stravaRow);
  };

  useEffect(() => {
    refreshConnections().catch(error => setMsg(errorText(error)));
  }, []);

  const save = async () => {
    try {
      await profile.updateMine({
        display_name: name,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
      });
      await onSaved();
      setMsg('Profile saved.');
    } catch (error) { setMsg(errorText(error)); }
  };

  const requestVerification = async () => {
    setBusy(true);
    try {
      await profile.requestUniversityVerification(uni);
      await onSaved();
      setMsg('University verification requested. Verified status cannot be self-assigned.');
    } catch (error) { setMsg(errorText(error)); }
    finally { setBusy(false); }
  };

  const addCalendar = async () => {
    try {
      const source = await calendars.add({ name: calName, url, provider: 'custom' });
      setSources(rows => [source, ...rows]);
      setCalName('');
      setUrl('');
      setMsg('Calendar connected. Use Sync to import events.');
    } catch (error) { setMsg(errorText(error)); }
  };

  return (
    <Overlay onClose={onClose}>
      <div className="modal-title"><span className="eyebrow">SETTINGS</span><h1>Connections</h1></div>

      <section className="setting">
        <h3>University verification</h3>
        <p>Optional. Your university is not required at signup. Verified status is read-only and must be granted by a real verification workflow or admin.</p>
        <input value={uni} onChange={event => setUni(event.target.value)} placeholder="University" />
        <div className="connection">
          <span>
            <b>{me?.university_verified ? 'Verified' : me?.university_verification_requested_at ? 'Verification pending' : 'Not verified'}</b>
            <small>{me?.university || 'No university on file'}</small>
          </span>
          <span className={`pill ${me?.university_verified ? 'success' : ''}`}>{me?.university_verified ? 'VERIFIED' : 'OPTIONAL'}</span>
        </div>
        <button className="ghost wide" disabled={busy || !uni.trim()} onClick={requestVerification}>{me?.university_verification_requested_at ? 'Request verification again' : 'Request verification'}</button>
      </section>

      <section className="setting">
        <h3>External calendar</h3>
        <p>Paste a secret .ics / webcal URL. The URL is treated as private. Recurring events are imported as their first occurrence only in V1.</p>
        <input value={calName} onChange={event => setCalName(event.target.value)} placeholder="Calendar name" />
        <input value={url} onChange={event => setUrl(event.target.value)} placeholder="https://…/calendar.ics" />
        <button className="primary" disabled={!url.trim()} onClick={addCalendar}>Connect calendar</button>
        {sources.map(source => (
          <div className="connection" key={source.id}>
            <span><b>{source.name}</b><small>{source.last_synced_at ? `Last synced ${new Date(source.last_synced_at).toLocaleString()}` : 'Not synced yet'}</small></span>
            <button onClick={async () => {
              try {
                const response = await calendars.sync(source.id);
                setMsg(`Imported ${response.imported} event${response.imported === 1 ? '' : 's'}.`);
                await refreshConnections();
                await onSaved();
              } catch (error) { setMsg(errorText(error)); }
            }}>Sync</button>
            <button aria-label="Remove calendar" onClick={async () => {
              try {
                await calendars.remove(source.id);
                setSources(rows => rows.filter(row => row.id !== source.id));
                await onSaved();
              } catch (error) { setMsg(errorText(error)); }
            }}><X /></button>
          </div>
        ))}
      </section>

      <section className="setting">
        <h3>Fitness & wearables</h3>
        <p>Simulated Health is clearly labeled for web/PWA use. Strava OAuth tokens stay server-side and are not readable by the browser role.</p>
        <button className="connection" onClick={async () => {
          try {
            const next = await wearables.save({ provider: 'simulated', enabled: !wear?.enabled });
            setWear(next);
            await onSaved();
          } catch (error) { setMsg(errorText(error)); }
        }}>
          <span><b>Simulated Health</b><small>{wear?.enabled ? 'On · updates on Home' : 'Off'}</small></span>
          <span className="pill">{wear?.enabled ? 'ON' : 'OFF'}</span>
        </button>
        <div className="connection">
          <span><b>Strava</b><small>{stravaConnection?.enabled ? `Connected${stravaConnection.last_synced_at ? ` · synced ${new Date(stravaConnection.last_synced_at).toLocaleString()}` : ''}` : 'Not connected'}</small></span>
          <span className="pill">{stravaConnection?.enabled ? 'CONNECTED' : 'OFF'}</span>
        </div>
        <button className="ghost wide" onClick={() => { try { strava.startOAuth(); } catch (error) { setMsg(errorText(error)); } }}>{stravaConnection?.enabled ? 'Reconnect Strava' : 'Connect Strava'}</button>
        <button className="ghost wide" disabled={!stravaConnection?.enabled} onClick={async () => {
          try {
            const response = await strava.syncNow();
            setMsg(`Strava sync complete. ${response.recordedActivities || 0} new verified activit${response.recordedActivities === 1 ? 'y' : 'ies'} recorded.`);
            await refreshConnections();
            await onSaved();
          } catch (error) { setMsg(errorText(error)); }
        }}>Sync Strava now</button>
      </section>

      <section className="setting">
        <h3>Account</h3>
        <input value={name} onChange={event => setName(event.target.value)} placeholder="Display name" />
        <button className="primary" onClick={save}>Save changes</button>
        <button className="ghost wide" onClick={() => auth.signOut()}>Sign out</button>
      </section>
      {msg && <div className="notice">{msg}</div>}
    </Overlay>
  );
}

function Profile({ me, groupsList, health, wearable, reload, onClose }) {
  const [section, setSection] = useState('overview');
  return (
    <Overlay onClose={onClose}>
      <div className="profile-top"><Avatar p={me} size="large" /><h1>{me?.display_name || 'Member'}</h1><p>{me?.university || 'University not added'}</p></div>
      <div className="stats">
        <div><strong>{activeStreak(me)}</strong><span>streak</span></div>
        <div><strong>{me?.longest_streak || 0}</strong><span>best streak</span></div>
        <div><strong>{Number(me?.points_balance || 0).toLocaleString()}</strong><span>points</span></div>
      </div>
      <div className="code-box"><span>Your Friend Code</span><b>{me?.friend_code || 'Generating…'}</b><button onClick={() => navigator.clipboard?.writeText(me?.friend_code || '')} aria-label="Copy friend code"><Copy /></button></div>
      <div className="subtabs profile-tabs">
        <button className={section === 'overview' ? 'active' : ''} onClick={() => setSection('overview')}><UserCircle />Profile</button>
        <button className={section === 'rewards' ? 'active' : ''} onClick={() => setSection('rewards')}><Trophy />Rewards</button>
      </div>
      {section === 'overview' ? (
        <>
          <section className="setting">
            <h3>Private health metrics</h3>
            <p>These simulated metrics are displayed only inside your signed-in profile and Home experience.</p>
            <div className="health-grid">
              <Metric icon={<Footprints />} label="Steps" value={health.steps.toLocaleString()} />
              <Metric icon={<Heart />} label="BPM" value={health.bpm} />
              <Metric icon={<Zap />} label="Calories" value={health.calories} />
            </div>
            <small className="muted-text">Source: {wearable?.enabled ? 'Simulated Health' : 'Simulation off'}</small>
          </section>
          <section className="setting">
            <h3>Rewards & progress</h3>
            <p>Challenges, points and the shop live inside Profile so the main app stays focused on the four primary tabs.</p>
            <button className="primary wide" onClick={() => setSection('rewards')}>Open Challenges & Shop</button>
            <button className="ghost wide" onClick={() => { onClose?.(); window.dispatchEvent(new CustomEvent('open-fitness')); }}>Open Fitness Center</button>
          </section>
        </>
      ) : <RewardsTab me={me} groupsList={groupsList} reload={reload} />}
    </Overlay>
  );
}

function Chat({ target, onClose, onConversationReady, onRead }) {
  const [items, setItems] = useState([]);
  const [text, setText] = useState('');
  const [conv, setConv] = useState(null);
  const [error, setError] = useState('');

  const addUnique = row => setItems(current => current.some(item => item.id === row.id) ? current : [...current, row]);

  useEffect(() => {
    let channel;
    let alive = true;
    (async () => {
      try {
        const conversation = target.kind === 'group'
          ? await conversations.group(target.id)
          : await conversations.directWith(target.id);
        if (!conversation?.id) throw new Error('Conversation could not be opened.');
        if (!alive) return;
        setConv(conversation);
        onConversationReady?.(conversation.id);
        setItems(await messages.list(conversation.id));
        await messages.markRead(conversation.id);
        onRead?.(conversation.id);
        channel = messages.subscribe(conversation.id, async row => {
          const sender = await profile.byId(row.sender_id).catch(() => null);
          if (!alive) return;
          addUnique({ ...row, sender });
          if (row.sender_id !== target.currentUser) {
            messages.markRead(conversation.id).then(() => onRead?.(conversation.id)).catch(() => {});
          }
        });
      } catch (err) {
        if (alive) setError(errorText(err));
      }
    })();
    return () => {
      alive = false;
      messages.unsubscribe(channel);
    };
  }, [target.id, target.kind]);

  const send = async () => {
    if (!text.trim() || !conv) return;
    try {
      const created = await messages.send(conv.id, text);
      const sender = await profile.mine();
      addUnique({ ...created, sender });
      setText('');
    } catch (err) { setError(errorText(err)); }
  };

  return (
    <Overlay onClose={onClose}>
      <div className="chat-head"><div><span className="eyebrow">{target.kind === 'group' ? 'GROUP CHAT' : 'DIRECT MESSAGE'}</span><h1>{target.name}</h1></div></div>
      {error && <div className="notice">{error}</div>}
      <div className="chat-log">
        {items.map(message => (
          <div className={`bubble ${message.sender_id === target.currentUser ? 'mine' : ''}`} key={message.id}>
            <b>{message.sender?.display_name || 'Member'}</b><p>{message.content}</p><small>{time(message.created_at)}</small>
          </div>
        ))}
        {!items.length && !error && <div className="empty">No messages yet.</div>}
      </div>
      <div className="chat-compose"><input value={text} onChange={event => setText(event.target.value)} placeholder="Message…" onKeyDown={event => event.key === 'Enter' && send()} /><button onClick={send} disabled={!conv || !text.trim()} aria-label="Send"><Send /></button></div>
    </Overlay>
  );
}

function Fab({ onAction }) {
  const [open, setOpen] = useState(false);
  const choose = action => { setOpen(false); onAction(action); };
  return (
    <div className="fab-wrap">
      {open && (
        <div className="fab-menu">
          <button onClick={() => choose('workout')}><Dumbbell />Log Workout</button>
          <button onClick={() => choose('post')}><ImageIcon />Post Update</button>
          <button onClick={() => choose('group')}><Users />Create Group</button>
          <button onClick={() => choose('friend')}><UserPlus />Add Friend</button>
        </div>
      )}
      <button className={`fab ${open ? 'open' : ''}`} onClick={() => setOpen(value => !value)} aria-label="Quick actions">{open ? <X /> : <Plus />}</button>
    </div>
  );
}

function FriendModal({ onClose, onDone }) {
  const [code, setCode] = useState('');
  const [found, setFound] = useState(null);
  const [requests, setRequests] = useState([]);
  const [msg, setMsg] = useState('');

  useEffect(() => { friends.requests().then(setRequests).catch(() => {}); }, []);

  const find = async () => {
    try { setFound(await friends.byCode(code)); setMsg(''); }
    catch { setFound(null); setMsg('No member found for that code.'); }
  };
  const send = async () => {
    try { await friends.send(found.id); setMsg('Friend request sent.'); }
    catch (error) { setMsg(errorText(error)); }
  };

  return (
    <Overlay onClose={onClose}>
      <div className="modal-title"><span className="eyebrow">FRIENDS</span><h1>Add by Friend Code</h1></div>
      <div className="code-input"><input value={code} onChange={event => setCode(event.target.value.toUpperCase())} placeholder="PLOY-4X9K" /><button className="primary" onClick={find}>Find</button></div>
      {found && <div className="result"><Avatar p={found} /><div><b>{found.display_name}</b><small>{found.friend_code}</small></div><button className="primary" onClick={send}>Add</button></div>}
      <h3>Pending invitations</h3>
      {requests.map(request => (
        <div className="result" key={request.id}>
          <Avatar p={request.requester} />
          <div><b>{request.requester?.display_name}</b><small>Friend request</small></div>
          <button aria-label="Accept" onClick={async () => {
            try {
              await friends.respond(request.id, 'accepted');
              setRequests(rows => rows.filter(row => row.id !== request.id));
              await onDone();
            } catch (error) { setMsg(errorText(error)); }
          }}><Check /></button>
          <button aria-label="Decline" onClick={async () => {
            try {
              await friends.respond(request.id, 'declined');
              setRequests(rows => rows.filter(row => row.id !== request.id));
              await onDone();
            } catch (error) { setMsg(errorText(error)); }
          }}><X /></button>
        </div>
      ))}
      {!requests.length && <div className="empty">No pending invitations.</div>}
      {msg && <div className="notice">{msg}</div>}
    </Overlay>
  );
}

function GroupModal({ friendsList, onClose, onDone }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [members, setMembers] = useState([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <Overlay onClose={onClose}>
      <div className="modal-title"><span className="eyebrow">GROUPS</span><h1>Create a group</h1></div>
      <input value={name} onChange={event => setName(event.target.value)} placeholder="Group name" />
      <input value={description} onChange={event => setDescription(event.target.value)} placeholder="Description (optional)" />
      <div className="picker">
        {friendsList.map(row => row.friend && (
          <label key={row.friend.id}>
            <input type="checkbox" checked={members.includes(row.friend.id)} onChange={event => setMembers(event.target.checked ? [...members, row.friend.id] : members.filter(id => id !== row.friend.id))} />
            <Avatar p={row.friend} /><span>{row.friend.display_name}</span>
          </label>
        ))}
      </div>
      <button className="primary wide" disabled={busy || !name.trim()} onClick={async () => {
        setBusy(true);
        try {
          await groups.create({ name, description, memberIds: members });
          await onDone();
          onClose();
        } catch (error) { setMsg(errorText(error)); }
        finally { setBusy(false); }
      }}>{busy ? 'Creating…' : 'Create group'}</button>
      {msg && <div className="notice">{msg}</div>}
    </Overlay>
  );
}

function JoinModal({ onClose, onDone }) {
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  return (
    <Overlay onClose={onClose}>
      <div className="modal-title"><span className="eyebrow">GROUPS</span><h1>Join with code</h1></div>
      <input value={code} onChange={event => setCode(event.target.value.toUpperCase())} placeholder="FITNESS-8K2Q" />
      <button className="primary wide" disabled={!code.trim()} onClick={async () => {
        try { await groups.joinByCode(code); await onDone(); onClose(); }
        catch (error) { setMsg(errorText(error)); }
      }}>Join group</button>
      {msg && <div className="notice">{msg}</div>}
    </Overlay>
  );
}

function PostModal({ onClose, onDone }) {
  const [textValue, setTextValue] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  return (
    <Overlay onClose={onClose}>
      <div className="modal-title"><span className="eyebrow">COMMUNITY</span><h1>Post an update</h1></div>
      <textarea value={textValue} onChange={event => setTextValue(event.target.value)} placeholder="Share your workout, win or motivation…" />
      <input type="file" accept="image/*" onChange={event => setFile(event.target.files?.[0] || null)} />
      <p className="muted-text">Posting an update does not count as a logged workout. Use Log Workout for self-reported activity points.</p>
      <button className="primary wide" disabled={busy || (!textValue.trim() && !file)} onClick={async () => {
        setBusy(true);
        try {
          const imageUrl = file ? await uploadPostImage(file) : null;
          await posts.create({ content: textValue, imageUrl });
          await onDone();
          onClose();
        } catch (error) { setMsg(errorText(error)); }
        finally { setBusy(false); }
      }}>{busy ? 'Posting…' : 'Publish'}</button>
      {msg && <div className="notice">{msg}</div>}
    </Overlay>
  );
}


function FitnessModal({ me, onClose, onRefresh }) {
  const [section, setSection] = useState('today');
  const [nutrition, setNutrition] = useState({ protein_g: 120, carbs_g: 180, fat_g: 60, calories: 2000, water_ml: 2000 });
  const [achievements, setAchievements] = useState([]);
  const [fp, setFp] = useState(null);
  const [exercises, setExercises] = useState([]);
  const [history, setHistory] = useState([]);
  const [records, setRecords] = useState([]);
  const [loadRows, setLoadRows] = useState([]);
  const [readiness, setReadiness] = useState(null);
  const [recovery, setRecovery] = useState({ sleep_hours: 7, sleep_quality: 7, soreness: 3, stress: 3, energy: 7 });
  const [workout, setWorkout] = useState(null);
  const [workoutExercises, setWorkoutExercises] = useState([]);
  const [search, setSearch] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const loadFitness = async () => {
    try {
      const [profileRow, exRows, historyRows, recordRows, loadData, readinessData] = await Promise.all([
        fitness.profile(), fitness.exercises(), fitness.history(), fitness.records(), fitness.load(), fitness.readiness()
      ]);
      setFp(profileRow); setExercises(exRows); setHistory(historyRows); setRecords(recordRows); setLoadRows(loadData); setReadiness(readinessData); setAchievements(await fitness.achievements());
    } catch (e) { setMsg(errorText(e)); }
  };
  useEffect(() => { loadFitness(); }, []);

  const start = async () => {
    setBusy(true);
    try {
      const w = await fitness.startWorkout({ title: fp?.preferred_training === 'cardio' ? 'Cardio Session' : 'Strength Session' });
      setWorkout(w); setWorkoutExercises([]); setSection('log');
    } catch (e) { setMsg(errorText(e)); } finally { setBusy(false); }
  };
  const addExercise = async ex => {
    if (!workout) return;
    try {
      const row = await fitness.addExercise({ workoutId: workout.id, exerciseId: ex.id, position: workoutExercises.length });
      setWorkoutExercises(v => [...v, { ...row, exercise: ex, sets: [] }]);
    } catch (e) { setMsg(errorText(e)); }
  };
  const addSet = async item => {
    const next = item.sets.length + 1;
    const reps = Number(item.reps || (item.exercise.is_time_based ? 30 : 8));
    const weight = item.weight === '' || item.weight == null ? null : Number(item.weight);
    const rpe = item.rpe === '' || item.rpe == null ? null : Number(item.rpe);
    try {
      const row = await fitness.addSet({ workoutExerciseId: item.id, setNumber: next, reps, weight, rpe, durationSeconds: item.exercise.is_time_based ? reps : null });
      setWorkoutExercises(v => v.map(x => x.id === item.id ? { ...x, sets: [...x.sets, row], reps: '', weight: '', rpe: '' } : x));
    } catch (e) { setMsg(errorText(e)); }
  };
  const finish = async () => {
    if (!workout) return;
    setBusy(true);
    try {
      const result = await fitness.completeWorkout(workout.id);
      setMsg(`Workout complete · ${Number(result?.volume || 0).toLocaleString()} volume · ${result?.sets || 0} sets`);
      setWorkout(null); setWorkoutExercises([]); await loadFitness(); await onRefresh?.(); setSection('today');
    } catch (e) { setMsg(errorText(e)); } finally { setBusy(false); }
  };
  const saveRecovery = async () => {
    try { await fitness.recovery(recovery); const r = await fitness.readiness(); setReadiness(r); setMsg('Recovery check-in saved.'); } catch (e) { setMsg(errorText(e)); }
  };
  const filtered = exercises.filter(x => !search || x.name.toLowerCase().includes(search.toLowerCase()));
  const weeklyVolume = loadRows.reduce((sum, x) => sum + Number(x.volume || 0), 0);
  const weeklySessions = loadRows.reduce((sum, x) => sum + Number(x.sessions || 0), 0);

  return <Overlay onClose={onClose}>
    <div className="modal-title"><span className="eyebrow">FITNESS ENGINE</span><h1>{workout ? workout.title : 'Your Fitness'}</h1><p>Train, recover, track progress and build consistency.</p></div>
    {!workout && <div className="subtabs profile-tabs">
      {['today','plans','progress','recovery','wellness','history'].map(x => <button key={x} className={section===x?'active':''} onClick={()=>setSection(x)}>{x[0].toUpperCase()+x.slice(1)}</button>)}
    </div>}
    {workout ? <>
      <div className="health-grid"><Metric icon={<Dumbbell/>} label="Exercises" value={workoutExercises.length}/><Metric icon={<Target/>} label="Sets" value={workoutExercises.reduce((a,x)=>a+x.sets.length,0)}/><Metric icon={<Zap/>} label="Mode" value={fp?.preferred_training || 'strength'}/></div>
      <div className="setting"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Add an exercise…"/><div className="chips">{filtered.slice(0,8).map(ex=><button className="chip" key={ex.id} onClick={()=>addExercise(ex)}>{ex.name}</button>)}</div></div>
      {workoutExercises.map(item=><div className="card" key={item.id} style={{marginTop:12,padding:14}}><div style={{display:'flex',justifyContent:'space-between',gap:10}}><b>{item.exercise.name}</b><span className="muted-text">{item.sets.length} sets</span></div>{item.sets.map((s,i)=><div className="muted-text" key={s.id}>Set {i+1}: {s.reps ?? '—'} reps {s.weight != null ? `× ${s.weight} ${fp?.unit || 'kg'}` : ''}{s.rpe != null ? ` · RPE ${s.rpe}` : ''}</div>)}<div className="inlineform"><input placeholder="Reps" type="number" onChange={e=>setWorkoutExercises(v=>v.map(x=>x.id===item.id?{...x,reps:e.target.value}:x))}/><input placeholder={fp?.unit==='lb'?'Weight lb':'Weight kg'} type="number" step="0.5" onChange={e=>setWorkoutExercises(v=>v.map(x=>x.id===item.id?{...x,weight:e.target.value}:x))}/><input placeholder="RPE" type="number" min="1" max="10" step="0.5" onChange={e=>setWorkoutExercises(v=>v.map(x=>x.id===item.id?{...x,rpe:e.target.value}:x))}/><button className="secondary" onClick={()=>addSet(item)}>Add set</button></div></div>)}
      <button className="primary wide" disabled={busy || !workoutExercises.length} onClick={finish}>{busy?'Finishing…':'Finish workout'}</button>
    </> : section==='today' ? <>
      <div className="health-grid"><Metric icon={<Zap/>} label="Readiness" value={readiness?.score ?? '—'} unit="/100"/><Metric icon={<Dumbbell/>} label="7d sessions" value={weeklySessions}/><Metric icon={<Flame/>} label="7d volume" value={Math.round(weeklyVolume).toLocaleString()}/></div>
      <section className="setting"><h3>{readiness?.recommendation || 'Ready'}</h3><p className="muted-text">{readiness?.recommendation==='Recover'?'Prioritize recovery today.':readiness?.recommendation==='Pace Yourself'?'Keep intensity controlled and focus on quality.':'You can train with intent today.'}</p><button className="primary wide" onClick={start}>{busy?'Starting…':'Start workout'}</button></section>
      <section className="setting"><h3>Fitness profile</h3><div className="health-grid"><label>Goal<select value={fp?.goal||'general_fitness'} onChange={e=>setFp({...fp,goal:e.target.value})}><option value="general_fitness">General fitness</option><option value="strength">Strength</option><option value="muscle">Muscle gain</option><option value="endurance">Endurance</option></select></label><label>Experience<select value={fp?.experience||'beginner'} onChange={e=>setFp({...fp,experience:e.target.value})}><option>beginner</option><option>intermediate</option><option>advanced</option></select></label><label>Days/week<input type="number" min="1" max="7" value={fp?.training_days||3} onChange={e=>setFp({...fp,training_days:e.target.value})}/></label><label>Session minutes<input type="number" min="15" max="180" value={fp?.session_minutes||45} onChange={e=>setFp({...fp,session_minutes:e.target.value})}/></label></div><button className="ghost wide" onClick={async()=>{try{await fitness.saveProfile(fp||{});setMsg('Fitness profile saved.')}catch(e){setMsg(errorText(e))}}}>Save fitness profile</button></section>
    </> : section==='plans' ? <PlanBuilder profile={fp} onSaved={loadFitness}/> : section==='progress' ? <>
      <section className="setting"><h3>Performance</h3><div className="health-grid"><Metric icon={<Flame/>} label="Sessions" value={weeklySessions}/><Metric icon={<Dumbbell/>} label="Volume" value={Math.round(weeklyVolume).toLocaleString()}/><Metric icon={<Trophy/>} label="PRs" value={records.length}/></div></section>
      <section className="setting"><h3>Personal records</h3>{records.length ? records.slice(0,12).map(r=><div className="connection" key={r.id}><span><b>{r.exercise?.name || 'Exercise'}</b><small>{r.record_type.replaceAll('_',' ')}</small></span><strong>{Math.round(Number(r.value))}</strong></div>) : <p className="muted-text">Your first PR will appear here after you train.</p>}</section>
      <section className="setting"><h3>Training load</h3>{loadRows.slice(-14).map(r=><div className="connection" key={r.date}><span>{r.date}</span><span>{Math.round(Number(r.load))} load · {Math.round(Number(r.volume))} volume</span></div>)}</section>
    </> : section==='recovery' ? <>
      <section className="setting"><h3>Daily recovery check-in</h3><div className="health-grid"><label>Sleep quality<input type="number" min="1" max="10" value={recovery.sleep_quality} onChange={e=>setRecovery({...recovery,sleep_quality:e.target.value})}/></label><label>Energy<input type="number" min="1" max="10" value={recovery.energy} onChange={e=>setRecovery({...recovery,energy:e.target.value})}/></label><label>Soreness<input type="number" min="1" max="10" value={recovery.soreness} onChange={e=>setRecovery({...recovery,soreness:e.target.value})}/></label><label>Stress<input type="number" min="1" max="10" value={recovery.stress} onChange={e=>setRecovery({...recovery,stress:e.target.value})}/></label></div><button className="primary wide" onClick={saveRecovery}>Save recovery</button></section>
      <section className="setting"><h3>Readiness</h3><p className="muted-text">{readiness?.score ?? '—'}/100 · {readiness?.recommendation || 'Complete a check-in'}</p></section>
    </> : section==='wellness' ? <>
      <section className="setting"><h3>Nutrition & hydration</h3><div className="health-grid"><label>Protein g<input type="number" value={nutrition.protein_g} onChange={e=>setNutrition({...nutrition,protein_g:e.target.value})}/></label><label>Carbs g<input type="number" value={nutrition.carbs_g} onChange={e=>setNutrition({...nutrition,carbs_g:e.target.value})}/></label><label>Fat g<input type="number" value={nutrition.fat_g} onChange={e=>setNutrition({...nutrition,fat_g:e.target.value})}/></label><label>Calories<input type="number" value={nutrition.calories} onChange={e=>setNutrition({...nutrition,calories:e.target.value})}/></label><label>Water ml<input type="number" value={nutrition.water_ml} onChange={e=>setNutrition({...nutrition,water_ml:e.target.value})}/></label></div><button className="primary wide" onClick={async()=>{try{await fitness.nutrition(nutrition);setMsg('Nutrition check-in saved.')}catch(e){setMsg(errorText(e))}}}>Save wellness</button></section>
      <section className="setting"><h3>Achievements</h3>{achievements.filter(a=>a.earned).map(a=><div className="connection" key={a.id}><span><b>{a.name}</b><small>{a.description}</small></span><strong>+{a.points}</strong></div>)}{!achievements.some(a=>a.earned)&&<p className="muted-text">Complete workouts to unlock achievements.</p>}</section>
    </> : <section className="setting"><h3>Workout history</h3>{history.length?history.map(w=><div className="connection" key={w.id}><span><b>{w.title}</b><small>{new Date(w.started_at).toLocaleString()}</small></span><span>{Math.round(Number(w.total_volume||0))} vol · {w.total_sets||0} sets</span></div>):<p className="muted-text">No completed workouts yet.</p>}</section>}
    {msg && <div className="notice">{msg}</div>}
  </Overlay>;
}

function PlanBuilder({ profile: fp, onSaved }) {
  const [name,setName]=useState('My Training Plan'); const [goal,setGoal]=useState(fp?.goal||'general_fitness'); const [msg,setMsg]=useState(''); const [busy,setBusy]=useState(false);
  const save=async()=>{setBusy(true);try{const plan=await fitness.createPlan({name,goal});for(const [weekday,title] of [[1,'Upper Body'],[3,'Lower Body'],[5,'Full Body']]) await fitness.addPlanWorkout({planId:plan.id,weekday,title,focus:goal});setMsg('3-day starter plan created.');onSaved?.();}catch(e){setMsg(errorText(e));}finally{setBusy(false)}};
  return <section className="setting"><h3>Build a training plan</h3><input value={name} onChange={e=>setName(e.target.value)} placeholder="Plan name"/><select value={goal} onChange={e=>setGoal(e.target.value)}><option value="strength">Strength</option><option value="muscle">Muscle gain</option><option value="general_fitness">General fitness</option><option value="endurance">Endurance</option></select><p className="muted-text">Creates a simple progressive weekly structure you can refine as the workout engine learns your performance.</p><button className="primary wide" disabled={busy||!name.trim()} onClick={save}>{busy?'Creating…':'Create 3-day plan'}</button>{msg&&<div className="notice">{msg}</div>}</section>;
}

function App() {
  const [authReady, setAuthReady] = useState(false);
  const [session, setSession] = useState(null);
  const [me, setMe] = useState(null);
  const [tab, setTab] = useState('home');
  const [overlay, setOverlay] = useState(null);
  const [feed, setFeed] = useState([]);
  const [groupsList, setGroupsList] = useState([]);
  const [friendsList, setFriendsList] = useState([]);
  const [chatList, setChatList] = useState([]);
  const [calSources, setCalSources] = useState([]);
  const [scheduleItems, setScheduleItems] = useState([]);
  const [pendingRequests, setPendingRequests] = useState(0);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [health, setHealth] = useState({ steps: 6842, bpm: 72, calories: 412 });
  const [wearable, setWearable] = useState(null);
  const [readiness, setReadiness] = useState(null);
  const [chat, setChat] = useState(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true);
      setSession(null);
      return undefined;
    }
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (alive) { setSession(data.session || null); setAuthReady(true); }
    })();
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!alive) return;
      setSession(nextSession || null);
      if (!nextSession) setMe(null);
    });
    return () => { alive = false; data.subscription.unsubscribe(); };
  }, []);

  const load = async () => {
    if (!session) return false;
    try {
      let current = await profile.mine();
      if (!current) throw new Error('Your profile could not be loaded.');
      const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      if (current.timezone !== browserTimezone) {
        current = await profile.updateMine({ timezone: browserTimezone }).catch(() => current);
      }

      const [postRows, groupRows, friendRows, conversationRows, calendarRows, eventRows, simulated, requestRows, unreadCounts, readinessData] = await Promise.all([
        posts.list(),
        groups.mine(),
        friends.list(),
        conversations.list(),
        calendars.list(),
        schedule.list(),
        wearables.settings(),
        friends.requests(),
        messages.unreadCounts(),
        fitness.readiness().catch(() => null)
      ]);

      setMe(current);
      setFeed(postRows);
      setGroupsList(groupRows);
      setFriendsList(friendRows);
      setCalSources(calendarRows);
      setScheduleItems(eventRows);
      let simulatedConnection = simulated;
      if (!simulatedConnection) {
        simulatedConnection = await wearables.save({ provider: 'simulated', enabled: true }).catch(() => ({ enabled: true, provider: 'simulated' }));
      }
      setWearable(simulatedConnection);
      setReadiness(readinessData);
      setPendingRequests(requestRows.length);
      setUnreadTotal(Object.values(unreadCounts).reduce((sum, value) => sum + value, 0));

      const chats = [];
      for (const conversation of conversationRows.filter(row => row.kind === 'direct')) {
        const memberRows = await conversations.members(conversation.id);
        const other = memberRows.find(member => member.id !== current.id);
        if (other) chats.push({
          id: other.id,
          conversationId: conversation.id,
          name: other.display_name,
          preview: 'Direct chat',
          kind: 'direct',
          unread: unreadCounts[conversation.id] || 0
        });
      }
      for (const conversation of conversationRows.filter(row => row.kind === 'group')) {
        const group = groupRows.find(item => item.id === conversation.group_id);
        if (group) chats.push({
          id: group.id,
          conversationId: conversation.id,
          name: group.name,
          preview: 'Group chat',
          kind: 'group',
          unread: unreadCounts[conversation.id] || 0
        });
      }
      setChatList(chats);
      return true;
    } catch (error) {
      setMe(null);
      try { await auth.signOut(); } catch {}
      setSession(null);
      setNotice(errorText(error));
      return false;
    }
  };

  useEffect(() => { const open = () => setOverlay('fitness'); window.addEventListener('open-fitness', open); return () => window.removeEventListener('open-fitness', open); }, []);

  useEffect(() => {
    if (!session) return;
    load();
    const params = new URLSearchParams(window.location.search);
    const stravaCode = params.get('strava_code');
    const stravaError = params.get('strava_error');
    if (stravaError) {
      setNotice(`Strava connection failed: ${stravaError.replaceAll('_', ' ')}`);
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }
    if (stravaCode) {
      // OAuth authorization codes are short-lived secrets; remove them from browser history immediately.
      window.history.replaceState({}, '', window.location.pathname);
      (async () => {
        try {
          const response = await fetch('/api/strava/exchange', {
            method: 'POST',
            headers: { 'content-type': 'application/json', Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify({ code: stravaCode })
          });
          if (!response.ok) throw new Error(await response.text());
          setNotice('Strava connected.');
          await load();
        } catch (error) { setNotice(errorText(error)); }
      })();
    }
  }, [session]);

  useEffect(() => {
    if (!me?.id) return undefined;
    const channel = messages.subscribeAll(row => {
      if (row.sender_id === me.id || row.conversation_id === activeConversationId) return;
      setUnreadTotal(value => value + 1);
      setChatList(list => list.map(item => item.conversationId === row.conversation_id ? { ...item, unread: (item.unread || 0) + 1 } : item));
    });
    return () => messages.unsubscribe(channel);
  }, [me?.id, activeConversationId]);

  const clearConversationUnread = conversationId => {
    if (!conversationId) return;
    setChatList(list => {
      const current = list.find(item => item.conversationId === conversationId);
      const amount = Number(current?.unread || 0);
      if (amount) setUnreadTotal(total => Math.max(0, total - amount));
      return list.map(item => item.conversationId === conversationId ? { ...item, unread: 0 } : item);
    });
  };

  useEffect(() => {
    if (!wearable?.enabled) return undefined;
    const timer = setInterval(() => {
      setHealth(current => ({
        steps: Math.max(0, current.steps + Math.floor(Math.random() * 121) - 30),
        bpm: Math.max(58, Math.min(105, current.bpm + Math.floor(Math.random() * 7) - 3)),
        calories: Math.max(0, current.calories + Math.floor(Math.random() * 9))
      }));
    }, 3500);
    return () => clearInterval(timer);
  }, [wearable?.enabled]);

  if (!authReady) {
    return <div className="auth"><div className="auth-card"><div className="logo"><span>F</span> Fit <b>Together</b></div><p>Checking your sign-in…</p></div></div>;
  }
  if (!session || !me) return <Auth />;

  const todayEvents = scheduleItems
    .filter(event => isToday(event.starts_at))
    .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  const nextToday = todayEvents.find(event => new Date(event.ends_at || event.starts_at).getTime() >= Date.now()) || todayEvents[0];
  const todayPlan = nextToday
    ? { title: nextToday.title, subtitle: nextToday.event_type === 'calendar' ? 'Calendar event' : 'Planned session', time: time(nextToday.starts_at), detail: nextToday.location || nextToday.event_type }
    : { title: 'Open workout slot', subtitle: 'Nothing scheduled yet', time: 'Choose a time', detail: 'Plan' };

  const action = async type => {
    if (type === 'post') setOverlay('post');
    if (type === 'friend') setOverlay('friend');
    if (type === 'group') setOverlay('group');
    if (type === 'workout') setOverlay('fitness');
  };

  return (
    <div className="app">
      <header>
        <button className="brand-btn" onClick={() => setTab('home')}><span>F</span><b>Fit Together</b></button>
        <div className="header-actions">
          <PointsPill value={me?.points_balance} />
          <StreakPill value={activeStreak(me)} />
          <button className="icon-btn" onClick={() => setOverlay('settings')} aria-label="Settings"><Settings /></button>
          <button className="avatar-btn" onClick={() => setOverlay('profile')} aria-label="Profile"><Avatar p={me} /></button>
        </div>
      </header>

      <main>
        {tab === 'home' && <HomeTab me={me} health={health} wearable={wearable} plan={todayPlan} readiness={readiness} openPlan={() => setTab('plan')} openSettings={() => setOverlay('settings')} openFitness={() => setOverlay('fitness')} />}
        {tab === 'plan' && <PlanTab scheduleItems={scheduleItems} setScheduleItems={setScheduleItems} calSources={calSources} groupsList={groupsList} me={me} />}
        {tab === 'social' && (
          <SocialTab
            groupsList={groupsList}
            chatList={chatList}
            friendsList={friendsList}
            onFriends={() => setOverlay('friend')}
            onOpenGroup={group => { setActiveConversationId(null); setChat({ kind: 'group', id: group.id, name: group.name, currentUser: me.id }); }}
            onOpenFriend={item => { setActiveConversationId(item.conversationId || null); setChat({ kind: item.kind || 'direct', id: item.id, name: item.name, currentUser: me.id }); }}
            onCreateGroup={() => setOverlay('group')}
            onJoinGroup={() => setOverlay('join')}
            onLeaveGroup={async group => {
              if (!window.confirm(`Leave ${group.name}? You will immediately lose access to its group chat.`)) return;
              try {
                await groups.leave(group.id);
                if (chat?.kind === 'group' && chat.id === group.id) setChat(null);
                await load();
                setNotice(`Left ${group.name}.`);
              } catch (error) { setNotice(errorText(error)); }
            }}
          />
        )}
        {tab === 'feed' && <FeedTab items={feed} reload={load} pendingCount={pendingRequests} onAddFriend={() => setOverlay('friend')} />}
      </main>

      <Fab onAction={action} />

      <nav>
        <button className={tab === 'home' ? 'active' : ''} onClick={() => setTab('home')}><Home /><span>Home</span></button>
        <button className={tab === 'plan' ? 'active' : ''} onClick={() => setTab('plan')}><CalendarDays /><span>Plan</span></button>
        <button className={`badged ${tab === 'social' ? 'active' : ''}`} onClick={() => setTab('social')}><Users /><span>Social</span><Badge value={unreadTotal} /></button>
        <button className={`badged ${tab === 'feed' ? 'active' : ''}`} onClick={() => setTab('feed')}><MessageSquare /><span>Feed</span><Badge value={pendingRequests} /></button>
      </nav>

      {notice && <div className="toast" onClick={() => setNotice('')}>{notice}</div>}
      {overlay === 'settings' && <SettingsModal me={me} onClose={() => setOverlay(null)} onSaved={load} />}
      {overlay === 'profile' && <Profile me={me} groupsList={groupsList} health={health} wearable={wearable} reload={load} onClose={() => setOverlay(null)} />}
      {overlay === 'friend' && <FriendModal onClose={() => setOverlay(null)} onDone={load} />}
      {overlay === 'group' && <GroupModal friendsList={friendsList} onClose={() => setOverlay(null)} onDone={load} />}
      {overlay === 'join' && <JoinModal onClose={() => setOverlay(null)} onDone={load} />}
      {overlay === 'fitness' && <FitnessModal me={me} onClose={() => setOverlay(null)} onRefresh={load} />}
      {overlay === 'post' && <PostModal onClose={() => setOverlay(null)} onDone={load} />}
      {chat && <Chat target={chat} onConversationReady={id => { setActiveConversationId(id); clearConversationUnread(id); }} onRead={clearConversationUnread} onClose={async () => { setActiveConversationId(null); setChat(null); await load(); }} />}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
