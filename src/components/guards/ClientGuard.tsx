import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from './AuthGuard';

export function ClientGuard({ children }: { children: React.ReactNode }) {
  const { role, loading, userOrganizations, activeOrganizationId } = useAuth();
  const location = useLocation();
  const currentPath = location.pathname + location.search;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Allow both clients and admins to access client pages
  // Admins can access for testing and oversight purposes
  if (role !== 'client' && role !== 'admin') {
    return <Navigate to={`/auth?redirect=${encodeURIComponent(currentPath)}`} replace />;
  }

  // For clients with multiple orgs but no active org selected, redirect to select
  if (role === 'client' && userOrganizations.length > 1 && !activeOrganizationId) {
    return <Navigate to="/select-organization" replace />;
  }

  return <AuthGuard>{children}</AuthGuard>;
}
