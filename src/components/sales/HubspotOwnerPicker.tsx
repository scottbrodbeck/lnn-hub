import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { useCrmOwners } from '@/hooks/useCrmOwners';
import { useAdminEmailSet } from '@/hooks/useAdminEligibleUsers';

interface Props {
  value: string | null | undefined;
  onChange: (v: string | null) => void;
  placeholder?: string;
  allowUnassigned?: boolean;
}

/**
 * Picker for selecting a HubSpot owner (crm_owners.id).
 * Highlights owners whose email matches a local admin/super_admin user.
 */
export function HubspotOwnerPicker({
  value,
  onChange,
  placeholder = 'Select owner',
  allowUnassigned = true,
}: Props) {
  const [open, setOpen] = useState(false);
  const { data: owners = [], isLoading } = useCrmOwners();
  const { emails: adminEmails } = useAdminEmailSet();

  const visible = (owners ?? []).filter((o: any) => !o.archived);
  const selected = visible.find((o: any) => o.id === value);
  const selectedIsAdmin = selected
    ? adminEmails.has((selected.email || '').toLowerCase())
    : false;

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
            <span className="truncate flex items-center gap-2">
              {selected.full_name ?? selected.email ?? '(unnamed)'}
              {selectedIsAdmin && (
                <Badge variant="secondary" className="text-[10px]">Admin</Badge>
              )}
            </span>
          ) : (
            <span className="text-muted-foreground">{isLoading ? 'Loading…' : placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command
          filter={(value, search) => (value.includes(search.toLowerCase()) ? 1 : 0)}
        >
          <CommandInput placeholder="Search owners…" />
          <CommandList>
            <CommandEmpty>No owners found.</CommandEmpty>
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
              {visible.map((o: any) => {
                const label = `${o.full_name ?? ''} ${o.email ?? ''}`.trim().toLowerCase();
                const isAdmin = adminEmails.has((o.email || '').toLowerCase());
                return (
                  <CommandItem
                    key={o.id}
                    value={label || o.id}
                    onSelect={() => {
                      onChange(o.id);
                      setOpen(false);
                    }}
                    className={cn(isAdmin && 'bg-primary/5')}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        value === o.id ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    <span className="truncate flex-1">
                      {o.full_name ?? '(unnamed)'}{' '}
                      <span className="text-muted-foreground">{o.email ?? ''}</span>
                    </span>
                    {isAdmin && (
                      <Badge variant="secondary" className="text-[10px] ml-2">Admin</Badge>
                    )}
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
