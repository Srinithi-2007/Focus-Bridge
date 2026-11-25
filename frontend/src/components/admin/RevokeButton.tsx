'use client';

import { useState } from 'react';
import { adminRequest, errorMessage } from '@/lib/admin/client';

export default function RevokeButton({ id, onDone, onError }: { id: string; onDone: () => void; onError: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        if (!window.confirm('Revoke this invitation? The link will stop working.')) return;
        setBusy(true);
        try {
          await adminRequest(`/admin/invitations/${id}`, { method: 'DELETE' });
          onDone();
        } catch (e) {
          onError(errorMessage(e));
        } finally {
          setBusy(false);
        }
      }}
      className="text-sm font-medium text-red-600 hover:underline disabled:opacity-60"
    >
      Revoke
    </button>
  );
}
