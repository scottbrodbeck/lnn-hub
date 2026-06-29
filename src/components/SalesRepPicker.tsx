import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAdminEligibleUsers } from '@/hooks/useAdminEligibleUsers';

interface Props {
  value: string | null | undefined;
  onChange: (v: string | null) => void;
  placeholder?: string;
  allowUnassigned?: boolean;
}

/**
 * Picker for assigning a Sales Rep to an admin client (organization).
 * Lists only users with role 'admin' or 'super_admin'.
 */
export function SalesRepPicker({
  value,
  onChange,
  placeholder = 'Select sales rep',
  allowUnassigned = true,
}: Props) {
  const [open, setOpen] = useState(false);
  const { data: users = [], isLoading } = useAdminEligibleUsers();

  const selected = users.find((u) => u.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          {selected ? (
            <span className="truncate">{selected.full_name ?? selected.email}</span>
          ) : (
            <span className="text-muted-foreground">
              {isLoading ? 'Loading…' : placeholder}
            </span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command
          filter={(value, search) => (value.includes(search.toLowerCase()) ? 1 : 0)}
        >
          <CommandInput placeholder="Search users…" />
          <CommandList>
            <CommandEmpty>No users found.</CommandEmpty>
            <CommandGroup>
              {allowUnassigned && (
                <CommandItem
                  value="unassigned"
                  onSelect={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn('mr-2 h-4 w-4', !value ? 'opacity-100' : 'opacity-0')}
                  />
                  <span className="text-muted-foreground">Unassigned</span>
                </CommandItem>
              )}
              {users.map((u) => {
                const label = `${u.full_name ?? ''} ${u.email}`.trim().toLowerCase();
                return (
                  <CommandItem
                    key={u.id}
                    value={label || u.id}
                    onSelect={() => {
                      onChange(u.id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        value === u.id ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    <span className="truncate">
                      {u.full_name ?? '(unnamed)'}{' '}
                      <span className="text-muted-foreground">{u.email}</span>
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
