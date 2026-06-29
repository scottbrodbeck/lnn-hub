import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandInput,
} from '@/components/ui/command';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCrmOrganizations } from '@/hooks/useCrmOrganizations';
import { useCrmContacts } from '@/hooks/useCrmContacts';
import { useCrmPipelines, useCrmStages, useDefaultPipeline } from '@/hooks/useCrmPipeline';
import { useCreateCrmDeal, type CrmDeal } from '@/hooks/useCrmDeals';
import { OwnerPicker } from './OwnerPicker';
import { ComboboxInput } from './ComboboxInput';
import { DEFAULT_DEAL_SOURCES } from '@/lib/crmLookupDefaults';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export function DealFormDialog({ open, onOpenChange }: Props) {
  const { data: orgs = [] } = useCrmOrganizations();
  const { data: pipelines = [] } = useCrmPipelines();
  const { defaultPipeline } = useDefaultPipeline();
  
  const create = useCreateCrmDeal();

  const [form, setForm] = useState<Partial<CrmDeal>>({});
  const { data: stages = [] } = useCrmStages(form.pipeline_id);
  const { data: contacts = [] } = useCrmContacts({ organizationId: form.crm_organization_id ?? undefined });

  useEffect(() => {
    if (open) {
      setForm({
        pipeline_id: defaultPipeline?.id,
        currency: 'USD',
        value: 0,
      });
    }
  }, [open, defaultPipeline?.id]);

  useEffect(() => {
    if (form.pipeline_id && stages.length && !stages.find((s) => s.id === form.stage_id)) {
      const first = stages.find((s) => !s.is_won && !s.is_lost) ?? stages[0];
      setForm((f) => ({ ...f, stage_id: first?.id }));
    }
  }, [form.pipeline_id, form.stage_id, stages]);

  const setField = <K extends keyof CrmDeal>(k: K, v: CrmDeal[K]) => setForm((f) => ({ ...f, [k]: v }));
  const valid = !!form.title?.trim() && !!form.pipeline_id && !!form.stage_id && !!form.crm_organization_id;

  const submit = async () => {
    if (!valid) return;
    await create.mutateAsync(form);
    onOpenChange(false);
  };

  const contactOptions = useMemo(
    () => contacts.map((c) => ({ id: c.id, label: `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() || c.email || '(no name)' })),
    [contacts]
  );

  const sortedOrgs = useMemo(
    () =>
      [...orgs].sort((a, b) =>
        (a.name ?? '').localeCompare(b.name ?? '', undefined, { sensitivity: 'base' }),
      ),
    [orgs],
  );
  const selectedOrg = sortedOrgs.find((o) => o.id === form.crm_organization_id);
  const [orgPopoverOpen, setOrgPopoverOpen] = useState(false);
  const [orgQuery, setOrgQuery] = useState('');
  const filteredOrgs = useMemo(() => {
    const query = orgQuery.trim().toLowerCase();
    if (!query) return sortedOrgs;
    return sortedOrgs.filter((o) => (o.name ?? '').toLowerCase().includes(query));
  }, [orgQuery, sortedOrgs]);

  const selectedContact = contactOptions.find((c) => c.id === form.primary_contact_id);
  const [contactPopoverOpen, setContactPopoverOpen] = useState(false);
  const [contactQuery, setContactQuery] = useState('');
  const filteredContacts = useMemo(() => {
    const query = contactQuery.trim().toLowerCase();
    if (!query) return contactOptions;
    return contactOptions.filter((c) => c.label.toLowerCase().includes(query));
  }, [contactQuery, contactOptions]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>New Deal</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Title *</Label>
            <Input value={form.title ?? ''} onChange={(e) => setField('title', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Pipeline *</Label>
              <Select value={form.pipeline_id ?? ''} onValueChange={(v) => setField('pipeline_id', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {pipelines.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Stage *</Label>
              <Select value={form.stage_id ?? ''} onValueChange={(v) => setField('stage_id', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {stages.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2 col-span-2">
              <Label>Organization *</Label>
              <Popover
                open={orgPopoverOpen}
                onOpenChange={(nextOpen) => {
                  setOrgPopoverOpen(nextOpen);
                  if (!nextOpen) setOrgQuery('');
                }}
              >
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={orgPopoverOpen}
                    className={cn(
                      'w-full justify-between font-normal',
                      !selectedOrg && 'text-muted-foreground',
                    )}
                  >
                    {selectedOrg?.name ?? 'Select organization'}
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
                      {filteredOrgs.length === 0 ? (
                        <div className="py-6 text-center text-sm text-muted-foreground">
                          No organizations found.
                        </div>
                      ) : (
                        filteredOrgs.map((o) => (
                          <button
                            key={o.id}
                            type="button"
                            role="option"
                            aria-selected={form.crm_organization_id === o.id}
                            className="relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                            onClick={() => {
                              setField('crm_organization_id', o.id);
                              setOrgPopoverOpen(false);
                              setOrgQuery('');
                            }}
                          >
                            <Check
                              className={cn(
                                'mr-2 h-4 w-4',
                                form.crm_organization_id === o.id ? 'opacity-100' : 'opacity-0',
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
            </div>
            <div className="grid gap-2 col-span-2">
              <Label>Primary contact</Label>
              <Popover
                open={contactPopoverOpen}
                onOpenChange={(nextOpen) => {
                  setContactPopoverOpen(nextOpen);
                  if (!nextOpen) setContactQuery('');
                }}
              >
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={contactPopoverOpen}
                    disabled={!form.crm_organization_id}
                    className={cn(
                      'w-full justify-between font-normal',
                      !selectedContact && 'text-muted-foreground',
                    )}
                  >
                    {selectedContact?.label ?? 'Select contact'}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="p-0 w-[--radix-popover-trigger-width]"
                  align="start"
                >
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Search contacts…"
                      value={contactQuery}
                      onValueChange={setContactQuery}
                    />
                    <div
                      className="max-h-72 overflow-y-auto overscroll-contain p-1"
                      onWheel={(event) => event.stopPropagation()}
                      role="listbox"
                    >
                      {filteredContacts.length === 0 ? (
                        <div className="py-6 text-center text-sm text-muted-foreground">
                          No contacts found.
                        </div>
                      ) : (
                        filteredContacts.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            role="option"
                            aria-selected={form.primary_contact_id === c.id}
                            className="relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                            onClick={() => {
                              setField('primary_contact_id', c.id);
                              setContactPopoverOpen(false);
                              setContactQuery('');
                            }}
                          >
                            <Check
                              className={cn(
                                'mr-2 h-4 w-4',
                                form.primary_contact_id === c.id ? 'opacity-100' : 'opacity-0',
                              )}
                            />
                            {c.label}
                          </button>
                        ))
                      )}
                    </div>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div className="grid gap-2">
              <Label>Value (USD)</Label>
              <Input
                type="number"
                value={form.value ?? 0}
                onFocus={(e) => e.target.select()}
                onChange={(e) => {
                  const raw = e.target.value;
                  setField('value', raw === '' ? 0 : Number(raw));
                }}
              />
            </div>
            <div className="grid gap-2">
              <Label>Expected close date</Label>
              <Input
                type="date"
                value={form.expected_close_date ?? ''}
                onChange={(e) => setField('expected_close_date', e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Source</Label>
              <ComboboxInput
                value={form.source ?? ''}
                onChange={(v) => setField('source', v)}
                options={DEFAULT_DEAL_SOURCES}
                placeholder="Optional"
              />
            </div>
            <div className="grid gap-2">
              <Label>Owner</Label>
              <OwnerPicker
                value={form.owner_user_id ?? null}
                onChange={(v) => setField('owner_user_id', v)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!valid || create.isPending}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
