import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { QboDiagnosticsPanel } from '@/components/sales/settings/QboDiagnosticsPanel';
import { HubspotDiagnosticsPanel } from '@/components/sales/settings/HubspotDiagnosticsPanel';
import { HubspotReconcilePanel } from '@/components/sales/settings/HubspotReconcilePanel';

export default function SalesTesting() {
  const { role } = useAuth();
  const canEdit = role === 'admin' || role === 'super_admin';

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Testing</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Run end-to-end diagnostics against connected integrations.
        </p>
      </div>

      <Tabs defaultValue="hubspot">
        <TabsList>
          <TabsTrigger value="hubspot">HubSpot Diagnostics</TabsTrigger>
          <TabsTrigger value="reconcile">HubSpot Reconcile</TabsTrigger>
          <TabsTrigger value="qbo">QuickBooks Diagnostics</TabsTrigger>
        </TabsList>

        <TabsContent value="hubspot" className="mt-4">
          <HubspotDiagnosticsPanel canEdit={canEdit} />
        </TabsContent>

        <TabsContent value="reconcile" className="mt-4">
          <HubspotReconcilePanel canEdit={canEdit} />
        </TabsContent>

        <TabsContent value="qbo" className="mt-4">
          <QboDiagnosticsPanel canEdit={canEdit} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
