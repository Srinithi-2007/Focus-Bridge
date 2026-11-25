'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { Alert, Badge, Card, PageHeader } from '@/components/ui';
import Button from '@/components/Button';
import { errorMessage, workspaceRequest } from '@/lib/workspace/client';

interface Turn { role: 'you' | 'assistant'; text: string; source?: 'ai' | 'planner' }

const PROMPTS = ['What is due next?', 'Which task should I start first?', 'How do I plan my week?'];

// The assistant is stateless: each message is answered from the question and your own deadlines. It cannot change tasks, plans or reviews.
export default function StudentAssistantPage() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function ask(message: string) {
    if (!message.trim()) return;
    setBusy(true);
    setError('');
    setTurns((t) => [...t, { role: 'you', text: message.trim() }]);
    setText('');
    try {
      const res = await workspaceRequest<{ reply: string; source: 'ai' | 'planner' }>('/me/assistant/chat', { method: 'POST', body: { message: message.trim() } });
      setTurns((t) => [...t, { role: 'assistant', text: res.reply, source: res.source }]);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    ask(text);
  }

  return (
    <>
      <PageHeader title="Assistant" description="Ask about your deadlines and planning. The assistant helps you plan; it does not change your coach's tasks or write reviews." />
      <div className="grid gap-6 xl:grid-cols-[1fr_280px]">
        <Card>
          {error && <div className="mb-4"><Alert>{error}</Alert></div>}
          <div className="mb-4 min-h-[240px] space-y-3" aria-live="polite">
            {turns.length === 0 && <p className="text-sm text-slate-500">Try one of the suggestions, or type a question below.</p>}
            {turns.map((t, i) => (
              <div key={i} className={`rounded-lg p-3 text-sm ${t.role === 'you' ? 'ml-10 bg-brand-50' : 'mr-10 bg-slate-100'}`}>
                <p className="mb-1 text-xs text-slate-500">{t.role === 'you' ? 'You' : 'Assistant'}{t.source && <> · <Badge tone={t.source === 'ai' ? 'blue' : 'slate'}>{t.source === 'ai' ? 'AI' : 'Built-in (AI not configured)'}</Badge></>}</p>
                <p className="whitespace-pre-wrap">{t.text}</p>
              </div>
            ))}
            {busy && <p className="text-sm text-slate-500">Thinking…</p>}
          </div>
          <form onSubmit={submit} className="flex gap-2">
            <label htmlFor="assistant-input" className="sr-only">Your question</label>
            <input id="assistant-input" value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} placeholder="Ask about your deadlines or plan" className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm" />
            <Button type="submit" disabled={busy || !text.trim()}>Send</Button>
          </form>
        </Card>

        <Card title="Suggestions">
          <div className="flex flex-col gap-2">
            {PROMPTS.map((p) => <button key={p} type="button" disabled={busy} onClick={() => ask(p)} className="rounded-md border border-slate-300 px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-50">{p}</button>)}
          </div>
          <p className="mt-4 text-sm">To plan a specific task, open <Link href="/student/tasks" className="text-brand-600 hover:underline">Tasks</Link> and choose Propose a plan.</p>
        </Card>
      </div>
    </>
  );
}
