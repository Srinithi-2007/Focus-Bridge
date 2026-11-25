'use client';

import { ReactNode } from 'react';
import WorkspaceShell from '@/components/workspace/WorkspaceShell';

const NAV = [
  { href: '/admin/dashboard', label: 'Dashboard' },
  { href: '/admin/students', label: 'Students' },
  { href: '/admin/coaches', label: 'Coaches' },
  { href: '/admin/allocations', label: 'Allocations' },
  { href: '/admin/groups', label: 'Groups' },
  { href: '/admin/programs', label: 'Programs' },
  { href: '/admin/reports', label: 'Reports' },
  { href: '/admin/settings', label: 'Settings' },
];

export default function AdminShell({ children }: { children: ReactNode }) {
  return (
    <WorkspaceShell nav={NAV} requiredRole="admin" label="Admin">
      {children}
    </WorkspaceShell>
  );
}
