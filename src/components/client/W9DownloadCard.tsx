import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useW9Document, getW9SignedUrl } from '@/hooks/useW9Document';

export function W9DownloadCard() {
  const { data: w9, isLoading } = useW9Document();
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    if (!w9) return;
    setDownloading(true);
    try {
      const url = await getW9SignedUrl(w9.file_path, w9.file_name);
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e: any) {
      toast.error('Could not download W-9', { description: e.message });
    } finally {
      setDownloading(false);
    }
  };

  if (isLoading || !w9) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tax Documents</CardTitle>
        <CardDescription>
          Download our current W-9 form for your records or accounts payable team.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 p-3">
          <div className="flex items-center gap-3 min-w-0">
            <FileText className="h-5 w-5 text-primary shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{w9.file_name}</p>
              <p className="text-xs text-muted-foreground">PDF · W-9 tax form</p>
            </div>
          </div>
          <Button size="sm" onClick={handleDownload} disabled={downloading}>
            {downloading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            <span className="ml-2">Download</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
