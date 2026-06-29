import { useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, Link2 } from 'lucide-react';
import {
  useQboCustomerSearch,
  useQboCustomerSuggestions,
  useQboLinkCustomer,
} from '@/hooks/useQboCustomerSync';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  crmOrgId: string;
  crmOrgName: string;
}

const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function LinkQboCustomerDialog({ open, onOpenChange, crmOrgId, crmOrgName }: Props) {
  const [query, setQuery] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const link = useQboLinkCustomer();

  const { data: suggestions = [], isLoading: suggestLoading } = useQboCustomerSuggestions(crmOrgId, open);
  const { data: results = [], isFetching: searchLoading } = useQboCustomerSearch(query, open && hasSearched);

  const handleLink = async (qboId: string) => {
    await link.mutateAsync({ crm_organization_id: crmOrgId, qbo_customer_id: qboId });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Link to QuickBooks customer</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Linking <strong>{crmOrgName}</strong> — choose the matching QBO customer.
          </p>
        </DialogHeader>

        <div className="space-y-5">
          <section>
            <h3 className="text-sm font-medium mb-2">Suggested matches</h3>
            {suggestLoading ? (
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" /> Searching QuickBooks…
              </div>
            ) : suggestions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No automatic suggestions found.</p>
            ) : (
              <div className="space-y-2">
                {suggestions.map((s) => (
                  <div key={s.id} className="flex items-center justify-between border rounded-md p-2 text-sm">
                    <div>
                      <div className="font-medium">{s.display_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {s.email ?? '—'} · Balance {fmt.format(s.balance)}
                        <Badge variant="outline" className="ml-2 text-[10px]">{s.score}%</Badge>
                      </div>
                    </div>
                    <Button size="sm" disabled={link.isPending} onClick={() => handleLink(s.id)}>
                      <Link2 className="h-3 w-3 mr-1" /> Link
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h3 className="text-sm font-medium mb-2">Search QuickBooks</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setHasSearched(true);
              }}
              className="flex gap-2"
            >
              <Input
                placeholder="Search by display or company name…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <Button type="submit" variant="outline" disabled={query.trim().length < 2 || searchLoading}>
                {searchLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </form>

            {hasSearched && (
              <div className="mt-3 space-y-2">
                {searchLoading ? (
                  <p className="text-sm text-muted-foreground">Searching…</p>
                ) : results.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No customers found.</p>
                ) : (
                  results.map((c) => (
                    <div key={c.id} className="flex items-center justify-between border rounded-md p-2 text-sm">
                      <div>
                        <div className="font-medium">
                          {c.display_name}
                          {!c.active && <Badge variant="secondary" className="ml-2 text-[10px]">inactive</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {c.email ?? '—'} · Balance {fmt.format(c.balance)}
                        </div>
                      </div>
                      <Button size="sm" variant="outline" disabled={link.isPending} onClick={() => handleLink(c.id)}>
                        <Link2 className="h-3 w-3 mr-1" /> Link
                      </Button>
                    </div>
                  ))
                )}
              </div>
            )}
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
