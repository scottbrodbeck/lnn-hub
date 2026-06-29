import { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Settings, Calendar, FileText, LogOut, Send, Users, Mail, Image, ClipboardList, Building2, Menu, X, Activity, FlaskConical } from 'lucide-react';
import { AdminGuard } from '@/components/guards/AdminGuard';
import { useAdminPendingCount } from '@/hooks/useAdminPendingCount';
import { useChecklistCount } from '@/hooks/useChecklistCount';
import { useQAIssueCount } from '@/hooks/useQAIssueCount';
import { useIsMobile } from '@/hooks/use-mobile';
import { DashboardSwitcher } from '@/components/sales/DashboardSwitcher';
import lnnLogo from '@/assets/lnn-logo.png';

export function AdminLayout() {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const { pendingRequestCount } = useAdminPendingCount();
  const { checklistUncheckedCount } = useChecklistCount();
  const { issueCount: qaIssueCount } = useQAIssueCount();

  const isActive = (path: string) => location.pathname === path;
  const totalTasksCount = pendingRequestCount + checklistUncheckedCount;

  const closeSidebar = () => {
    if (isMobile) setSidebarOpen(false);
  };

  const sidebarContent = (
    <>
      <div className="p-6 border-b border-border">
        <img src={lnnLogo} alt="LNN Logo" className="h-12 w-auto mb-4" />
        <h1 className="text-xl font-bold text-foreground">Admin Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">{user?.email}</p>
        <div className="mt-3">
          <DashboardSwitcher />
        </div>
      </div>
      
      <nav className="p-4 space-y-2">
        <Link to="/admin/tasks" onClick={closeSidebar}>
          <Button variant={isActive('/admin/tasks') ? 'default' : 'ghost'} className="w-full justify-start">
            <ClipboardList className="mr-2 h-4 w-4" />
            Tasks
            {totalTasksCount > 0 && (
              <Badge className="ml-auto bg-destructive text-destructive-foreground hover:bg-destructive h-5 min-w-5 px-1.5 rounded-full flex items-center justify-center text-xs font-semibold">
                {totalTasksCount}
              </Badge>
            )}
          </Button>
        </Link>
        
        <Link to="/admin/calendar" onClick={closeSidebar}>
          <Button variant={isActive('/admin/calendar') ? 'default' : 'ghost'} className="w-full justify-start">
            <Calendar className="mr-2 h-4 w-4" />
            Calendar
          </Button>
        </Link>
        
        <Link to="/admin/assignments" onClick={closeSidebar}>
          <Button variant={isActive('/admin/assignments') ? 'default' : 'ghost'} className="w-full justify-start">
            <FileText className="mr-2 h-4 w-4" />
            Assignments
          </Button>
        </Link>
        
        <Link to="/admin/display-ads" onClick={closeSidebar}>
          <Button variant={isActive('/admin/display-ads') ? 'default' : 'ghost'} className="w-full justify-start">
            <Image className="h-4 w-4 mr-2" />
            Display Ads
          </Button>
        </Link>
        
        <Link to="/admin/direct-publish" onClick={closeSidebar}>
          <Button variant={isActive('/admin/direct-publish') ? 'default' : 'ghost'} className="w-full justify-start">
            <Send className="mr-2 h-4 w-4" />
            Direct Post
          </Button>
        </Link>
        
        <Link to="/admin/direct-blast" onClick={closeSidebar}>
          <Button variant={isActive('/admin/direct-blast') ? 'default' : 'ghost'} className="w-full justify-start">
            <Mail className="mr-2 h-4 w-4" />
            Direct Blast
          </Button>
        </Link>
        
        <Link to="/admin/clients" onClick={closeSidebar}>
          <Button variant={location.pathname.startsWith('/admin/clients') ? 'default' : 'ghost'} className="w-full justify-start">
            <Building2 className="mr-2 h-4 w-4" />
            Clients
          </Button>
        </Link>
        
        <Link to="/admin/users" onClick={closeSidebar}>
          <Button variant={location.pathname.startsWith('/admin/users') ? 'default' : 'ghost'} className="w-full justify-start">
            <Users className="mr-2 h-4 w-4" />
            Users
          </Button>
        </Link>
        
        <Link to="/admin/activity" onClick={closeSidebar}>
          <Button variant={location.pathname.startsWith('/admin/activity') ? 'default' : 'ghost'} className="w-full justify-start">
            <Activity className="mr-2 h-4 w-4" />
            Activity
            {qaIssueCount > 0 && (
              <Badge className="ml-auto bg-destructive text-destructive-foreground hover:bg-destructive h-5 min-w-5 px-1.5 rounded-full flex items-center justify-center text-xs font-semibold">
                {qaIssueCount}
              </Badge>
            )}
          </Button>
        </Link>
        
        <Link to="/admin/settings" onClick={closeSidebar}>
          <Button variant={isActive('/admin/settings') ? 'default' : 'ghost'} className="w-full justify-start">
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </Button>
        </Link>

        <Link to="/admin/testing" onClick={closeSidebar}>
          <Button variant={isActive('/admin/testing') ? 'default' : 'ghost'} className="w-full justify-start">
            <FlaskConical className="mr-2 h-4 w-4" />
            Testing
          </Button>
        </Link>
      </nav>

      <div className="mt-auto p-4">
        <Button variant="outline" className="w-full justify-start" onClick={signOut}>
          <LogOut className="mr-2 h-4 w-4" />
          Sign Out
        </Button>
      </div>
    </>
  );

  return (
    <AdminGuard>
      <div className="min-h-screen bg-background">
        <div className="flex">
          {/* Mobile header */}
          {isMobile && (
            <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between p-3 border-b border-border bg-card">
              <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)}>
                <Menu className="h-5 w-5" />
              </Button>
              <img src={lnnLogo} alt="LNN Logo" className="h-8 w-auto" />
              <div className="w-10" />
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
          <main className={`flex-1 ${isMobile ? 'pt-14' : ''}`}>
            <Outlet />
          </main>
        </div>
      </div>
    </AdminGuard>
  );
}
