import WorkspaceShell from '@/components/workspace/WorkspaceShell';
import StudentAccessibility from '@/components/student/StudentAccessibility';

const NAV = [
  { href: '/student/dashboard', label: 'Dashboard' },
  { href: '/student/tasks', label: 'Tasks' },
  { href: '/student/calendar', label: 'Calendar' },
  { href: '/student/assistant', label: 'Assistant' },
  { href: '/student/coach', label: 'My coach' },
  { href: '/student/groups', label: 'Groups' },
  { href: '/student/progress', label: 'Progress' },
  { href: '/student/notifications', label: 'Notifications' },
  { href: '/student/settings', label: 'Settings' },
];

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return (
    <WorkspaceShell nav={NAV} requiredRole="student" label="Student">
      <StudentAccessibility />
      {children}
    </WorkspaceShell>
  );
}
