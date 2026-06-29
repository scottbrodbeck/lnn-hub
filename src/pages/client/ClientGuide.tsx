import { useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import DOMPurify from 'dompurify';
import { Loader2, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { HelpDialog } from '@/components/HelpDialog';
import { useOnboardingSettings } from '@/hooks/useOnboardingSettings';
import { DEFAULT_GUIDE_CONTENT } from '@/lib/onboardingGuide';

export default function ClientGuide() {
  const { data: settings, isLoading } = useOnboardingSettings();
  const [helpOpen, setHelpOpen] = useState(false);
  const sanitized = useRef<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  // Route stays registered but is inert when the guide is disabled
  if (!settings?.guideEnabled) {
    return <Navigate to="/client/posts" replace />;
  }

  const html = settings.guideContent?.trim() ? settings.guideContent : DEFAULT_GUIDE_CONTENT;
  // Sanitize admin-authored HTML before rendering (same pattern as ActivityRow).
  // Cache in a ref but keep the inline fallback so first paint is never blank.
  sanitized.current = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });

  return (
    <div className="container mx-auto p-6 max-w-3xl">
      <h1 className="text-3xl font-bold text-foreground mb-6">Getting Started</h1>
      <Card>
        <CardContent className="pt-6">
          <div
            className="prose prose-sm sm:prose max-w-none dark:prose-invert"
            dangerouslySetInnerHTML={{
              __html: sanitized.current ?? DOMPurify.sanitize(html, { USE_PROFILES: { html: true } }),
            }}
          />
        </CardContent>
      </Card>

      <div className="mt-6 flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Still have questions?</span>
        <Button variant="outline" size="sm" onClick={() => setHelpOpen(true)}>
          <HelpCircle className="h-4 w-4 mr-2" />
          Contact us
        </Button>
      </div>

      <HelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  );
}
