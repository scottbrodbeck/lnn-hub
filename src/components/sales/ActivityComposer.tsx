import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateCrmActivity, type CrmActivityType } from '@/hooks/useCrmActivities';
import { useCrmOrganizations } from '@/hooks/useCrmOrganizations';
import { useCrmContacts } from '@/hooks/useCrmContacts';
import { useCrmDeals } from '@/hooks/useCrmDeals';
import { OwnerPicker } from './OwnerPicker';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultDealId?: string | null;
  defaultOrganizationId?: string | null;
  defaultContactId?: string | null;
}

const TYPES: CrmActivityType[] = ['task', 'call', 'meeting', 'email', 'note'];

export function ActivityComposer({
  open,
  onOpenChange,
  defaultDealId,
  defaultOrganizationId,
  defaultContactId,
}: Props) {
  const create = useCreateCrmActivity();
  const { data: orgs = [] } = useCrmOrganizations();
  const { data: deals = [] } = useCrmDeals({});
  const [type, setType] = useState<CrmActivityType>('task');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [dealId, setDealId] = useState<string | null>(defaultDealId ?? null);
  const [orgId, setOrgId] = useState<string | null>(defaultOrganizationId ?? null);
  const [contactId, setContactId] = useState<string | null>(defaultContactId ?? null);

  const { data: contacts = [] } = useCrmContacts({ organizationId: orgId ?? undefined });

  useEffect(() => {
    if (open) {
      setType('task');
      setSubject('');
      setBody('');
      setDueAt('');
      setOwnerId(null);
      setDealId(defaultDealId ?? null);
      setOrgId(defaultOrganizationId ?? null);
      setContactId(defaultContactId ?? null);
    }
  }, [open, defaultDealId, defaultOrganizationId, defaultContactId]);

  const valid = subject.trim().length > 0;

  const submit = async () => {
    if (!valid) return;
    await create.mutateAsync({
      type,
      subject: subject.trim(),
      body: body.trim() || null,
      due_at: dueAt ? new Date(dueAt).toISOString() : null,
      owner_user_id: ownerId,
      deal_id: dealId,
      crm_organization_id: orgId,
      contact_id: contactId,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Log activity</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as CrmActivityType)}>
                <SelectTrigger className="capitalize"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => (
                    <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Due</Label>
              <Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Subject *</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="What is this about?" />
          </div>
          <div className="grid gap-2">
            <Label>Notes</Label>
            <Textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 border-t">
            <div className="grid gap-2">
              <Label>Owner</Label>
              <OwnerPicker value={ownerId} onChange={setOwnerId} />
            </div>
            <div className="grid gap-2">
              <Label>Related deal</Label>
              <Select value={dealId ?? '__none__'} onValueChange={(v) => setDealId(v === '__none__' ? null : v)}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {deals.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Related organization</Label>
              <Select value={orgId ?? '__none__'} onValueChange={(v) => { setOrgId(v === '__none__' ? null : v); setContactId(null); }}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {orgs.map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Related contact</Label>
              <Select value={contactId ?? '__none__'} onValueChange={(v) => setContactId(v === '__none__' ? null : v)}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {contacts.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>
                      {`${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() || c.email || '(no name)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!valid || create.isPending}>Log activity</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
