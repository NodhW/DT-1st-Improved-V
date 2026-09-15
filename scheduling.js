export function localDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function findBestSlot(events = [], durationMin = 45, windowStartHour = 6, windowEndHour = 22, baseDate = new Date()) {
  const base = new Date(baseDate); base.setHours(0,0,0,0);
  const dayStart = new Date(base); dayStart.setHours(windowStartHour,0,0,0);
  const dayEnd = new Date(base); dayEnd.setHours(windowEndHour,0,0,0);
  let cursor = dayStart;
  if (localDateKey(base) === localDateKey(new Date())) { const rounded = new Date(); rounded.setSeconds(0,0); rounded.setMinutes(Math.ceil(rounded.getMinutes()/15)*15); if (rounded > cursor) cursor = rounded; }
  const busy=(events||[]).map(event=>{ const start=new Date(event.starts_at ?? event.start ?? event[0]); const end=new Date(event.ends_at ?? event.end ?? event[1] ?? start.getTime()+30*60000); return [start,end]; }).filter(([a,b])=>!Number.isNaN(a.getTime())&&!Number.isNaN(b.getTime())).sort((a,b)=>a[0]-b[0]);
  for (const [start,end] of busy) { if (start-cursor >= durationMin*60000) return new Date(cursor); if (end>cursor) cursor=end; }
  if (dayEnd-cursor >= durationMin*60000) return new Date(cursor);
  const fallback=new Date(base); fallback.setHours(18,30,0,0); return fallback;
}
