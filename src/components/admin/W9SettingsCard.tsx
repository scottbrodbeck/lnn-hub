import { useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Upload, Download, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useW9Document, getW9SignedUrl, W9_BUCKET } from '@/hooks/useW9Document';

const MAX_BYTES = 10 * 1024 * 1024;

export function W9SettingsCard() {
  const { user } = useAuth();
  const { data: w9, isLoading } = useW9Document();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    if (!w9) return;
    setDownloading(true);
    try {
      const url = await getW9SignedUrl(w9.file_path, w9.file_name);
      window.open(url, '_blank');
    } catch (e: any) {
      toast.error('Failed to open file', { description: e.message });
    } finally {
      setDownloading(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      toast.error('Only PDF files are allowed');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error('File must be smaller than 10MB');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setUploading(true);
    try {
      // Stable path so previous file is overwritten; bust any caches via timestamp meta
      const filePath = `w9/current-w9.pdf`;
      const { error: upErr } = await supabase.storage
        .from(W9_BUCKET)
        .upload(filePath, file, {
          contentType: 'application/pdf',
          upsert: true,
          cacheControl: '60',
        });
      if (upErr) throw upErr;

      const pointer = {
        file_path: filePath,
        file_name: file.name,
        uploaded_at: new Date().toISOString(),
        uploaded_by: user?.id ?? null,
      };

      const { data: existing } = await supabase
        .from('admin_settings')
        .select('id')
        .eq('key', 'w9_document')
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('admin_settings')
          .update({ value: pointer as any })
          .eq('key', 'w9_document');
        if (error) throw error;
      } else {
        const { error } = await supabase.from('admin_settings').insert({
          key: 'w9_document',
          value: pointer as any,
          description: 'Current active W-9 tax document available for client download',
        });
        if (error) throw error;
      }

      toast.success('W-9 uploaded', { description: file.name });
      qc.invalidateQueries({ queryKey: ['w9-document'] });
    } catch (e: any) {
      console.error('W-9 upload failed:', e);
      toast.error('Upload failed', { description: e.message });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tax Documents — W-9</CardTitle>
        <CardDescription>
          The current W-9 PDF that clients can download from their portal.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Loading…
          </div>
        ) : w9 ? (
          <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 p-3">
            <div className="flex items-center gap-3 min-w-0">
              <FileText className="h-5 w-5 text-primary shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{w9.file_name}</p>
                <p className="text-xs text-muted-foreground">
                  Uploaded {new Date(w9.uploaded_at).toLocaleString()}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownload}
              disabled={downloading}
            >
              {downloading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              <span className="ml-2">Preview</span>
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No W-9 uploaded yet.</p>
        )}

        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={handleUpload}
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            <span className="ml-2">{w9 ? 'Replace W-9' : 'Upload W-9'}</span>
          </Button>
          <p className="text-xs text-muted-foreground mt-2">
            PDF only · max 10MB. Uploading replaces the current file for all clients.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
