import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from './AuthGuard';

export function SalesGuard({ children }: { children: React.ReactNode }) {
  const { role, loading } = useAuth();

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

  if (role !== 'sales' && role !== 'admin' && role !== 'super_admin') {
    return <Navigate to="/" replace />;
  }

  return <AuthGuard>{children}</AuthGuard>;
}
