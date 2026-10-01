export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      ai_conversations: {
        Row: {
          created_at: string
          id: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
          tool_name: string | null
          tool_payload: Json | null
          user_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
          tool_name?: string | null
          tool_payload?: Json | null
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
          tool_name?: string | null
          tool_payload?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_user_id_fkey"
            columns: ["conversation_id", "user_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      alerts: {
        Row: {
          body: string
          category_id: string | null
          created_at: string
          dedupe_key: string
          dismissed_at: string | null
          id: string
          params: Json
          period_id: string | null
          pushed_at: string | null
          read_at: string | null
          title: string
          transaction_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          body: string
          category_id?: string | null
          created_at?: string
          dedupe_key: string
          dismissed_at?: string | null
          id?: string
          params?: Json
          period_id?: string | null
          pushed_at?: string | null
          read_at?: string | null
          title: string
          transaction_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          body?: string
          category_id?: string | null
          created_at?: string
          dedupe_key?: string
          dismissed_at?: string | null
          id?: string
          params?: Json
          period_id?: string | null
          pushed_at?: string | null
          read_at?: string | null
          title?: string
          transaction_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_category_id_user_id_fkey"
            columns: ["category_id", "user_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "alerts_period_id_user_id_fkey"
            columns: ["period_id", "user_id"]
            isOneToOne: false
            referencedRelation: "budget_periods"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "alerts_transaction_id_user_id_fkey"
            columns: ["transaction_id", "user_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      budget_periods: {
        Row: {
          carried_over_rappen: number
          closed_at: string | null
          created_at: string
          ends_on: string
          fixed_costs_rappen: number
          id: string
          income_rappen: number
          leftover_action: string | null
          leftover_rappen: number | null
          savings_rappen: number
          starts_on: string
          updated_at: string
          user_id: string
        }
        Insert: {
          carried_over_rappen?: number
          closed_at?: string | null
          created_at?: string
          ends_on: string
          fixed_costs_rappen: number
          id?: string
          income_rappen: number
          leftover_action?: string | null
          leftover_rappen?: number | null
          savings_rappen: number
          starts_on: string
          updated_at?: string
          user_id: string
        }
        Update: {
          carried_over_rappen?: number
          closed_at?: string | null
          created_at?: string
          ends_on?: string
          fixed_costs_rappen?: number
          id?: string
          income_rappen?: number
          leftover_action?: string | null
          leftover_rappen?: number | null
          savings_rappen?: number
          starts_on?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      budgets: {
        Row: {
          amount_rappen: number
          category_id: string
          created_at: string
          id: string
          period_id: string
          rollover_rappen: number
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_rappen: number
          category_id: string
          created_at?: string
          id?: string
          period_id: string
          rollover_rappen?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_rappen?: number
          category_id?: string
          created_at?: string
          id?: string
          period_id?: string
          rollover_rappen?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budgets_category_id_user_id_fkey"
            columns: ["category_id", "user_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "budgets_period_id_user_id_fkey"
            columns: ["period_id", "user_id"]
            isOneToOne: false
            referencedRelation: "budget_periods"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      categories: {
        Row: {
          archived_at: string | null
          created_at: string
          default_key: string | null
          icon: string | null
          id: string
          name: string | null
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          default_key?: string | null
          icon?: string | null
          id?: string
          name?: string | null
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          default_key?: string | null
          icon?: string | null
          id?: string
          name?: string | null
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      categorization_rules: {
        Row: {
          category_id: string
          created_at: string
          id: string
          match_field: string
          match_type: string
          pattern: string
          priority: number
          updated_at: string
          user_id: string
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          match_field: string
          match_type: string
          pattern: string
          priority?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          match_field?: string
          match_type?: string
          pattern?: string
          priority?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categorization_rules_category_id_user_id_fkey"
            columns: ["category_id", "user_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      consent_events: {
        Row: {
          created_at: string
          granted: boolean
          id: string
          kind: string
          subject: string | null
          user_id: string
          version: string
        }
        Insert: {
          created_at?: string
          granted: boolean
          id?: string
          kind: string
          subject?: string | null
          user_id: string
          version: string
        }
        Update: {
          created_at?: string
          granted?: boolean
          id?: string
          kind?: string
          subject?: string | null
          user_id?: string
          version?: string
        }
        Relationships: []
      }
      data_sources: {
        Row: {
          consent_granted_at: string
          consent_revoked_at: string | null
          consent_version: string
          created_at: string
          display_name: string | null
          id: string
          kind: string
          last_error: string | null
          last_synced_at: string | null
          provider: string | null
          settings: Json
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          consent_granted_at?: string
          consent_revoked_at?: string | null
          consent_version: string
          created_at?: string
          display_name?: string | null
          id?: string
          kind: string
          last_error?: string | null
          last_synced_at?: string | null
          provider?: string | null
          settings?: Json
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          consent_granted_at?: string
          consent_revoked_at?: string | null
          consent_version?: string
          created_at?: string
          display_name?: string | null
          id?: string
          kind?: string
          last_error?: string | null
          last_synced_at?: string | null
          provider?: string | null
          settings?: Json
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      fixed_costs: {
        Row: {
          active: boolean
          amount_rappen: number
          created_at: string
          due_day: number | null
          id: string
          kind: string
          label: string | null
          merchant_hint: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          amount_rappen: number
          created_at?: string
          due_day?: number | null
          id?: string
          kind: string
          label?: string | null
          merchant_hint?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          amount_rappen?: number
          created_at?: string
          due_day?: number | null
          id?: string
          kind?: string
          label?: string | null
          merchant_hint?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_settings: {
        Row: {
          categorize_requests: boolean
          category_thresholds: boolean
          created_at: string
          daily_allowance: boolean
          max_per_day: number
          pace: boolean
          payday: boolean
          quiet_hours_enabled: boolean
          quiet_hours_end: string
          quiet_hours_start: string
          total_low: boolean
          transaction_moments: boolean
          unusual_purchase: boolean
          updated_at: string
          user_id: string
          weekly_review: boolean
        }
        Insert: {
          categorize_requests?: boolean
          category_thresholds?: boolean
          created_at?: string
          daily_allowance?: boolean
          max_per_day?: number
          pace?: boolean
          payday?: boolean
          quiet_hours_enabled?: boolean
          quiet_hours_end?: string
          quiet_hours_start?: string
          total_low?: boolean
          transaction_moments?: boolean
          unusual_purchase?: boolean
          updated_at?: string
          user_id: string
          weekly_review?: boolean
        }
        Update: {
          categorize_requests?: boolean
          category_thresholds?: boolean
          created_at?: string
          daily_allowance?: boolean
          max_per_day?: number
          pace?: boolean
          payday?: boolean
          quiet_hours_enabled?: boolean
          quiet_hours_end?: string
          quiet_hours_start?: string
          total_low?: boolean
          transaction_moments?: boolean
          unusual_purchase?: boolean
          updated_at?: string
          user_id?: string
          weekly_review?: boolean
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          irregular_income: boolean
          language: string
          leftover_policy: string
          net_income_rappen: number | null
          onboarding_completed_at: string | null
          pain_level: string
          payday: number | null
          payment_methods: string[]
          savings_goal_date: string | null
          savings_goal_name: string | null
          savings_goal_rappen: number | null
          savings_monthly_rappen: number
          sound_enabled: boolean
          timezone: string
          updated_at: string
          weekly_work_minutes: number | null
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          irregular_income?: boolean
          language?: string
          leftover_policy?: string
          net_income_rappen?: number | null
          onboarding_completed_at?: string | null
          pain_level?: string
          payday?: number | null
          payment_methods?: string[]
          savings_goal_date?: string | null
          savings_goal_name?: string | null
          savings_goal_rappen?: number | null
          savings_monthly_rappen?: number
          sound_enabled?: boolean
          timezone?: string
          updated_at?: string
          weekly_work_minutes?: number | null
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          irregular_income?: boolean
          language?: string
          leftover_policy?: string
          net_income_rappen?: number | null
          onboarding_completed_at?: string | null
          pain_level?: string
          payday?: number | null
          payment_methods?: string[]
          savings_goal_date?: string | null
          savings_goal_name?: string | null
          savings_goal_rappen?: number | null
          savings_monthly_rappen?: number
          sound_enabled?: boolean
          timezone?: string
          updated_at?: string
          weekly_work_minutes?: number | null
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_ends_at: string | null
          last_event_at: string | null
          product_id: string | null
          status: string
          store: string | null
          trial_ends_at: string | null
          updated_at: string
          user_id: string
          will_renew: boolean | null
        }
        Insert: {
          created_at?: string
          current_period_ends_at?: string | null
          last_event_at?: string | null
          product_id?: string | null
          status?: string
          store?: string | null
          trial_ends_at?: string | null
          updated_at?: string
          user_id: string
          will_renew?: boolean | null
        }
        Update: {
          created_at?: string
          current_period_ends_at?: string | null
          last_event_at?: string | null
          product_id?: string | null
          status?: string
          store?: string | null
          trial_ends_at?: string | null
          updated_at?: string
          user_id?: string
          will_renew?: boolean | null
        }
        Relationships: []
      }
      transaction_splits: {
        Row: {
          amount_rappen: number
          category_id: string | null
          created_at: string
          id: string
          note: string | null
          transaction_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_rappen: number
          category_id?: string | null
          created_at?: string
          id?: string
          note?: string | null
          transaction_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_rappen?: number
          category_id?: string | null
          created_at?: string
          id?: string
          note?: string | null
          transaction_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_splits_category_id_user_id_fkey"
            columns: ["category_id", "user_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "transaction_splits_transaction_id_user_id_fkey"
            columns: ["transaction_id", "user_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      transactions: {
        Row: {
          acknowledged_at: string | null
          amount_rappen: number
          booked_at: string
          categorized_by: string
          category_confidence: number | null
          category_id: string | null
          created_at: string
          currency: string
          data_source_id: string | null
          deleted_at: string | null
          external_id: string | null
          fixed_cost_id: string | null
          id: string
          items: Json | null
          mcc: number | null
          merchant: string | null
          merged_into_id: string | null
          note: string | null
          original_amount_minor: number | null
          original_currency: string | null
          raw_text: string | null
          source: string
          updated_at: string
          user_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          amount_rappen: number
          booked_at: string
          categorized_by?: string
          category_confidence?: number | null
          category_id?: string | null
          created_at?: string
          currency?: string
          data_source_id?: string | null
          deleted_at?: string | null
          external_id?: string | null
          fixed_cost_id?: string | null
          id?: string
          items?: Json | null
          mcc?: number | null
          merchant?: string | null
          merged_into_id?: string | null
          note?: string | null
          original_amount_minor?: number | null
          original_currency?: string | null
          raw_text?: string | null
          source: string
          updated_at?: string
          user_id: string
        }
        Update: {
          acknowledged_at?: string | null
          amount_rappen?: number
          booked_at?: string
          categorized_by?: string
          category_confidence?: number | null
          category_id?: string | null
          created_at?: string
          currency?: string
          data_source_id?: string | null
          deleted_at?: string | null
          external_id?: string | null
          fixed_cost_id?: string | null
          id?: string
          items?: Json | null
          mcc?: number | null
          merchant?: string | null
          merged_into_id?: string | null
          note?: string | null
          original_amount_minor?: number | null
          original_currency?: string | null
          raw_text?: string | null
          source?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_category_id_user_id_fkey"
            columns: ["category_id", "user_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "transactions_data_source_id_user_id_fkey"
            columns: ["data_source_id", "user_id"]
            isOneToOne: false
            referencedRelation: "data_sources"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "transactions_fixed_cost_id_user_id_fkey"
            columns: ["fixed_cost_id", "user_id"]
            isOneToOne: false
            referencedRelation: "fixed_costs"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "transactions_merged_into_id_user_id_fkey"
            columns: ["merged_into_id", "user_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      delete_my_account: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const

