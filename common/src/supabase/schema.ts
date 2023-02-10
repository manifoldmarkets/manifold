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
      contract_answers: {
        Row: {
          answer_id: string
          contract_id: string
          data: Json
          fs_updated_time: string
        }
        Insert: {
          answer_id: string
          contract_id: string
          data: Json
          fs_updated_time: string
        }
        Update: {
          answer_id?: string
          contract_id?: string
          data?: Json
          fs_updated_time?: string
        }
      }
      contract_bets: {
        Row: {
          bet_id: string
          contract_id: string
          data: Json
          fs_updated_time: string
        }
        Insert: {
          bet_id: string
          contract_id: string
          data: Json
          fs_updated_time: string
        }
        Update: {
          bet_id?: string
          contract_id?: string
          data?: Json
          fs_updated_time?: string
        }
      }
      contract_comments: {
        Row: {
          comment_id: string
          contract_id: string
          data: Json
          fs_updated_time: string
        }
        Insert: {
          comment_id: string
          contract_id: string
          data: Json
          fs_updated_time: string
        }
        Update: {
          comment_id?: string
          contract_id?: string
          data?: Json
          fs_updated_time?: string
        }
      }
      contract_follows: {
        Row: {
          contract_id: string
          data: Json
          follow_id: string
          fs_updated_time: string
        }
        Insert: {
          contract_id: string
          data: Json
          follow_id: string
          fs_updated_time: string
        }
        Update: {
          contract_id?: string
          data?: Json
          follow_id?: string
          fs_updated_time?: string
        }
      }
      contract_liquidity: {
        Row: {
          contract_id: string
          data: Json
          fs_updated_time: string
          liquidity_id: string
        }
        Insert: {
          contract_id: string
          data: Json
          fs_updated_time: string
          liquidity_id: string
        }
        Update: {
          contract_id?: string
          data?: Json
          fs_updated_time?: string
          liquidity_id?: string
        }
      }
      contract_recommendation_features: {
        Row: {
          contract_id: string
          f0: number
          f1: number
          f2: number
          f3: number
          f4: number
          freshness_score: number
        }
        Insert: {
          contract_id: string
          f0: number
          f1: number
          f2: number
          f3: number
          f4: number
          freshness_score?: number
        }
        Update: {
          contract_id?: string
          f0?: number
          f1?: number
          f2?: number
          f3?: number
          f4?: number
          freshness_score?: number
        }
      }
      contracts: {
        Row: {
          data: Json
          fs_updated_time: string
          id: string
        }
        Insert: {
          data: Json
          fs_updated_time: string
          id: string
        }
        Update: {
          data?: Json
          fs_updated_time?: string
          id?: string
        }
      }
      group_contracts: {
        Row: {
          contract_id: string
          data: Json
          fs_updated_time: string
          group_id: string
        }
        Insert: {
          contract_id: string
          data: Json
          fs_updated_time: string
          group_id: string
        }
        Update: {
          contract_id?: string
          data?: Json
          fs_updated_time?: string
          group_id?: string
        }
      }
      group_members: {
        Row: {
          data: Json
          fs_updated_time: string
          group_id: string
          member_id: string
        }
        Insert: {
          data: Json
          fs_updated_time: string
          group_id: string
          member_id: string
        }
        Update: {
          data?: Json
          fs_updated_time?: string
          group_id?: string
          member_id?: string
        }
      }
      groups: {
        Row: {
          data: Json
          fs_updated_time: string
          id: string
        }
        Insert: {
          data: Json
          fs_updated_time: string
          id: string
        }
        Update: {
          data?: Json
          fs_updated_time?: string
          id?: string
        }
      }
      incoming_writes: {
        Row: {
          data: Json | null
          doc_id: string
          event_id: string | null
          id: number
          parent_id: string | null
          table_id: string
          ts: string
          write_kind: string
        }
        Insert: {
          data?: Json | null
          doc_id: string
          event_id?: string | null
          id?: never
          parent_id?: string | null
          table_id: string
          ts: string
          write_kind: string
        }
        Update: {
          data?: Json | null
          doc_id?: string
          event_id?: string | null
          id?: never
          parent_id?: string | null
          table_id?: string
          ts?: string
          write_kind?: string
        }
      }
      manalinks: {
        Row: {
          data: Json
          fs_updated_time: string
          id: string
        }
        Insert: {
          data: Json
          fs_updated_time: string
          id: string
        }
        Update: {
          data?: Json
          fs_updated_time?: string
          id?: string
        }
      }
      posts: {
        Row: {
          data: Json
          fs_updated_time: string
          id: string
        }
        Insert: {
          data: Json
          fs_updated_time: string
          id: string
        }
        Update: {
          data?: Json
          fs_updated_time?: string
          id?: string
        }
      }
      test: {
        Row: {
          data: Json
          fs_updated_time: string
          id: string
        }
        Insert: {
          data: Json
          fs_updated_time: string
          id: string
        }
        Update: {
          data?: Json
          fs_updated_time?: string
          id?: string
        }
      }
      tombstones: {
        Row: {
          doc_id: string
          fs_deleted_at: string
          id: number
          parent_id: string | null
          table_id: string
        }
        Insert: {
          doc_id: string
          fs_deleted_at: string
          id?: never
          parent_id?: string | null
          table_id: string
        }
        Update: {
          doc_id?: string
          fs_deleted_at?: string
          id?: never
          parent_id?: string | null
          table_id?: string
        }
      }
      txns: {
        Row: {
          data: Json
          fs_updated_time: string
          id: string
        }
        Insert: {
          data: Json
          fs_updated_time: string
          id: string
        }
        Update: {
          data?: Json
          fs_updated_time?: string
          id?: string
        }
      }
      user_contract_metrics: {
        Row: {
          contract_id: string
          data: Json
          fs_updated_time: string
          user_id: string
        }
        Insert: {
          contract_id: string
          data: Json
          fs_updated_time: string
          user_id: string
        }
        Update: {
          contract_id?: string
          data?: Json
          fs_updated_time?: string
          user_id?: string
        }
      }
      user_events: {
        Row: {
          data: Json
          event_id: string
          fs_updated_time: string
          user_id: string
        }
        Insert: {
          data: Json
          event_id: string
          fs_updated_time: string
          user_id: string
        }
        Update: {
          data?: Json
          event_id?: string
          fs_updated_time?: string
          user_id?: string
        }
      }
      user_follows: {
        Row: {
          data: Json
          follow_id: string
          fs_updated_time: string
          user_id: string
        }
        Insert: {
          data: Json
          follow_id: string
          fs_updated_time: string
          user_id: string
        }
        Update: {
          data?: Json
          follow_id?: string
          fs_updated_time?: string
          user_id?: string
        }
      }
      user_portfolio_history: {
        Row: {
          data: Json
          fs_updated_time: string
          portfolio_id: string
          user_id: string
        }
        Insert: {
          data: Json
          fs_updated_time: string
          portfolio_id: string
          user_id: string
        }
        Update: {
          data?: Json
          fs_updated_time?: string
          portfolio_id?: string
          user_id?: string
        }
      }
      user_reactions: {
        Row: {
          data: Json
          fs_updated_time: string
          reaction_id: string
          user_id: string
        }
        Insert: {
          data: Json
          fs_updated_time: string
          reaction_id: string
          user_id: string
        }
        Update: {
          data?: Json
          fs_updated_time?: string
          reaction_id?: string
          user_id?: string
        }
      }
      user_recommendation_features: {
        Row: {
          f0: number
          f1: number
          f2: number
          f3: number
          f4: number
          user_id: string
        }
        Insert: {
          f0: number
          f1: number
          f2: number
          f3: number
          f4: number
          user_id: string
        }
        Update: {
          f0?: number
          f1?: number
          f2?: number
          f3?: number
          f4?: number
          user_id?: string
        }
      }
      user_seen_markets: {
        Row: {
          contract_id: string
          data: Json
          fs_updated_time: string
          user_id: string
        }
        Insert: {
          contract_id: string
          data: Json
          fs_updated_time: string
          user_id: string
        }
        Update: {
          contract_id?: string
          data?: Json
          fs_updated_time?: string
          user_id?: string
        }
      }
      users: {
        Row: {
          data: Json
          fs_updated_time: string
          id: string
        }
        Insert: {
          data: Json
          fs_updated_time: string
          id: string
        }
        Update: {
          data?: Json
          fs_updated_time?: string
          id?: string
        }
      }
    }
    Views: {
      group_role: {
        Row: {
          avatar_url: Json | null
          createdtime: Json | null
          creator_id: Json | null
          group_data: Json | null
          group_id: string | null
          group_name: Json | null
          group_slug: Json | null
          member_id: string | null
          name: Json | null
          role: string | null
          username: Json | null
        }
      }
    }
    Functions: {
      calculate_distance: {
        Args: {
          row1: unknown
          row2: unknown
        }
        Returns: number
      }
      dot: {
        Args: {
          urf: unknown
          crf: unknown
        }
        Returns: number
      }
      get_contract_metrics_with_contracts:
        | {
            Args: {
              uid: string
              count: number
            }
            Returns: {
              contract_id: string
              metrics: Json
              contract: Json
            }[]
          }
        | {
            Args: {
              uid: string
              count: number
              start: number
            }
            Returns: {
              contract_id: string
              metrics: Json
              contract: Json
            }[]
          }
      get_document_table: {
        Args: {
          doc_kind: string
        }
        Returns: string
      }
      get_document_table_spec: {
        Args: {
          table_id: string
        }
        Returns: Database['public']['CompositeTypes']['table_spec']
      }
      get_open_limit_bets_with_contracts: {
        Args: {
          uid: string
          count: number
        }
        Returns: {
          contract_id: string
          bets: Json[]
          contract: Json
        }[]
      }
      get_recommended_contract_scores: {
        Args: {
          uid: string
        }
        Returns: {
          contract_id: string
          rec_score: number
        }[]
      }
      get_recommended_contract_set: {
        Args: {
          uid: string
          n: number
        }
        Returns: Json[]
      }
      get_recommended_contracts_by_score: {
        Args: {
          uid: string
          count: number
        }
        Returns: {
          data: Json
          score: number
        }[]
      }
      get_related_contract_ids: {
        Args: {
          source_id: string
        }
        Returns: {
          contract_id: string
          distance: number
        }[]
      }
      get_related_contracts: {
        Args: {
          cid: string
          lim: number
          start: number
        }
        Returns: Json[]
      }
      get_time: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      gtrgm_compress: {
        Args: {
          '': unknown
        }
        Returns: unknown
      }
      gtrgm_decompress: {
        Args: {
          '': unknown
        }
        Returns: unknown
      }
      gtrgm_in: {
        Args: {
          '': unknown
        }
        Returns: unknown
      }
      gtrgm_options: {
        Args: {
          '': unknown
        }
        Returns: undefined
      }
      gtrgm_out: {
        Args: {
          '': unknown
        }
        Returns: unknown
      }
      install_available_extensions_and_test: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      is_valid_contract: {
        Args: {
          data: Json
        }
        Returns: boolean
      }
      recently_liked_contract_counts: {
        Args: {
          since: number
        }
        Returns: {
          contract_id: string
          n: number
        }[]
      }
      replicate_writes_process_one: {
        Args: {
          r: unknown
        }
        Returns: boolean
      }
      replicate_writes_process_since: {
        Args: {
          since: string
        }
        Returns: {
          id: number
          succeeded: boolean
        }[]
      }
      search_contracts_by_group_slugs: {
        Args: {
          group_slugs: string[]
          lim: number
          start: number
        }
        Returns: Json[]
      }
      search_contracts_by_group_slugs_for_creator: {
        Args: {
          creator_id: string
          group_slugs: string[]
          lim: number
          start: number
        }
        Returns: Json[]
      }
      set_limit: {
        Args: {
          '': number
        }
        Returns: number
      }
      show_limit: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      show_trgm: {
        Args: {
          '': string
        }
        Returns: string[]
      }
      squared_distance: {
        Args: {
          row1: unknown
          row2: unknown
        }
        Returns: number
      }
      to_jsonb: {
        Args: {
          '': Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      contract_ids: {
        contract_id: string
      }
      contract_score: {
        contract_id: string
      }
      table_spec: {
        parent_id_col_name: string
        id_col_name: string
      }
    }
  }
}
