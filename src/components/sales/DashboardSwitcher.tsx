import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ShieldCheck, TrendingUp } from 'lucide-react';

/**
 * Visible only to admins/super_admins (who always have access to both surfaces).
 * Standalone `sales` users land directly on /sales and don't need a switcher.
 */
export function DashboardSwitcher() {
  const { role } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  if (role !== 'admin' && role !== 'super_admin') return null;

  const onSales = location.pathname.startsWith('/sales');
  const value = onSales ? 'sales' : 'admin';

  const handleChange = (next: string) => {
    if (!next || next === value) return;
    navigate(next === 'sales' ? '/sales/pipeline' : '/admin/tasks');
  };

  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={handleChange}
      className="w-full grid grid-cols-2 rounded-md border bg-muted/40 p-0.5"
    >
      <ToggleGroupItem
        value="admin"
        aria-label="Admin Dashboard"
        className="data-[state=on]:bg-background data-[state=on]:shadow-sm rounded-sm text-xs gap-1.5"
      >
        <ShieldCheck className="h-3.5 w-3.5" />
        <span className="truncate">Admin</span>
      </ToggleGroupItem>
      <ToggleGroupItem
        value="sales"
        aria-label="Sales Dashboard"
        className="data-[state=on]:bg-background data-[state=on]:shadow-sm rounded-sm text-xs gap-1.5"
      >
        <TrendingUp className="h-3.5 w-3.5" />
        <span className="truncate">Sales</span>
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
