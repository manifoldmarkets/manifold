export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json }
  | Json[]

export interface Database {
  public: {
    Tables: {
      bets: {
        Row: {
          id: string
          data: Json
          fs_updated_time: string
        }
        Insert: {
          id: string
          data: Json
          fs_updated_time: string
        }
        Update: {
          id?: string
          data?: Json
          fs_updated_time?: string
        }
      }
      comments: {
        Row: {
          id: string
          data: Json
          fs_updated_time: string
        }
        Insert: {
          id: string
          data: Json
          fs_updated_time: string
        }
        Update: {
          id?: string
          data?: Json
          fs_updated_time?: string
        }
      }
      contracts: {
        Row: {
          id: string
          data: Json
          fs_updated_time: string
        }
        Insert: {
          id: string
          data: Json
          fs_updated_time: string
        }
        Update: {
          id?: string
          data?: Json
          fs_updated_time?: string
        }
      }
      groups: {
        Row: {
          id: string
          data: Json
          fs_updated_time: string
        }
        Insert: {
          id: string
          data: Json
          fs_updated_time: string
        }
        Update: {
          id?: string
          data?: Json
          fs_updated_time?: string
        }
      }
      incoming_writes: {
        Row: {
          id: number
          event_id: string | null
          doc_kind: string
          write_kind: string
          doc_id: string
          data: Json | null
          ts: string
          processed: boolean
        }
        Insert: {
          id?: never
          event_id?: string | null
          doc_kind: string
          write_kind: string
          doc_id: string
          data?: Json | null
          ts: string
          processed?: boolean
        }
        Update: {
          id?: never
          event_id?: string | null
          doc_kind?: string
          write_kind?: string
          doc_id?: string
          data?: Json | null
          ts?: string
          processed?: boolean
        }
      }
      txns: {
        Row: {
          id: string
          data: Json
          fs_updated_time: string
        }
        Insert: {
          id: string
          data: Json
          fs_updated_time: string
        }
        Update: {
          id?: string
          data?: Json
          fs_updated_time?: string
        }
      }
      users: {
        Row: {
          id: string
          data: Json
          fs_updated_time: string
        }
        Insert: {
          id: string
          data: Json
          fs_updated_time: string
        }
        Update: {
          id?: string
          data?: Json
          fs_updated_time?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_document_table: {
        Args: { doc_kind: string }
        Returns: string
      }
      install_available_extensions_and_test: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      replicate_writes_process_all: {
        Args: Record<PropertyKey, never>
        Returns: { succeeded: boolean; n: number }[]
      }
      replicate_writes_process_one: {
        Args: { r: unknown }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
  }
}
