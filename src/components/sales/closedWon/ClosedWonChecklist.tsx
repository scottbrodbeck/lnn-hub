import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Trophy,
  CheckCircle2,
  Circle,
  AlertTriangle,
  ExternalLink,
  SkipForward,
  Loader2,
} from 'lucide-react';
import type { CrmOrg } from '@/hooks/useCrmOrganizations';
import { useAuth } from '@/contexts/AuthContext';
import {
  getWonFlow,
  useUpdateWonFlow,
  useDealHasDisplayProducts,
  useDealAssignmentLinkCount,
  useOrgPortalUserCount,
  useHubspotPortalId,
} from '@/hooks/useDealWonFlow';
import { LinkAdminClientDialog } from '../LinkAdminClientDialog';
import { GenerateAssignmentsDialog } from '../GenerateAssignmentsDialog';
import { DisplayAdsProvisionDialog, type ProvisionedCampaign } from '../DisplayAdsProvisionDialog';
import { UserManagementDialog } from '@/components/UserManagementDialog';

type StepState = 'done' | 'skipped' | 'pending' | 'blocked' | 'error';

interface StepRow {
  key: string;
  label: string;
  state: StepState;
  detail?: React.ReactNode;
  todo?: string;
  action?: { label: string; onClick: () => void };
  skippable?: boolean;
  onSkip?: () => void;
}

interface Props {
  deal: any;
  crmOrg: CrmOrg | null | undefined;
  invoices: any[];
  onCreateInvoice: () => void;
}

export function ClosedWonChecklist({ deal, crmOrg, invoices, onCreateInvoice }: Props) {
  const wonFlow = getWonFlow(deal);
  const updateWonFlow = useUpdateWonFlow();
  const { role } = useAuth();
  const isAdmin = role === 'admin' || role === 'super_admin';

  const [linkOpen, setLinkOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [displayOpen, setDisplayOpen] = useState(false);
  const [usersOpen, setUsersOpen] = useState(false);

  const { data: hasDisplayProducts } = useDealHasDisplayProducts(deal?.id, true);
  const invoiceIds = invoices.map((i: any) => i.id);
  const { data: linkCount, isLoading: linksLoading } = useDealAssignmentLinkCount(
    deal?.id,
    invoiceIds,
    true,
  );
  const { data: portalId } = useHubspotPortalId();

  const linkedOrgId = crmOrg?.linked_org_id ?? null;
  const { data: portalUserCount } = useOrgPortalUserCount(linkedOrgId, isAdmin && !!linkedOrgId);

  // ── Derive step states ─────────────────────────────────────────────
  const hubspotState: StepState = !deal.hubspot_id
    ? 'blocked'
    : wonFlow.hubspot?.won_stage_missing
      ? 'error'
      : deal.sync_status === 'error'
        ? 'error'
        : deal.sync_status === 'synced'
          ? 'done'
          : 'pending';

  const clientState: StepState = linkedOrgId ? 'done' : 'pending';

  const invoiceState: StepState = invoices.length > 0
    ? 'done'
    : wonFlow.invoice?.status === 'skipped'
      ? 'skipped'
      : 'pending';

  const assignmentsState: StepState = (linkCount ?? 0) > 0
    ? 'done'
    : wonFlow.assignments?.status === 'skipped'
      ? 'skipped'
      : !linkedOrgId
        ? 'blocked'
        : 'pending';

  const usersState: StepState = wonFlow.users?.status === 'done' || (isAdmin && (portalUserCount ?? 0) > 0)
    ? 'done'
    : wonFlow.users?.status === 'skipped'
      ? 'skipped'
      : !linkedOrgId
        ? 'blocked'
        : 'pending';

  const displayCampaigns = wonFlow.display?.campaigns ?? [];
  const displayState: StepState = displayCampaigns.length > 0
    ? 'done'
    : wonFlow.display?.status === 'skipped'
      ? 'skipped'
      : !linkedOrgId
        ? 'blocked'
        : 'pending';

  const hubspotUrl = portalId && deal.hubspot_id
    ? `https://app.hubspot.com/contacts/${portalId}/deal/${deal.hubspot_id}`
    : null;

  const firstInvoice: any = invoices[0];

  const steps: StepRow[] = [
    {
      key: 'hubspot',
      label: 'Marked won in HubSpot',
      state: hubspotState,
      detail: hubspotState === 'done'
        ? hubspotUrl
          ? <a href={hubspotUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">Open deal in HubSpot <ExternalLink className="h-3 w-3" /></a>
          : 'Synced'
        : hubspotState === 'pending'
          ? 'Sync queued…'
          : undefined,
      todo: !deal.hubspot_id
        ? 'Deal is not synced to HubSpot (no HubSpot id) — it will sync on the next pull/push cycle.'
        : wonFlow.hubspot?.won_stage_missing
          ? 'This pipeline has no closed-won stage, so HubSpot will not show the deal as won. Configure a won stage, then move the deal there.'
          : deal.sync_status === 'error'
            ? `HubSpot sync error: ${deal.sync_error ?? 'unknown'}`
            : undefined,
    },
    {
      key: 'client',
      label: 'Client in admin dashboard',
      state: clientState,
      detail: linkedOrgId ? (
        <Link to={`/admin/clients?org=${linkedOrgId}`} className="text-primary hover:underline inline-flex items-center gap-1">
          View client{wonFlow.client?.client_code ? ` (${wonFlow.client.client_code})` : ''} <ExternalLink className="h-3 w-3" />
        </Link>
      ) : undefined,
      todo: !linkedOrgId ? 'Link or create the admin client — assignments and display ads depend on it.' : undefined,
      action: !linkedOrgId && crmOrg
        ? { label: 'Link / create client', onClick: () => setLinkOpen(true) }
        : undefined,
    },
    {
      key: 'users',
      label: 'Portal user access',
      state: usersState,
      detail: usersState === 'done' && linkedOrgId && isAdmin ? (
        <Link to={`/admin/clients?org=${linkedOrgId}`} className="text-primary hover:underline inline-flex items-center gap-1">
          {(portalUserCount ?? 0) > 0 ? `${portalUserCount} user(s) — manage` : 'Manage users'} <ExternalLink className="h-3 w-3" />
        </Link>
      ) : undefined,
      todo: usersState === 'blocked'
        ? 'Blocked: complete the client step first.'
        : usersState === 'skipped'
          ? 'Portal users skipped — invite them later from Admin → Clients.'
          : (usersState === 'pending' && !isAdmin)
            ? 'Admin access is required to create portal logins — ask an admin, then mark this step done or skip it.'
            : undefined,
      action: usersState === 'pending'
        ? (isAdmin
            ? { label: 'Add portal user', onClick: () => setUsersOpen(true) }
            : { label: 'Mark done', onClick: () => void updateWonFlow(deal, { users: { status: 'done' } }) })
        : undefined,
      skippable: usersState === 'pending',
      onSkip: () => void updateWonFlow(deal, { users: { status: 'skipped' } }),
    },
    {
      key: 'invoice',
      label: 'QuickBooks invoice',
      state: invoiceState,
      detail: firstInvoice ? (
        <span className="inline-flex items-center gap-2">
          {firstInvoice.doc_number ? `#${firstInvoice.doc_number}` : firstInvoice.invoice_type}
          {(wonFlow.invoice?.qbo_url) && (
            <a href={wonFlow.invoice.qbo_url!} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
              Open in QuickBooks <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </span>
      ) : undefined,
      todo: invoiceState === 'skipped' ? 'Invoice skipped — create one later from this deal if needed.' : undefined,
      action: invoiceState === 'pending'
        ? { label: 'Create invoice', onClick: onCreateInvoice }
        : undefined,
      skippable: invoiceState === 'pending',
      onSkip: () => void updateWonFlow(deal, { invoice: { status: 'skipped' } }),
    },
    {
      key: 'assignments',
      label: 'Content assignments',
      state: linksLoading ? 'pending' : assignmentsState,
      detail: (linkCount ?? 0) > 0 && linkedOrgId ? (
        <Link to={`/admin/assignments?org=${linkedOrgId}`} className="text-primary hover:underline inline-flex items-center gap-1">
          {linkCount} created — view assignments <ExternalLink className="h-3 w-3" />
        </Link>
      ) : undefined,
      todo: assignmentsState === 'blocked'
        ? 'Blocked: complete the client step first.'
        : assignmentsState === 'skipped'
          ? 'Assignments skipped — generate later from this deal or its invoice.'
          : undefined,
      action: assignmentsState === 'pending'
        ? { label: 'Generate assignments', onClick: () => setAssignOpen(true) }
        : undefined,
      skippable: assignmentsState === 'pending',
      onSkip: () => void updateWonFlow(deal, { assignments: { status: 'skipped' } }),
    },
    ...(hasDisplayProducts
      ? [{
          key: 'display',
          label: 'Display ad campaigns',
          state: displayState,
          detail: displayCampaigns.length > 0 ? (
            <span className="space-x-2">
              {displayCampaigns.map((c) => (
                <Link
                  key={c.broadstreet_id}
                  to={c.local_id ? `/admin/display-ads?campaign=${c.local_id}` : '/admin/display-ads'}
                  className="text-primary hover:underline inline-flex items-center gap-1"
                >
                  {c.ad_type}{c.site_name ? ` · ${c.site_name}` : ''} <ExternalLink className="h-3 w-3" />
                </Link>
              ))}
            </span>
          ) : undefined,
          todo: displayState === 'blocked'
            ? 'Blocked: complete the client step first.'
            : displayState === 'skipped'
              ? 'Display campaigns skipped — create them later in Display Ads.'
              : undefined,
          action: displayState === 'pending'
            ? { label: 'Provision campaigns', onClick: () => setDisplayOpen(true) }
            : undefined,
          skippable: displayState === 'pending',
          onSkip: () => void updateWonFlow(deal, { display: { status: 'skipped' } }),
        } as StepRow]
      : []),
  ];

  const doneCount = steps.filter((s) => s.state === 'done' || s.state === 'skipped').length;
  const allDone = doneCount === steps.length;
  const todos = steps.filter((s) => s.todo);

  // Stamp completion once everything is done/skipped
  useEffect(() => {
    if (allDone && !wonFlow.completed_at && !linksLoading) {
      void updateWonFlow(deal, { completed_at: new Date().toISOString() });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allDone, linksLoading]);

  return (
    <div className={`rounded-lg border p-4 space-y-3 ${allDone ? 'border-green-200 bg-green-50/40 dark:border-green-900 dark:bg-green-950/20' : ''}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-semibold text-sm">
          <Trophy className="h-4 w-4 text-amber-500" />
          Closed-won checklist
        </div>
        <Badge variant={allDone ? 'default' : 'secondary'} className={allDone ? 'bg-green-600' : ''}>
          {doneCount}/{steps.length} complete
        </Badge>
      </div>

      <div className="space-y-2">
        {steps.map((step) => (
          <div key={step.key} className="flex items-start gap-2 text-sm">
            {step.state === 'done' && <CheckCircle2 className="h-4 w-4 mt-0.5 text-green-600 shrink-0" />}
            {step.state === 'skipped' && <SkipForward className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />}
            {step.state === 'pending' && (
              step.key === 'hubspot'
                ? <Loader2 className="h-4 w-4 mt-0.5 animate-spin text-muted-foreground shrink-0" />
                : <Circle className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            )}
            {(step.state === 'blocked' || step.state === 'error') && <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-500 shrink-0" />}
            <div className="flex-1 min-w-0">
              <span className={step.state === 'skipped' ? 'text-muted-foreground line-through' : ''}>{step.label}</span>
              {step.detail && <div className="text-xs mt-0.5">{step.detail}</div>}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {step.action && (
                <Button size="sm" variant="outline" className="h-7" onClick={step.action.onClick}>
                  {step.action.label}
                </Button>
              )}
              {step.skippable && step.onSkip && (
                <Button size="sm" variant="ghost" className="h-7 text-muted-foreground" onClick={step.onSkip}>
                  Skip
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {todos.length > 0 && (
        <div className="rounded-md border border-amber-200 dark:border-amber-900 bg-amber-50/60 dark:bg-amber-950/20 p-2.5 space-y-1">
          <p className="text-xs font-medium">Remaining to-dos</p>
          {todos.map((s) => (
            <p key={s.key} className="text-xs text-muted-foreground">• {s.todo}</p>
          ))}
        </div>
      )}

      {crmOrg && (
        <LinkAdminClientDialog open={linkOpen} onOpenChange={setLinkOpen} crmOrg={crmOrg} />
      )}
      {isAdmin && linkedOrgId && (
        <UserManagementDialog
          open={usersOpen}
          onOpenChange={setUsersOpen}
          preselectedOrganizationId={linkedOrgId}
          onSuccess={() => void updateWonFlow(deal, { users: { status: 'done' } })}
        />
      )}
      <GenerateAssignmentsDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        qboInvoicesId={firstInvoice?.id ?? null}
        dealId={firstInvoice ? null : deal.id}
        onResult={(r) =>
          void updateWonFlow(deal, {
            assignments: { status: 'done', created: r.created, unscheduled: r.unscheduled },
          })
        }
      />
      <DisplayAdsProvisionDialog
        open={displayOpen}
        onOpenChange={setDisplayOpen}
        dealId={deal.id}
        linkedOrgId={linkedOrgId}
        defaultStartDate={deal.expected_close_date ?? undefined}
        onProvisioned={(campaigns: ProvisionedCampaign[]) =>
          void updateWonFlow(deal, {
            display: {
              status: 'done',
              campaigns: [...displayCampaigns, ...campaigns],
            },
          })
        }
      />
    </div>
  );
}
