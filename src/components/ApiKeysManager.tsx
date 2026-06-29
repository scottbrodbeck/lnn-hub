import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Copy, Plus, Trash2, KeyRound, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';

type ApiKey = {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

// Generate a secure random API key on the client.
function generateRawKey(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return `lnn_${out}`;
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function ApiKeysManager() {
  const { user } = useAuth();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createdKeyValue, setCreatedKeyValue] = useState<string | null>(null);
  const [revokingKey, setRevokingKey] = useState<ApiKey | null>(null);

  const fetchKeys = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('api_keys')
      .select('id, name, key_prefix, created_at, last_used_at, revoked_at')
      .order('created_at', { ascending: false });
    if (error) {
      toast.error('Failed to load API keys');
    } else {
      setKeys(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchKeys();
  }, []);

  const handleCreate = async () => {
    if (!newKeyName.trim()) {
      toast.error('Please enter a name');
      return;
    }
    setCreating(true);
    try {
      const raw = generateRawKey();
      const hash = await sha256Hex(raw);
      const prefix = raw.slice(0, 12); // "lnn_" + first 8 chars
      const { error } = await supabase.from('api_keys').insert({
        name: newKeyName.trim(),
        key_prefix: prefix,
        key_hash: hash,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
      setCreatedKeyValue(raw);
      setNewKeyName('');
      await fetchKeys();
    } catch (err: any) {
      toast.error('Failed to create key: ' + err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async () => {
    if (!revokingKey) return;
    const { error } = await supabase
      .from('api_keys')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', revokingKey.id);
    if (error) {
      toast.error('Failed to revoke key');
    } else {
      toast.success('Key revoked');
      await fetchKeys();
    }
    setRevokingKey(null);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" />
              API Keys
            </CardTitle>
            <CardDescription>
              Generate secret keys for external integrations to call the Client Lookup API. Keys
              are hashed; the full secret is shown only once at creation.
            </CardDescription>
          </div>
          <Button
            onClick={() => {
              setCreateOpen(true);
              setCreatedKeyValue(null);
              setNewKeyName('');
            }}
          >
            <Plus className="h-4 w-4 mr-2" /> New API Key
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : keys.length === 0 ? (
            <p className="text-sm text-muted-foreground">No API keys yet.</p>
          ) : (
            <div className="divide-y border rounded-md">
              {keys.map((k) => (
                <div key={k.id} className="flex items-center justify-between p-4 gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{k.name}</span>
                      {k.revoked_at && <Badge variant="destructive">Revoked</Badge>}
                    </div>
                    <code className="text-xs text-muted-foreground">
                      {k.key_prefix}…
                    </code>
                    <div className="text-xs text-muted-foreground mt-1">
                      Created {format(new Date(k.created_at), 'PP')}
                      {' · '}
                      {k.last_used_at
                        ? `Last used ${format(new Date(k.last_used_at), 'PPp')}`
                        : 'Never used'}
                    </div>
                  </div>
                  {!k.revoked_at && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRevokingKey(k)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-1" /> Revoke
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Client Lookup API</CardTitle>
          <CardDescription>How to call the endpoint from external systems.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <Label>Endpoint</Label>
            <code className="block bg-muted p-2 rounded mt-1 text-xs break-all">
              POST https://nsqosbysixcjcwkdpajk.supabase.co/functions/v1/client-lookup
            </code>
          </div>
          <div>
            <Label>Headers</Label>
            <code className="block bg-muted p-2 rounded mt-1 text-xs">
              Authorization: Bearer YOUR_API_KEY{'\n'}Content-Type: application/json
            </code>
          </div>
          <div>
            <Label>Body</Label>
            <code className="block bg-muted p-2 rounded mt-1 text-xs">
              {'{ "client_code": "MTG2" }'}
            </code>
          </div>
          <div>
            <Label>Response</Label>
            <code className="block bg-muted p-2 rounded mt-1 text-xs whitespace-pre">
{`{
  "exists": true,
  "client_name": "Mt. Gox",
  "client_code": "MTG2",
  "created_at": "2026-01-15T12:34:56Z",
  "stat_contacts": "alice@x.com, bob@x.com",
  "creative_contacts": "alice@x.com, carol@x.com",
  "sales_rep_name": "Jane Doe",
  "sales_rep_email": "jane@lnn.co"
}`}
            </code>
          </div>
        </CardContent>
      </Card>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={(open) => {
        setCreateOpen(open);
        if (!open) setCreatedKeyValue(null);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{createdKeyValue ? 'API Key Created' : 'New API Key'}</DialogTitle>
            <DialogDescription>
              {createdKeyValue
                ? 'Copy this key now. You will not be able to see it again.'
                : 'Give this key a descriptive name (e.g. "Zapier", "Internal sync").'}
            </DialogDescription>
          </DialogHeader>

          {createdKeyValue ? (
            <div className="space-y-3">
              <div className="flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <span>This is the only time the full key will be displayed. Store it somewhere safe.</span>
              </div>
              <div className="flex gap-2">
                <Input value={createdKeyValue} readOnly className="font-mono text-xs" />
                <Button onClick={() => copyToClipboard(createdKeyValue)} size="icon" variant="secondary">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="key-name">Name</Label>
              <Input
                id="key-name"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="e.g. Zapier integration"
                autoFocus
              />
            </div>
          )}

          <DialogFooter>
            {createdKeyValue ? (
              <Button onClick={() => setCreateOpen(false)}>Done</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreate} disabled={creating}>
                  {creating ? 'Creating…' : 'Create Key'}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke confirmation */}
      <AlertDialog open={!!revokingKey} onOpenChange={(open) => !open && setRevokingKey(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke this API key?</AlertDialogTitle>
            <AlertDialogDescription>
              "{revokingKey?.name}" will immediately stop working. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRevoke} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
