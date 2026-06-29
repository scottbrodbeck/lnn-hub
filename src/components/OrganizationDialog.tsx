import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { SalesRepPicker } from '@/components/SalesRepPicker';
import { recordAudit } from '@/lib/audit';
import { buildCodePrefix, nextAvailableClientCode } from '@/lib/clientCode';

interface OrganizationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  editingOrganization?: {
    id: string;
    name: string;
    client_code: string;
    is_active: boolean;
  } | null;
}

export function OrganizationDialog({
  open,
  onOpenChange,
  onSuccess,
  editingOrganization,
}: OrganizationDialogProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    client_code: '',
    is_active: true,
    broadstreet_advertiser_id: '',
    broadstreet_advertiser_name: '',
    sales_rep_user_id: null as string | null,
    stat_email_suppress: '',
  });
  const [userEditedCode, setUserEditedCode] = useState(false);
  const [duplicateName, setDuplicateName] = useState(false);
  const reqIdRef = useRef(0);

  const isEdit = !!editingOrganization;

  useEffect(() => {
    if (editingOrganization) {
      setFormData({
        name: editingOrganization.name,
        client_code: editingOrganization.client_code,
        is_active: editingOrganization.is_active,
        broadstreet_advertiser_id: (editingOrganization as any).broadstreet_advertiser_id?.toString() || '',
        broadstreet_advertiser_name: (editingOrganization as any).broadstreet_advertiser_name || '',
        sales_rep_user_id: (editingOrganization as any).sales_rep_user_id ?? null,
        stat_email_suppress: ((editingOrganization as any).stat_email_suppress ?? []).join('\n'),
      });
      setUserEditedCode(true); // don't auto-overwrite existing code
    } else {
      setFormData({
        name: '',
        client_code: '',
        is_active: true,
        broadstreet_advertiser_id: '',
        broadstreet_advertiser_name: '',
        sales_rep_user_id: null,
        stat_email_suppress: '',
      });
      setUserEditedCode(false);
    }
    setDuplicateName(false);
  }, [editingOrganization, open]);

  // Debounced effect: duplicate-name check + auto client code generation (create mode only)
  useEffect(() => {
    if (isEdit) return;
    const name = formData.name.trim();
    if (!name) {
      setDuplicateName(false);
      return;
    }
    const myReq = ++reqIdRef.current;
    const t = setTimeout(async () => {
      // Duplicate name check
      const { data: dup } = await supabase
        .from('organizations')
        .select('id')
        .ilike('name', name)
        .limit(1);
      if (myReq !== reqIdRef.current) return;
      setDuplicateName((dup?.length ?? 0) > 0);

      // Auto-generate code if user hasn't manually edited it
      if (!userEditedCode) {
        const prefix = buildCodePrefix(name);
        const code = await nextAvailableClientCode(prefix);
        if (myReq !== reqIdRef.current) return;
        setFormData((f) => ({ ...f, client_code: code }));
      }
    }, 400);
    return () => clearTimeout(t);
  }, [formData.name, isEdit, userEditedCode]);

  const handleResetCode = async () => {
    const name = formData.name.trim();
    if (!name) {
      setFormData((f) => ({ ...f, client_code: '' }));
      setUserEditedCode(false);
      return;
    }
    const code = await nextAvailableClientCode(buildCodePrefix(name));
    setFormData((f) => ({ ...f, client_code: code }));
    setUserEditedCode(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const clientCodeRegex = /^[a-zA-Z0-9_-]+$/;
      if (!clientCodeRegex.test(formData.client_code)) {
        toast.error('Client code must contain only letters, numbers, hyphens, and underscores');
        setLoading(false);
        return;
      }

      // Parse the suppression textarea into a deduped, lowercased email list.
      const statEmailSuppress = Array.from(
        new Set(
          formData.stat_email_suppress
            .split(/[\n,]+/)
            .map((e) => e.trim().toLowerCase())
            .filter(Boolean),
        ),
      );

      if (editingOrganization) {
        const updatePayload = {
          name: formData.name,
          client_code: formData.client_code,
          is_active: formData.is_active,
          broadstreet_advertiser_id: formData.broadstreet_advertiser_id ? parseInt(formData.broadstreet_advertiser_id, 10) : null,
          broadstreet_advertiser_name: formData.broadstreet_advertiser_name || null,
          sales_rep_user_id: formData.sales_rep_user_id,
          stat_email_suppress: statEmailSuppress,
        };

        const beforeOrg = editingOrganization as any;

        const { error } = await supabase
          .from('organizations')
          .update(updatePayload)
          .eq('id', editingOrganization.id);

        if (error) throw error;
        toast.success('Organization updated successfully');

        // Emit distinct audit entries per semantic change
        const prevRep = beforeOrg.sales_rep_user_id ?? null;
        const nextRep = formData.sales_rep_user_id ?? null;
        if (prevRep !== nextRep) {
          void recordAudit({
            organizationId: editingOrganization.id,
            action: 'org.sales_rep_changed',
            entityType: 'organization',
            entityId: editingOrganization.id,
            summary: nextRep ? 'Sales rep updated' : 'Sales rep cleared',
            before: { sales_rep_user_id: prevRep },
            after: { sales_rep_user_id: nextRep },
          });
        }

        // Catch-all org.updated for other tracked fields (name, client_code,
        // is_active, broadstreet_*). recordAudit skips no-op writes.
        void recordAudit({
          organizationId: editingOrganization.id,
          action: 'org.updated',
          entityType: 'organization',
          entityId: editingOrganization.id,
          summary: `Updated organization "${formData.name}"`,
          before: {
            name: beforeOrg.name,
            client_code: beforeOrg.client_code,
            is_active: beforeOrg.is_active,
            broadstreet_advertiser_id: beforeOrg.broadstreet_advertiser_id ?? null,
            broadstreet_advertiser_name: beforeOrg.broadstreet_advertiser_name ?? null,
            stat_email_suppress: beforeOrg.stat_email_suppress ?? [],
          },
          after: {
            name: updatePayload.name,
            client_code: updatePayload.client_code,
            is_active: updatePayload.is_active,
            broadstreet_advertiser_id: updatePayload.broadstreet_advertiser_id,
            broadstreet_advertiser_name: updatePayload.broadstreet_advertiser_name,
            stat_email_suppress: updatePayload.stat_email_suppress,
          },
        });
      } else {
        const insertPayload = {
          name: formData.name,
          client_code: formData.client_code,
          is_active: formData.is_active,
          broadstreet_advertiser_id: formData.broadstreet_advertiser_id ? parseInt(formData.broadstreet_advertiser_id, 10) : null,
          broadstreet_advertiser_name: formData.broadstreet_advertiser_name || null,
          sales_rep_user_id: formData.sales_rep_user_id,
          stat_email_suppress: statEmailSuppress,
        };

        const { data: inserted, error } = await supabase
          .from('organizations')
          .insert(insertPayload)
          .select('id')
          .single();

        if (error) {
          if (error.code === '23505') {
            toast.error('Client code already exists');
            setLoading(false);
            return;
          }
          throw error;
        }
        toast.success('Organization created successfully');

        if (inserted?.id) {
          void recordAudit({
            organizationId: inserted.id,
            action: 'org.created',
            entityType: 'organization',
            entityId: inserted.id,
            summary: `Created organization "${formData.name}"`,
            after: insertPayload,
          });
        }
      }

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Failed to save organization:', error);
      toast.error(error.message || 'Failed to save organization');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {editingOrganization ? 'Edit Organization' : 'Add New Organization'}
          </DialogTitle>
          <DialogDescription>
            {editingOrganization
              ? 'Update the organization details below.'
              : 'Enter the details for the new organization.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="space-y-4 py-4 flex-1 overflow-y-auto pr-1">
            {!isEdit && duplicateName && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  An organization named "{formData.name.trim()}" already exists. You can still create this one if intended.
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="name">Organization Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter organization name"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client_code">Client Code</Label>
              <Input
                id="client_code"
                value={formData.client_code}
                onChange={(e) => {
                  setFormData({ ...formData, client_code: e.target.value });
                  if (!isEdit) setUserEditedCode(true);
                }}
                placeholder="e.g., ACME-001"
                required
                pattern="[a-zA-Z0-9_-]+"
                title="Only letters, numbers, hyphens, and underscores allowed"
              />
              {!isEdit ? (
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>
                    {userEditedCode ? 'Custom code' : 'Auto-generated from name'}
                  </span>
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto p-0"
                    onClick={handleResetCode}
                  >
                    Reset to auto
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Only letters, numbers, hyphens, and underscores allowed
                </p>
              )}
            </div>
            {isEdit && (
              <div className="space-y-2 rounded-md border border-border p-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="archived">Archived</Label>
                  <Switch
                    id="archived"
                    checked={!formData.is_active}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_active: !checked })}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Archived clients are hidden from assignment, calendar, blast, ad, and user-org pickers. Existing data is preserved.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label>Sales Rep</Label>
              <SalesRepPicker
                value={formData.sales_rep_user_id}
                onChange={(v) => setFormData({ ...formData, sales_rep_user_id: v })}
              />
              <p className="text-xs text-muted-foreground">
                Internal admin or super-admin user responsible for this client.
              </p>
            </div>

            {/* Broadstreet Display Ads Section */}
            <div className="border-t border-border pt-4 mt-4">
              <h4 className="text-sm font-semibold mb-3">Broadstreet Display Ads</h4>
              <p className="text-xs text-muted-foreground mb-4">
                Link this organization to a Broadstreet advertiser account for display ad management.
              </p>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="broadstreet_advertiser_id">Broadstreet Advertiser ID</Label>
                  <Input
                    id="broadstreet_advertiser_id"
                    type="number"
                    value={formData.broadstreet_advertiser_id}
                    onChange={(e) => setFormData({ ...formData, broadstreet_advertiser_id: e.target.value })}
                    placeholder="e.g., 12345"
                  />
                  <p className="text-xs text-muted-foreground">
                    Find this in Broadstreet under Advertisers
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="broadstreet_advertiser_name">Advertiser Name</Label>
                  <Input
                    id="broadstreet_advertiser_name"
                    value={formData.broadstreet_advertiser_name}
                    onChange={(e) => setFormData({ ...formData, broadstreet_advertiser_name: e.target.value })}
                    placeholder="e.g., Acme Corp"
                  />
                  <p className="text-xs text-muted-foreground">
                    Display name for the advertiser (for reference)
                  </p>
                </div>
              </div>
            </div>

            {/* Stat-email suppression */}
            <div className="border-t border-border pt-4 mt-4">
              <h4 className="text-sm font-semibold mb-3">Stat Email Suppression</h4>
              <div className="space-y-2">
                <Label htmlFor="stat_email_suppress">Always exclude these emails</Label>
                <Textarea
                  id="stat_email_suppress"
                  value={formData.stat_email_suppress}
                  onChange={(e) => setFormData({ ...formData, stat_email_suppress: e.target.value })}
                  placeholder={"jane@example.com\njohn@example.com"}
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  One email per line (or comma-separated). These addresses are always
                  dropped from sponsored-post stat emails for this client, regardless of
                  portal membership or per-user preferences. Use this as a definitive
                  opt-out for anyone who should never receive stat emails.
                </p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : editingOrganization ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
