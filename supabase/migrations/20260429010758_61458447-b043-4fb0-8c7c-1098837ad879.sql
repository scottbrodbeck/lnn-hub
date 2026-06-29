-- Phase 3: Invoice tracking
CREATE TABLE IF NOT EXISTS public.qbo_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID REFERENCES public.crm_deals(id) ON DELETE SET NULL,
  crm_organization_id UUID REFERENCES public.crm_organizations(id) ON DELETE SET NULL,
  qbo_customer_id TEXT,
  qbo_invoice_id TEXT,                -- single invoice (one-time)
  qbo_recurring_id TEXT,              -- RecurringTransaction id
  doc_number TEXT,
  invoice_type TEXT NOT NULL DEFAULT 'one_time'
    CHECK (invoice_type IN ('one_time','recurring')),
  recurrence_cadence TEXT
    CHECK (recurrence_cadence IS NULL OR recurrence_cadence IN ('monthly','quarterly','yearly')),
  recurrence_start_date DATE,
  recurrence_end_date DATE,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','sent','partially_paid','paid','overdue','voided','failed')),
  txn_date DATE,
  due_date DATE,
  currency TEXT,
  subtotal NUMERIC(14,2),
  total NUMERIC(14,2),
  balance NUMERIC(14,2),
  line_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  send_to_email TEXT,
  email_sent_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  sync_error TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qbo_invoices_deal_id ON public.qbo_invoices (deal_id);
CREATE INDEX IF NOT EXISTS idx_qbo_invoices_org_id ON public.qbo_invoices (crm_organization_id);
CREATE INDEX IF NOT EXISTS idx_qbo_invoices_qbo_invoice_id ON public.qbo_invoices (qbo_invoice_id) WHERE qbo_invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_qbo_invoices_qbo_recurring_id ON public.qbo_invoices (qbo_recurring_id) WHERE qbo_recurring_id IS NOT NULL;

ALTER TABLE public.qbo_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "CRM users manage qbo invoices" ON public.qbo_invoices;
CREATE POLICY "CRM users manage qbo invoices"
ON public.qbo_invoices
FOR ALL
USING (public.has_crm_access(auth.uid()))
WITH CHECK (public.has_crm_access(auth.uid()));

CREATE TRIGGER trg_qbo_invoices_updated_at
  BEFORE UPDATE ON public.qbo_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Deal-level pointers / preferences
ALTER TABLE public.crm_deals
  ADD COLUMN IF NOT EXISTS qbo_invoice_skipped BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS qbo_last_invoice_id UUID REFERENCES public.qbo_invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS qbo_recurring_invoice_id UUID REFERENCES public.qbo_invoices(id) ON DELETE SET NULL;