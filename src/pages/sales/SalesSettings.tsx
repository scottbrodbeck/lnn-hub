import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { ProductSyncPanel } from '@/components/sales/settings/ProductSyncPanel';
import { HubspotSyncPanel } from '@/components/sales/settings/HubspotSyncPanel';
import { MyPreferencesPanel } from '@/components/sales/settings/MyPreferencesPanel';
import { QboSyncPanel } from '@/components/sales/settings/QboSyncPanel';

export default function SalesSettings() {
  const { role } = useAuth();
  const canEdit = role === 'admin' || role === 'super_admin';

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Sales Settings</h1>

      <Tabs defaultValue="my-preferences">
        <TabsList className="flex flex-wrap h-auto w-full justify-start gap-1">
          <TabsTrigger value="my-preferences">My Preferences</TabsTrigger>
          <TabsTrigger value="hubspot-sync">HubSpot Sync</TabsTrigger>
          <TabsTrigger value="hubspot-products">Product Sync</TabsTrigger>
          <TabsTrigger value="quickbooks">QuickBooks</TabsTrigger>
        </TabsList>

        <TabsContent value="my-preferences" className="mt-4">
          <MyPreferencesPanel />
        </TabsContent>

        <TabsContent value="hubspot-sync" className="mt-4">
          <HubspotSyncPanel canEdit={canEdit} />
        </TabsContent>

        <TabsContent value="hubspot-products" className="mt-4">
          <ProductSyncPanel canEdit={canEdit} />
        </TabsContent>

        <TabsContent value="quickbooks" className="mt-4">
          <QboSyncPanel canEdit={canEdit} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
