export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      admin_audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          diff: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json
          organization_id: string
          summary: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          diff?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json
          organization_id: string
          summary: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          diff?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json
          organization_id?: string
          summary?: string
        }
        Relationships: []
      }
      admin_daily_checklist: {
        Row: {
          checked_at: string
          checked_by: string
          checklist_date: string
          created_at: string
          id: string
          item_id: string
          item_type: string
        }
        Insert: {
          checked_at?: string
          checked_by: string
          checklist_date?: string
          created_at?: string
          id?: string
          item_id: string
          item_type: string
        }
        Update: {
          checked_at?: string
          checked_by?: string
          checklist_date?: string
          created_at?: string
          id?: string
          item_id?: string
          item_type?: string
        }
        Relationships: []
      }
      admin_settings: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          key: string
          updated_at: string | null
          value: Json
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          key: string
          updated_at?: string | null
          value: Json
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          key?: string
          updated_at?: string | null
          value?: Json
        }
        Relationships: []
      }
      api_key_usage_log: {
        Row: {
          api_key_id: string | null
          client_code: string | null
          created_at: string
          endpoint: string
          error_message: string | null
          id: string
          ip: string | null
          status_code: number
          user_agent: string | null
        }
        Insert: {
          api_key_id?: string | null
          client_code?: string | null
          created_at?: string
          endpoint: string
          error_message?: string | null
          id?: string
          ip?: string | null
          status_code: number
          user_agent?: string | null
        }
        Update: {
          api_key_id?: string | null
          client_code?: string | null
          created_at?: string
          endpoint?: string
          error_message?: string | null
          id?: string
          ip?: string | null
          status_code?: number
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_key_usage_log_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          revoked_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          revoked_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          revoked_at?: string | null
        }
        Relationships: []
      }
      api_logs: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          log_type: string
          post_id: string | null
          request_data: Json | null
          response_data: Json | null
          site_id: string | null
          status: string
          summary: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          log_type: string
          post_id?: string | null
          request_data?: Json | null
          response_data?: Json | null
          site_id?: string | null
          status: string
          summary: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          log_type?: string
          post_id?: string | null
          request_data?: Json | null
          response_data?: Json | null
          site_id?: string | null
          status?: string
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_logs_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_logs_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_logs_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites_public"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_instances: {
        Row: {
          assignment_id: string
          completed_at: string | null
          created_at: string
          exception_notes: string | null
          id: string
          instance_date: string
          is_completed: boolean
          is_exception: boolean
          is_skipped: boolean
          overridden_assignment_name: string | null
          overridden_due_date: string | null
          skip_type: string | null
          started_at: string | null
          submitted_post_id: string | null
          updated_at: string
        }
        Insert: {
          assignment_id: string
          completed_at?: string | null
          created_at?: string
          exception_notes?: string | null
          id?: string
          instance_date: string
          is_completed?: boolean
          is_exception?: boolean
          is_skipped?: boolean
          overridden_assignment_name?: string | null
          overridden_due_date?: string | null
          skip_type?: string | null
          started_at?: string | null
          submitted_post_id?: string | null
          updated_at?: string
        }
        Update: {
          assignment_id?: string
          completed_at?: string | null
          created_at?: string
          exception_notes?: string | null
          id?: string
          instance_date?: string
          is_completed?: boolean
          is_exception?: boolean
          is_skipped?: boolean
          overridden_assignment_name?: string | null
          overridden_due_date?: string | null
          skip_type?: string | null
          started_at?: string | null
          submitted_post_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignment_instances_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "post_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_instances_submitted_post_id_fkey"
            columns: ["submitted_post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      column_templates: {
        Row: {
          author_name: string | null
          banner_image_url: string | null
          created_at: string
          created_by: string | null
          featured_image_url: string | null
          footer_paragraph: string | null
          id: string
          intro_paragraph: string | null
          is_active: boolean
          logo_author_name: string | null
          logo_link_url: string | null
          logo_url: string | null
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          author_name?: string | null
          banner_image_url?: string | null
          created_at?: string
          created_by?: string | null
          featured_image_url?: string | null
          footer_paragraph?: string | null
          id?: string
          intro_paragraph?: string | null
          is_active?: boolean
          logo_author_name?: string | null
          logo_link_url?: string | null
          logo_url?: string | null
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          author_name?: string | null
          banner_image_url?: string | null
          created_at?: string
          created_by?: string | null
          featured_image_url?: string | null
          footer_paragraph?: string | null
          id?: string
          intro_paragraph?: string | null
          is_active?: boolean
          logo_author_name?: string | null
          logo_link_url?: string | null
          logo_url?: string | null
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "column_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "column_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_activities: {
        Row: {
          body: string | null
          body_fetched_at: string | null
          body_html: string | null
          body_text: string | null
          completed_at: string | null
          contact_id: string | null
          created_at: string
          crm_organization_id: string | null
          deal_id: string | null
          direction: string | null
          due_at: string | null
          engagement_type: string | null
          hs_archived: boolean
          hs_timestamp: string | null
          hs_updated_at: string | null
          hubspot_id: string | null
          id: string
          metadata: Json
          owner_user_id: string | null
          subject: string
          sync_error: string | null
          sync_status: string
          type: Database["public"]["Enums"]["crm_activity_type"]
          updated_at: string
        }
        Insert: {
          body?: string | null
          body_fetched_at?: string | null
          body_html?: string | null
          body_text?: string | null
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string
          crm_organization_id?: string | null
          deal_id?: string | null
          direction?: string | null
          due_at?: string | null
          engagement_type?: string | null
          hs_archived?: boolean
          hs_timestamp?: string | null
          hs_updated_at?: string | null
          hubspot_id?: string | null
          id?: string
          metadata?: Json
          owner_user_id?: string | null
          subject: string
          sync_error?: string | null
          sync_status?: string
          type: Database["public"]["Enums"]["crm_activity_type"]
          updated_at?: string
        }
        Update: {
          body?: string | null
          body_fetched_at?: string | null
          body_html?: string | null
          body_text?: string | null
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string
          crm_organization_id?: string | null
          deal_id?: string | null
          direction?: string | null
          due_at?: string | null
          engagement_type?: string | null
          hs_archived?: boolean
          hs_timestamp?: string | null
          hs_updated_at?: string | null
          hubspot_id?: string | null
          id?: string
          metadata?: Json
          owner_user_id?: string | null
          subject?: string
          sync_error?: string | null
          sync_status?: string
          type?: Database["public"]["Enums"]["crm_activity_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_activities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_crm_organization_id_fkey"
            columns: ["crm_organization_id"]
            isOneToOne: false
            referencedRelation: "crm_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "crm_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_contacts: {
        Row: {
          created_at: string
          crm_organization_id: string | null
          email: string | null
          first_name: string | null
          hs_archived: boolean
          hs_updated_at: string | null
          hubspot_id: string | null
          id: string
          import_batch_id: string | null
          is_primary: boolean
          last_name: string | null
          notes: string | null
          owner_user_id: string | null
          phone: string | null
          sync_error: string | null
          sync_status: string
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          crm_organization_id?: string | null
          email?: string | null
          first_name?: string | null
          hs_archived?: boolean
          hs_updated_at?: string | null
          hubspot_id?: string | null
          id?: string
          import_batch_id?: string | null
          is_primary?: boolean
          last_name?: string | null
          notes?: string | null
          owner_user_id?: string | null
          phone?: string | null
          sync_error?: string | null
          sync_status?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          crm_organization_id?: string | null
          email?: string | null
          first_name?: string | null
          hs_archived?: boolean
          hs_updated_at?: string | null
          hubspot_id?: string | null
          id?: string
          import_batch_id?: string | null
          is_primary?: boolean
          last_name?: string | null
          notes?: string | null
          owner_user_id?: string | null
          phone?: string | null
          sync_error?: string | null
          sync_status?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_contacts_crm_organization_id_fkey"
            columns: ["crm_organization_id"]
            isOneToOne: false
            referencedRelation: "crm_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_contacts_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_deal_products: {
        Row: {
          created_at: string
          deal_id: string
          discount_pct: number
          id: string
          product_id: string
          quantity: number
          total: number
          unit_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          deal_id: string
          discount_pct?: number
          id?: string
          product_id: string
          quantity?: number
          total?: number
          unit_price?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          deal_id?: string
          discount_pct?: number
          id?: string
          product_id?: string
          quantity?: number
          total?: number
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_deal_products_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "crm_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_deal_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "crm_products"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_deal_stage_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          deal_id: string
          from_stage_id: string | null
          id: string
          to_stage_id: string | null
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          deal_id: string
          from_stage_id?: string | null
          id?: string
          to_stage_id?: string | null
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          deal_id?: string
          from_stage_id?: string | null
          id?: string
          to_stage_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_deal_stage_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_deal_stage_history_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "crm_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_deal_stage_history_from_stage_id_fkey"
            columns: ["from_stage_id"]
            isOneToOne: false
            referencedRelation: "crm_pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_deal_stage_history_to_stage_id_fkey"
            columns: ["to_stage_id"]
            isOneToOne: false
            referencedRelation: "crm_pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_deals: {
        Row: {
          blanket_discount_pct: number
          created_at: string
          crm_organization_id: string | null
          currency: string
          expected_close_date: string | null
          hs_archived: boolean
          hs_updated_at: string | null
          hubspot_id: string | null
          id: string
          import_batch_id: string | null
          linked_assignment_id: string | null
          lost_at: string | null
          lost_reason: string | null
          metadata: Json
          notes: string | null
          owner_user_id: string | null
          pipeline_id: string
          primary_contact_id: string | null
          qbo_invoice_skipped: boolean | null
          qbo_last_invoice_id: string | null
          qbo_recurring_invoice_id: string | null
          source: string | null
          stage_id: string
          status: Database["public"]["Enums"]["crm_deal_status"]
          sync_error: string | null
          sync_status: string
          title: string
          updated_at: string
          value: number
          won_at: string | null
        }
        Insert: {
          blanket_discount_pct?: number
          created_at?: string
          crm_organization_id?: string | null
          currency?: string
          expected_close_date?: string | null
          hs_archived?: boolean
          hs_updated_at?: string | null
          hubspot_id?: string | null
          id?: string
          import_batch_id?: string | null
          linked_assignment_id?: string | null
          lost_at?: string | null
          lost_reason?: string | null
          metadata?: Json
          notes?: string | null
          owner_user_id?: string | null
          pipeline_id: string
          primary_contact_id?: string | null
          qbo_invoice_skipped?: boolean | null
          qbo_last_invoice_id?: string | null
          qbo_recurring_invoice_id?: string | null
          source?: string | null
          stage_id: string
          status?: Database["public"]["Enums"]["crm_deal_status"]
          sync_error?: string | null
          sync_status?: string
          title: string
          updated_at?: string
          value?: number
          won_at?: string | null
        }
        Update: {
          blanket_discount_pct?: number
          created_at?: string
          crm_organization_id?: string | null
          currency?: string
          expected_close_date?: string | null
          hs_archived?: boolean
          hs_updated_at?: string | null
          hubspot_id?: string | null
          id?: string
          import_batch_id?: string | null
          linked_assignment_id?: string | null
          lost_at?: string | null
          lost_reason?: string | null
          metadata?: Json
          notes?: string | null
          owner_user_id?: string | null
          pipeline_id?: string
          primary_contact_id?: string | null
          qbo_invoice_skipped?: boolean | null
          qbo_last_invoice_id?: string | null
          qbo_recurring_invoice_id?: string | null
          source?: string | null
          stage_id?: string
          status?: Database["public"]["Enums"]["crm_deal_status"]
          sync_error?: string | null
          sync_status?: string
          title?: string
          updated_at?: string
          value?: number
          won_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_deals_crm_organization_id_fkey"
            columns: ["crm_organization_id"]
            isOneToOne: false
            referencedRelation: "crm_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_deals_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_deals_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "crm_pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_deals_primary_contact_id_fkey"
            columns: ["primary_contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_deals_qbo_last_invoice_id_fkey"
            columns: ["qbo_last_invoice_id"]
            isOneToOne: false
            referencedRelation: "qbo_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_deals_qbo_recurring_invoice_id_fkey"
            columns: ["qbo_recurring_invoice_id"]
            isOneToOne: false
            referencedRelation: "qbo_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_deals_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "crm_pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_import_batches: {
        Row: {
          completed_at: string | null
          counts: Json
          created_at: string
          created_by: string | null
          error_message: string | null
          field_mapping: Json
          id: string
          owner_mapping: Json
          pipeline_id: string | null
          selected_entities: Json
          source: string
          stage_mapping: Json
          status: string
          undone_at: string | null
        }
        Insert: {
          completed_at?: string | null
          counts?: Json
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          field_mapping?: Json
          id?: string
          owner_mapping?: Json
          pipeline_id?: string | null
          selected_entities?: Json
          source?: string
          stage_mapping?: Json
          status?: string
          undone_at?: string | null
        }
        Update: {
          completed_at?: string | null
          counts?: Json
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          field_mapping?: Json
          id?: string
          owner_mapping?: Json
          pipeline_id?: string | null
          selected_entities?: Json
          source?: string
          stage_mapping?: Json
          status?: string
          undone_at?: string | null
        }
        Relationships: []
      }
      crm_import_staging: {
        Row: {
          associations: Json
          batch_id: string
          created_at: string
          entity_type: string
          errors: Json
          hubspot_id: string | null
          id: string
          match_target_id: string | null
          match_type: string
          payload: Json
          previous_batch_id: string | null
        }
        Insert: {
          associations?: Json
          batch_id: string
          created_at?: string
          entity_type: string
          errors?: Json
          hubspot_id?: string | null
          id?: string
          match_target_id?: string | null
          match_type?: string
          payload?: Json
          previous_batch_id?: string | null
        }
        Update: {
          associations?: Json
          batch_id?: string
          created_at?: string
          entity_type?: string
          errors?: Json
          hubspot_id?: string | null
          id?: string
          match_target_id?: string | null
          match_type?: string
          payload?: Json
          previous_batch_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_import_staging_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "crm_import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_organizations: {
        Row: {
          address: string | null
          created_at: string
          crm_owner_id: string | null
          hs_archived: boolean
          hs_updated_at: string | null
          hubspot_id: string | null
          id: string
          import_batch_id: string | null
          industry: string | null
          last_activity_at: string | null
          linked_org_id: string | null
          name: string
          notes: string | null
          owner_user_id: string | null
          phone: string | null
          qbo_active: boolean | null
          qbo_balance: number | null
          qbo_balance_refreshed_at: string | null
          qbo_balance_with_jobs: number | null
          qbo_currency: string | null
          qbo_customer_id: string | null
          qbo_customer_name: string | null
          qbo_last_invoice_date: string | null
          qbo_last_payment_date: string | null
          qbo_sync_error: string | null
          qbo_sync_token: string | null
          size: string | null
          source: string | null
          sync_error: string | null
          sync_status: string
          tags: string[]
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          crm_owner_id?: string | null
          hs_archived?: boolean
          hs_updated_at?: string | null
          hubspot_id?: string | null
          id?: string
          import_batch_id?: string | null
          industry?: string | null
          last_activity_at?: string | null
          linked_org_id?: string | null
          name: string
          notes?: string | null
          owner_user_id?: string | null
          phone?: string | null
          qbo_active?: boolean | null
          qbo_balance?: number | null
          qbo_balance_refreshed_at?: string | null
          qbo_balance_with_jobs?: number | null
          qbo_currency?: string | null
          qbo_customer_id?: string | null
          qbo_customer_name?: string | null
          qbo_last_invoice_date?: string | null
          qbo_last_payment_date?: string | null
          qbo_sync_error?: string | null
          qbo_sync_token?: string | null
          size?: string | null
          source?: string | null
          sync_error?: string | null
          sync_status?: string
          tags?: string[]
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          crm_owner_id?: string | null
          hs_archived?: boolean
          hs_updated_at?: string | null
          hubspot_id?: string | null
          id?: string
          import_batch_id?: string | null
          industry?: string | null
          last_activity_at?: string | null
          linked_org_id?: string | null
          name?: string
          notes?: string | null
          owner_user_id?: string | null
          phone?: string | null
          qbo_active?: boolean | null
          qbo_balance?: number | null
          qbo_balance_refreshed_at?: string | null
          qbo_balance_with_jobs?: number | null
          qbo_currency?: string | null
          qbo_customer_id?: string | null
          qbo_customer_name?: string | null
          qbo_last_invoice_date?: string | null
          qbo_last_payment_date?: string | null
          qbo_sync_error?: string | null
          qbo_sync_token?: string | null
          size?: string | null
          source?: string | null
          sync_error?: string | null
          sync_status?: string
          tags?: string[]
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_organizations_crm_owner_id_fkey"
            columns: ["crm_owner_id"]
            isOneToOne: false
            referencedRelation: "crm_owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_organizations_linked_org_id_fkey"
            columns: ["linked_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_organizations_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_owners: {
        Row: {
          archived: boolean
          created_at: string
          email: string | null
          first_name: string | null
          full_name: string | null
          hs_updated_at: string | null
          hubspot_owner_id: string
          id: string
          last_name: string | null
          match_method: string
          profile_id: string | null
          updated_at: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          email?: string | null
          first_name?: string | null
          full_name?: string | null
          hs_updated_at?: string | null
          hubspot_owner_id: string
          id?: string
          last_name?: string | null
          match_method?: string
          profile_id?: string | null
          updated_at?: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          email?: string | null
          first_name?: string | null
          full_name?: string | null
          hs_updated_at?: string | null
          hubspot_owner_id?: string
          id?: string
          last_name?: string | null
          match_method?: string
          profile_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_owners_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_pipeline_stages: {
        Row: {
          color: string | null
          created_at: string
          hs_archived: boolean
          hs_updated_at: string | null
          hubspot_id: string | null
          id: string
          is_lost: boolean
          is_won: boolean
          name: string
          pipeline_id: string
          sort_order: number
          updated_at: string
          win_probability: number
        }
        Insert: {
          color?: string | null
          created_at?: string
          hs_archived?: boolean
          hs_updated_at?: string | null
          hubspot_id?: string | null
          id?: string
          is_lost?: boolean
          is_won?: boolean
          name: string
          pipeline_id: string
          sort_order?: number
          updated_at?: string
          win_probability?: number
        }
        Update: {
          color?: string | null
          created_at?: string
          hs_archived?: boolean
          hs_updated_at?: string | null
          hubspot_id?: string | null
          id?: string
          is_lost?: boolean
          is_won?: boolean
          name?: string
          pipeline_id?: string
          sort_order?: number
          updated_at?: string
          win_probability?: number
        }
        Relationships: [
          {
            foreignKeyName: "crm_pipeline_stages_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "crm_pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_pipelines: {
        Row: {
          created_at: string
          hs_archived: boolean
          hs_updated_at: string | null
          hubspot_id: string | null
          id: string
          is_default: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          hs_archived?: boolean
          hs_updated_at?: string | null
          hubspot_id?: string | null
          id?: string
          is_default?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          hs_archived?: boolean
          hs_updated_at?: string | null
          hubspot_id?: string | null
          id?: string
          is_default?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      crm_product_bundle_items: {
        Row: {
          assignment_kind: string
          bundle_product_id: string
          cadence: string
          content_category: string | null
          created_at: string
          id: string
          label: string | null
          post_type: string | null
          quantity: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          assignment_kind: string
          bundle_product_id: string
          cadence?: string
          content_category?: string | null
          created_at?: string
          id?: string
          label?: string | null
          post_type?: string | null
          quantity?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          assignment_kind?: string
          bundle_product_id?: string
          cadence?: string
          content_category?: string | null
          created_at?: string
          id?: string
          label?: string | null
          post_type?: string | null
          quantity?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_product_bundle_items_bundle_product_id_fkey"
            columns: ["bundle_product_id"]
            isOneToOne: false
            referencedRelation: "crm_products"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_product_hubspot_links: {
        Row: {
          created_at: string
          crm_product_id: string
          hubspot_name: string | null
          hubspot_price: number | null
          hubspot_product_id: string
          id: string
          last_push_error: string | null
          last_push_status: string | null
          last_pushed_at: string | null
          linked_at: string
          linked_by: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          crm_product_id: string
          hubspot_name?: string | null
          hubspot_price?: number | null
          hubspot_product_id: string
          id?: string
          last_push_error?: string | null
          last_push_status?: string | null
          last_pushed_at?: string | null
          linked_at?: string
          linked_by?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          crm_product_id?: string
          hubspot_name?: string | null
          hubspot_price?: number | null
          hubspot_product_id?: string
          id?: string
          last_push_error?: string | null
          last_push_status?: string | null
          last_pushed_at?: string | null
          linked_at?: string
          linked_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_product_hubspot_links_crm_product_id_fkey"
            columns: ["crm_product_id"]
            isOneToOne: false
            referencedRelation: "crm_products"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_product_sync_runs: {
        Row: {
          archived_count: number
          created_count: number
          error: string | null
          finished_at: string | null
          id: string
          source: string
          started_at: string
          status: string
          triggered_by: string
          unchanged_count: number
          updated_count: number
        }
        Insert: {
          archived_count?: number
          created_count?: number
          error?: string | null
          finished_at?: string | null
          id?: string
          source?: string
          started_at?: string
          status?: string
          triggered_by?: string
          unchanged_count?: number
          updated_count?: number
        }
        Update: {
          archived_count?: number
          created_count?: number
          error?: string | null
          finished_at?: string | null
          id?: string
          source?: string
          started_at?: string
          status?: string
          triggered_by?: string
          unchanged_count?: number
          updated_count?: number
        }
        Relationships: []
      }
      crm_products: {
        Row: {
          billing_cycle: Database["public"]["Enums"]["crm_billing_cycle"]
          category: string | null
          created_at: string
          description: string | null
          hubspot_id: string | null
          hubspot_sync_enabled: boolean
          id: string
          import_batch_id: string | null
          is_active: boolean
          name: string
          qbo_environment: string | null
          qbo_item_id: string | null
          qbo_item_name: string | null
          qbo_sync_error: string | null
          qbo_sync_fields: string
          qbo_sync_token: string | null
          qbo_synced_at: string | null
          site_slug: string | null
          source: string
          source_key: string | null
          source_synced_at: string | null
          unit_price: number
          updated_at: string
          upstream_id: string | null
          variant_slug: string | null
        }
        Insert: {
          billing_cycle?: Database["public"]["Enums"]["crm_billing_cycle"]
          category?: string | null
          created_at?: string
          description?: string | null
          hubspot_id?: string | null
          hubspot_sync_enabled?: boolean
          id?: string
          import_batch_id?: string | null
          is_active?: boolean
          name: string
          qbo_environment?: string | null
          qbo_item_id?: string | null
          qbo_item_name?: string | null
          qbo_sync_error?: string | null
          qbo_sync_fields?: string
          qbo_sync_token?: string | null
          qbo_synced_at?: string | null
          site_slug?: string | null
          source?: string
          source_key?: string | null
          source_synced_at?: string | null
          unit_price?: number
          updated_at?: string
          upstream_id?: string | null
          variant_slug?: string | null
        }
        Update: {
          billing_cycle?: Database["public"]["Enums"]["crm_billing_cycle"]
          category?: string | null
          created_at?: string
          description?: string | null
          hubspot_id?: string | null
          hubspot_sync_enabled?: boolean
          id?: string
          import_batch_id?: string | null
          is_active?: boolean
          name?: string
          qbo_environment?: string | null
          qbo_item_id?: string | null
          qbo_item_name?: string | null
          qbo_sync_error?: string | null
          qbo_sync_fields?: string
          qbo_sync_token?: string | null
          qbo_synced_at?: string | null
          site_slug?: string | null
          source?: string
          source_key?: string | null
          source_synced_at?: string | null
          unit_price?: number
          updated_at?: string
          upstream_id?: string | null
          variant_slug?: string | null
        }
        Relationships: []
      }
      crm_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      crm_sync_log: {
        Row: {
          created_at: string
          detail: Json | null
          direction: string
          entity_type: string
          error: string | null
          id: string
          latency_ms: number | null
          op: string | null
          records_processed: number | null
          status: string
        }
        Insert: {
          created_at?: string
          detail?: Json | null
          direction: string
          entity_type: string
          error?: string | null
          id?: string
          latency_ms?: number | null
          op?: string | null
          records_processed?: number | null
          status: string
        }
        Update: {
          created_at?: string
          detail?: Json | null
          direction?: string
          entity_type?: string
          error?: string | null
          id?: string
          latency_ms?: number | null
          op?: string | null
          records_processed?: number | null
          status?: string
        }
        Relationships: []
      }
      crm_sync_outbox: {
        Row: {
          applied_at: string | null
          associations: Json
          attempts: number
          created_at: string
          created_by: string | null
          entity_id: string | null
          entity_type: string
          hubspot_id: string | null
          id: string
          idempotency_key: string
          last_error: string | null
          next_attempt_at: string
          op: string
          payload: Json
          status: string
          updated_at: string
        }
        Insert: {
          applied_at?: string | null
          associations?: Json
          attempts?: number
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          entity_type: string
          hubspot_id?: string | null
          id?: string
          idempotency_key: string
          last_error?: string | null
          next_attempt_at?: string
          op: string
          payload?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          applied_at?: string | null
          associations?: Json
          attempts?: number
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          entity_type?: string
          hubspot_id?: string | null
          id?: string
          idempotency_key?: string
          last_error?: string | null
          next_attempt_at?: string
          op?: string
          payload?: Json
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      crm_sync_state: {
        Row: {
          backfill_completed_at: string | null
          backfill_started_at: string | null
          last_error: string | null
          last_full_reconcile_at: string | null
          last_modified_watermark: string | null
          last_run_at: string | null
          last_run_status: string | null
          object_type: string
          pull_cursor: string | null
          pull_mode: string
          records_processed: number
          updated_at: string
        }
        Insert: {
          backfill_completed_at?: string | null
          backfill_started_at?: string | null
          last_error?: string | null
          last_full_reconcile_at?: string | null
          last_modified_watermark?: string | null
          last_run_at?: string | null
          last_run_status?: string | null
          object_type: string
          pull_cursor?: string | null
          pull_mode?: string
          records_processed?: number
          updated_at?: string
        }
        Update: {
          backfill_completed_at?: string | null
          backfill_started_at?: string | null
          last_error?: string | null
          last_full_reconcile_at?: string | null
          last_modified_watermark?: string | null
          last_run_at?: string | null
          last_run_status?: string | null
          object_type?: string
          pull_cursor?: string | null
          pull_mode?: string
          records_processed?: number
          updated_at?: string
        }
        Relationships: []
      }
      crm_user_push_quota: {
        Row: {
          count: number
          user_id: string
          window_start: string
        }
        Insert: {
          count?: number
          user_id: string
          window_start?: string
        }
        Update: {
          count?: number
          user_id?: string
          window_start?: string
        }
        Relationships: []
      }
      display_ad_advertisers: {
        Row: {
          advertiser_name: string
          broadstreet_advertiser_id: number
          created_at: string
          created_by: string | null
          id: string
          is_auto_created: boolean
          network_id: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          advertiser_name: string
          broadstreet_advertiser_id: number
          created_at?: string
          created_by?: string | null
          id?: string
          is_auto_created?: boolean
          network_id: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          advertiser_name?: string
          broadstreet_advertiser_id?: number
          created_at?: string
          created_by?: string | null
          id?: string
          is_auto_created?: boolean
          network_id?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "display_ad_advertisers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      display_ad_cache: {
        Row: {
          cache_key: string
          created_at: string
          data: Json
          expires_at: string
          id: string
          organization_id: string
        }
        Insert: {
          cache_key: string
          created_at?: string
          data: Json
          expires_at: string
          id?: string
          organization_id: string
        }
        Update: {
          cache_key?: string
          created_at?: string
          data?: Json
          expires_at?: string
          id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "display_ad_cache_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      display_ad_campaign_stats_cache: {
        Row: {
          ad_count: number
          ad_previews: Json
          campaign_id: string
          clicks: number
          fetched_at: string
          has_error: boolean
          hovers: number
          organization_id: string
          updated_at: string
          views: number
        }
        Insert: {
          ad_count?: number
          ad_previews?: Json
          campaign_id: string
          clicks?: number
          fetched_at?: string
          has_error?: boolean
          hovers?: number
          organization_id: string
          updated_at?: string
          views?: number
        }
        Update: {
          ad_count?: number
          ad_previews?: Json
          campaign_id?: string
          clicks?: number
          fetched_at?: string
          has_error?: boolean
          hovers?: number
          organization_id?: string
          updated_at?: string
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "display_ad_campaign_stats_cache_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "display_ad_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "display_ad_campaign_stats_cache_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      display_ad_campaigns: {
        Row: {
          ad_type: string
          broadstreet_advertiser_id: number
          broadstreet_campaign_id: number
          created_at: string
          created_by: string | null
          end_date: string | null
          id: string
          is_active: boolean
          is_auto_created: boolean
          name: string
          organization_id: string
          site_id: string
          start_date: string
          updated_at: string
        }
        Insert: {
          ad_type: string
          broadstreet_advertiser_id: number
          broadstreet_campaign_id: number
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          is_active?: boolean
          is_auto_created?: boolean
          name: string
          organization_id: string
          site_id: string
          start_date: string
          updated_at?: string
        }
        Update: {
          ad_type?: string
          broadstreet_advertiser_id?: number
          broadstreet_campaign_id?: number
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          is_active?: boolean
          is_auto_created?: boolean
          name?: string
          organization_id?: string
          site_id?: string
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "display_ad_campaigns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "display_ad_campaigns_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "display_ad_campaigns_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites_public"
            referencedColumns: ["id"]
          },
        ]
      }
      display_ad_placements: {
        Row: {
          ad_height: number | null
          ad_image_url: string | null
          ad_name: string
          ad_width: number | null
          broadstreet_advertisement_id: number
          broadstreet_placement_ids: number[] | null
          campaign_id: string
          click_url: string | null
          created_at: string
          ended_at: string | null
          final_stats: Json | null
          id: string
          is_active: boolean
          started_at: string
          updated_at: string
        }
        Insert: {
          ad_height?: number | null
          ad_image_url?: string | null
          ad_name?: string
          ad_width?: number | null
          broadstreet_advertisement_id: number
          broadstreet_placement_ids?: number[] | null
          campaign_id: string
          click_url?: string | null
          created_at?: string
          ended_at?: string | null
          final_stats?: Json | null
          id?: string
          is_active?: boolean
          started_at?: string
          updated_at?: string
        }
        Update: {
          ad_height?: number | null
          ad_image_url?: string | null
          ad_name?: string
          ad_width?: number | null
          broadstreet_advertisement_id?: number
          broadstreet_placement_ids?: number[] | null
          campaign_id?: string
          click_url?: string | null
          created_at?: string
          ended_at?: string | null
          final_stats?: Json | null
          id?: string
          is_active?: boolean
          started_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "display_ad_placements_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "display_ad_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      email_blasts: {
        Row: {
          assignment_id: string | null
          beehiiv_post_id: string | null
          beehiiv_post_url: string | null
          body_content: string | null
          cached_stats: Json | null
          click_url: string
          client_id: string | null
          created_at: string
          cta_button_text: string | null
          cta_button_url: string | null
          headline: string | null
          id: string
          mailchimp_campaign_id: string | null
          mailchimp_campaign_url: string | null
          mailchimp_web_id: number | null
          main_image_url: string
          organization_id: string | null
          preview_text: string | null
          published_at: string | null
          scheduled_date: string | null
          secondary_image_url: string | null
          site_id: string
          stats_cached_at: string | null
          status: string
          subject_line: string
          submitted_at: string | null
          title: string
          updated_at: string
        }
        Insert: {
          assignment_id?: string | null
          beehiiv_post_id?: string | null
          beehiiv_post_url?: string | null
          body_content?: string | null
          cached_stats?: Json | null
          click_url: string
          client_id?: string | null
          created_at?: string
          cta_button_text?: string | null
          cta_button_url?: string | null
          headline?: string | null
          id?: string
          mailchimp_campaign_id?: string | null
          mailchimp_campaign_url?: string | null
          mailchimp_web_id?: number | null
          main_image_url: string
          organization_id?: string | null
          preview_text?: string | null
          published_at?: string | null
          scheduled_date?: string | null
          secondary_image_url?: string | null
          site_id: string
          stats_cached_at?: string | null
          status?: string
          subject_line: string
          submitted_at?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          assignment_id?: string | null
          beehiiv_post_id?: string | null
          beehiiv_post_url?: string | null
          body_content?: string | null
          cached_stats?: Json | null
          click_url?: string
          client_id?: string | null
          created_at?: string
          cta_button_text?: string | null
          cta_button_url?: string | null
          headline?: string | null
          id?: string
          mailchimp_campaign_id?: string | null
          mailchimp_campaign_url?: string | null
          mailchimp_web_id?: number | null
          main_image_url?: string
          organization_id?: string | null
          preview_text?: string | null
          published_at?: string | null
          scheduled_date?: string | null
          secondary_image_url?: string | null
          site_id?: string
          stats_cached_at?: string | null
          status?: string
          subject_line?: string
          submitted_at?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_blasts_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "post_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_blasts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_blasts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_blasts_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_blasts_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites_public"
            referencedColumns: ["id"]
          },
        ]
      }
      email_notification_logs: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          notification_data: Json | null
          notification_type: string
          sent_at: string
          status: string
          subject: string
          user_email: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          notification_data?: Json | null
          notification_type: string
          sent_at?: string
          status?: string
          subject: string
          user_email: string
          user_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          notification_data?: Json | null
          notification_type?: string
          sent_at?: string
          status?: string
          subject?: string
          user_email?: string
          user_id?: string
        }
        Relationships: []
      }
      email_sponsorships: {
        Row: {
          assignment_id: string | null
          banner_image_url: string
          click_url: string
          client_id: string | null
          created_at: string
          id: string
          organization_id: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          site_id: string
          status: string
          submission_deadline: string
          submitted_at: string | null
          updated_at: string
          week_start_date: string
        }
        Insert: {
          assignment_id?: string | null
          banner_image_url: string
          click_url: string
          client_id?: string | null
          created_at?: string
          id?: string
          organization_id?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          site_id: string
          status?: string
          submission_deadline: string
          submitted_at?: string | null
          updated_at?: string
          week_start_date: string
        }
        Update: {
          assignment_id?: string | null
          banner_image_url?: string
          click_url?: string
          client_id?: string | null
          created_at?: string
          id?: string
          organization_id?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          site_id?: string
          status?: string
          submission_deadline?: string
          submitted_at?: string | null
          updated_at?: string
          week_start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_sponsorships_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "post_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_sponsorships_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_sponsorships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_sponsorships_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_sponsorships_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_sponsorships_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites_public"
            referencedColumns: ["id"]
          },
        ]
      }
      image_uploads: {
        Row: {
          caption: string | null
          created_at: string
          file_size: number | null
          id: string
          is_in_use: boolean
          is_optimized: boolean | null
          last_checked_at: string | null
          optimized_size: number | null
          organization_id: string | null
          original_filename: string
          original_size: number | null
          processing_error: string | null
          public_url: string
          status: string | null
          storage_path: string
          thumbnail_url: string | null
          updated_at: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          caption?: string | null
          created_at?: string
          file_size?: number | null
          id?: string
          is_in_use?: boolean
          is_optimized?: boolean | null
          last_checked_at?: string | null
          optimized_size?: number | null
          organization_id?: string | null
          original_filename: string
          original_size?: number | null
          processing_error?: string | null
          public_url: string
          status?: string | null
          storage_path: string
          thumbnail_url?: string | null
          updated_at?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          caption?: string | null
          created_at?: string
          file_size?: number | null
          id?: string
          is_in_use?: boolean
          is_optimized?: boolean | null
          last_checked_at?: string | null
          optimized_size?: number | null
          organization_id?: string | null
          original_filename?: string
          original_size?: number | null
          processing_error?: string | null
          public_url?: string
          status?: string | null
          storage_path?: string
          thumbnail_url?: string | null
          updated_at?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "image_uploads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "image_uploads_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          broadstreet_advertiser_id: number | null
          broadstreet_advertiser_name: string | null
          client_code: string
          created_at: string
          created_by: string | null
          default_sponsor_id: string | null
          id: string
          is_active: boolean
          name: string
          sales_rep_user_id: string | null
          stat_email_suppress: string[]
          updated_at: string
        }
        Insert: {
          broadstreet_advertiser_id?: number | null
          broadstreet_advertiser_name?: string | null
          client_code: string
          created_at?: string
          created_by?: string | null
          default_sponsor_id?: string | null
          id?: string
          is_active?: boolean
          name: string
          sales_rep_user_id?: string | null
          stat_email_suppress?: string[]
          updated_at?: string
        }
        Update: {
          broadstreet_advertiser_id?: number | null
          broadstreet_advertiser_name?: string | null
          client_code?: string
          created_at?: string
          created_by?: string | null
          default_sponsor_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sales_rep_user_id?: string | null
          stat_email_suppress?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizations_default_sponsor_id_fkey"
            columns: ["default_sponsor_id"]
            isOneToOne: false
            referencedRelation: "sponsors"
            referencedColumns: ["id"]
          },
        ]
      }
      otp_codes: {
        Row: {
          code: string
          created_at: string
          email: string
          expires_at: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          code: string
          created_at?: string
          email: string
          expires_at: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      post_assignments: {
        Row: {
          assigned_to: string | null
          assignment_name: string
          completed_at: string | null
          content_category: string
          created_at: string
          created_by: string | null
          due_date: string | null
          email_notifications_enabled: boolean
          id: string
          is_completed: boolean
          is_skipped: boolean
          notes: string | null
          organization_id: string | null
          post_type: Database["public"]["Enums"]["post_type"]
          recurrence_day_of_week: number | null
          recurrence_end_date: string | null
          recurrence_type: Database["public"]["Enums"]["recurrence_type"]
          site_id: string
          skip_type: string | null
          started_at: string | null
          submitted_post_id: string | null
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          assignment_name: string
          completed_at?: string | null
          content_category?: string
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          email_notifications_enabled?: boolean
          id?: string
          is_completed?: boolean
          is_skipped?: boolean
          notes?: string | null
          organization_id?: string | null
          post_type: Database["public"]["Enums"]["post_type"]
          recurrence_day_of_week?: number | null
          recurrence_end_date?: string | null
          recurrence_type?: Database["public"]["Enums"]["recurrence_type"]
          site_id: string
          skip_type?: string | null
          started_at?: string | null
          submitted_post_id?: string | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          assignment_name?: string
          completed_at?: string | null
          content_category?: string
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          email_notifications_enabled?: boolean
          id?: string
          is_completed?: boolean
          is_skipped?: boolean
          notes?: string | null
          organization_id?: string | null
          post_type?: Database["public"]["Enums"]["post_type"]
          recurrence_day_of_week?: number | null
          recurrence_end_date?: string | null
          recurrence_type?: Database["public"]["Enums"]["recurrence_type"]
          site_id?: string
          skip_type?: string | null
          started_at?: string | null
          submitted_post_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_assignments_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_assignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_assignments_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_assignments_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_assignments_submitted_post_id_fkey"
            columns: ["submitted_post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_edit_requests: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          additional_request_data: Json | null
          assignment_id: string | null
          created_at: string | null
          id: string
          instance_date: string | null
          new_author_bio: string | null
          new_author_name: string | null
          new_author_photo_url: string | null
          new_content: string | null
          new_cta_button_text: string | null
          new_cta_button_url: string | null
          new_due_date: string | null
          new_featured_image_id: string | null
          new_featured_image_url: string | null
          new_gallery_images: Json | null
          new_headline: string | null
          new_logo_author_name: string | null
          new_logo_link_url: string | null
          new_logo_url: string | null
          new_youtube_url: string | null
          old_author_bio: string | null
          old_author_name: string | null
          old_author_photo_url: string | null
          old_content: string | null
          old_cta_button_text: string | null
          old_cta_button_url: string | null
          old_due_date: string | null
          old_featured_image_id: string | null
          old_featured_image_url: string | null
          old_gallery_images: Json | null
          old_headline: string | null
          old_logo_author_name: string | null
          old_logo_link_url: string | null
          old_logo_url: string | null
          old_youtube_url: string | null
          post_id: string
          request_reason: string | null
          request_type: string
          requested_at: string
          requested_by: string
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string | null
          wordpress_update_error: string | null
          wordpress_updated: boolean | null
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          additional_request_data?: Json | null
          assignment_id?: string | null
          created_at?: string | null
          id?: string
          instance_date?: string | null
          new_author_bio?: string | null
          new_author_name?: string | null
          new_author_photo_url?: string | null
          new_content?: string | null
          new_cta_button_text?: string | null
          new_cta_button_url?: string | null
          new_due_date?: string | null
          new_featured_image_id?: string | null
          new_featured_image_url?: string | null
          new_gallery_images?: Json | null
          new_headline?: string | null
          new_logo_author_name?: string | null
          new_logo_link_url?: string | null
          new_logo_url?: string | null
          new_youtube_url?: string | null
          old_author_bio?: string | null
          old_author_name?: string | null
          old_author_photo_url?: string | null
          old_content?: string | null
          old_cta_button_text?: string | null
          old_cta_button_url?: string | null
          old_due_date?: string | null
          old_featured_image_id?: string | null
          old_featured_image_url?: string | null
          old_gallery_images?: Json | null
          old_headline?: string | null
          old_logo_author_name?: string | null
          old_logo_link_url?: string | null
          old_logo_url?: string | null
          old_youtube_url?: string | null
          post_id: string
          request_reason?: string | null
          request_type?: string
          requested_at?: string
          requested_by: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string | null
          wordpress_update_error?: string | null
          wordpress_updated?: boolean | null
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          additional_request_data?: Json | null
          assignment_id?: string | null
          created_at?: string | null
          id?: string
          instance_date?: string | null
          new_author_bio?: string | null
          new_author_name?: string | null
          new_author_photo_url?: string | null
          new_content?: string | null
          new_cta_button_text?: string | null
          new_cta_button_url?: string | null
          new_due_date?: string | null
          new_featured_image_id?: string | null
          new_featured_image_url?: string | null
          new_gallery_images?: Json | null
          new_headline?: string | null
          new_logo_author_name?: string | null
          new_logo_link_url?: string | null
          new_logo_url?: string | null
          new_youtube_url?: string | null
          old_author_bio?: string | null
          old_author_name?: string | null
          old_author_photo_url?: string | null
          old_content?: string | null
          old_cta_button_text?: string | null
          old_cta_button_url?: string | null
          old_due_date?: string | null
          old_featured_image_id?: string | null
          old_featured_image_url?: string | null
          old_gallery_images?: Json | null
          old_headline?: string | null
          old_logo_author_name?: string | null
          old_logo_link_url?: string | null
          old_logo_url?: string | null
          old_youtube_url?: string | null
          post_id?: string
          request_reason?: string | null
          request_type?: string
          requested_at?: string
          requested_by?: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string | null
          wordpress_update_error?: string | null
          wordpress_updated?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "post_edit_requests_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "post_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_edit_requests_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_edit_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_edit_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          animated_featured_image: Json | null
          assignment_ids: string[] | null
          author_bio: string | null
          author_name: string | null
          author_photo_url: string | null
          byline: string | null
          client_id: string | null
          comments_enabled: boolean
          content: string
          created_at: string
          cta_button_text: string | null
          cta_button_url: string | null
          featured_image_id: string | null
          featured_image_url: string | null
          gallery_images: Json | null
          headline: string
          id: string
          logo_author_name: string | null
          logo_link_url: string | null
          logo_url: string | null
          metadata: Json | null
          organization_id: string | null
          poll_data: Json | null
          published_at: string | null
          social_posts: Json | null
          sponsor_id: string | null
          status: Database["public"]["Enums"]["post_status"]
          updated_at: string
          wordpress_media_ids: Json | null
          wordpress_post_id: number | null
          wordpress_post_url: string | null
          wordpress_site_id: string | null
          youtube_url: string | null
        }
        Insert: {
          animated_featured_image?: Json | null
          assignment_ids?: string[] | null
          author_bio?: string | null
          author_name?: string | null
          author_photo_url?: string | null
          byline?: string | null
          client_id?: string | null
          comments_enabled?: boolean
          content: string
          created_at?: string
          cta_button_text?: string | null
          cta_button_url?: string | null
          featured_image_id?: string | null
          featured_image_url?: string | null
          gallery_images?: Json | null
          headline: string
          id?: string
          logo_author_name?: string | null
          logo_link_url?: string | null
          logo_url?: string | null
          metadata?: Json | null
          organization_id?: string | null
          poll_data?: Json | null
          published_at?: string | null
          social_posts?: Json | null
          sponsor_id?: string | null
          status?: Database["public"]["Enums"]["post_status"]
          updated_at?: string
          wordpress_media_ids?: Json | null
          wordpress_post_id?: number | null
          wordpress_post_url?: string | null
          wordpress_site_id?: string | null
          youtube_url?: string | null
        }
        Update: {
          animated_featured_image?: Json | null
          assignment_ids?: string[] | null
          author_bio?: string | null
          author_name?: string | null
          author_photo_url?: string | null
          byline?: string | null
          client_id?: string | null
          comments_enabled?: boolean
          content?: string
          created_at?: string
          cta_button_text?: string | null
          cta_button_url?: string | null
          featured_image_id?: string | null
          featured_image_url?: string | null
          gallery_images?: Json | null
          headline?: string
          id?: string
          logo_author_name?: string | null
          logo_link_url?: string | null
          logo_url?: string | null
          metadata?: Json | null
          organization_id?: string | null
          poll_data?: Json | null
          published_at?: string | null
          social_posts?: Json | null
          sponsor_id?: string | null
          status?: Database["public"]["Enums"]["post_status"]
          updated_at?: string
          wordpress_media_ids?: Json | null
          wordpress_post_id?: number | null
          wordpress_post_url?: string | null
          wordpress_site_id?: string | null
          youtube_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "posts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_featured_image_id_fkey"
            columns: ["featured_image_id"]
            isOneToOne: false
            referencedRelation: "image_uploads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "sponsors"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          default_author_bio: string | null
          default_author_name: string | null
          default_author_photo_url: string | null
          default_byline: string | null
          default_logo_link_url: string | null
          default_logo_url: string | null
          email: string
          full_name: string | null
          id: string
          is_active: boolean | null
          last_login: string | null
          organization_id: string | null
          preferred_crm_pipeline_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_author_bio?: string | null
          default_author_name?: string | null
          default_author_photo_url?: string | null
          default_byline?: string | null
          default_logo_link_url?: string | null
          default_logo_url?: string | null
          email: string
          full_name?: string | null
          id: string
          is_active?: boolean | null
          last_login?: string | null
          organization_id?: string | null
          preferred_crm_pipeline_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_author_bio?: string | null
          default_author_name?: string | null
          default_author_photo_url?: string | null
          default_byline?: string | null
          default_logo_link_url?: string | null
          default_logo_url?: string | null
          email?: string
          full_name?: string | null
          id?: string
          is_active?: boolean | null
          last_login?: string | null
          organization_id?: string | null
          preferred_crm_pipeline_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_preferred_crm_pipeline_id_fkey"
            columns: ["preferred_crm_pipeline_id"]
            isOneToOne: false
            referencedRelation: "crm_pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      qa_checks: {
        Row: {
          checked_at: string
          checks: Json
          created_at: string
          entity_id: string
          entity_type: string
          error_message: string | null
          external_id: string | null
          id: string
          is_dismissed: boolean
          site_id: string | null
          status: string
        }
        Insert: {
          checked_at?: string
          checks?: Json
          created_at?: string
          entity_id: string
          entity_type: string
          error_message?: string | null
          external_id?: string | null
          id?: string
          is_dismissed?: boolean
          site_id?: string | null
          status?: string
        }
        Update: {
          checked_at?: string
          checks?: Json
          created_at?: string
          entity_id?: string
          entity_type?: string
          error_message?: string | null
          external_id?: string | null
          id?: string
          is_dismissed?: boolean
          site_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "qa_checks_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qa_checks_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites_public"
            referencedColumns: ["id"]
          },
        ]
      }
      qbo_auth_state: {
        Row: {
          access_token: string | null
          access_token_expires_at: string | null
          environment: string | null
          id: boolean
          oauth_state: string | null
          oauth_state_expires_at: string | null
          realm_id: string | null
          refresh_token: string | null
          refresh_token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          access_token_expires_at?: string | null
          environment?: string | null
          id?: boolean
          oauth_state?: string | null
          oauth_state_expires_at?: string | null
          realm_id?: string | null
          refresh_token?: string | null
          refresh_token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          access_token_expires_at?: string | null
          environment?: string | null
          id?: boolean
          oauth_state?: string | null
          oauth_state_expires_at?: string | null
          realm_id?: string | null
          refresh_token?: string | null
          refresh_token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      qbo_invoice_assignment_links: {
        Row: {
          assignment_id: string
          created_at: string
          cycle_index: number
          deal_id: string | null
          deal_product_id: string | null
          id: string
          position_in_cycle: number
          qbo_invoice_id: string | null
        }
        Insert: {
          assignment_id: string
          created_at?: string
          cycle_index?: number
          deal_id?: string | null
          deal_product_id?: string | null
          id?: string
          position_in_cycle?: number
          qbo_invoice_id?: string | null
        }
        Update: {
          assignment_id?: string
          created_at?: string
          cycle_index?: number
          deal_id?: string | null
          deal_product_id?: string | null
          id?: string
          position_in_cycle?: number
          qbo_invoice_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qbo_invoice_assignment_links_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "post_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qbo_invoice_assignment_links_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "crm_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qbo_invoice_assignment_links_qbo_invoice_id_fkey"
            columns: ["qbo_invoice_id"]
            isOneToOne: false
            referencedRelation: "qbo_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      qbo_invoices: {
        Row: {
          balance: number | null
          created_at: string
          created_by: string | null
          crm_organization_id: string | null
          currency: string | null
          deal_id: string | null
          doc_number: string | null
          due_date: string | null
          email_sent_at: string | null
          id: string
          invoice_type: string
          last_synced_at: string | null
          line_items: Json
          qbo_customer_id: string | null
          qbo_invoice_id: string | null
          qbo_recurring_id: string | null
          recurrence_cadence: string | null
          recurrence_end_date: string | null
          recurrence_start_date: string | null
          send_to_email: string | null
          status: string
          subtotal: number | null
          sync_error: string | null
          total: number | null
          txn_date: string | null
          updated_at: string
        }
        Insert: {
          balance?: number | null
          created_at?: string
          created_by?: string | null
          crm_organization_id?: string | null
          currency?: string | null
          deal_id?: string | null
          doc_number?: string | null
          due_date?: string | null
          email_sent_at?: string | null
          id?: string
          invoice_type?: string
          last_synced_at?: string | null
          line_items?: Json
          qbo_customer_id?: string | null
          qbo_invoice_id?: string | null
          qbo_recurring_id?: string | null
          recurrence_cadence?: string | null
          recurrence_end_date?: string | null
          recurrence_start_date?: string | null
          send_to_email?: string | null
          status?: string
          subtotal?: number | null
          sync_error?: string | null
          total?: number | null
          txn_date?: string | null
          updated_at?: string
        }
        Update: {
          balance?: number | null
          created_at?: string
          created_by?: string | null
          crm_organization_id?: string | null
          currency?: string | null
          deal_id?: string | null
          doc_number?: string | null
          due_date?: string | null
          email_sent_at?: string | null
          id?: string
          invoice_type?: string
          last_synced_at?: string | null
          line_items?: Json
          qbo_customer_id?: string | null
          qbo_invoice_id?: string | null
          qbo_recurring_id?: string | null
          recurrence_cadence?: string | null
          recurrence_end_date?: string | null
          recurrence_start_date?: string | null
          send_to_email?: string | null
          status?: string
          subtotal?: number | null
          sync_error?: string | null
          total?: number | null
          txn_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "qbo_invoices_crm_organization_id_fkey"
            columns: ["crm_organization_id"]
            isOneToOne: false
            referencedRelation: "crm_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qbo_invoices_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "crm_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      qbo_sync_runs: {
        Row: {
          created_count: number
          detail: Json
          error: string | null
          error_count: number
          finished_at: string | null
          id: string
          kind: string
          matched_count: number
          started_at: string
          status: string
          triggered_by: string
          unchanged_count: number
          updated_count: number
        }
        Insert: {
          created_count?: number
          detail?: Json
          error?: string | null
          error_count?: number
          finished_at?: string | null
          id?: string
          kind: string
          matched_count?: number
          started_at?: string
          status?: string
          triggered_by?: string
          unchanged_count?: number
          updated_count?: number
        }
        Update: {
          created_count?: number
          detail?: Json
          error?: string | null
          error_count?: number
          finished_at?: string | null
          id?: string
          kind?: string
          matched_count?: number
          started_at?: string
          status?: string
          triggered_by?: string
          unchanged_count?: number
          updated_count?: number
        }
        Relationships: []
      }
      sites: {
        Row: {
          beehiiv_config: Json | null
          broadstreet_config: Json | null
          created_at: string
          created_by: string | null
          default_wordpress_author_id: number | null
          id: string
          is_active: boolean
          mailchimp_config: Json | null
          name: string
          updated_at: string
          url: string
          wordpress_app_password: string | null
          wordpress_username: string | null
        }
        Insert: {
          beehiiv_config?: Json | null
          broadstreet_config?: Json | null
          created_at?: string
          created_by?: string | null
          default_wordpress_author_id?: number | null
          id?: string
          is_active?: boolean
          mailchimp_config?: Json | null
          name: string
          updated_at?: string
          url: string
          wordpress_app_password?: string | null
          wordpress_username?: string | null
        }
        Update: {
          beehiiv_config?: Json | null
          broadstreet_config?: Json | null
          created_at?: string
          created_by?: string | null
          default_wordpress_author_id?: number | null
          id?: string
          is_active?: boolean
          mailchimp_config?: Json | null
          name?: string
          updated_at?: string
          url?: string
          wordpress_app_password?: string | null
          wordpress_username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsors: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          link_url: string | null
          logo_url: string
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          link_url?: string | null
          logo_url: string
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          link_url?: string | null
          logo_url?: string
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sponsors_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      support_requests: {
        Row: {
          contact_email: string
          contact_name: string
          created_at: string
          description: string
          design_specs: Json | null
          design_type: string | null
          id: string
          organization_id: string | null
          page_url: string | null
          request_category: string
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          screenshot_urls: Json | null
          status: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          contact_email: string
          contact_name: string
          created_at?: string
          description: string
          design_specs?: Json | null
          design_type?: string | null
          id?: string
          organization_id?: string | null
          page_url?: string | null
          request_category?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          screenshot_urls?: Json | null
          status?: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          contact_email?: string
          contact_name?: string
          created_at?: string
          description?: string
          design_specs?: Json | null
          design_type?: string | null
          id?: string
          organization_id?: string | null
          page_url?: string | null
          request_category?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          screenshot_urls?: Json | null
          status?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_notification_preferences: {
        Row: {
          created_at: string
          default_comments_enabled: boolean
          email_due_reminders: boolean
          email_edit_approvals: boolean
          email_new_assignments: boolean
          exclude_from_creative_emails: boolean
          exclude_from_stat_emails: boolean
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          default_comments_enabled?: boolean
          email_due_reminders?: boolean
          email_edit_approvals?: boolean
          email_new_assignments?: boolean
          exclude_from_creative_emails?: boolean
          exclude_from_stat_emails?: boolean
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          default_comments_enabled?: boolean
          email_due_reminders?: boolean
          email_edit_approvals?: boolean
          email_new_assignments?: boolean
          exclude_from_creative_emails?: boolean
          exclude_from_stat_emails?: boolean
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_organizations: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean
          organization_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean
          organization_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean
          organization_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_organizations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_organizations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wordpress_author_mappings: {
        Row: {
          created_at: string
          id: string
          site_id: string
          updated_at: string
          user_id: string
          wordpress_author_id: number
        }
        Insert: {
          created_at?: string
          id?: string
          site_id: string
          updated_at?: string
          user_id: string
          wordpress_author_id: number
        }
        Update: {
          created_at?: string
          id?: string
          site_id?: string
          updated_at?: string
          user_id?: string
          wordpress_author_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "wordpress_author_mappings_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wordpress_author_mappings_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites_public"
            referencedColumns: ["id"]
          },
        ]
      }
      wordpress_media_mappings: {
        Row: {
          created_at: string | null
          id: string
          image_upload_id: string | null
          site_id: string
          supabase_image_url: string
          updated_at: string | null
          wordpress_media_id: number
          wordpress_media_url: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          image_upload_id?: string | null
          site_id: string
          supabase_image_url: string
          updated_at?: string | null
          wordpress_media_id: number
          wordpress_media_url: string
        }
        Update: {
          created_at?: string | null
          id?: string
          image_upload_id?: string | null
          site_id?: string
          supabase_image_url?: string
          updated_at?: string | null
          wordpress_media_id?: number
          wordpress_media_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "wordpress_media_mappings_image_upload_id_fkey"
            columns: ["image_upload_id"]
            isOneToOne: false
            referencedRelation: "image_uploads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wordpress_media_mappings_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wordpress_media_mappings_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites_public"
            referencedColumns: ["id"]
          },
        ]
      }
      wordpress_sponsor_mappings: {
        Row: {
          created_at: string
          id: string
          site_id: string
          sponsor_id: string
          updated_at: string
          wordpress_sponsor_id: number
        }
        Insert: {
          created_at?: string
          id?: string
          site_id: string
          sponsor_id: string
          updated_at?: string
          wordpress_sponsor_id: number
        }
        Update: {
          created_at?: string
          id?: string
          site_id?: string
          sponsor_id?: string
          updated_at?: string
          wordpress_sponsor_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "wordpress_sponsor_mappings_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wordpress_sponsor_mappings_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wordpress_sponsor_mappings_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "sponsors"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      sites_public: {
        Row: {
          created_at: string | null
          email_platform: string | null
          id: string | null
          is_active: boolean | null
          name: string | null
          updated_at: string | null
          url: string | null
        }
        Insert: {
          created_at?: string | null
          email_platform?: never
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          updated_at?: string | null
          url?: string | null
        }
        Update: {
          created_at?: string | null
          email_platform?: never
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          updated_at?: string | null
          url?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      cleanup_expired_otp_codes: { Args: never; Returns: undefined }
      get_audit_log_actors: {
        Args: { _organization_id: string }
        Returns: {
          actor_user_id: string
        }[]
      }
      get_my_default_sponsor: {
        Args: { _organization_id?: string }
        Returns: {
          link_url: string
          logo_url: string
          name: string
          organization_id: string
          sponsor_id: string
        }[]
      }
      get_onboarding_settings: { Args: never; Returns: Json }
      has_crm_access: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      recompute_crm_org_last_activity: {
        Args: { _org_id: string }
        Returns: undefined
      }
      set_my_default_sponsor: {
        Args: { _organization_id: string; _sponsor_id: string }
        Returns: {
          broadstreet_advertiser_id: number | null
          broadstreet_advertiser_name: string | null
          client_code: string
          created_at: string
          created_by: string | null
          default_sponsor_id: string | null
          id: string
          is_active: boolean
          name: string
          sales_rep_user_id: string | null
          stat_email_suppress: string[]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "organizations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      app_role: "admin" | "client" | "super_admin" | "sales"
      crm_activity_type: "call" | "meeting" | "task" | "email" | "note"
      crm_billing_cycle: "one_time" | "monthly" | "quarterly" | "annual"
      crm_deal_status: "open" | "won" | "lost"
      post_status: "draft" | "published" | "archived" | "pending_edit_review"
      post_type: "standard" | "column"
      recurrence_type: "one_time" | "weekly" | "biweekly" | "monthly"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "client", "super_admin", "sales"],
      crm_activity_type: ["call", "meeting", "task", "email", "note"],
      crm_billing_cycle: ["one_time", "monthly", "quarterly", "annual"],
      crm_deal_status: ["open", "won", "lost"],
      post_status: ["draft", "published", "archived", "pending_edit_review"],
      post_type: ["standard", "column"],
      recurrence_type: ["one_time", "weekly", "biweekly", "monthly"],
    },
  },
} as const
