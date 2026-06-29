import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useCreateCrmOrganization, useUpdateCrmOrganization, type CrmOrg } from '@/hooks/useCrmOrganizations';
import { HubspotOwnerPicker } from './HubspotOwnerPicker';
import { TagsInput } from './TagsInput';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  org?: Partial<CrmOrg> | null;
}

export function OrgFormDialog({ open, onOpenChange, org }: Props) {
  const create = useCreateCrmOrganization();
  const update = useUpdateCrmOrganization();
  const [form, setForm] = useState<Partial<CrmOrg>>({});

  useEffect(() => {
    setForm(org ?? {});
  }, [org, open]);

  const isEdit = !!org?.id;
  const setField = (k: keyof CrmOrg, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.name?.trim()) return;
    if (isEdit) {
      await update.mutateAsync({ ...form, id: org!.id! } as any);
    } else {
      await create.mutateAsync(form);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Organization' : 'New Organization'}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Name *</Label>
            <Input value={form.name ?? ''} onChange={(e) => setField('name', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Website</Label>
              <Input value={form.website ?? ''} onChange={(e) => setField('website', e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Industry</Label>
              <Input value={form.industry ?? ''} onChange={(e) => setField('industry', e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Size</Label>
              <Input value={form.size ?? ''} onChange={(e) => setField('size', e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Phone</Label>
              <Input value={form.phone ?? ''} onChange={(e) => setField('phone', e.target.value)} />
            </div>
            <div className="grid gap-2 col-span-2">
              <Label>Address</Label>
              <Input value={form.address ?? ''} onChange={(e) => setField('address', e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Source</Label>
              <Input value={form.source ?? ''} onChange={(e) => setField('source', e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Owner (HubSpot)</Label>
              <HubspotOwnerPicker
                value={form.crm_owner_id ?? null}
                onChange={(v) => setField('crm_owner_id', v)}
              />
            </div>
            <div className="grid gap-2 col-span-2">
              <Label>Tags</Label>
              <TagsInput
                value={form.tags ?? []}
                onChange={(v) => setField('tags', v)}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Notes</Label>
            <Textarea rows={3} value={form.notes ?? ''} onChange={(e) => setField('notes', e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!form.name?.trim() || create.isPending || update.isPending}>
            {isEdit ? 'Save' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
