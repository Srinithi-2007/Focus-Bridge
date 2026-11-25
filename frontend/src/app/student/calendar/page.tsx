'use client';

import { useMemo, useState } from 'react';
import { Alert, Badge, Card, EmptyState, PageHeader, Spinner } from '@/components/ui';
import { fmtDay, fmtTime } from '@/components/student/shared';
import { errorMessage, useWorkspaceData, workspaceRequest } from '@/lib/workspace/client';

interface Cal {
  range: { from: string; to: string };
  workBlocks: { id: string; title: string; start: string; end: string; done: boolean; taskId: string | null }[];
  deadlines: { id: string; title: string; deadline: string; submitted: boolean }[];
  activities: { id: string; title: string; startsAt: string; endsAt: string; status: string; location: string }[];
}

type View = 'week' | 'month';
const DAY = 86400000;

function startOfWeek(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const diff = (x.getDay() + 6) % 7; // Monday first
  x.setDate(x.getDate() - diff);
  return x;
}

export default function StudentCalendarPage() {
  const [view, setView] = useState<View>('week');
  const [anchor, setAnchor] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [error, setError] = useState('');

  // Window covers the visible view. Times are sent in UTC ISO strings.
  const window = useMemo(() => {
    if (view === 'week') {
      const s = startOfWeek(anchor);
      return { from: s, to: new Date(s.getTime() + 7 * DAY) };
    }
    const s = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const start = startOfWeek(s);
    return { from: start, to: new Date(start.getTime() + 42 * DAY) };
  }, [view, anchor]);

  const q = `from=${encodeURIComponent(window.from.toISOString())}&to=${encodeURIComponent(window.to.toISOString())}`;
  const cal = useWorkspaceData<Cal>(`/me/calendar?${q}`);

  function shift(n: number) {
    setAnchor(new Date(anchor.getTime() + n * (view === 'week' ? 7 : 31) * DAY));
    setSelectedDay(null);
  }

  async function toggle(id: string, done: boolean) {
    setError('');
    try {
      await workspaceRequest(`/me/calendar/events/${id}`, { method: 'PATCH', body: { done } });
      cal.reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  // Groups every item by local day key.
  const byDay = useMemo(() => {
    const map = new Map<string, { kind: 'block' | 'deadline' | 'activity'; id: string; title: string; time: string; done?: boolean; submitted?: boolean; onToggle?: boolean }[]>();
    const key = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
    const push = (iso: string, item: { kind: 'block' | 'deadline' | 'activity'; id: string; title: string; time: string; done?: boolean; submitted?: boolean; onToggle?: boolean }) => {
      const k = key(iso);
      map.set(k, [...(map.get(k) || []), item]);
    };
    for (const b of cal.data?.workBlocks || []) push(b.start, { kind: 'block', id: b.id, title: b.title, time: `${fmtTime(b.start)} – ${fmtTime(b.end)}`, done: b.done, onToggle: true });
    for (const d of cal.data?.deadlines || []) push(d.deadline, { kind: 'deadline', id: d.id, title: d.title, time: `Deadline ${fmtTime(d.deadline)}`, submitted: d.submitted });
    for (const a of cal.data?.activities || []) push(a.startsAt, { kind: 'activity', id: a.id, title: a.title, time: `${fmtTime(a.startsAt)} – ${fmtTime(a.endsAt)}` });
    return map;
  }, [cal.data]);

  const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const days = Array.from({ length: view === 'week' ? 7 : 42 }, (_, i) => new Date(window.from.getTime() + i * DAY));
  const todayKey = dayKey(new Date());
  const chosen = selectedDay ? byDay.get(selectedDay) || [] : [];

  return (
    <>
      <PageHeader title="Calendar" description="Approved work blocks, deadlines and group activities. Times are shown in your local time zone."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="Calendar view" className="flex gap-1">
              {(['week', 'month'] as const).map((v) => <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={`rounded-md px-3 py-1.5 text-sm capitalize ${view === v ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'}`}>{v}</button>)}
            </div>
            <button type="button" onClick={() => shift(-1)} className="rounded border px-3 py-1.5 text-sm hover:bg-slate-50">Previous</button>
            <button type="button" onClick={() => { setAnchor(new Date()); setSelectedDay(null); }} className="rounded border px-3 py-1.5 text-sm hover:bg-slate-50">Today</button>
            <button type="button" onClick={() => shift(1)} className="rounded border px-3 py-1.5 text-sm hover:bg-slate-50">Next</button>
          </div>
        }
      />
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      {cal.loading && !cal.data && <Spinner label="Loading calendar" />}
      {cal.error && <Alert>{cal.error}</Alert>}

      {cal.data && (
        <div className="space-y-6">
          {view === 'week' ? (
            <div className="grid gap-3 md:grid-cols-7">
              {days.map((d) => {
                const k = dayKey(d);
                const items = byDay.get(k) || [];
                return (
                  <Card key={k} className={`${k === todayKey ? 'ring-2 ring-brand-500' : ''}`}>
                    <button type="button" onClick={() => setSelectedDay(k)} className="mb-2 w-full text-left text-sm font-semibold hover:underline">{fmtDay(d.toISOString())}</button>
                    <ul className="space-y-2 text-sm">
                      {items.length === 0 && <li className="text-xs text-slate-400">Nothing scheduled</li>}
                      {items.map((it) => <Item key={`${it.kind}-${it.id}`} item={it} onToggle={toggle} />)}
                    </ul>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-1 text-xs">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((n) => <div key={n} className="px-2 py-1 font-semibold text-slate-500">{n}</div>)}
              {days.map((d) => {
                const k = dayKey(d);
                const count = (byDay.get(k) || []).length;
                const inMonth = d.getMonth() === anchor.getMonth();
                return (
                  <button key={k} type="button" onClick={() => setSelectedDay(k)} aria-label={`${fmtDay(d.toISOString())}, ${count} item${count === 1 ? '' : 's'}`}
                    className={`min-h-[64px] rounded-md border p-2 text-left ${inMonth ? 'bg-white' : 'bg-slate-50 text-slate-400'} ${k === todayKey ? 'border-brand-500' : 'border-slate-200'} ${selectedDay === k ? 'ring-2 ring-brand-500' : ''}`}>
                    <span className="font-medium">{d.getDate()}</span>
                    {count > 0 && <span className="mt-1 block rounded bg-brand-50 px-1 text-brand-700">{count}</span>}
                  </button>
                );
              })}
            </div>
          )}

          {selectedDay && (
            <Card title="Selected day" action={<button type="button" onClick={() => setSelectedDay(null)} className="text-sm text-slate-600 hover:underline">Close</button>}>
              {chosen.length === 0 ? <EmptyState title="Nothing on this day" /> : (
                <ul className="space-y-2 text-sm">{chosen.map((it) => <Item key={`${it.kind}-${it.id}`} item={it} onToggle={toggle} />)}</ul>
              )}
            </Card>
          )}
          {!cal.data.workBlocks.length && !cal.data.deadlines.length && !cal.data.activities.length && <p className="text-sm text-slate-500">Nothing in this period. Approve a plan in Tasks to add work blocks.</p>}
        </div>
      )}
    </>
  );
}

function Item({ item, onToggle }: { item: { kind: 'block' | 'deadline' | 'activity'; id: string; title: string; time: string; done?: boolean; submitted?: boolean; onToggle?: boolean }; onToggle: (id: string, done: boolean) => void }) {
  const tone = item.kind === 'block' ? 'blue' : item.kind === 'deadline' ? 'amber' : 'green';
  const label = item.kind === 'block' ? 'Work block' : item.kind === 'deadline' ? (item.submitted ? 'Submitted' : 'Deadline') : 'Activity';
  return (
    <li className="rounded border border-slate-200 p-2">
      <Badge tone={tone}>{label}</Badge>
      <p className={`mt-1 font-medium ${item.done ? 'line-through text-slate-400' : ''}`}>{item.title}</p>
      <p className="text-xs text-slate-500">{item.time}</p>
      {item.onToggle && (
        <label className="mt-1 flex items-center gap-2 text-xs"><input type="checkbox" checked={!!item.done} onChange={(e) => onToggle(item.id, e.target.checked)} className="h-4 w-4" />Done</label>
      )}
    </li>
  );
}
