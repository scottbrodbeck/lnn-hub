import { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, PenTool, LogOut, Settings, FilePenLine, Building2, HelpCircle, Mail, MonitorPlay, Menu, X, BookOpen } from 'lucide-react';
import { ClientGuard } from '@/components/guards/ClientGuard';
import { HelpDialog } from '@/components/HelpDialog';
import { useMyPostsBadgeCount } from '@/hooks/useMyPostsBadgeCount';
import { useOnboardingSettings } from '@/hooks/useOnboardingSettings';
import { useIsMobile } from '@/hooks/use-mobile';
import lnnLogo from '@/assets/lnn-logo.png';

export function ClientLayout() {
  const { user, signOut, activeOrganizationId, activeOrganizationName, userOrganizations, role } = useAuth();
  const isAdminViewing = role === 'admin' || role === 'super_admin';
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [helpDialogOpen, setHelpDialogOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const { data: hasDisplayAds } = useQuery({
    queryKey: ['org-has-display-ads', activeOrganizationId],
    queryFn: async () => {
      if (!activeOrganizationId) return false;
      const { data } = await supabase
        .from('organizations')
        .select('broadstreet_advertiser_id')
        .eq('id', activeOrganizationId)
        .single();
      return !!data?.broadstreet_advertiser_id;
    },
    enabled: !!activeOrganizationId,
  });

  const { data: myPostsBadgeCount } = useMyPostsBadgeCount(activeOrganizationId);
  const { data: onboarding } = useOnboardingSettings();

  const { data: emailMarketingData } = useQuery({
    queryKey: ['email-marketing-data', activeOrganizationId],
    queryFn: async () => {
      if (!activeOrganizationId) return { hasContent: false, pendingCount: 0 };
      const today = new Date().toISOString().split('T')[0];
      
      const { count: assignmentCount } = await supabase
        .from('post_assignments')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', activeOrganizationId)
        .in('content_category', ['email_blast', 'email_sponsorship']);
      
      const { count: blastCount } = await supabase
        .from('email_blasts')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', activeOrganizationId);
      
      const { count: sponsorshipCount } = await supabase
        .from('email_sponsorships')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', activeOrganizationId);
      
      const hasContent = (assignmentCount || 0) > 0 || (blastCount || 0) > 0 || (sponsorshipCount || 0) > 0;
      
      const { count: pendingBlasts } = await supabase
        .from('post_assignments')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', activeOrganizationId)
        .eq('content_category', 'email_blast')
        .eq('is_completed', false)
        .eq('is_skipped', false)
        .gte('due_date', today);
      
      const { count: pendingSponsorships } = await supabase
        .from('post_assignments')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', activeOrganizationId)
        .eq('content_category', 'email_sponsorship')
        .eq('is_completed', false)
        .eq('is_skipped', false)
        .gte('due_date', today);
      
      return {
        hasContent,
        pendingCount: (pendingBlasts || 0) + (pendingSponsorships || 0),
      };
    },
    enabled: !!activeOrganizationId,
  });

  const isActive = (path: string) => location.pathname === path;
  const hasMultipleOrgs = userOrganizations.length > 1;

  const closeSidebar = () => {
    if (isMobile) setSidebarOpen(false);
  };

  const sidebarContent = (
    <>
      <div className="p-6 border-b border-border">
        <img src={lnnLogo} alt="LNN Logo" className="h-12 w-auto mb-4" />
        <h1 className="text-xl font-bold text-foreground">Client Portal</h1>
        <p className="text-sm text-muted-foreground mt-1">{user?.email}</p>
        {activeOrganizationName && (
          <p className="text-xs text-primary mt-1 font-medium">{activeOrganizationName}</p>
        )}
      </div>
      
      <nav className="p-4 space-y-2">
        <Link to="/client/posts" onClick={closeSidebar}>
          <Button variant={isActive('/client/posts') ? 'default' : 'ghost'} className="w-full justify-start">
            <FileText className="mr-2 h-4 w-4" />
            My Posts
            {myPostsBadgeCount > 0 && (
              <Badge className="ml-auto bg-destructive hover:bg-destructive text-destructive-foreground">
                {myPostsBadgeCount}
              </Badge>
            )}
          </Button>
        </Link>
        
        <Link to="/client/submit" onClick={closeSidebar}>
          <Button variant={isActive('/client/submit') ? 'default' : 'ghost'} className="w-full justify-start">
            <PenTool className="mr-2 h-4 w-4" />
            Submit Post
          </Button>
        </Link>
        
        <Link to="/client/drafts" onClick={closeSidebar}>
          <Button variant={isActive('/client/drafts') ? 'default' : 'ghost'} className="w-full justify-start">
            <FilePenLine className="mr-2 h-4 w-4" />
            Drafts
          </Button>
        </Link>
        
        {emailMarketingData?.hasContent && (
          <Link to="/client/email-marketing" onClick={closeSidebar}>
            <Button variant={isActive('/client/email-marketing') || isActive('/client/submit-blast') ? 'default' : 'ghost'} className="w-full justify-start">
              <Mail className="mr-2 h-4 w-4" />
              Email Marketing
              {(emailMarketingData?.pendingCount ?? 0) > 0 && (
                <Badge className="ml-auto bg-destructive hover:bg-destructive text-destructive-foreground">
                  {emailMarketingData.pendingCount}
                </Badge>
              )}
            </Button>
          </Link>
        )}
        
        {hasDisplayAds && (
          <Link to="/client/display-ads" onClick={closeSidebar}>
            <Button variant={isActive('/client/display-ads') || location.pathname.startsWith('/client/display-ads') ? 'default' : 'ghost'} className="w-full justify-start">
              <MonitorPlay className="mr-2 h-4 w-4" />
              Display Ads
            </Button>
          </Link>
        )}
        
        <Link to="/client/settings" onClick={closeSidebar}>
          <Button variant={isActive('/client/settings') ? 'default' : 'ghost'} className="w-full justify-start">
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </Button>
        </Link>
      </nav>

      <div className="mt-auto p-4 space-y-2">
        {onboarding?.guideEnabled && (
          <Link to="/client/guide" onClick={closeSidebar}>
            <Button variant={isActive('/client/guide') ? 'default' : 'ghost'} className="w-full justify-start">
              <BookOpen className="mr-2 h-4 w-4" />
              Getting Started
            </Button>
          </Link>
        )}
        {hasMultipleOrgs && (
          <Button variant="outline" className="w-full justify-start" onClick={() => { closeSidebar(); navigate('/select-organization'); }}>
            <Building2 className="mr-2 h-4 w-4" />
            Change Organization
          </Button>
        )}
        <Button variant="outline" className="w-full justify-start" onClick={signOut}>
          <LogOut className="mr-2 h-4 w-4" />
          Sign Out
        </Button>
      </div>
    </>
  );

  return (
    <ClientGuard>
      <div className="min-h-screen bg-background">
        <div className="flex">
          {/* Mobile header */}
          {isMobile && (
            <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between p-3 border-b border-border bg-card">
              <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)}>
                <Menu className="h-5 w-5" />
              </Button>
              <img src={lnnLogo} alt="LNN Logo" className="h-8 w-auto" />
              <Button variant="ghost" size="icon" onClick={() => setHelpDialogOpen(true)}>
                <HelpCircle className="h-5 w-5" />
              </Button>
            </div>
          )}

          {/* Mobile overlay */}
          {isMobile && sidebarOpen && (
            <div className="fixed inset-0 z-50 bg-black/50" onClick={closeSidebar}>
              <aside
                className="w-64 bg-card min-h-screen flex flex-col border-r border-border"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex justify-end p-2">
                  <Button variant="ghost" size="icon" onClick={closeSidebar}>
                    <X className="h-5 w-5" />
                  </Button>
                </div>
                {sidebarContent}
              </aside>
            </div>
          )}

          {/* Desktop sidebar */}
          {!isMobile && (
            <aside className="w-64 min-w-64 max-w-64 flex-shrink-0 border-r border-border bg-card min-h-screen flex flex-col">
              {sidebarContent}
            </aside>
          )}

          {/* Main Content */}
          <main className={`flex-1 relative ${isMobile ? 'pt-14' : ''}`}>
            {/* Help button - desktop only */}
            {!isMobile && (
              <Button
                variant="outline"
                size="icon"
                className="fixed top-4 right-4 z-40 rounded-full h-10 w-10 shadow-md bg-background hover:bg-accent"
                onClick={() => setHelpDialogOpen(true)}
                title="Need help?"
              >
                <HelpCircle className="h-5 w-5" />
                <span className="sr-only">Help</span>
              </Button>
            )}
            
            {isAdminViewing && (
              <div className="sticky top-0 z-30 bg-amber-500/95 text-amber-950 border-b border-amber-700/40 px-4 py-2 text-sm font-medium flex items-center justify-between gap-3 shadow-sm">
                <span>
                  Admin view: you're seeing the client portal for{' '}
                  <strong>{activeOrganizationName ?? 'this organization'}</strong>. Only this org's data is shown — your personal posts from other orgs are hidden.
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="bg-white/80 hover:bg-white text-amber-950 border-amber-700/40"
                  onClick={() => navigate('/admin')}
                >
                  Back to Admin
                </Button>
              </div>
            )}

            <Outlet />
            
            <HelpDialog 
              open={helpDialogOpen} 
              onOpenChange={setHelpDialogOpen} 
            />
          </main>
        </div>
      </div>
    </ClientGuard>
  );
}
