import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, ArrowLeft, Save } from 'lucide-react';
import {
  useBundleItems,
  useSaveBundleItem,
  useDeleteBundleItem,
  type BundleItem,
} from '@/hooks/useBundleItems';

type Draft = Omit<BundleItem, 'created_at' | 'updated_at'> & { _dirty?: boolean };

const CONTENT_CATEGORIES = ['website', 'email_blast', 'email_sponsorship'];
const POST_TYPES = ['standard', 'sponsored', 'newsletter'];
const CADENCES = ['none', 'weekly', 'biweekly', 'monthly'] as const;

export default function SalesBundleComposition() {
  const { productId } = useParams<{ productId: string }>();

  const { data: product } = useQuery({
    queryKey: ['crm_products', productId],
    enabled: !!productId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_products')
        .select('id, name, category, site_slug')
        .eq('id', productId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: items = [], isLoading } = useBundleItems(productId);
  const save = useSaveBundleItem();
  const del = useDeleteBundleItem();

  const [drafts, setDrafts] = useState<Draft[]>([]);

  useEffect(() => {
    setDrafts(items.map((i) => ({ ...i })));
  }, [items]);

  const updateDraft = (idx: number, patch: Partial<Draft>) => {
    setDrafts((arr) => arr.map((d, i) => (i === idx ? { ...d, ...patch, _dirty: true } : d)));
  };

  const addRow = () => {
    if (!productId) return;
    setDrafts((arr) => [
      ...arr,
      {
        id: `new-${Date.now()}-${arr.length}`,
        bundle_product_id: productId,
        assignment_kind: 'post',
        content_category: 'website',
        post_type: 'standard',
        quantity: 1,
        cadence: 'weekly',
        label: '',
        sort_order: arr.length,
        _dirty: true,
      },
    ]);
  };

  const saveRow = async (d: Draft) => {
    const isNew = d.id.startsWith('new-');
    await save.mutateAsync({
      ...(isNew ? {} : { id: d.id }),
      bundle_product_id: d.bundle_product_id,
      assignment_kind: d.assignment_kind,
      content_category: d.assignment_kind === 'post' ? d.content_category : null,
      post_type: d.assignment_kind === 'post' ? d.post_type : null,
      quantity: d.quantity,
      cadence: d.cadence,
      label: d.label,
      sort_order: d.sort_order,
    });
  };

  const deleteRow = async (d: Draft) => {
    if (d.id.startsWith('new-')) {
      setDrafts((arr) => arr.filter((x) => x.id !== d.id));
      return;
    }
    if (!productId) return;
    await del.mutateAsync({ id: d.id, bundle_product_id: productId });
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/sales/products"><ArrowLeft className="h-4 w-4 mr-1" /> Products</Link>
          </Button>
          <div>
            <h1 className="text-2xl font-semibold">{product?.name ?? 'Bundle'}</h1>
            <div className="text-sm text-muted-foreground flex gap-2 items-center">
              <Badge variant="outline">{product?.category ?? '—'}</Badge>
              {product?.site_slug && <span>{product.site_slug}</span>}
            </div>
          </div>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Define what deliverables this bundle contains. When the sales team generates assignments
        from an invoice that includes this bundle, one synthetic assignment line will be planned per
        item below (multiplied by the deal quantity).
      </p>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Label</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>Content category</TableHead>
              <TableHead>Post type</TableHead>
              <TableHead className="w-20">Qty</TableHead>
              <TableHead>Cadence</TableHead>
              <TableHead className="w-32"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">Loading…</TableCell></TableRow>
            ) : drafts.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">No items yet.</TableCell></TableRow>
            ) : (
              drafts.map((d, idx) => {
                const isPost = d.assignment_kind === 'post';
                return (
                  <TableRow key={d.id}>
                    <TableCell>
                      <Input
                        value={d.label ?? ''}
                        placeholder="e.g. Sponsored post"
                        onChange={(e) => updateDraft(idx, { label: e.target.value })}
                        className="h-8"
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={d.assignment_kind}
                        onValueChange={(v) => updateDraft(idx, { assignment_kind: v as any })}
                      >
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="post">post</SelectItem>
                          <SelectItem value="display_ad">display_ad</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      {isPost ? (
                        <Select
                          value={d.content_category ?? 'website'}
                          onValueChange={(v) => updateDraft(idx, { content_category: v })}
                        >
                          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {CONTENT_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : <span className="text-xs text-muted-foreground">n/a</span>}
                    </TableCell>
                    <TableCell>
                      {isPost ? (
                        <Select
                          value={d.post_type ?? 'standard'}
                          onValueChange={(v) => updateDraft(idx, { post_type: v })}
                        >
                          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {POST_TYPES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : <span className="text-xs text-muted-foreground">n/a</span>}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={1}
                        value={d.quantity}
                        onChange={(e) => updateDraft(idx, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                        className="h-8 w-16"
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={d.cadence}
                        onValueChange={(v) => updateDraft(idx, { cadence: v as any })}
                      >
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {CADENCES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant={d._dirty ? 'default' : 'outline'}
                          disabled={!d._dirty || save.isPending}
                          onClick={() => saveRow(d)}
                        >
                          <Save className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => deleteRow(d)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <div>
        <Button variant="outline" onClick={addRow}>
          <Plus className="h-4 w-4 mr-1" /> Add item
        </Button>
      </div>
    </div>
  );
}
