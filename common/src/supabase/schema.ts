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
      contract_embeddings: {
        Row: {
          contract_id: string
          created_at: string
          embedding: unknown
        }
        Insert: {
          contract_id: string
          created_at?: string
          embedding: unknown
        }
        Update: {
          contract_id?: string
          created_at?: string
          embedding?: unknown
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
          freshness_score: number | null
        }
        Insert: {
          contract_id: string
          f0: number
          f1: number
          f2: number
          f3: number
          f4: number
          freshness_score?: number | null
        }
        Update: {
          contract_id?: string
          f0?: number
          f1?: number
          f2?: number
          f3?: number
          f4?: number
          freshness_score?: number | null
        }
      }
      contracts: {
        Row: {
          close_time: string | null
          created_time: string | null
          creator_id: string | null
          data: Json
          fs_updated_time: string
          id: string
          mechanism: string | null
          outcome_type: string | null
          popularity_score: number | null
          question: string | null
          question_fts: unknown | null
          resolution: string | null
          resolution_probability: number | null
          resolution_time: string | null
          slug: string | null
          visibility: string | null
        }
        Insert: {
          close_time?: string | null
          created_time?: string | null
          creator_id?: string | null
          data: Json
          fs_updated_time: string
          id: string
          mechanism?: string | null
          outcome_type?: string | null
          popularity_score?: number | null
          question?: string | null
          question_fts?: unknown | null
          resolution?: string | null
          resolution_probability?: number | null
          resolution_time?: string | null
          slug?: string | null
          visibility?: string | null
        }
        Update: {
          close_time?: string | null
          created_time?: string | null
          creator_id?: string | null
          data?: Json
          fs_updated_time?: string
          id?: string
          mechanism?: string | null
          outcome_type?: string | null
          popularity_score?: number | null
          question?: string | null
          question_fts?: unknown | null
          resolution?: string | null
          resolution_probability?: number | null
          resolution_time?: string | null
          slug?: string | null
          visibility?: string | null
        }
      }
      discord_messages_markets: {
        Row: {
          channel_id: string
          last_updated_thread_time: number | null
          market_id: string
          market_slug: string
          message_id: string
          thread_id: string | null
        }
        Insert: {
          channel_id: string
          last_updated_thread_time?: number | null
          market_id: string
          market_slug: string
          message_id: string
          thread_id?: string | null
        }
        Update: {
          channel_id?: string
          last_updated_thread_time?: number | null
          market_id?: string
          market_slug?: string
          message_id?: string
          thread_id?: string | null
        }
      }
      discord_users: {
        Row: {
          api_key: string
          discord_user_id: string
          user_id: string | null
        }
        Insert: {
          api_key: string
          discord_user_id: string
          user_id?: string | null
        }
        Update: {
          api_key?: string
          discord_user_id?: string
          user_id?: string | null
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
      topic_embeddings: {
        Row: {
          created_at: string
          embedding: unknown
          topic: string
        }
        Insert: {
          created_at?: string
          embedding: unknown
          topic: string
        }
        Update: {
          created_at?: string
          embedding?: unknown
          topic?: string
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
      user_embeddings: {
        Row: {
          created_at: string
          interest_embedding: unknown
          pre_signup_interest_embedding: unknown | null
          user_id: string
        }
        Insert: {
          created_at?: string
          interest_embedding: unknown
          pre_signup_interest_embedding?: unknown | null
          user_id: string
        }
        Update: {
          created_at?: string
          interest_embedding?: unknown
          pre_signup_interest_embedding?: unknown | null
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
          balance: number | null
          investment_value: number | null
          portfolio_id: string
          total_deposits: number | null
          ts: string | null
          user_id: string
        }
        Insert: {
          balance?: number | null
          investment_value?: number | null
          portfolio_id: string
          total_deposits?: number | null
          ts?: string | null
          user_id: string
        }
        Update: {
          balance?: number | null
          investment_value?: number | null
          portfolio_id?: string
          total_deposits?: number | null
          ts?: string | null
          user_id?: string
        }
      }
      user_quest_metrics: {
        Row: {
          idempotency_key: string | null
          score_id: string
          score_value: number
          user_id: string
        }
        Insert: {
          idempotency_key?: string | null
          score_id: string
          score_value: number
          user_id: string
        }
        Update: {
          idempotency_key?: string | null
          score_id?: string
          score_value?: number
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
      user_topics: {
        Row: {
          created_at: string
          topic_embedding: unknown
          topics: string[]
          user_id: string
        }
        Insert: {
          created_at?: string
          topic_embedding: unknown
          topics: string[]
          user_id: string
        }
        Update: {
          created_at?: string
          topic_embedding?: unknown
          topics?: string[]
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
      contract_distance: {
        Row: {
          distance: number | null
          id1: string | null
          id2: string | null
        }
      }
      contracts_rbac: {
        Row: {
          close_time: string | null
          created_time: string | null
          creator_id: string | null
          data: Json | null
          fs_updated_time: string | null
          id: string | null
          mechanism: string | null
          outcome_type: string | null
          popularity_score: number | null
          question: string | null
          question_fts: unknown | null
          resolution: string | null
          resolution_probability: number | null
          resolution_time: string | null
          slug: string | null
          visibility: string | null
        }
        Insert: {
          close_time?: string | null
          created_time?: string | null
          creator_id?: string | null
          data?: Json | null
          fs_updated_time?: string | null
          id?: string | null
          mechanism?: string | null
          outcome_type?: string | null
          popularity_score?: number | null
          question?: string | null
          question_fts?: unknown | null
          resolution?: string | null
          resolution_probability?: number | null
          resolution_time?: string | null
          slug?: string | null
          visibility?: string | null
        }
        Update: {
          close_time?: string | null
          created_time?: string | null
          creator_id?: string | null
          data?: Json | null
          fs_updated_time?: string | null
          id?: string | null
          mechanism?: string | null
          outcome_type?: string | null
          popularity_score?: number | null
          question?: string | null
          question_fts?: unknown | null
          resolution?: string | null
          resolution_probability?: number | null
          resolution_time?: string | null
          slug?: string | null
          visibility?: string | null
        }
      }
      contracts_view: {
        Row: {
          close_time: number | null
          created_time: number | null
          creator_id: string | null
          id: string | null
          is_resolved: boolean | null
          outcome_type: string | null
          visibility: string | null
        }
        Insert: {
          close_time?: never
          created_time?: never
          creator_id?: never
          id?: string | null
          is_resolved?: never
          outcome_type?: never
          visibility?: never
        }
        Update: {
          close_time?: never
          created_time?: never
          creator_id?: never
          id?: string | null
          is_resolved?: never
          outcome_type?: never
          visibility?: never
        }
      }
      group_role: {
        Row: {
          avatar_url: string | null
          createdtime: number | null
          creator_id: string | null
          group_data: Json | null
          group_id: string | null
          group_name: string | null
          group_slug: string | null
          member_id: string | null
          name: string | null
          role: string | null
          username: string | null
        }
      }
      groups_rbac: {
        Row: {
          data: Json | null
          fs_updated_time: string | null
          id: string | null
        }
        Insert: {
          data?: Json | null
          fs_updated_time?: string | null
          id?: string | null
        }
        Update: {
          data?: Json | null
          fs_updated_time?: string | null
          id?: string | null
        }
      }
      listed_open_contracts: {
        Row: {
          close_time: string | null
          created_time: string | null
          creator_id: string | null
          data: Json | null
          fs_updated_time: string | null
          id: string | null
          mechanism: string | null
          outcome_type: string | null
          popularity_score: number | null
          question: string | null
          resolution: string | null
          resolution_probability: number | null
          resolution_time: string | null
          slug: string | null
          visibility: string | null
        }
        Insert: {
          close_time?: string | null
          created_time?: string | null
          creator_id?: string | null
          data?: Json | null
          fs_updated_time?: string | null
          id?: string | null
          mechanism?: string | null
          outcome_type?: string | null
          popularity_score?: number | null
          question?: string | null
          resolution?: string | null
          resolution_probability?: number | null
          resolution_time?: string | null
          slug?: string | null
          visibility?: string | null
        }
        Update: {
          close_time?: string | null
          created_time?: string | null
          creator_id?: string | null
          data?: Json | null
          fs_updated_time?: string | null
          id?: string | null
          mechanism?: string | null
          outcome_type?: string | null
          popularity_score?: number | null
          question?: string | null
          resolution?: string | null
          resolution_probability?: number | null
          resolution_time?: string | null
          slug?: string | null
          visibility?: string | null
        }
      }
      private_contract_comments: {
        Row: {
          comment_id: string | null
          contract_id: string | null
          data: Json | null
          fs_updated_time: string | null
        }
      }
      public_contracts: {
        Row: {
          close_time: string | null
          created_time: string | null
          creator_id: string | null
          data: Json | null
          fs_updated_time: string | null
          id: string | null
          mechanism: string | null
          outcome_type: string | null
          popularity_score: number | null
          question: string | null
          question_fts: unknown | null
          resolution: string | null
          resolution_probability: number | null
          resolution_time: string | null
          slug: string | null
          visibility: string | null
        }
        Insert: {
          close_time?: string | null
          created_time?: string | null
          creator_id?: string | null
          data?: Json | null
          fs_updated_time?: string | null
          id?: string | null
          mechanism?: string | null
          outcome_type?: string | null
          popularity_score?: number | null
          question?: string | null
          question_fts?: unknown | null
          resolution?: string | null
          resolution_probability?: number | null
          resolution_time?: string | null
          slug?: string | null
          visibility?: string | null
        }
        Update: {
          close_time?: string | null
          created_time?: string | null
          creator_id?: string | null
          data?: Json | null
          fs_updated_time?: string | null
          id?: string | null
          mechanism?: string | null
          outcome_type?: string | null
          popularity_score?: number | null
          question?: string | null
          question_fts?: unknown | null
          resolution?: string | null
          resolution_probability?: number | null
          resolution_time?: string | null
          slug?: string | null
          visibility?: string | null
        }
      }
      public_open_contracts: {
        Row: {
          close_time: string | null
          created_time: string | null
          creator_id: string | null
          data: Json | null
          fs_updated_time: string | null
          id: string | null
          mechanism: string | null
          outcome_type: string | null
          popularity_score: number | null
          question: string | null
          resolution: string | null
          resolution_probability: number | null
          resolution_time: string | null
          slug: string | null
          visibility: string | null
        }
        Insert: {
          close_time?: string | null
          created_time?: string | null
          creator_id?: string | null
          data?: Json | null
          fs_updated_time?: string | null
          id?: string | null
          mechanism?: string | null
          outcome_type?: string | null
          popularity_score?: number | null
          question?: string | null
          resolution?: string | null
          resolution_probability?: number | null
          resolution_time?: string | null
          slug?: string | null
          visibility?: string | null
        }
        Update: {
          close_time?: string | null
          created_time?: string | null
          creator_id?: string | null
          data?: Json | null
          fs_updated_time?: string | null
          id?: string | null
          mechanism?: string | null
          outcome_type?: string | null
          popularity_score?: number | null
          question?: string | null
          resolution?: string | null
          resolution_probability?: number | null
          resolution_time?: string | null
          slug?: string | null
          visibility?: string | null
        }
      }
      related_contracts: {
        Row: {
          contract_id: string | null
          data: Json | null
          distance: number | null
          from_contract_id: string | null
        }
      }
      trending_contracts: {
        Row: {
          close_time: string | null
          created_time: string | null
          creator_id: string | null
          data: Json | null
          fs_updated_time: string | null
          id: string | null
          mechanism: string | null
          outcome_type: string | null
          popularity_score: number | null
          question: string | null
          resolution: string | null
          resolution_probability: number | null
          resolution_time: string | null
          slug: string | null
          visibility: string | null
        }
        Insert: {
          close_time?: string | null
          created_time?: string | null
          creator_id?: string | null
          data?: Json | null
          fs_updated_time?: string | null
          id?: string | null
          mechanism?: string | null
          outcome_type?: string | null
          popularity_score?: number | null
          question?: string | null
          resolution?: string | null
          resolution_probability?: number | null
          resolution_time?: string | null
          slug?: string | null
          visibility?: string | null
        }
        Update: {
          close_time?: string | null
          created_time?: string | null
          creator_id?: string | null
          data?: Json | null
          fs_updated_time?: string | null
          id?: string | null
          mechanism?: string | null
          outcome_type?: string | null
          popularity_score?: number | null
          question?: string | null
          resolution?: string | null
          resolution_probability?: number | null
          resolution_time?: string | null
          slug?: string | null
          visibility?: string | null
        }
      }
      user_contract_distance: {
        Row: {
          contract_id: string | null
          distance: number | null
          user_id: string | null
        }
      }
      user_groups: {
        Row: {
          avatarurl: string | null
          follower_count: number | null
          groups: string[] | null
          id: string | null
          name: string | null
          username: string | null
        }
      }
      user_referrals: {
        Row: {
          data: Json | null
          id: string | null
          rank: number | null
          total_referrals: number | null
        }
      }
      user_referrals_profit: {
        Row: {
          data: Json | null
          id: string | null
          rank: number | null
          total_referrals: number | null
          total_referred_profit: number | null
        }
      }
      user_trending_contract: {
        Row: {
          close_time: string | null
          contract_id: string | null
          created_time: string | null
          distance: number | null
          popularity_score: number | null
          user_id: string | null
        }
      }
    }
    Functions: {
      blah: {
        Args: {
          input_contract_id: string
          similarity_threshold: number
          match_count: number
        }
        Returns: {
          data: Json
        }[]
      }
      calculate_distance: {
        Args: {
          row1: unknown
          row2: unknown
        }
        Returns: number
      }
      can_access_private_contract: {
        Args: {
          this_contract_id: string
          this_member_id: string
        }
        Returns: boolean
      }
      closest_contract_embeddings: {
        Args: {
          input_contract_id: string
          similarity_threshold: number
          match_count: number
        }
        Returns: {
          contract_id: string
          similarity: number
          data: Json
        }[]
      }
      closest_contract_embeddings2: {
        Args: {
          input_contract_id: string
          similarity_threshold: number
          match_count: number
        }
        Returns: {
          contract_id: string
          similarity: number
          data: Json
        }[]
      }
      dot: {
        Args: {
          urf: unknown
          crf: unknown
        }
        Returns: number
      }
      firebase_uid: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      get_contract_metrics_for_contract: {
        Args: {
          contractid: string
        }
        Returns: {
          user_id: string
          contract_metrics: Json
        }[]
      }
      get_contract_metrics_grouped_by_user: {
        Args: {
          uids: string[]
          period: string
        }
        Returns: {
          user_id: string
          contract_metrics: Json[]
        }[]
      }
      get_contract_metrics_grouped_by_user_ids: {
        Args: {
          uids: string[]
          period: string
        }
        Returns: {
          user_id: string
          contract_metrics: Json[]
        }[]
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
      get_contracts_by_creator_ids: {
        Args: {
          creator_ids: string[]
          created_time: number
        }
        Returns: {
          creator_id: string
          contracts: Json
        }[]
      }
      get_cpmm_pool_prob: {
        Args: {
          pool: Json
          p: number
        }
        Returns: number
      }
      get_cpmm_resolved_prob:
        | {
            Args: {
              data: Json
            }
            Returns: number
          }
        | {
            Args: {
              c: unknown
            }
            Returns: number
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
        Returns: Database["public"]["CompositeTypes"]["table_spec"]
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
      get_profit: {
        Args: {
          portfolio: Json
        }
        Returns: number
      }
      get_recommended_contract_scores: {
        Args: {
          uid: string
        }
        Returns: {
          contract_id: string
          score: number
        }[]
      }
      get_recommended_contract_scores_unseen: {
        Args: {
          uid: string
        }
        Returns: {
          contract_id: string
          score: number
        }[]
      }
      get_recommended_contract_set:
        | {
            Args: {
              uid: string
              n: number
            }
            Returns: Json[]
          }
        | {
            Args: {
              uid: string
              n: number
              excluded_contract_ids: string[]
            }
            Returns: {
              data: Json
              score: number
            }[]
          }
      get_recommended_contracts: {
        Args: {
          uid: string
          n: number
          excluded_contract_ids: string[]
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
      get_recommended_contracts_by_score_excluding: {
        Args: {
          uid: string
          count: number
          excluded_contract_ids: string[]
        }
        Returns: {
          data: Json
          score: number
        }[]
      }
      get_recommended_contracts_embeddings: {
        Args: {
          uid: string
          n: number
          excluded_contract_ids: string[]
        }
        Returns: {
          data: Json
          distance: number
          relative_dist: number
          popularity_score: number
        }[]
      }
      get_recommended_contracts_embeddings_from: {
        Args: {
          uid: string
          p_embedding: string
          n: number
          excluded_contract_ids: string[]
        }
        Returns: {
          data: Json
          distance: number
          relative_dist: number
          popularity_score: number
        }[]
      }
      get_recommended_contracts_embeddings_topic: {
        Args: {
          uid: string
          p_topic: string
          n: number
          excluded_contract_ids: string[]
        }
        Returns: {
          data: Json
          distance: number
          relative_dist: number
          popularity_score: number
        }[]
      }
      get_recommended_contracts_embeddings2: {
        Args: {
          uid: string
          n: number
          excluded_contract_ids: string[]
        }
        Returns: {
          data: Json
          distance: number
          relative_dist: number
          popularity_score: number
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
        Returns: unknown
      }
      get_time: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      get_user_bets_from_resolved_contracts: {
        Args: {
          uid: string
          count: number
          start: number
        }
        Returns: {
          contract_id: string
          bets: Json[]
          contract: Json
        }[]
      }
      get_user_group_id_for_current_user: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      get_your_contract_ids:
        | {
            Args: {
              uid: string
              n: number
              start: number
            }
            Returns: {
              contract_id: string
            }[]
          }
        | {
            Args: {
              uid: string
            }
            Returns: {
              contract_id: string
            }[]
          }
      get_your_daily_changed_contracts: {
        Args: {
          uid: string
          n: number
          start: number
        }
        Returns: {
          data: Json
          daily_score: number
        }[]
      }
      get_your_recent_contracts: {
        Args: {
          uid: string
          n: number
          start: number
        }
        Returns: {
          data: Json
          max_ts: number
        }[]
      }
      get_your_trending_contracts: {
        Args: {
          uid: string
          n: number
          start: number
        }
        Returns: {
          data: Json
          score: number
        }[]
      }
      gtrgm_compress: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gtrgm_decompress: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gtrgm_in: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gtrgm_options: {
        Args: {
          "": unknown
        }
        Returns: undefined
      }
      gtrgm_out: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      install_available_extensions_and_test: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      is_valid_contract: {
        Args: {
          ct: unknown
        }
        Returns: boolean
      }
      ivfflathandler: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      millis_interval: {
        Args: {
          start_millis: number
          end_millis: number
        }
        Returns: unknown
      }
      millis_to_ts: {
        Args: {
          millis: number
        }
        Returns: string
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
      save_user_topics: {
        Args: {
          p_user_id: string
          p_topics: string[]
        }
        Returns: undefined
      }
      search_contract_embeddings: {
        Args: {
          query_embedding: unknown
          similarity_threshold: number
          match_count: number
        }
        Returns: {
          contract_id: string
          similarity: number
        }[]
      }
      search_contracts_by_group_slugs: {
        Args: {
          group_slugs: string[]
          lim: number
          start: number
        }
        Returns: unknown
      }
      search_contracts_by_group_slugs_for_creator: {
        Args: {
          creator_id: string
          group_slugs: string[]
          lim: number
          start: number
        }
        Returns: unknown
      }
      search_contracts_combined: {
        Args: {
          term: string
          contract_filter: string
          contract_sort: string
          offset_n: number
          limit_n: number
          fuzzy?: boolean
          groupid?: string
        }
        Returns: {
          data: Json
        }[]
      }
      search_contracts_test: {
        Args: {
          term: string
          contract_filter: string
          contract_sort: string
          offset_n: number
          limit_n: number
          fuzzy?: boolean
          group_id?: string
          creator_id?: string
        }
        Returns: string
      }
      set_limit: {
        Args: {
          "": number
        }
        Returns: number
      }
      show_limit: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      show_trgm: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      squared_distance: {
        Args: {
          row1: unknown
          row2: unknown
        }
        Returns: number
      }
      test_empty_search_contracts: {
        Args: {
          contract_filter: string
          contract_sort: string
          offset_n: number
          limit_n: number
          group_id?: string
          creator_id?: string
        }
        Returns: string
      }
      test_search_contracts: {
        Args: {
          term: string
          contract_filter: string
          contract_sort: string
          offset_n: number
          limit_n: number
          fuzzy?: boolean
          group_id?: string
          creator_id?: string
        }
        Returns: string
      }
      to_jsonb: {
        Args: {
          "": Json
        }
        Returns: Json
      }
      ts_to_millis:
        | {
            Args: {
              ts: string
            }
            Returns: number
          }
        | {
            Args: {
              ts: string
            }
            Returns: number
          }
      vector_avg: {
        Args: {
          "": number[]
        }
        Returns: unknown
      }
      vector_dims: {
        Args: {
          "": unknown
        }
        Returns: number
      }
      vector_norm: {
        Args: {
          "": unknown
        }
        Returns: number
      }
      vector_out: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      vector_send: {
        Args: {
          "": unknown
        }
        Returns: string
      }
      vector_typmod_in: {
        Args: {
          "": unknown[]
        }
        Returns: number
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
