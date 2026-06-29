import { useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
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
import {
  useAdminOrganizationsLite,
  useLinkAdminClient,
  useCreateAdminClientFromCrm,
  type CrmOrg,
} from '@/hooks/useCrmOrganizations';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  crmOrg: CrmOrg;
}

export function LinkAdminClientDialog({ open, onOpenChange, crmOrg }: Props) {
  const { data: admins = [] } = useAdminOrganizationsLite();
  const link = useLinkAdminClient();
  const create = useCreateAdminClientFromCrm();
  const [selected, setSelected] = useState<string>('');
  const [popoverOpen, setPopoverOpen] = useState(false);

  const selectedAdmin = admins.find((a: any) => a.id === selected);

  const submit = async () => {
    if (!selected) return;
    await link.mutateAsync({ crmOrgId: crmOrg.id, adminOrgId: selected });
    onOpenChange(false);
  };

  const createNew = async () => {
    await create.mutateAsync(crmOrg);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link to Admin Client</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Existing Admin Client</Label>
            <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={popoverOpen}
                  className="w-full justify-between font-normal"
                >
                  {selectedAdmin ? (
                    <span className="truncate">
                      {(selectedAdmin as any).name}{' '}
                      <span className="text-muted-foreground">
                        ({(selectedAdmin as any).client_code})
                      </span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Select a client</span>
                  )}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="w-[--radix-popover-trigger-width] p-0"
                align="start"
              >
                <Command
                  filter={(value, search) => {
                    // value is the lowercased "name (code)" string we set per item
                    return value.includes(search.toLowerCase()) ? 1 : 0;
                  }}
                >
                  <CommandInput placeholder="Search clients…" />
                  <CommandList>
                    <CommandEmpty>No clients found.</CommandEmpty>
                    <CommandGroup>
                      {admins.map((a: any) => {
                        const label = `${a.name} (${a.client_code})`;
                        return (
                          <CommandItem
                            key={a.id}
                            value={label.toLowerCase()}
                            onSelect={() => {
                              setSelected(a.id);
                              setPopoverOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                'mr-2 h-4 w-4',
                                selected === a.id ? 'opacity-100' : 'opacity-0'
                              )}
                            />
                            <span className="truncate">
                              {a.name}{' '}
                              <span className="text-muted-foreground">({a.client_code})</span>
                            </span>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          <div className="text-sm text-muted-foreground">
            Or create a new Admin client using this organization's name.
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="secondary" onClick={createNew} disabled={create.isPending}>
            Create new
          </Button>
          <Button onClick={submit} disabled={!selected || link.isPending}>
            Link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
