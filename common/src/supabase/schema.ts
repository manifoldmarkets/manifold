export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      answers: {
        Row: {
          contract_id: string
          created_time: string
          id: string
          index: number
          pool_no: number
          pool_yes: number
          prob: number
          subsidy_pool: number
          text: string
          total_subsidy: number
          user_id: string
        }
        Insert: {
          contract_id: string
          created_time?: string
          id: string
          index: number
          pool_no: number
          pool_yes: number
          prob: number
          subsidy_pool: number
          text: string
          total_subsidy: number
          user_id: string
        }
        Update: {
          contract_id?: string
          created_time?: string
          id?: string
          index?: number
          pool_no?: number
          pool_yes?: number
          prob?: number
          subsidy_pool?: number
          text?: string
          total_subsidy?: number
          user_id?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          channel_id: string
          content: Json
          created_time: string
          id: number
          user_avatar_url: string
          user_id: string
          user_name: string
          user_username: string
        }
        Insert: {
          channel_id: string
          content: Json
          created_time?: string
          id?: number
          user_avatar_url: string
          user_id: string
          user_name: string
          user_username: string
        }
        Update: {
          channel_id?: string
          content?: Json
          created_time?: string
          id?: number
          user_avatar_url?: string
          user_id?: string
          user_name?: string
          user_username?: string
        }
        Relationships: []
      }
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
        Relationships: []
      }
      contract_bets: {
        Row: {
          amount: number | null
          bet_id: string
          contract_id: string
          created_time: string | null
          data: Json
          fs_updated_time: string
          is_ante: boolean | null
          is_api: boolean | null
          is_challenge: boolean | null
          is_redemption: boolean | null
          outcome: string | null
          prob_after: number | null
          prob_before: number | null
          shares: number | null
          user_id: string | null
          visibility: string | null
        }
        Insert: {
          amount?: number | null
          bet_id: string
          contract_id: string
          created_time?: string | null
          data: Json
          fs_updated_time: string
          is_ante?: boolean | null
          is_api?: boolean | null
          is_challenge?: boolean | null
          is_redemption?: boolean | null
          outcome?: string | null
          prob_after?: number | null
          prob_before?: number | null
          shares?: number | null
          user_id?: string | null
          visibility?: string | null
        }
        Update: {
          amount?: number | null
          bet_id?: string
          contract_id?: string
          created_time?: string | null
          data?: Json
          fs_updated_time?: string
          is_ante?: boolean | null
          is_api?: boolean | null
          is_challenge?: boolean | null
          is_redemption?: boolean | null
          outcome?: string | null
          prob_after?: number | null
          prob_before?: number | null
          shares?: number | null
          user_id?: string | null
          visibility?: string | null
        }
        Relationships: []
      }
      contract_comment_edits: {
        Row: {
          comment_id: string
          contract_id: string
          created_time: string
          data: Json
          editor_id: string
          id: number
        }
        Insert: {
          comment_id: string
          contract_id: string
          created_time?: string
          data: Json
          editor_id: string
          id?: number
        }
        Update: {
          comment_id?: string
          contract_id?: string
          created_time?: string
          data?: Json
          editor_id?: string
          id?: number
        }
        Relationships: []
      }
      contract_comments: {
        Row: {
          comment_id: string
          contract_id: string
          created_time: string | null
          data: Json
          fs_updated_time: string
          is_api: boolean
          user_id: string | null
          visibility: string | null
        }
        Insert: {
          comment_id: string
          contract_id: string
          created_time?: string | null
          data: Json
          fs_updated_time: string
          is_api?: boolean
          user_id?: string | null
          visibility?: string | null
        }
        Update: {
          comment_id?: string
          contract_id?: string
          created_time?: string | null
          data?: Json
          fs_updated_time?: string
          is_api?: boolean
          user_id?: string | null
          visibility?: string | null
        }
        Relationships: []
      }
      contract_edits: {
        Row: {
          contract_id: string
          created_time: string
          data: Json
          editor_id: string
          id: number
          idempotency_key: string | null
        }
        Insert: {
          contract_id: string
          created_time?: string
          data: Json
          editor_id: string
          id?: number
          idempotency_key?: string | null
        }
        Update: {
          contract_id?: string
          created_time?: string
          data?: Json
          editor_id?: string
          id?: number
          idempotency_key?: string | null
        }
        Relationships: []
      }
      contract_embeddings: {
        Row: {
          contract_id: string
          created_at: string
          embedding: string
        }
        Insert: {
          contract_id: string
          created_at?: string
          embedding: string
        }
        Update: {
          contract_id?: string
          created_at?: string
          embedding?: string
        }
        Relationships: []
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
        Relationships: []
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
        Relationships: []
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
        Relationships: []
      }
      contracts: {
        Row: {
          close_time: string | null
          created_time: string | null
          creator_id: string | null
          data: Json
          description_fts: unknown | null
          fs_updated_time: string
          id: string
          importance_score: number | null
          mechanism: string | null
          outcome_type: string | null
          popularity_score: number | null
          question: string | null
          question_fts: unknown | null
          question_nostop_fts: unknown | null
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
          description_fts?: unknown | null
          fs_updated_time: string
          id: string
          importance_score?: number | null
          mechanism?: string | null
          outcome_type?: string | null
          popularity_score?: number | null
          question?: string | null
          question_fts?: unknown | null
          question_nostop_fts?: unknown | null
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
          description_fts?: unknown | null
          fs_updated_time?: string
          id?: string
          importance_score?: number | null
          mechanism?: string | null
          outcome_type?: string | null
          popularity_score?: number | null
          question?: string | null
          question_fts?: unknown | null
          question_nostop_fts?: unknown | null
          resolution?: string | null
          resolution_probability?: number | null
          resolution_time?: string | null
          slug?: string | null
          visibility?: string | null
        }
        Relationships: []
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
        Relationships: []
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
        Relationships: []
      }
      group_contracts: {
        Row: {
          contract_id: string
          data: Json | null
          fs_updated_time: string | null
          group_id: string
        }
        Insert: {
          contract_id: string
          data?: Json | null
          fs_updated_time?: string | null
          group_id: string
        }
        Update: {
          contract_id?: string
          data?: Json | null
          fs_updated_time?: string | null
          group_id?: string
        }
        Relationships: []
      }
      group_embeddings: {
        Row: {
          created_time: string
          embedding: string
          group_id: string
        }
        Insert: {
          created_time?: string
          embedding: string
          group_id: string
        }
        Update: {
          created_time?: string
          embedding?: string
          group_id?: string
        }
        Relationships: []
      }
      group_invites: {
        Row: {
          created_time: string
          duration: unknown | null
          expire_time: string | null
          group_id: string
          id: string
          is_forever: boolean | null
          is_max_uses_reached: boolean | null
          max_uses: number | null
          uses: number
        }
        Insert: {
          created_time?: string
          duration?: unknown | null
          expire_time?: string | null
          group_id: string
          id?: string
          is_forever?: boolean | null
          is_max_uses_reached?: boolean | null
          max_uses?: number | null
          uses?: number
        }
        Update: {
          created_time?: string
          duration?: unknown | null
          expire_time?: string | null
          group_id?: string
          id?: string
          is_forever?: boolean | null
          is_max_uses_reached?: boolean | null
          max_uses?: number | null
          uses?: number
        }
        Relationships: [
          {
            foreignKeyName: 'group_invites_group_id_fkey'
            columns: ['group_id']
            referencedRelation: 'groups'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'group_invites_group_id_fkey'
            columns: ['group_id']
            referencedRelation: 'group_role'
            referencedColumns: ['group_id']
          },
          {
            foreignKeyName: 'group_invites_group_id_fkey'
            columns: ['group_id']
            referencedRelation: 'groups_rbac'
            referencedColumns: ['id']
          }
        ]
      }
      group_members: {
        Row: {
          created_time: string | null
          data: Json | null
          fs_updated_time: string | null
          group_id: string
          member_id: string
          role: string | null
        }
        Insert: {
          created_time?: string | null
          data?: Json | null
          fs_updated_time?: string | null
          group_id: string
          member_id: string
          role?: string | null
        }
        Update: {
          created_time?: string | null
          data?: Json | null
          fs_updated_time?: string | null
          group_id?: string
          member_id?: string
          role?: string | null
        }
        Relationships: []
      }
      groups: {
        Row: {
          creator_id: string | null
          data: Json
          fs_updated_time: string | null
          id: string
          importance_score: number | null
          name: string
          name_fts: unknown | null
          privacy_status: string | null
          slug: string
          total_members: number | null
        }
        Insert: {
          creator_id?: string | null
          data: Json
          fs_updated_time?: string | null
          id?: string
          importance_score?: number | null
          name: string
          name_fts?: unknown | null
          privacy_status?: string | null
          slug: string
          total_members?: number | null
        }
        Update: {
          creator_id?: string | null
          data?: Json
          fs_updated_time?: string | null
          id?: string
          importance_score?: number | null
          name?: string
          name_fts?: unknown | null
          privacy_status?: string | null
          slug?: string
          total_members?: number | null
        }
        Relationships: []
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
        Relationships: []
      }
      leagues: {
        Row: {
          cohort: string
          created_time: string
          division: number
          mana_earned: number
          mana_earned_breakdown: Json
          rank_snapshot: number | null
          season: number
          user_id: string
        }
        Insert: {
          cohort: string
          created_time?: string
          division: number
          mana_earned?: number
          mana_earned_breakdown?: Json
          rank_snapshot?: number | null
          season: number
          user_id: string
        }
        Update: {
          cohort?: string
          created_time?: string
          division?: number
          mana_earned?: number
          mana_earned_breakdown?: Json
          rank_snapshot?: number | null
          season?: number
          user_id?: string
        }
        Relationships: []
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
        Relationships: []
      }
      market_ads: {
        Row: {
          cost_per_view: number
          created_at: string
          embedding: string
          funds: number
          id: string
          market_id: string
          user_id: string
        }
        Insert: {
          cost_per_view: number
          created_at?: string
          embedding: string
          funds: number
          id?: string
          market_id: string
          user_id: string
        }
        Update: {
          cost_per_view?: number
          created_at?: string
          embedding?: string
          funds?: number
          id?: string
          market_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'market_ads_market_id_fkey'
            columns: ['market_id']
            referencedRelation: 'contracts'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'market_ads_market_id_fkey'
            columns: ['market_id']
            referencedRelation: 'contracts_rbac'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'market_ads_market_id_fkey'
            columns: ['market_id']
            referencedRelation: 'contracts_view'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'market_ads_market_id_fkey'
            columns: ['market_id']
            referencedRelation: 'listed_open_contracts'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'market_ads_market_id_fkey'
            columns: ['market_id']
            referencedRelation: 'public_contracts'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'market_ads_market_id_fkey'
            columns: ['market_id']
            referencedRelation: 'public_open_contracts'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'market_ads_market_id_fkey'
            columns: ['market_id']
            referencedRelation: 'trending_contracts'
            referencedColumns: ['id']
          }
        ]
      }
      news: {
        Row: {
          author: string | null
          contract_ids: string[] | null
          created_time: string
          description: string | null
          group_ids: string[] | null
          id: number
          image_url: string | null
          published_time: string
          source_id: string | null
          source_name: string | null
          title: string
          title_embedding: string
          url: string
        }
        Insert: {
          author?: string | null
          contract_ids?: string[] | null
          created_time?: string
          description?: string | null
          group_ids?: string[] | null
          id?: number
          image_url?: string | null
          published_time: string
          source_id?: string | null
          source_name?: string | null
          title: string
          title_embedding: string
          url: string
        }
        Update: {
          author?: string | null
          contract_ids?: string[] | null
          created_time?: string
          description?: string | null
          group_ids?: string[] | null
          id?: number
          image_url?: string | null
          published_time?: string
          source_id?: string | null
          source_name?: string | null
          title?: string
          title_embedding?: string
          url?: string
        }
        Relationships: []
      }
      platform_calibration: {
        Row: {
          created_time: string
          data: Json
          id: number
        }
        Insert: {
          created_time?: string
          data: Json
          id?: never
        }
        Update: {
          created_time?: string
          data?: Json
          id?: never
        }
        Relationships: []
      }
      portfolios: {
        Row: {
          created_time: string
          creator_id: string
          id: string
          items: Json
          name: string
          slug: string
        }
        Insert: {
          created_time?: string
          creator_id: string
          id: string
          items: Json
          name: string
          slug: string
        }
        Update: {
          created_time?: string
          creator_id?: string
          id?: string
          items?: Json
          name?: string
          slug?: string
        }
        Relationships: []
      }
      post_comments: {
        Row: {
          comment_id: string
          created_time: string | null
          data: Json
          fs_updated_time: string | null
          post_id: string
          user_id: string | null
          visibility: string | null
        }
        Insert: {
          comment_id?: string
          created_time?: string | null
          data: Json
          fs_updated_time?: string | null
          post_id: string
          user_id?: string | null
          visibility?: string | null
        }
        Update: {
          comment_id?: string
          created_time?: string | null
          data?: Json
          fs_updated_time?: string | null
          post_id?: string
          user_id?: string | null
          visibility?: string | null
        }
        Relationships: []
      }
      posts: {
        Row: {
          created_time: string | null
          creator_id: string | null
          data: Json
          fs_updated_time: string | null
          group_id: string | null
          id: string
          visibility: string | null
        }
        Insert: {
          created_time?: string | null
          creator_id?: string | null
          data: Json
          fs_updated_time?: string | null
          group_id?: string | null
          id?: string
          visibility?: string | null
        }
        Update: {
          created_time?: string | null
          creator_id?: string | null
          data?: Json
          fs_updated_time?: string | null
          group_id?: string | null
          id?: string
          visibility?: string | null
        }
        Relationships: []
      }
      q_and_a: {
        Row: {
          bounty: number
          created_time: string
          deleted: boolean
          description: string
          id: string
          question: string
          user_id: string
        }
        Insert: {
          bounty: number
          created_time?: string
          deleted?: boolean
          description: string
          id: string
          question: string
          user_id: string
        }
        Update: {
          bounty?: number
          created_time?: string
          deleted?: boolean
          description?: string
          id?: string
          question?: string
          user_id?: string
        }
        Relationships: []
      }
      q_and_a_answers: {
        Row: {
          award: number
          created_time: string
          deleted: boolean
          id: string
          q_and_a_id: string
          text: string
          user_id: string
        }
        Insert: {
          award?: number
          created_time?: string
          deleted?: boolean
          id: string
          q_and_a_id: string
          text: string
          user_id: string
        }
        Update: {
          award?: number
          created_time?: string
          deleted?: boolean
          id?: string
          q_and_a_id?: string
          text?: string
          user_id?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          content: Json | null
          created_time: string
          market_id: string
          rating: number
          reviewer_id: string
          vendor_id: string
        }
        Insert: {
          content?: Json | null
          created_time?: string
          market_id: string
          rating: number
          reviewer_id: string
          vendor_id: string
        }
        Update: {
          content?: Json | null
          created_time?: string
          market_id?: string
          rating?: number
          reviewer_id?: string
          vendor_id?: string
        }
        Relationships: []
      }
      stats: {
        Row: {
          daily_values: number[] | null
          title: string
        }
        Insert: {
          daily_values?: number[] | null
          title: string
        }
        Update: {
          daily_values?: number[] | null
          title?: string
        }
        Relationships: []
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
        Relationships: []
      }
      topic_embeddings: {
        Row: {
          created_at: string
          embedding: string
          topic: string
        }
        Insert: {
          created_at?: string
          embedding: string
          topic: string
        }
        Update: {
          created_at?: string
          embedding?: string
          topic?: string
        }
        Relationships: []
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
        Relationships: []
      }
      user_contract_metrics: {
        Row: {
          contract_id: string
          data: Json
          fs_updated_time: string | null
          has_no_shares: boolean | null
          has_shares: boolean | null
          has_yes_shares: boolean | null
          profit: number | null
          total_shares_no: number | null
          total_shares_yes: number | null
          user_id: string
        }
        Insert: {
          contract_id: string
          data: Json
          fs_updated_time?: string | null
          has_no_shares?: boolean | null
          has_shares?: boolean | null
          has_yes_shares?: boolean | null
          profit?: number | null
          total_shares_no?: number | null
          total_shares_yes?: number | null
          user_id: string
        }
        Update: {
          contract_id?: string
          data?: Json
          fs_updated_time?: string | null
          has_no_shares?: boolean | null
          has_shares?: boolean | null
          has_yes_shares?: boolean | null
          profit?: number | null
          total_shares_no?: number | null
          total_shares_yes?: number | null
          user_id?: string
        }
        Relationships: []
      }
      user_disinterests: {
        Row: {
          comment_id: string | null
          contract_id: string
          created_time: string
          creator_id: string
          feed_id: number | null
          id: number
          user_id: string
        }
        Insert: {
          comment_id?: string | null
          contract_id: string
          created_time?: string
          creator_id: string
          feed_id?: number | null
          id?: never
          user_id: string
        }
        Update: {
          comment_id?: string | null
          contract_id?: string
          created_time?: string
          creator_id?: string
          feed_id?: number | null
          id?: never
          user_id?: string
        }
        Relationships: []
      }
      user_embeddings: {
        Row: {
          contract_view_embedding: string | null
          created_at: string
          disinterest_embedding: string | null
          interest_embedding: string
          pre_signup_embedding_is_default: boolean | null
          pre_signup_interest_embedding: string | null
          user_id: string
        }
        Insert: {
          contract_view_embedding?: string | null
          created_at?: string
          disinterest_embedding?: string | null
          interest_embedding: string
          pre_signup_embedding_is_default?: boolean | null
          pre_signup_interest_embedding?: string | null
          user_id: string
        }
        Update: {
          contract_view_embedding?: string | null
          created_at?: string
          disinterest_embedding?: string | null
          interest_embedding?: string
          pre_signup_embedding_is_default?: boolean | null
          pre_signup_interest_embedding?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_events: {
        Row: {
          ad_id: string | null
          comment_id: string | null
          contract_id: string | null
          data: Json
          id: number
          name: string
          ts: string | null
          user_id: string | null
        }
        Insert: {
          ad_id?: string | null
          comment_id?: string | null
          contract_id?: string | null
          data: Json
          id?: never
          name: string
          ts?: string | null
          user_id?: string | null
        }
        Update: {
          ad_id?: string | null
          comment_id?: string | null
          contract_id?: string | null
          data?: Json
          id?: never
          name?: string
          ts?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      user_feed: {
        Row: {
          answer_id: string | null
          bet_id: string | null
          comment_id: string | null
          contract_id: string | null
          created_time: string
          creator_id: string | null
          data: Json | null
          data_type: string
          event_time: string
          group_id: string | null
          id: number
          idempotency_key: string | null
          is_copied: boolean
          news_id: string | null
          reaction_id: string | null
          reason: string
          seen_time: string | null
          user_id: string
        }
        Insert: {
          answer_id?: string | null
          bet_id?: string | null
          comment_id?: string | null
          contract_id?: string | null
          created_time?: string
          creator_id?: string | null
          data?: Json | null
          data_type: string
          event_time: string
          group_id?: string | null
          id?: never
          idempotency_key?: string | null
          is_copied?: boolean
          news_id?: string | null
          reaction_id?: string | null
          reason: string
          seen_time?: string | null
          user_id: string
        }
        Update: {
          answer_id?: string | null
          bet_id?: string | null
          comment_id?: string | null
          contract_id?: string | null
          created_time?: string
          creator_id?: string | null
          data?: Json | null
          data_type?: string
          event_time?: string
          group_id?: string | null
          id?: never
          idempotency_key?: string | null
          is_copied?: boolean
          news_id?: string | null
          reaction_id?: string | null
          reason?: string
          seen_time?: string | null
          user_id?: string
        }
        Relationships: []
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
        Relationships: []
      }
      user_notifications: {
        Row: {
          data: Json
          fs_updated_time: string
          notification_id: string
          user_id: string
        }
        Insert: {
          data: Json
          fs_updated_time: string
          notification_id: string
          user_id: string
        }
        Update: {
          data?: Json
          fs_updated_time?: string
          notification_id?: string
          user_id?: string
        }
        Relationships: []
      }
      user_portfolio_history: {
        Row: {
          balance: number | null
          investment_value: number | null
          loan_total: number | null
          portfolio_id: string
          total_deposits: number | null
          ts: string | null
          user_id: string
        }
        Insert: {
          balance?: number | null
          investment_value?: number | null
          loan_total?: number | null
          portfolio_id: string
          total_deposits?: number | null
          ts?: string | null
          user_id: string
        }
        Update: {
          balance?: number | null
          investment_value?: number | null
          loan_total?: number | null
          portfolio_id?: string
          total_deposits?: number | null
          ts?: string | null
          user_id?: string
        }
        Relationships: []
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
        Relationships: []
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
        Relationships: []
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
        Relationships: []
      }
      user_seen_markets: {
        Row: {
          contract_id: string
          created_time: string
          data: Json
          id: number
          type: string
          user_id: string
        }
        Insert: {
          contract_id: string
          created_time?: string
          data: Json
          id?: never
          type?: string
          user_id: string
        }
        Update: {
          contract_id?: string
          created_time?: string
          data?: Json
          id?: never
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      user_topics: {
        Row: {
          created_at: string
          topic_embedding: string
          topics: string[]
          user_id: string
        }
        Insert: {
          created_at?: string
          topic_embedding: string
          topics: string[]
          user_id: string
        }
        Update: {
          created_at?: string
          topic_embedding?: string
          topics?: string[]
          user_id?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          data: Json
          fs_updated_time: string
          id: string
          name: string
          name_username_vector: unknown | null
          username: string
        }
        Insert: {
          data: Json
          fs_updated_time: string
          id: string
          name: string
          name_username_vector?: unknown | null
          username: string
        }
        Update: {
          data?: Json
          fs_updated_time?: string
          id?: string
          name?: string
          name_username_vector?: unknown | null
          username?: string
        }
        Relationships: []
      }
    }
    Views: {
      contract_bets_rbac: {
        Row: {
          amount: number | null
          bet_id: string | null
          contract_id: string | null
          created_time: string | null
          data: Json | null
          fs_updated_time: string | null
          is_ante: boolean | null
          is_challenge: boolean | null
          is_redemption: boolean | null
          outcome: string | null
          prob_after: number | null
          prob_before: number | null
          shares: number | null
          user_id: string | null
          visibility: string | null
        }
        Insert: {
          amount?: number | null
          bet_id?: string | null
          contract_id?: string | null
          created_time?: string | null
          data?: Json | null
          fs_updated_time?: string | null
          is_ante?: boolean | null
          is_challenge?: boolean | null
          is_redemption?: boolean | null
          outcome?: string | null
          prob_after?: number | null
          prob_before?: number | null
          shares?: number | null
          user_id?: string | null
          visibility?: string | null
        }
        Update: {
          amount?: number | null
          bet_id?: string | null
          contract_id?: string | null
          created_time?: string | null
          data?: Json | null
          fs_updated_time?: string | null
          is_ante?: boolean | null
          is_challenge?: boolean | null
          is_redemption?: boolean | null
          outcome?: string | null
          prob_after?: number | null
          prob_before?: number | null
          shares?: number | null
          user_id?: string | null
          visibility?: string | null
        }
        Relationships: []
      }
      contract_distance: {
        Row: {
          distance: number | null
          id1: string | null
          id2: string | null
        }
        Relationships: []
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
        Relationships: []
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
        Relationships: []
      }
      group_role: {
        Row: {
          avatar_url: string | null
          createdtime: number | null
          creator_id: string | null
          group_id: string | null
          group_name: string | null
          group_slug: string | null
          member_id: string | null
          name: string | null
          privacy_status: string | null
          role: string | null
          total_members: number | null
          username: string | null
        }
        Relationships: []
      }
      groups_rbac: {
        Row: {
          creator_id: string | null
          data: Json | null
          fs_updated_time: string | null
          id: string | null
          name: string | null
          name_fts: unknown | null
          privacy_status: string | null
          slug: string | null
          total_members: number | null
        }
        Insert: {
          creator_id?: string | null
          data?: Json | null
          fs_updated_time?: string | null
          id?: string | null
          name?: string | null
          name_fts?: unknown | null
          privacy_status?: string | null
          slug?: string | null
          total_members?: number | null
        }
        Update: {
          creator_id?: string | null
          data?: Json | null
          fs_updated_time?: string | null
          id?: string | null
          name?: string | null
          name_fts?: unknown | null
          privacy_status?: string | null
          slug?: string | null
          total_members?: number | null
        }
        Relationships: []
      }
      liked_sorted_comments: {
        Row: {
          comment_id: string | null
          contract_id: string | null
          data: Json | null
          user_id: string | null
        }
        Insert: {
          comment_id?: string | null
          contract_id?: string | null
          data?: Json | null
          user_id?: never
        }
        Update: {
          comment_id?: string | null
          contract_id?: string | null
          data?: Json | null
          user_id?: never
        }
        Relationships: []
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
        Relationships: []
      }
      private_contract_comments: {
        Row: {
          comment_id: string | null
          contract_id: string | null
          data: Json | null
          fs_updated_time: string | null
        }
        Relationships: []
      }
      public_contract_bets: {
        Row: {
          amount: number | null
          bet_id: string | null
          contract_id: string | null
          created_time: string | null
          data: Json | null
          fs_updated_time: string | null
          is_ante: boolean | null
          is_challenge: boolean | null
          is_redemption: boolean | null
          outcome: string | null
          prob_after: number | null
          prob_before: number | null
          shares: number | null
          user_id: string | null
          visibility: string | null
        }
        Insert: {
          amount?: number | null
          bet_id?: string | null
          contract_id?: string | null
          created_time?: string | null
          data?: Json | null
          fs_updated_time?: string | null
          is_ante?: boolean | null
          is_challenge?: boolean | null
          is_redemption?: boolean | null
          outcome?: string | null
          prob_after?: number | null
          prob_before?: number | null
          shares?: number | null
          user_id?: string | null
          visibility?: string | null
        }
        Update: {
          amount?: number | null
          bet_id?: string | null
          contract_id?: string | null
          created_time?: string | null
          data?: Json | null
          fs_updated_time?: string | null
          is_ante?: boolean | null
          is_challenge?: boolean | null
          is_redemption?: boolean | null
          outcome?: string | null
          prob_after?: number | null
          prob_before?: number | null
          shares?: number | null
          user_id?: string | null
          visibility?: string | null
        }
        Relationships: []
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
        Relationships: []
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
        Relationships: []
      }
      related_contracts: {
        Row: {
          contract_id: string | null
          data: Json | null
          distance: number | null
          from_contract_id: string | null
        }
        Relationships: []
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
        Relationships: []
      }
      user_contract_distance: {
        Row: {
          contract_id: string | null
          distance: number | null
          user_id: string | null
        }
        Relationships: []
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
        Relationships: []
      }
      user_league_info: {
        Row: {
          cohort: string | null
          created_time: string | null
          division: number | null
          mana_earned: number | null
          mana_earned_breakdown: Json | null
          rank: number | null
          rank_snapshot: number | null
          season: number | null
          user_id: string | null
        }
        Relationships: []
      }
      user_referrals: {
        Row: {
          data: Json | null
          id: string | null
          rank: number | null
          total_referrals: number | null
        }
        Relationships: []
      }
      user_referrals_profit: {
        Row: {
          data: Json | null
          id: string | null
          rank: number | null
          total_referrals: number | null
          total_referred_profit: number | null
        }
        Relationships: []
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
        Relationships: []
      }
    }
    Functions: {
      add_creator_name_to_description: {
        Args: {
          data: Json
        }
        Returns: string
      }
      can_access_private_contract: {
        Args: {
          this_contract_id: string
          this_member_id: string
        }
        Returns: boolean
      }
      can_access_private_post: {
        Args: {
          this_post_id: string
          this_member_id: string
        }
        Returns: boolean
      }
      check_group_accessibility: {
        Args: {
          this_group_id: string
          this_user_id: string
        }
        Returns: boolean
      }
      closest_contract_embeddings:
        | {
            Args: {
              input_contract_id: string
              similarity_threshold: number
              match_count: number
              is_admin?: boolean
            }
            Returns: {
              contract_id: string
              similarity: number
              data: Json
            }[]
          }
        | {
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
      convert_data_array_to_contract_table: {
        Args: {
          data_table: Json[]
        }
        Returns: {
          close_time: string | null
          created_time: string | null
          creator_id: string | null
          data: Json
          description_fts: unknown | null
          fs_updated_time: string
          id: string
          importance_score: number | null
          mechanism: string | null
          outcome_type: string | null
          popularity_score: number | null
          question: string | null
          question_fts: unknown | null
          question_nostop_fts: unknown | null
          resolution: string | null
          resolution_probability: number | null
          resolution_time: string | null
          slug: string | null
          visibility: string | null
        }[]
      }
      convert_data_to_contract: {
        Args: {
          data: Json
        }
        Returns: Record<string, unknown>
      }
      count_recent_comments: {
        Args: {
          contract_id: string
        }
        Returns: number
      }
      count_recent_comments_by_contract: {
        Args: Record<PropertyKey, never>
        Returns: {
          contract_id: string
          comment_count: number
        }[]
      }
      count_users_above_similarity: {
        Args: {
          nid: number
          similarity: number
        }
        Returns: number
      }
      extract_text_from_rich_text_json: {
        Args: {
          description: Json
        }
        Returns: string
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
              start: number
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
      get_contracts_with_unseen_liked_comments: {
        Args: {
          available_contract_ids: string[]
          excluded_contract_ids: string[]
          current_user_id: string
          limit_count: number
        }
        Returns: {
          contract_id: string
          comment_id: string
          user_id: string
          data: Json
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
      get_document_table_spec: {
        Args: {
          table_id: string
        }
        Returns: Database['public']['CompositeTypes']['table_spec']
      }
      get_engaged_users: {
        Args: Record<PropertyKey, never>
        Returns: {
          user_id: string
          username: string
          name: string
        }[]
      }
      get_exact_match_minus_last_word_query: {
        Args: {
          p_query: string
        }
        Returns: string
      }
      get_group_contracts: {
        Args: {
          this_group_id: string
        }
        Returns: {
          data: Json
        }[]
      }
      get_last_week_long_link: {
        Args: {
          this_group_id: string
        }
        Returns: string
      }
      get_notifications: {
        Args: {
          uid: string
          unseen_only: boolean
          max_num: number
        }
        Returns: {
          data: Json
          fs_updated_time: string
          notification_id: string
          user_id: string
        }[]
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
      get_open_limit_bets_with_contracts_rls: {
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
      get_prefix_match_query: {
        Args: {
          p_query: string
        }
        Returns: string
      }
      get_profit: {
        Args: {
          portfolio: Json
        }
        Returns: number
      }
      get_rating: {
        Args: {
          user_id: string
        }
        Returns: {
          count: number
          rating: number
        }[]
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
      get_recommended_contracts_embeddings_fast: {
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
          max_dist: number
        }
        Returns: {
          data: Json
          distance: number
          relative_dist: number
          popularity_score: number
        }[]
      }
      get_recommended_contracts_embeddings_from_fast: {
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
      get_recommended_contracts_embeddings_from_ian: {
        Args: {
          uid: string
          p_embedding: string
          n: number
          excluded_contract_ids: string[]
          max_dist: number
        }
        Returns: {
          data: Json
          distance: number
          relative_dist: number
          popularity_score: number
        }[]
      }
      get_recommended_contracts_embeddings_from_using_comments: {
        Args: {
          uid: string
          p_embedding: string
          n: number
          excluded_contract_ids: string[]
          max_dist: number
        }
        Returns: {
          data: Json
          distance: number
          relative_dist: number
          popularity_score: number
        }[]
      }
      get_recommended_contracts_embeddings_from_using_only_comments: {
        Args: {
          uid: string
          p_embedding: string
          n: number
          excluded_contract_ids: string[]
          max_dist: number
        }
        Returns: {
          data: Json
          distance: number
          relative_dist: number
          popularity_score: number
          comment_id: string
        }[]
      }
      get_recommended_contracts_embeddings_from2:
        | {
            Args: {
              uid: string
              p_embedding: string
              n: number
              excluded_contract_ids: string[]
              max_dist: number
            }
            Returns: {
              data: Json
              distance: number
              relative_dist: number
              popularity_score: number
            }[]
          }
        | {
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
      get_recommended_contracts_embeddings_using_comments: {
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
      get_recommended_contracts_embeddings_using_only_comments: {
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
          comment_id: string
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
      get_reply_chain_comments_for_comment_ids: {
        Args: {
          comment_ids: string[]
        }
        Returns: {
          id: string
          contract_id: string
          data: Json
        }[]
      }
      get_reply_chain_comments_matching_contracts: {
        Args: {
          contract_ids: string[]
          past_time_ms: number
        }
        Returns: {
          id: string
          contract_id: string
          data: Json
        }[]
      }
      get_time: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      get_top_market_ads: {
        Args: {
          uid: string
        }
        Returns: {
          ad_id: string
          market_id: string
          ad_funds: number
          ad_cost_per_view: number
          market_data: Json
        }[]
      }
      get_unique_bettors_since: {
        Args: {
          this_contract_id: string
          since: number
        }
        Returns: number
      }
      get_unseen_reply_chain_comments_matching_contracts: {
        Args: {
          contract_ids: string[]
          current_user_id: string
        }
        Returns: {
          id: string
          contract_id: string
          data: Json
        }[]
      }
      get_user_bet_contracts: {
        Args: {
          this_user_id: string
          this_limit: number
        }
        Returns: {
          data: Json
        }[]
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
      get_user_bets_from_resolved_contracts_rbac: {
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
      get_user_league_info_from_username: {
        Args: {
          this_season: number
          this_username: string
        }
        Returns: {
          cohort: string | null
          created_time: string | null
          division: number | null
          mana_earned: number | null
          mana_earned_breakdown: Json | null
          rank: number | null
          rank_snapshot: number | null
          season: number | null
          user_id: string | null
        }[]
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
      has_moderator_or_above_role: {
        Args: {
          this_group_id: string
          this_user_id: string
        }
        Returns: boolean
      }
      install_available_extensions_and_test: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      is_admin: {
        Args: {
          input_string: string
        }
        Returns: boolean
      }
      is_group_admin: {
        Args: {
          this_group_id: string
          this_user_id: string
        }
        Returns: boolean
      }
      is_group_member: {
        Args: {
          this_group_id: string
          this_user_id: string
        }
        Returns: boolean
      }
      is_private_contract_member: {
        Args: {
          this_contract_id: string
          this_member_id: string
        }
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
          '': unknown
        }
        Returns: unknown
      }
      jsonb_array_to_text_array: {
        Args: {
          _js: Json
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
      random_alphanumeric: {
        Args: {
          length: number
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
      sample_resolved_bets: {
        Args: {
          trader_threshold: number
          p: number
        }
        Returns: {
          prob: number
          is_yes: boolean
        }[]
      }
      save_user_topics: {
        Args: {
          p_user_id: string
          p_topics: string[]
        }
        Returns: undefined
      }
      save_user_topics_blank: {
        Args: {
          p_user_id: string
        }
        Returns: undefined
      }
      save_user_topics_blank2: {
        Args: {
          p_user_id: string
        }
        Returns: undefined
      }
      search_contract_embeddings: {
        Args: {
          query_embedding: string
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
      search_group_embeddings: {
        Args: {
          query_embedding: string
          similarity_threshold: number
          max_count: number
          name_similarity_threshold: number
        }
        Returns: {
          name: string
          group_id: string
          similarity: number
        }[]
      }
      search_groups: {
        Args: {
          query: string
          count: number
        }
        Returns: {
          creator_id: string | null
          data: Json
          fs_updated_time: string | null
          id: string
          importance_score: number | null
          name: string
          name_fts: unknown | null
          privacy_status: string | null
          slug: string
          total_members: number | null
        }[]
      }
      search_users: {
        Args: {
          query: string
          count: number
        }
        Returns: {
          data: Json
          fs_updated_time: string
          id: string
          name: string
          name_username_vector: unknown | null
          username: string
        }[]
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
          '': Json
        }
        Returns: Json
      }
      top_creators_for_user: {
        Args: {
          uid: string
          excluded_ids: string[]
          limit_n: number
        }
        Returns: {
          user_id: string
          n: number
        }[]
      }
      top_news:
        | {
            Args: {
              uid: string
            }
            Returns: {
              title: string
              description: string
            }[]
          }
        | {
            Args: {
              uid: string
              similarity: number
            }
            Returns: {
              title: string
              description: string
            }[]
          }
        | {
            Args: {
              uid: string
              similarity: number
              n: number
            }
            Returns: {
              title: string
              description: string
            }[]
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
      user_top_news: {
        Args: {
          uid: string
          similarity: number
          n: number
        }
        Returns: {
          id: number
          created_time: string
          title: string
          url: string
          published_time: string
          author: string
          description: string
          image_url: string
          source_id: string
          source_name: string
          contract_ids: string[]
        }[]
      }
      vector_avg: {
        Args: {
          '': number[]
        }
        Returns: string
      }
      vector_dims: {
        Args: {
          '': string
        }
        Returns: number
      }
      vector_norm: {
        Args: {
          '': string
        }
        Returns: number
      }
      vector_out: {
        Args: {
          '': string
        }
        Returns: unknown
      }
      vector_send: {
        Args: {
          '': string
        }
        Returns: string
      }
      vector_typmod_in: {
        Args: {
          '': unknown[]
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
      jsonb_data: {
        data: Json
      }
      table_spec: {
        parent_id_col_name: string
        id_col_name: string
      }
    }
  }
}
