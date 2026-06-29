import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandInput } from '@/components/ui/command';
import { Check, ChevronsUpDown, Link2, Loader2, AlertTriangle, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCrmOrganizationsSearch } from '@/hooks/useCrmOrganizations';
import { useCrmContacts } from '@/hooks/useCrmContacts';
import { useUpdateCrmDeal } from '@/hooks/useCrmDeals';
import { toast } from 'sonner';

interface Props {
  dealId: string;
  /** Current contact id on the deal; if set, we won't override it. */
  currentPrimaryContactId: string | null;
  onLinked?: () => void;
}

export function QboOrgPicker({ dealId, currentPrimaryContactId, onLinked }: Props) {
  const [orgPopoverOpen, setOrgPopoverOpen] = useState(false);
  const [orgQuery, setOrgQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [selectedOrgName, setSelectedOrgName] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(orgQuery), 200);
    return () => clearTimeout(t);
  }, [orgQuery]);

  const { data: orgs = [], isLoading: orgsLoading } = useCrmOrganizationsSearch(debouncedQuery);

  const selectedOrg = selectedOrgId
    ? orgs.find((o) => o.id === selectedOrgId) ?? (selectedOrgName ? { id: selectedOrgId, name: selectedOrgName } : null)
    : null;

  // Pull contacts for the selected org so we can auto-attach a primary contact.
  const { data: orgContacts = [] } = useCrmContacts({
    organizationId: selectedOrgId ?? undefined,
  });

  const update = useUpdateCrmDeal();

  const autoContact = useMemo(() => {
    if (!orgContacts.length) return null;
    return orgContacts.find((c) => c.is_primary) ?? orgContacts[0] ?? null;
  }, [orgContacts]);

  const autoContactLabel = autoContact
    ? [autoContact.first_name, autoContact.last_name].filter(Boolean).join(' ').trim() ||
      autoContact.email ||
      'Unnamed contact'
    : null;

  const handleLink = async () => {
    if (!selectedOrgId) return;
    const patch: any = { id: dealId, crm_organization_id: selectedOrgId };
    if (!currentPrimaryContactId && autoContact) {
      patch.primary_contact_id = autoContact.id;
    }
    try {
      await update.mutateAsync(patch);
      toast.success(
        autoContact && !currentPrimaryContactId
          ? `Linked to ${selectedOrg?.name}. Primary contact set to ${autoContactLabel}.`
          : `Linked to ${selectedOrg?.name}.`,
      );
      onLinked?.();
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to link organization');
    }
  };

  return (
    <div className="rounded-md border border-amber-300/60 bg-amber-50/60 dark:bg-amber-950/20 p-3 space-y-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-600" />
        <div className="flex-1">
          <p className="text-sm font-medium">Link this deal to an organization</p>
          <p className="text-xs text-muted-foreground">
            This deal isn't linked to a CRM organization yet. Pick one so we can connect it to a QuickBooks customer.
          </p>
        </div>
      </div>

      <div className="grid gap-2">
        <Popover
          open={orgPopoverOpen}
          onOpenChange={(nextOpen) => {
            setOrgPopoverOpen(nextOpen);
            if (!nextOpen) setOrgQuery('');
          }}
        >
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={orgPopoverOpen}
              className={cn(
                'w-full justify-between font-normal bg-background',
                !selectedOrg && 'text-muted-foreground',
              )}
            >
              {orgsLoading
                ? 'Loading organizations…'
                : selectedOrg?.name ?? 'Select organization'}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="p-0 w-[--radix-popover-trigger-width]"
            align="start"
          >
            <Command shouldFilter={false}>
              <CommandInput
                placeholder="Search organizations…"
                value={orgQuery}
                onValueChange={setOrgQuery}
              />
              <div
                className="max-h-72 overflow-y-auto overscroll-contain p-1"
                onWheel={(event) => event.stopPropagation()}
                role="listbox"
              >
                {orgsLoading ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">
                    Loading…
                  </div>
                ) : orgs.length === 0 ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">
                    No organizations found.
                  </div>
                ) : (
                  orgs.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      role="option"
                      aria-selected={selectedOrgId === o.id}
                      className="relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                      onClick={() => {
                        setSelectedOrgId(o.id);
                        setSelectedOrgName(o.name);
                        setOrgPopoverOpen(false);
                        setOrgQuery('');
                      }}
                    >
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4',
                          selectedOrgId === o.id ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                      {o.name}
                    </button>
                  ))
                )}
              </div>
            </Command>
          </PopoverContent>
        </Popover>

        {selectedOrgId && (
          <p className="text-xs text-muted-foreground">
            {currentPrimaryContactId
              ? 'Primary contact on the deal will be left unchanged.'
              : autoContactLabel
                ? <>Primary contact will be set to <span className="font-medium">{autoContactLabel}</span> — change in the deal panel.</>
                : 'This organization has no contacts yet — add one from the deal panel after linking.'}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <a
          href="/sales/organizations"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
        >
          Create new organization <ExternalLink className="h-3 w-3" />
        </a>
        <Button
          type="button"
          size="sm"
          onClick={handleLink}
          disabled={!selectedOrgId || update.isPending}
        >
          {update.isPending ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <Link2 className="h-4 w-4 mr-1" />
          )}
          Link organization
        </Button>
      </div>
    </div>
  );
}
