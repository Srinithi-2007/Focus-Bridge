// Shared authenticated request helpers for role workspaces. Admin, coach and student pages use the same
// session handling: every call carries the session token, and an expired session returns the user to sign-in.
export { adminRequest as workspaceRequest, useAdminData as useWorkspaceData, errorMessage, downloadCsv } from '@/lib/admin/client';
