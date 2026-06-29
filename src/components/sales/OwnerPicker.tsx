import { useMemo } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSalesEligibleUsers } from '@/hooks/useSalesEligibleUsers';

interface Props {
  /** null = All owners, 'unassigned' = no owner, uuid = specific user */
  value: string | null | undefined;
  onChange: (v: string | null) => void;
  placeholder?: string;
  allowUnassigned?: boolean;
  /** When true, include an "All owners" option (value: null). */
  allowAll?: boolean;
  /**
   * Optional set of user ids to restrict the picker to. Useful for filter
   * pickers that should only offer values present in the current dataset
   * (e.g. owners who actually have deals in the active pipeline).
   * When omitted, all sales-eligible users are shown.
   */
  restrictToIds?: Set<string>;
  /** When restrictToIds is set, controls whether to also offer the Unassigned option. */
  hasUnassigned?: boolean;
}

export function OwnerPicker({
  value,
  onChange,
  placeholder = 'Select owner',
  allowUnassigned = true,
  allowAll = false,
  restrictToIds,
  hasUnassigned = true,
}: Props) {
  const { data: users = [], isLoading } = useSalesEligibleUsers();

  const visibleUsers = useMemo(() => {
    if (!restrictToIds) return users;
    return users.filter((u) => restrictToIds.has(u.id));
  }, [users, restrictToIds]);

  // When we're scoping to deal owners, only show "Unassigned" if there are any.
  const showUnassigned = restrictToIds ? allowUnassigned && hasUnassigned : allowUnassigned;

  // Sentinels: __all__ = null (all owners), __none__ = 'unassigned'
  const selectValue =
    value === null || value === undefined
      ? allowAll
        ? '__all__'
        : '__none__'
      : value === 'unassigned'
        ? '__none__'
        : value;

  return (
    <Select
      value={selectValue}
      onValueChange={(v) => {
        if (v === '__all__') onChange(null);
        else if (v === '__none__') onChange(allowAll ? 'unassigned' : null);
        else onChange(v);
      }}
    >
      <SelectTrigger>
        <SelectValue placeholder={isLoading ? 'Loading…' : placeholder} />
      </SelectTrigger>
      <SelectContent>
        {allowAll && <SelectItem value="__all__">All owners</SelectItem>}
        {showUnassigned && <SelectItem value="__none__">Unassigned</SelectItem>}
        {visibleUsers.map((u) => (
          <SelectItem key={u.id} value={u.id}>
            {u.full_name ?? u.email}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
