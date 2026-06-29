import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSalesEligibleUsers } from '@/hooks/useSalesEligibleUsers';
import { useAuth } from '@/contexts/AuthContext';

interface Props {
  /** 'all' | 'mine' | 'unassigned' | <user_id> */
  value: string;
  onChange: (v: string) => void;
  className?: string;
}

/**
 * Filter selector for list views. CRM data is shared across all CRM users —
 * this only filters what the current user is looking at, it does not change
 * permissions.
 */
export function OwnerFilter({ value, onChange, className }: Props) {
  const { data: users = [], isLoading } = useSalesEligibleUsers();
  const { user } = useAuth();

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={className ?? 'w-48'}>
        <SelectValue placeholder={isLoading ? 'Loading…' : 'Owner'} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All owners</SelectItem>
        {user?.id && <SelectItem value="mine">My records</SelectItem>}
        <SelectItem value="unassigned">Unassigned</SelectItem>
        {users.length > 0 && (
          <div className="px-2 py-1 text-xs text-muted-foreground">Specific owner</div>
        )}
        {users.map((u) => (
          <SelectItem key={u.id} value={u.id}>
            {u.full_name ?? u.email}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Resolve an OwnerFilter value into a concrete filter argument for hooks.
 * Returns:
 *  - undefined → no owner filter
 *  - 'unassigned' → owner_user_id IS NULL
 *  - <uuid>   → owner_user_id = uuid
 */
export function resolveOwnerFilter(value: string, currentUserId: string | undefined): string | undefined {
  if (!value || value === 'all') return undefined;
  if (value === 'mine') return currentUserId ?? undefined;
  return value; // 'unassigned' or specific uuid
}
