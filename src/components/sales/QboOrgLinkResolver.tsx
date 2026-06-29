import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, Link2, Plus, AlertTriangle } from 'lucide-react';
import {
  useQboCustomerSearch,
  useQboCustomerSuggestions,
  useQboLinkCustomer,
  useQboCreateCustomer,
} from '@/hooks/useQboCustomerSync';

interface Props {
  crmOrgId: string;
  crmOrgName: string;
  primaryContactEmail?: string | null;
  defaults?: {
    phone?: string | null;
    website?: string | null;
    address?: string | null;
  };
  onLinked?: () => void;
}

const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function QboOrgLinkResolver({
  crmOrgId,
  crmOrgName,
  primaryContactEmail,
  defaults,
  onLinked,
}: Props) {
  const [query, setQuery] = useState(crmOrgName);
  const [hasSearched, setHasSearched] = useState(crmOrgName.trim().length >= 2);
  const [showCreate, setShowCreate] = useState(false);

  // Create-form state
  const [newName, setNewName] = useState(crmOrgName);
  const [newEmail, setNewEmail] = useState(primaryContactEmail ?? '');
  const [newPhone, setNewPhone] = useState(defaults?.phone ?? '');
  const [newWebsite, setNewWebsite] = useState(defaults?.website ?? '');
  const [newAddress, setNewAddress] = useState(defaults?.address ?? '');

  const link = useQboLinkCustomer();
  const create = useQboCreateCustomer();

  const { data: suggestions = [], isLoading: suggestLoading } = useQboCustomerSuggestions(
    crmOrgId,
    true,
    primaryContactEmail ?? null,
  );
  const { data: results = [], isFetching: searchLoading } = useQboCustomerSearch(
    query,
    hasSearched,
  );

  // Pre-select the best (first) match whenever a new result set arrives.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    if (results.length > 0) setSelectedId(results[0].id);
    else setSelectedId(null);
  }, [results]);

  const handleLink = async (qboId: string) => {
    await link.mutateAsync({ crm_organization_id: crmOrgId, qbo_customer_id: qboId });
    onLinked?.();
  };

  const handleCreate = async () => {
    await create.mutateAsync({
      crm_organization_id: crmOrgId,
      display_name: newName.trim(),
      email: newEmail.trim() || null,
      phone: newPhone.trim() || null,
      website: newWebsite.trim() || null,
      billing_address: newAddress.trim() ? { line1: newAddress.trim() } : null,
    });
    onLinked?.();
  };

  return (
    <div className="rounded-md border border-amber-300/60 bg-amber-50/50 dark:bg-amber-950/20 p-3 space-y-4">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-600 shrink-0" />
        <div className="text-sm">
          <div className="font-medium text-amber-900 dark:text-amber-200">
            Link this organization to QuickBooks
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            <strong>{crmOrgName}</strong> isn't linked to a QuickBooks customer yet. Pick a match
            below, search for one, or create a new customer in QuickBooks.
          </p>
        </div>
      </div>

      {/* Suggestions */}
      <section>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          Suggested matches
        </h4>
        {suggestLoading ? (
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" /> Searching QuickBooks…
          </div>
        ) : suggestions.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No automatic matches found by name or email.
          </p>
        ) : (
          <div className="space-y-1.5">
            {suggestions.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between rounded-md border bg-background p-2 text-sm"
              >
                <div className="min-w-0">
                  <div className="font-medium truncate">{s.display_name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {s.email ?? '—'} · Bal {fmt.format(s.balance)}
                    <Badge variant="outline" className="ml-2 text-[10px]">
                      {s.matched_by === 'email' ? 'email match' : `${s.score}%`}
                    </Badge>
                  </div>
                </div>
                <Button
                  size="sm"
                  disabled={link.isPending}
                  onClick={() => handleLink(s.id)}
                  className="ml-2 shrink-0"
                >
                  <Link2 className="h-3 w-3 mr-1" /> Link
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Search */}
      <section>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          Search QuickBooks
        </h4>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setHasSearched(true);
          }}
          className="flex gap-2"
        >
          <Input
            placeholder="Search by name or email…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-8 text-sm"
          />
          <Button
            type="submit"
            variant="outline"
            size="sm"
            disabled={query.trim().length < 2 || searchLoading}
          >
            {searchLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Search className="h-3 w-3" />
            )}
          </Button>
        </form>
        {hasSearched && (
          <div className="mt-2 space-y-1.5">
            {searchLoading ? (
              <p className="text-xs text-muted-foreground">Searching…</p>
            ) : results.length === 0 ? (
              <p className="text-xs text-muted-foreground">No customers found.</p>
            ) : (
              <>
                <p className="text-[11px] text-muted-foreground">
                  {results.length} match{results.length === 1 ? '' : 'es'} — best match pre-selected.
                </p>
                {results.slice(0, 8).map((c) => {
                  const isSelected = selectedId === c.id;
                  return (
                    <label
                      key={c.id}
                      className={`flex items-center justify-between gap-2 rounded-md border bg-background p-2 text-sm cursor-pointer transition ${
                        isSelected ? 'border-primary ring-1 ring-primary/30' : 'hover:bg-muted/50'
                      }`}
                    >
                      <div className="flex items-start gap-2 min-w-0">
                        <input
                          type="radio"
                          name="qbo-match"
                          checked={isSelected}
                          onChange={() => setSelectedId(c.id)}
                          className="mt-1 shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="font-medium truncate">
                            {c.display_name}
                            {!c.active && (
                              <Badge variant="secondary" className="ml-2 text-[10px]">
                                inactive
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {c.email ?? '—'} · Bal {fmt.format(c.balance)}
                          </div>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={link.isPending}
                        onClick={(e) => {
                          e.preventDefault();
                          handleLink(c.id);
                        }}
                        className="ml-2 shrink-0"
                      >
                        <Link2 className="h-3 w-3 mr-1" /> Link
                      </Button>
                    </label>
                  );
                })}
                <div className="flex justify-end pt-1">
                  <Button
                    size="sm"
                    disabled={!selectedId || link.isPending}
                    onClick={() => selectedId && handleLink(selectedId)}
                  >
                    {link.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                    <Link2 className="h-3 w-3 mr-1" /> Link selected
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </section>


      {/* Create new */}
      <section>
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Create new in QuickBooks
          </h4>
          {!showCreate && (
            <Button size="sm" variant="outline" onClick={() => setShowCreate(true)}>
              <Plus className="h-3 w-3 mr-1" /> New customer
            </Button>
          )}
        </div>
        {showCreate && (
          <div className="mt-2 space-y-2 rounded-md border bg-background p-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1 col-span-2">
                <Label className="text-xs">Display name</Label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">Email</Label>
                <Input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">Phone</Label>
                <Input
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="grid gap-1 col-span-2">
                <Label className="text-xs">Website</Label>
                <Input
                  value={newWebsite}
                  onChange={(e) => setNewWebsite(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="grid gap-1 col-span-2">
                <Label className="text-xs">Billing address</Label>
                <Input
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowCreate(false)}
                disabled={create.isPending}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleCreate}
                disabled={create.isPending || !newName.trim()}
              >
                {create.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                Create &amp; link
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
