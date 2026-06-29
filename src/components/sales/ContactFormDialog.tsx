import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCrmOrganizations } from '@/hooks/useCrmOrganizations';
import { useCreateCrmContact, useUpdateCrmContact, type CrmContact } from '@/hooks/useCrmContacts';
import { OwnerPicker } from './OwnerPicker';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  contact?: Partial<CrmContact> | null;
  defaultOrganizationId?: string;
}

export function ContactFormDialog({ open, onOpenChange, contact, defaultOrganizationId }: Props) {
  const { data: orgs = [] } = useCrmOrganizations();
  const create = useCreateCrmContact();
  const update = useUpdateCrmContact();
  const [form, setForm] = useState<Partial<CrmContact>>({});

  useEffect(() => {
    setForm(contact ?? { crm_organization_id: defaultOrganizationId, is_primary: false });
  }, [contact, defaultOrganizationId, open]);

  const isEdit = !!contact?.id;
  const setField = (k: keyof CrmContact, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const valid =
    !!form.crm_organization_id && (!!form.first_name?.trim() || !!form.last_name?.trim());

  const submit = async () => {
    if (!valid) return;
    if (isEdit) {
      await update.mutateAsync({ ...form, id: contact!.id! } as any);
    } else {
      await create.mutateAsync(form);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Contact' : 'New Contact'}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Organization *</Label>
            <Select
              value={form.crm_organization_id ?? ''}
              onValueChange={(v) => setField('crm_organization_id', v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select organization" />
              </SelectTrigger>
              <SelectContent>
                {orgs.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>First name</Label>
              <Input value={form.first_name ?? ''} onChange={(e) => setField('first_name', e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Last name</Label>
              <Input value={form.last_name ?? ''} onChange={(e) => setField('last_name', e.target.value)} />
            </div>
            <div className="grid gap-2 col-span-2">
              <Label>Title</Label>
              <Input value={form.title ?? ''} onChange={(e) => setField('title', e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Email</Label>
              <Input type="email" value={form.email ?? ''} onChange={(e) => setField('email', e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Phone</Label>
              <Input value={form.phone ?? ''} onChange={(e) => setField('phone', e.target.value)} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Owner</Label>
            <OwnerPicker
              value={form.owner_user_id ?? null}
              onChange={(v) => setField('owner_user_id', v)}
            />
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={!!form.is_primary} onCheckedChange={(v) => setField('is_primary', v)} />
            <Label>Primary contact for organization</Label>
          </div>
          <div className="grid gap-2">
            <Label>Notes</Label>
            <Textarea rows={3} value={form.notes ?? ''} onChange={(e) => setField('notes', e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!valid || create.isPending || update.isPending}>
            {isEdit ? 'Save' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
