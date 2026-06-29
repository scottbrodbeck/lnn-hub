import { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import {
  TrendingUp,
  Briefcase,
  Building,
  Contact,
  Package,
  CalendarClock,
  Settings,
  FlaskConical,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { SalesGuard } from '@/components/guards/SalesGuard';
import { useIsMobile } from '@/hooks/use-mobile';
import { DashboardSwitcher } from '@/components/sales/DashboardSwitcher';
import lnnLogo from '@/assets/lnn-logo.png';

export function SalesLayout() {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + '/');

  const closeSidebar = () => {
    if (isMobile) setSidebarOpen(false);
  };

  const navItems = [
    { to: '/sales/pipeline', label: 'Pipeline', icon: TrendingUp },
    { to: '/sales/deals', label: 'Deals', icon: Briefcase },
    { to: '/sales/organizations', label: 'Organizations', icon: Building },
    { to: '/sales/contacts', label: 'Contacts', icon: Contact },
    { to: '/sales/products', label: 'Products', icon: Package },
    { to: '/sales/activities', label: 'Activities', icon: CalendarClock },
    { to: '/sales/testing', label: 'Testing', icon: FlaskConical },
    { to: '/sales/settings', label: 'Settings', icon: Settings },
  ];

  const sidebarContent = (
    <>
      <div className="p-6 border-b border-border">
        <img src={lnnLogo} alt="LNN Logo" className="h-12 w-auto mb-4" />
        <h1 className="text-xl font-bold text-foreground">Sales Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1 truncate">{user?.email}</p>
        <div className="mt-3">
          <DashboardSwitcher />
        </div>
      </div>

      <nav className="p-4 space-y-2">
        {navItems.map(({ to, label, icon: Icon }) => (
          <Link key={to} to={to} onClick={closeSidebar}>
            <Button
              variant={isActive(to) ? 'default' : 'ghost'}
              className="w-full justify-start"
            >
              <Icon className="mr-2 h-4 w-4" />
              {label}
            </Button>
          </Link>
        ))}
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
    <SalesGuard>
      <div className="min-h-screen bg-background">
        <div className="flex">
          {isMobile && (
            <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between p-3 border-b border-border bg-card">
              <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)}>
                <Menu className="h-5 w-5" />
              </Button>
              <img src={lnnLogo} alt="LNN Logo" className="h-8 w-auto" />
              <div className="w-10" />
            </div>
          )}

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

          {!isMobile && (
            <aside className="w-64 min-w-64 max-w-64 flex-shrink-0 border-r border-border bg-card min-h-screen flex flex-col">
              {sidebarContent}
            </aside>
          )}

          <main className={`flex-1 ${isMobile ? 'pt-14' : ''}`}>
            <Outlet />
          </main>
        </div>
      </div>
    </SalesGuard>
  );
}
