import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2, XCircle, Loader2, ChevronDown, ExternalLink, Trash2, PlugZap, Send } from 'lucide-react';
import { toast } from 'sonner';

interface TestSite {
  id: string;
  name: string;
  url: string;
  platform: 'beehiiv' | 'mailchimp' | 'none';
  hasMailchimp: boolean;
}

interface StepResult {
  name: string;
  ok: boolean;
  detail?: string;
  response?: unknown;
}

const TEST_IMAGE_URL = 'https://placehold.co/1120x630/e2e8f0/64748b/png?text=Test+Image';

export function MailchimpDiagnosticsPanel() {
  const [sites, setSites] = useState<TestSite[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string>('');
  const [running, setRunning] = useState<'verify' | 'draft' | 'cleanup' | null>(null);

  const [verifyResult, setVerifyResult] = useState<any>(null);
  const [verifyOk, setVerifyOk] = useState<boolean | null>(null);

  const [draftSteps, setDraftSteps] = useState<StepResult[]>([]);
  const [testBlast, setTestBlast] = useState<{ blastId: string; campaignUrl: string | null } | null>(null);

  const selectedSite = sites.find(s => s.id === selectedSiteId);

  useEffect(() => {
    const fetchSites = async () => {
      const { data, error } = await supabase
        .from('sites')
        .select('id, name, url, beehiiv_config, mailchimp_config')
        .eq('is_active', true)
        .order('name');

      if (error || !data) return;

      setSites(data.map((site) => {
        const beehiiv = site.beehiiv_config as any;
        const mailchimp = site.mailchimp_config as any;
        const hasBeehiiv = !!(beehiiv?.api_key && beehiiv?.publication_id);
        const hasMailchimp = !!(mailchimp?.api_key && mailchimp?.audience_id);
        return {
          id: site.id,
          name: site.name,
          url: site.url,
          platform: hasBeehiiv ? 'beehiiv' as const : hasMailchimp ? 'mailchimp' as const : 'none' as const,
          hasMailchimp,
        };
      }));
    };
    fetchSites();
  }, []);

  const resetResults = () => {
    setVerifyResult(null);
    setVerifyOk(null);
    setDraftSteps([]);
    setTestBlast(null);
  };

  const handleVerify = async () => {
    if (!selectedSiteId) return;
    setRunning('verify');
    setVerifyResult(null);
    setVerifyOk(null);
    try {
      const { data, error } = await supabase.functions.invoke('create-mailchimp-campaign', {
        body: { mode: 'verify', siteId: selectedSiteId },
      });
      if (error) throw error;
      setVerifyResult(data);
      setVerifyOk(!!data.success);
      if (data.success) {
        toast.success('Mailchimp connection verified');
      } else {
        toast.error(`Verification failed: ${data.error}`);
      }
    } catch (error: any) {
      setVerifyResult({ error: error.message || 'Verification failed' });
      setVerifyOk(false);
      toast.error('Failed to verify Mailchimp connection');
    } finally {
      setRunning(null);
    }
  };

  const handleCreateTestDraft = async () => {
    if (!selectedSite) return;
    setRunning('draft');
    setDraftSteps([]);
    setTestBlast(null);

    const steps: StepResult[] = [];
    const pushStep = (step: StepResult) => {
      steps.push(step);
      setDraftSteps([...steps]);
    };

    try {
      // Step 1: insert a test blast row. Status stays 'draft' so it never
      // surfaces in the admin task queue or client views (no client_id/org).
      const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 16);
      const { data: blast, error: insertError } = await supabase
        .from('email_blasts')
        .insert([{
          title: `TEST — Mailchimp Diagnostics ${timestamp}`,
          subject_line: 'Test: Mailchimp integration check (safe to delete)',
          preview_text: 'Created by the admin testing page — not a real blast',
          main_image_url: TEST_IMAGE_URL,
          click_url: selectedSite.url,
          headline: 'Test Headline',
          body_content: '<p>This is a <strong>test draft</strong> created by the admin <em>testing page</em>. It exercises image, headline, body, and <a href="' + selectedSite.url + '">link</a> rendering.</p><ul><li>List item one</li><li>List item two</li></ul>',
          cta_button_text: 'Visit Site',
          cta_button_url: selectedSite.url,
          site_id: selectedSite.id,
          status: 'draft',
        }])
        .select('id')
        .single();

      if (insertError || !blast) {
        pushStep({ name: 'Insert test blast row', ok: false, detail: insertError?.message || 'Insert failed' });
        return;
      }
      pushStep({ name: 'Insert test blast row', ok: true, detail: `Blast id: ${blast.id}` });

      // Step 2: run the real edge function against it
      const { data: result, error: invokeError } = await supabase.functions.invoke('create-mailchimp-campaign', {
        body: { blastId: blast.id, siteId: selectedSite.id },
      });

      if (invokeError) {
        pushStep({ name: 'Create Mailchimp draft campaign', ok: false, detail: invokeError.message, response: result });
        setTestBlast({ blastId: blast.id, campaignUrl: null });
        return;
      }
      if (result?.notConfigured) {
        pushStep({ name: 'Create Mailchimp draft campaign', ok: false, detail: 'Mailchimp is not configured for this site', response: result });
        setTestBlast({ blastId: blast.id, campaignUrl: null });
        return;
      }
      if (!result?.success) {
        pushStep({ name: 'Create Mailchimp draft campaign', ok: false, detail: result?.error || 'Unknown error', response: result });
        setTestBlast({ blastId: blast.id, campaignUrl: null });
        return;
      }

      pushStep({
        name: 'Create Mailchimp draft campaign',
        ok: true,
        detail: `Campaign id: ${result.mailchimp_campaign_id}`,
        response: result,
      });
      setTestBlast({ blastId: blast.id, campaignUrl: result.mailchimp_campaign_url || null });
      toast.success('Test draft created in Mailchimp');
    } catch (error: any) {
      pushStep({ name: 'Unexpected error', ok: false, detail: error.message || String(error) });
    } finally {
      setRunning(null);
    }
  };

  const handleCleanup = async () => {
    if (!testBlast) return;
    setRunning('cleanup');
    try {
      const { error } = await supabase
        .from('email_blasts')
        .delete()
        .eq('id', testBlast.blastId);
      if (error) throw error;
      toast.success('Test blast row deleted', {
        description: testBlast.campaignUrl
          ? 'The draft campaign in Mailchimp is not deleted automatically — remove it there when done.'
          : undefined,
      });
      setTestBlast(null);
      setDraftSteps([]);
    } catch (error: any) {
      toast.error('Failed to delete test blast row: ' + (error.message || 'Unknown error'));
    } finally {
      setRunning(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Target Site</CardTitle>
          <CardDescription>Tests run against the site's saved Mailchimp configuration.</CardDescription>
        </CardHeader>
        <CardContent>
          <Label htmlFor="testing-site-select" className="sr-only">Site</Label>
          <Select
            value={selectedSiteId}
            onValueChange={(val) => { setSelectedSiteId(val); resetResults(); }}
          >
            <SelectTrigger id="testing-site-select" className="max-w-md">
              <SelectValue placeholder="Select a site..." />
            </SelectTrigger>
            <SelectContent>
              {sites.map(site => (
                <SelectItem key={site.id} value={site.id}>
                  <span className="flex items-center gap-2">
                    {site.name}
                    <span className="text-xs text-muted-foreground">
                      {site.platform === 'mailchimp' ? 'Mailchimp' : site.platform === 'beehiiv' ? 'Beehiiv' : 'No platform'}
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedSite && !selectedSite.hasMailchimp && (
            <Alert className="mt-3">
              <AlertDescription>
                {selectedSite.name} has no Mailchimp configuration (API key + Audience ID). Add it in Settings → Sites first.
              </AlertDescription>
            </Alert>
          )}
          {selectedSite?.hasMailchimp && selectedSite.platform === 'beehiiv' && (
            <Alert className="mt-3">
              <AlertDescription>
                This site has both platforms configured — real blasts go to Beehiiv (it takes precedence), but these tests will still exercise the Mailchimp config.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">Connection &amp; Config</CardTitle>
              <CardDescription>
                Pings Mailchimp, validates the audience, and checks the stored blast template.
              </CardDescription>
            </div>
            <ResultBadge ok={verifyOk} />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            onClick={handleVerify}
            disabled={running !== null || !selectedSite?.hasMailchimp}
            variant="outline"
            size="sm"
          >
            {running === 'verify' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <PlugZap className="h-4 w-4 mr-2" />}
            Verify Connection
          </Button>

          {verifyResult?.success && (
            <div className="text-sm space-y-1">
              <p><span className="text-muted-foreground">Audience:</span> {verifyResult.audience_name ?? '—'}{verifyResult.member_count != null && ` (${verifyResult.member_count.toLocaleString()} members)`}</p>
              <p><span className="text-muted-foreground">Default sender:</span> {verifyResult.from_name ? `${verifyResult.from_name} <${verifyResult.from_email}>` : '—'}</p>
              <p>
                <span className="text-muted-foreground">Blast template:</span>{' '}
                {verifyResult.template_status === 'found' && `#${verifyResult.template_id} "${verifyResult.template_name}"`}
                {verifyResult.template_status === 'not_created_yet' && 'Not created yet — will be auto-created on first blast'}
                {verifyResult.template_status === 'missing_will_recreate' && `#${verifyResult.template_id} was deleted in Mailchimp — will be re-created on next blast`}
                {verifyResult.template_status === 'check_failed' && 'Template check failed (see raw response)'}
              </p>
            </div>
          )}
          {verifyResult && !verifyResult.success && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>{verifyResult.error || 'Verification failed'}</AlertDescription>
            </Alert>
          )}
          {verifyResult && <RawResponse data={verifyResult} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">Test Draft Campaign</CardTitle>
              <CardDescription>
                Creates a clearly-labeled test blast (status stays draft, never enters the task queue) and runs the real create-mailchimp-campaign flow against it — including template auto-creation. Open the result in Mailchimp to confirm the sections are click-to-edit.
              </CardDescription>
            </div>
            <ResultBadge ok={draftSteps.length > 0 ? draftSteps.every(s => s.ok) : null} />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              onClick={handleCreateTestDraft}
              disabled={running !== null || !selectedSite?.hasMailchimp || !!testBlast}
              size="sm"
            >
              {running === 'draft' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
              Create Test Draft
            </Button>
            {testBlast?.campaignUrl && (
              <Button variant="outline" size="sm" onClick={() => window.open(testBlast.campaignUrl!, '_blank')}>
                <ExternalLink className="h-4 w-4 mr-2" />
                Open in Mailchimp
              </Button>
            )}
            {testBlast && (
              <Button variant="outline" size="sm" onClick={handleCleanup} disabled={running !== null}>
                {running === 'cleanup' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
                Delete Test Blast Row
              </Button>
            )}
          </div>

          {draftSteps.length > 0 && (
            <div className="space-y-1">
              {draftSteps.map((step, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex items-center gap-2 text-sm py-1">
                    {step.ok ? (
                      <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                    ) : (
                      <XCircle className="h-4 w-4 text-destructive shrink-0" />
                    )}
                    <span>{step.name}</span>
                    {step.detail && <span className="text-xs text-muted-foreground">{step.detail}</span>}
                  </div>
                  {step.response !== undefined && <RawResponse data={step.response} />}
                </div>
              ))}
            </div>
          )}

          {testBlast?.campaignUrl && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                Draft created. In Mailchimp, confirm it opens in the editor with click-to-edit sections (image, headline, body, button) rather than a raw HTML block. Delete the draft in Mailchimp when finished — only the local test row is removed here.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ResultBadge({ ok }: { ok: boolean | null }) {
  if (ok === null) return null;
  if (ok) return <Badge variant="default" className="gap-1"><CheckCircle2 className="h-3 w-3" />Pass</Badge>;
  return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />Fail</Badge>;
}

function RawResponse({ data }: { data: unknown }) {
  return (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ChevronDown className="h-3 w-3" />
          Raw response
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-48 mt-1">
          {JSON.stringify(data, null, 2)}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}
