import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Globe, Phone, MapPin, Pencil, Plus, Link2, Unlink, RefreshCw, Loader2, ExternalLink } from 'lucide-react';
import { useLinkAdminClient, type CrmOrgWithStats } from '@/hooks/useCrmOrganizations';
import { useCrmContacts } from '@/hooks/useCrmContacts';
import { useCrmDeals } from '@/hooks/useCrmDeals';
import { OrgFormDialog } from './OrgFormDialog';
import { ContactFormDialog } from './ContactFormDialog';
import { LinkAdminClientDialog } from './LinkAdminClientDialog';
import { LinkQboCustomerDialog } from './LinkQboCustomerDialog';
import { ContactDetailSheet } from './ContactDetailSheet';
import { DealDetailSheet } from './DealDetailSheet';
import { ActivityTimeline } from './ActivityTimeline';
import { QboInvoiceList } from './QboInvoiceList';
import { QboInvoiceDetailSheet } from './QboInvoiceDetailSheet';
import { useAuth } from '@/contexts/AuthContext';
import { useQboUnlinkCustomer, useQboRefreshOne } from '@/hooks/useQboCustomerSync';
import { formatDistanceToNow } from 'date-fns';
import { useAdminEmailSet } from '@/hooks/useAdminEligibleUsers';

const balanceFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  org: CrmOrgWithStats | null;
}

export function OrgDetailSheet({ open, onOpenChange, org }: Props) {
  const { role } = useAuth();
  const canManageLink = role === 'admin' || role === 'super_admin';
  const [editOpen, setEditOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [qboLinkOpen, setQboLinkOpen] = useState(false);
  const [activeContact, setActiveContact] = useState<any>(null);
  const [activeDealId, setActiveDealId] = useState<string | null>(null);
  const [activeInvoiceId, setActiveInvoiceId] = useState<string | null>(null);

  const navigate = useNavigate();
  const unlink = useLinkAdminClient();
  const qboUnlink = useQboUnlinkCustomer();
  const qboRefresh = useQboRefreshOne();
  const { data: contacts = [] } = useCrmContacts({ organizationId: org?.id });
  const { data: deals = [] } = useCrmDeals({});
  const { emails: adminEmails } = useAdminEmailSet();
  const orgDeals = deals.filter((d) => d.crm_organization_id === org?.id);

  if (!org) return null;

  const formatIndustry = (s: string) =>
    s
      .toLowerCase()
      .split(/[_\s]+/)
      .filter(Boolean)
      .map((w) => w[0].toUpperCase() + w.slice(1))
      .join(' ');

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-3xl overflow-y-auto">
        <SheetHeader>
          <div className="pr-10">
            <SheetTitle className="text-2xl">{org.name}</SheetTitle>
            {org.industry && (
              <p className="text-sm text-muted-foreground">{formatIndustry(org.industry)}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4 mr-1" /> Edit
            </Button>
            {org.linked_org_name && (
              <Badge variant="default">Linked: {org.linked_org_name}</Badge>
            )}
            {(org.tags ?? []).map((t) => (
              <Badge key={t} variant="secondary">{t}</Badge>
            ))}
          </div>
        </SheetHeader>

        <Tabs defaultValue="overview" className="mt-6">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="contacts">Contacts ({contacts.length})</TabsTrigger>
            <TabsTrigger value="deals">Deals ({orgDeals.length})</TabsTrigger>
            {org.qbo_customer_id && <TabsTrigger value="invoices">Invoices</TabsTrigger>}
            <TabsTrigger value="activities">Activities</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 mt-4">
            {org.website && (
              <div className="flex items-center gap-2 text-sm">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <a className="hover:underline" href={org.website} target="_blank" rel="noreferrer">
                  {org.website}
                </a>
              </div>
            )}
            {org.phone && (
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-4 w-4 text-muted-foreground" /> {org.phone}
              </div>
            )}
            {org.address && (
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground" /> {org.address}
              </div>
            )}
            {org.owner_name && (
              <div className="text-sm pt-2 border-t flex items-center gap-2">
                <span className="text-muted-foreground">Owner: </span>
                <span>{org.owner_name}</span>
                {org.owner_email && adminEmails.has(org.owner_email.toLowerCase()) && (
                  <Badge variant="secondary" className="text-[10px]">Admin user</Badge>
                )}
              </div>
            )}
            {org.notes && (
              <div>
                <p className="text-sm font-medium mb-1">Notes</p>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{org.notes}</p>
              </div>
            )}

            <div className="rounded-md border p-3 mt-4">
              <p className="text-sm font-medium mb-2">Admin Client Link</p>
              {org.linked_org_name ? (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm">{org.linked_org_name}</span>
                  <div className="flex gap-2">
                    {org.linked_org_id && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigate(`/admin/clients?org=${org.linked_org_id}`)}
                      >
                        <ExternalLink className="h-4 w-4 mr-1" /> View Client
                      </Button>
                    )}
                    {canManageLink && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => setLinkOpen(true)}>
                          <Link2 className="h-4 w-4 mr-1" /> Change
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => unlink.mutate({ crmOrgId: org.id, adminOrgId: null })}
                        >
                          <Unlink className="h-4 w-4 mr-1" /> Unlink
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Not linked</span>
                  {canManageLink && (
                    <Button size="sm" onClick={() => setLinkOpen(true)}>
                      <Link2 className="h-4 w-4 mr-1" /> Link
                    </Button>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-md border p-3 mt-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium">QuickBooks Customer</p>
                {org.qbo_customer_id && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={qboRefresh.isPending}
                    onClick={() => qboRefresh.mutate({ crm_organization_id: org.id })}
                  >
                    {qboRefresh.isPending ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-1" />
                    )}
                    Refresh
                  </Button>
                )}
              </div>

              {org.qbo_customer_id ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{org.qbo_customer_name ?? 'Linked customer'}</div>
                      <div className="text-xs text-muted-foreground">
                        Balance:{' '}
                        <span className={`font-semibold ${(org.qbo_balance ?? 0) > 0 ? 'text-foreground' : 'text-muted-foreground'}`}>
                          {balanceFmt.format(Number(org.qbo_balance ?? 0))}
                        </span>
                        {org.qbo_active === false && (
                          <Badge variant="secondary" className="ml-2 text-[10px]">inactive 2y+</Badge>
                        )}
                      </div>
                      {org.qbo_balance_refreshed_at && (
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          Updated {formatDistanceToNow(new Date(org.qbo_balance_refreshed_at), { addSuffix: true })}
                          {org.qbo_last_invoice_date && ` · last invoice ${org.qbo_last_invoice_date}`}
                        </div>
                      )}
                    </div>
                    {canManageLink && (
                      <div className="flex gap-2 shrink-0">
                        <Button size="sm" variant="outline" onClick={() => setQboLinkOpen(true)}>
                          <Link2 className="h-4 w-4 mr-1" /> Change
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={qboUnlink.isPending}
                          onClick={() => qboUnlink.mutate({ crm_organization_id: org.id })}
                        >
                          <Unlink className="h-4 w-4 mr-1" /> Unlink
                        </Button>
                      </div>
                    )}
                  </div>
                  {org.qbo_sync_error && (
                    <p className="text-xs text-destructive">{org.qbo_sync_error}</p>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Not linked</span>
                  {canManageLink && (
                    <Button size="sm" onClick={() => setQboLinkOpen(true)}>
                      <Link2 className="h-4 w-4 mr-1" /> Link to QBO
                    </Button>
                  )}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="contacts" className="mt-4">
            <div className="flex justify-end mb-3">
              <Button size="sm" onClick={() => setContactOpen(true)}>
                <Plus className="h-4 w-4 mr-1" /> Add contact
              </Button>
            </div>
            {contacts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No contacts yet.</p>
            ) : (
              <ul className="space-y-2">
                {contacts.map((c) => (
                  <li
                    key={c.id}
                    className="rounded-md border p-3 text-sm flex justify-between cursor-pointer hover:bg-muted/50"
                    onClick={() => setActiveContact(c)}
                  >
                    <span>
                      {`${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() || '(no name)'}
                      {c.is_primary && <Badge className="ml-2" variant="default">Primary</Badge>}
                    </span>
                    <span className="text-muted-foreground">{c.email ?? c.phone ?? ''}</span>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="deals" className="mt-4">
            {orgDeals.length === 0 ? (
              <p className="text-sm text-muted-foreground">No deals yet.</p>
            ) : (
              <ul className="space-y-2">
                {orgDeals.map((d) => (
                  <li
                    key={d.id}
                    className="rounded-md border p-3 text-sm flex justify-between cursor-pointer hover:bg-muted/50"
                    onClick={() => setActiveDealId(d.id)}
                  >
                    <span>{d.title}</span>
                    <span className="text-muted-foreground">{d.stage_name} · ${Number(d.value).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="activities" className="mt-4">
            <ActivityTimeline organizationId={org.id} />
          </TabsContent>

          {org.qbo_customer_id && (
            <TabsContent value="invoices" className="mt-4">
              <QboInvoiceList
                qboCustomerId={org.qbo_customer_id}
                onSelect={(inv) => setActiveInvoiceId(inv.id)}
              />
            </TabsContent>
          )}
        </Tabs>

        <OrgFormDialog open={editOpen} onOpenChange={setEditOpen} org={org} />
        <ContactFormDialog
          open={contactOpen}
          onOpenChange={setContactOpen}
          defaultOrganizationId={org.id}
        />
        <LinkAdminClientDialog open={linkOpen} onOpenChange={setLinkOpen} crmOrg={org} />
        <LinkQboCustomerDialog
          open={qboLinkOpen}
          onOpenChange={setQboLinkOpen}
          crmOrgId={org.id}
          crmOrgName={org.name}
        />
        <ContactDetailSheet
          open={!!activeContact}
          onOpenChange={(o) => !o && setActiveContact(null)}
          contact={activeContact}
        />
        <DealDetailSheet
          open={!!activeDealId}
          onOpenChange={(o) => !o && setActiveDealId(null)}
          dealId={activeDealId}
        />
        <QboInvoiceDetailSheet
          open={!!activeInvoiceId}
          onOpenChange={(o) => !o && setActiveInvoiceId(null)}
          qboInvoiceId={activeInvoiceId}
        />
      </SheetContent>
    </Sheet>
  );
}
