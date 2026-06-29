import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

export function RoleBasedRedirect() {
  const { user, role, loading, userOrganizations, activeOrganizationId } = useAuth();

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

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (role === 'admin' || role === 'super_admin') {
    return <Navigate to="/admin/tasks" replace />;
  }

  if (role === 'sales') {
    return <Navigate to="/sales/pipeline" replace />;
  }

  if (role === 'client') {
    // If client has multiple orgs and no active org selected, redirect to select
    if (userOrganizations.length > 1 && !activeOrganizationId) {
      return <Navigate to="/select-organization" replace />;
    }
    return <Navigate to="/client/posts" replace />;
  }

  return <Navigate to="/auth" replace />;
}
