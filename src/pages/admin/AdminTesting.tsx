import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MailchimpDiagnosticsPanel } from '@/components/admin/testing/MailchimpDiagnosticsPanel';

export default function AdminTesting() {
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Testing</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Run end-to-end diagnostics against connected integrations.
        </p>
      </div>

      <Tabs defaultValue="mailchimp">
        <TabsList>
          <TabsTrigger value="mailchimp">Mailchimp Diagnostics</TabsTrigger>
        </TabsList>

        <TabsContent value="mailchimp" className="mt-4">
          <MailchimpDiagnosticsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
