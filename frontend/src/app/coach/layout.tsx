import WorkspaceShell from '@/components/workspace/WorkspaceShell';

const NAV = [
  { href: '/coach/dashboard', label: 'Dashboard' },
  { href: '/coach/students', label: 'My students' },
  { href: '/coach/groups', label: 'Groups' },
  { href: '/coach/tasks', label: 'Tasks' },
  { href: '/coach/reviews', label: 'Reviews' },
  { href: '/coach/activities', label: 'Activities' },
  { href: '/coach/reports', label: 'Reports' },
];

export default function CoachLayout({ children }: { children: React.ReactNode }) {
  return <WorkspaceShell nav={NAV} requiredRole="coach" label="Coach">{children}</WorkspaceShell>;
}
