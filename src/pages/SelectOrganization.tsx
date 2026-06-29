import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Building2 } from 'lucide-react';

export default function SelectOrganization() {
  const { user, role, loading, userOrganizations, setActiveOrganization } = useAuth();
  const navigate = useNavigate();

  // Handle auto-select for single organization in useEffect to avoid state updates during render
  useEffect(() => {
    if (!loading && user && role === 'client' && userOrganizations.length === 1) {
      setActiveOrganization(userOrganizations[0].organization_id);
      navigate('/client/posts', { replace: true });
    }
  }, [loading, user, role, userOrganizations, setActiveOrganization, navigate]);

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

  // Admin-tier users don't need to select an organization
  if (role === 'admin' || role === 'super_admin') {
    return <Navigate to="/admin/tasks" replace />;
  }

  // If user has only one organization, show loading while useEffect handles redirect
  if (userOrganizations.length === 1) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // If no organizations, show error state
  if (userOrganizations.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle>No Organizations</CardTitle>
            <CardDescription>
              Your account is not associated with any organizations. Please contact an administrator.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const handleSelectOrganization = (orgId: string) => {
    setActiveOrganization(orgId);
    navigate('/client/posts');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Select Organization</CardTitle>
          <CardDescription>
            Choose which organization you want to manage content for this session.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {userOrganizations.map((org) => (
            <Button
              key={org.organization_id}
              variant="outline"
              className="w-full h-auto py-4 justify-start gap-3"
              onClick={() => handleSelectOrganization(org.organization_id)}
            >
              <Building2 className="h-5 w-5 text-muted-foreground" />
              <div className="text-left">
                <div className="font-medium">{org.organization_name}</div>
                {org.is_primary && (
                  <div className="text-xs text-muted-foreground">Primary organization</div>
                )}
              </div>
            </Button>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
