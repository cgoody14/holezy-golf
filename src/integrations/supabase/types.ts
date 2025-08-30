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
    PostgrestVersion: "12.2.12 (cd3cf9e)"
  }
  public: {
    Tables: {
      Client_Accounts: {
        Row: {
          created_at: string
          default_payment_method_id: string | null
          email: string | null
          first_name: string | null
          id: number
          last_name: string | null
          phone: string | null
          stripe_customer_id: string | null
          user_id: string | null
          username: string | null
        }
        Insert: {
          created_at?: string
          default_payment_method_id?: string | null
          email?: string | null
          first_name?: string | null
          id?: number
          last_name?: string | null
          phone?: string | null
          stripe_customer_id?: string | null
          user_id?: string | null
          username?: string | null
        }
        Update: {
          created_at?: string
          default_payment_method_id?: string | null
          email?: string | null
          first_name?: string | null
          id?: number
          last_name?: string | null
          phone?: string | null
          stripe_customer_id?: string | null
          user_id?: string | null
          username?: string | null
        }
        Relationships: []
      }
      Client_Bookings: {
        Row: {
          amount_charged: number | null
          booking_date: string | null
          booking_status: string | null
          cancelled: boolean | null
          cancelled_at: string | null
          client_id: number | null
          created_at: string
          currency: string | null
          earliest_time: string | null
          email: string | null
          facility_id: number | null
          First: string | null
          has_online_booking: string | null
          id: number
          Last: string | null
          latest_time: string | null
          number_of_players: number | null
          payment_status: string | null
          phone: string | null
          preferred_course: string | null
          promo_code: string | null
          stripe_payment_intent_id: string | null
          stripe_payment_method_id: string | null
          total_price: number | null
          updated_at: string | null
        }
        Insert: {
          amount_charged?: number | null
          booking_date?: string | null
          booking_status?: string | null
          cancelled?: boolean | null
          cancelled_at?: string | null
          client_id?: number | null
          created_at?: string
          currency?: string | null
          earliest_time?: string | null
          email?: string | null
          facility_id?: number | null
          First?: string | null
          has_online_booking?: string | null
          id?: number
          Last?: string | null
          latest_time?: string | null
          number_of_players?: number | null
          payment_status?: string | null
          phone?: string | null
          preferred_course?: string | null
          promo_code?: string | null
          stripe_payment_intent_id?: string | null
          stripe_payment_method_id?: string | null
          total_price?: number | null
          updated_at?: string | null
        }
        Update: {
          amount_charged?: number | null
          booking_date?: string | null
          booking_status?: string | null
          cancelled?: boolean | null
          cancelled_at?: string | null
          client_id?: number | null
          created_at?: string
          currency?: string | null
          earliest_time?: string | null
          email?: string | null
          facility_id?: number | null
          First?: string | null
          has_online_booking?: string | null
          id?: number
          Last?: string | null
          latest_time?: string | null
          number_of_players?: number | null
          payment_status?: string | null
          phone?: string | null
          preferred_course?: string | null
          promo_code?: string | null
          stripe_payment_intent_id?: string | null
          stripe_payment_method_id?: string | null
          total_price?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_bookings_client_accounts_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "Client_Accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "Client_Bookings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "Client_Accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_messages: {
        Row: {
          created_at: string
          email: string
          id: string
          is_read: boolean
          message: string
          name: string
          phone: string | null
          subject: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          is_read?: boolean
          message: string
          name: string
          phone?: string | null
          subject?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          is_read?: boolean
          message?: string
          name?: string
          phone?: string | null
          subject?: string | null
        }
        Relationships: []
      }
      Course_Database: {
        Row: {
          address: string | null
          course_name: string | null
          facility_id: number | null
          source: string | null
          tee_time_booking: string | null
          tee_times_url: string | null
        }
        Insert: {
          address?: string | null
          course_name?: string | null
          facility_id?: number | null
          source?: string | null
          tee_time_booking?: string | null
          tee_times_url?: string | null
        }
        Update: {
          address?: string | null
          course_name?: string | null
          facility_id?: number | null
          source?: string | null
          tee_time_booking?: string | null
          tee_times_url?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
