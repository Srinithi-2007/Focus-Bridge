'use client';

import { ReactNode, useEffect, useId } from 'react';

const TONES = {
  green: 'bg-emerald-100 text-emerald-900 border border-emerald-200/60',
  amber: 'bg-amber-100 text-amber-900 border border-amber-200/60',
  red: 'bg-rose-100 text-rose-900 border border-rose-200/60',
  blue: 'bg-teal-100 text-teal-900 border border-teal-200/60',
  slate: 'bg-stone-100 text-stone-800 border border-stone-200/60',
} as const;
export type Tone = keyof typeof TONES;

export function Badge({ tone = 'slate', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONES[tone]}`}>{children}</span>;
}

const STATUS_TONE: Record<string, { tone: Tone; label: string }> = {
  active: { tone: 'green', label: 'Active' },
  pending_approval: { tone: 'amber', label: 'Pending approval' },
  invited: { tone: 'blue', label: 'Invited' },
  deactivated: { tone: 'red', label: 'Deactivated' },
  open: { tone: 'blue', label: 'Open' },
  accepted: { tone: 'green', label: 'Accepted' },
  revoked: { tone: 'slate', label: 'Revoked' },
  expired: { tone: 'amber', label: 'Expired' },
};

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS_TONE[status] || { tone: 'slate' as Tone, label: status };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function Card({ title, action, children, className = '' }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-stone-200/90 bg-[#FCFBF8] p-6 shadow-sm ${className}`}>
      {(title || action) && (
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {title && <h2 className="text-base font-semibold text-stone-900 font-serif">{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function StatCard({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-stone-200/90 bg-[#FCFBF8] p-6 shadow-sm">
      <p className="text-sm font-medium text-stone-600">{label}</p>
      <p className="mt-2 text-3xl font-bold text-stone-900 font-serif">{value}</p>
      {hint && <p className="mt-1 text-xs text-stone-500">{hint}</p>}
    </div>
  );
}

export function Alert({ tone = 'error', children }: { tone?: 'error' | 'success' | 'info'; children: ReactNode }) {
  const styles = {
    error: 'bg-rose-50 text-rose-900 border border-rose-200/80',
    success: 'bg-emerald-50 text-emerald-900 border border-emerald-200/80',
    info: 'bg-teal-50 text-teal-900 border border-teal-200/80',
  };
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-xl p-4 text-sm font-medium ${styles[tone]}`}>
      {children}
    </div>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-3 py-8 text-sm text-stone-600">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-700 border-t-transparent" aria-hidden="true" />
      {label}…
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-stone-300 bg-[#FCFBF8]/80 p-8 text-center">
      <p className="font-semibold text-stone-800">{title}</p>
      {body && <p className="mt-1 text-sm text-stone-600">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Modal({ open, title, onClose, children, footer }: { open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-950/40 p-4 sm:items-center" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="w-full max-w-lg rounded-2xl bg-[#FCFBF8] border border-stone-200/90 p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 id={titleId} className="text-lg font-bold text-stone-900 font-serif">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-800 transition-colors" aria-label="Close dialog">
            ✕
          </button>
        </div>
        {children}
        {footer && <div className="mt-6 flex justify-end gap-3">{footer}</div>}
      </div>
    </div>
  );
}

export function SelectField({ label, value, onChange, options, disabled, id }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; disabled?: boolean; id?: string }) {
  const selectId = id || label.toLowerCase().replace(/\s+/g, '-');
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={selectId} className="text-sm font-medium text-stone-700">{label}</label>
      <select
        id={selectId}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:border-emerald-700 focus:outline-none focus:ring-1 focus:ring-emerald-700 disabled:bg-stone-100 shadow-xs"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-stone-900 font-serif">{title}</h1>
        {description && <p className="mt-1 text-sm text-stone-600">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
