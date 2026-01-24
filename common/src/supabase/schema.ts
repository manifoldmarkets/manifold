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
    PostgrestVersion: '12.2.3 (519615d)'
  }
  public: {
    Tables: {
      answers: {
        Row: {
          color: string | null
          contract_id: string | null
          created_time: string | null
          id: string
          image_url: string | null
          index: number | null
          is_other: boolean
          midpoint: number | null
          pool_no: number | null
          pool_yes: number | null
          prob: number | null
          prob_change_day: number | null
          prob_change_month: number | null
          prob_change_week: number | null
          resolution: string | null
          resolution_probability: number | null
          resolution_time: string | null
          resolver_id: string | null
          short_text: string | null
          subsidy_pool: number | null
          text: string | null
          text_fts: unknown
          total_liquidity: number | null
          user_id: string | null
          volume: number | null
        }
        Insert: {
          color?: string | null
          contract_id?: string | null
          created_time?: string | null
          id?: string
          image_url?: string | null
          index?: number | null
          is_other?: boolean
          midpoint?: number | null
          pool_no?: number | null
          pool_yes?: number | null
          prob?: number | null
          prob_change_day?: number | null
          prob_change_month?: number | null
          prob_change_week?: number | null
          resolution?: string | null
          resolution_probability?: number | null
          resolution_time?: string | null
          resolver_id?: string | null
          short_text?: string | null
          subsidy_pool?: number | null
          text?: string | null
          text_fts?: unknown
          total_liquidity?: number | null
          user_id?: string | null
          volume?: number | null
        }
        Update: {
          color?: string | null
          contract_id?: string | null
          created_time?: string | null
          id?: string
          image_url?: string | null
          index?: number | null
          is_other?: boolean
          midpoint?: number | null
          pool_no?: number | null
          pool_yes?: number | null
          prob?: number | null
          prob_change_day?: number | null
          prob_change_month?: number | null
          prob_change_week?: number | null
          resolution?: string | null
          resolution_probability?: number | null
          resolution_time?: string | null
          resolver_id?: string | null
          short_text?: string | null
          subsidy_pool?: number | null
          text?: string | null
          text_fts?: unknown
          total_liquidity?: number | null
          user_id?: string | null
          volume?: number | null
        }
        Relationships: []
      }
      audit_events: {
        Row: {
          bet_id: string | null
          comment_id: string | null
          contract_id: string | null
          created_time: string
          data: Json | null
          id: number
          name: string
          user_id: string
        }
        Insert: {
          bet_id?: string | null
          comment_id?: string | null
          contract_id?: string | null
          created_time?: string
          data?: Json | null
          id?: never
          name: string
          user_id: string
        }
        Update: {
          bet_id?: string | null
          comment_id?: string | null
          contract_id?: string | null
          created_time?: string
          data?: Json | null
          id?: never
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          archived: boolean
          color: string | null
          created_time: string
          display_order: number
          id: number
          name: string
          user_id: string
        }
        Insert: {
          archived?: boolean
          color?: string | null
          created_time?: string
          display_order?: number
          id?: never
          name: string
          user_id: string
        }
        Update: {
          archived?: boolean
          color?: string | null
          created_time?: string
          display_order?: number
          id?: never
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      charity_lotteries: {
        Row: {
          close_time: string
          created_time: string
          lottery_num: number
          name: string
          prize_amount_usd: number
          winning_ticket_id: string | null
        }
        Insert: {
          close_time: string
          created_time?: string
          lottery_num: number
          name: string
          prize_amount_usd: number
          winning_ticket_id?: string | null
        }
        Update: {
          close_time?: string
          created_time?: string
          lottery_num?: number
          name?: string
          prize_amount_usd?: number
          winning_ticket_id?: string | null
        }
        Relationships: []
      }
      charity_lottery_tickets: {
        Row: {
          charity_id: string
          created_time: string
          id: string
          lottery_num: number
          mana_spent: number
          num_tickets: number
          user_id: string
        }
        Insert: {
          charity_id: string
          created_time?: string
          id?: string
          lottery_num: number
          mana_spent: number
          num_tickets: number
          user_id: string
        }
        Update: {
          charity_id?: string
          created_time?: string
          id?: string
          lottery_num?: number
          mana_spent?: number
          num_tickets?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'charity_lottery_tickets_lottery_num_fkey'
            columns: ['lottery_num']
            isOneToOne: false
            referencedRelation: 'charity_lotteries'
            referencedColumns: ['lottery_num']
          }
        ]
      }
      chart_annotations: {
        Row: {
          answer_id: string | null
          comment_id: string | null
          contract_id: string
          created_time: string
          creator_avatar_url: string
          creator_id: string
          creator_name: string
          creator_username: string
          down_votes: number
          event_time: number
          external_url: string | null
          id: number
          prob_change: number | null
          text: string | null
          thumbnail_url: string | null
          up_votes: number
          user_id: string | null
        }
        Insert: {
          answer_id?: string | null
          comment_id?: string | null
          contract_id: string
          created_time?: string
          creator_avatar_url: string
          creator_id: string
          creator_name: string
          creator_username: string
          down_votes?: number
          event_time: number
          external_url?: string | null
          id?: never
          prob_change?: number | null
          text?: string | null
          thumbnail_url?: string | null
          up_votes?: number
          user_id?: string | null
        }
        Update: {
          answer_id?: string | null
          comment_id?: string | null
          contract_id?: string
          created_time?: string
          creator_avatar_url?: string
          creator_id?: string
          creator_name?: string
          creator_username?: string
          down_votes?: number
          event_time?: number
          external_url?: string | null
          id?: never
          prob_change?: number | null
          text?: string | null
          thumbnail_url?: string | null
          up_votes?: number
          user_id?: string | null
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          channel_id: string
          content: Json
          created_time: string
          id: number
          user_id: string
        }
        Insert: {
          channel_id: string
          content: Json
          created_time?: string
          id?: number
          user_id: string
        }
        Update: {
          channel_id?: string
          content?: Json
          created_time?: string
          id?: number
          user_id?: string
        }
        Relationships: []
      }
      contract_bets: {
        Row: {
          amount: number | null
          answer_id: string | null
          bet_id: string
          contract_id: string
          created_time: string
          data: Json
          expires_at: string | null
          is_api: boolean | null
          is_cancelled: boolean | null
          is_filled: boolean | null
          is_redemption: boolean | null
          loan_amount: number | null
          outcome: string | null
          prob_after: number | null
          prob_before: number | null
          shares: number | null
          updated_time: string
          user_id: string
        }
        Insert: {
          amount?: number | null
          answer_id?: string | null
          bet_id?: string
          contract_id: string
          created_time?: string
          data: Json
          expires_at?: string | null
          is_api?: boolean | null
          is_cancelled?: boolean | null
          is_filled?: boolean | null
          is_redemption?: boolean | null
          loan_amount?: number | null
          outcome?: string | null
          prob_after?: number | null
          prob_before?: number | null
          shares?: number | null
          updated_time?: string
          user_id: string
        }
        Update: {
          amount?: number | null
          answer_id?: string | null
          bet_id?: string
          contract_id?: string
          created_time?: string
          data?: Json
          expires_at?: string | null
          is_api?: boolean | null
          is_cancelled?: boolean | null
          is_filled?: boolean | null
          is_redemption?: boolean | null
          loan_amount?: number | null
          outcome?: string | null
          prob_after?: number | null
          prob_before?: number | null
          shares?: number | null
          updated_time?: string
          user_id?: string
        }
        Relationships: []
      }
      contract_boosts: {
        Row: {
          contract_id: string | null
          created_time: string
          end_time: string
          funded: boolean
          id: number
          post_id: string | null
          start_time: string
          user_id: string
        }
        Insert: {
          contract_id?: string | null
          created_time?: string
          end_time: string
          funded?: boolean
          id?: never
          post_id?: string | null
          start_time: string
          user_id: string
        }
        Update: {
          contract_id?: string | null
          created_time?: string
          end_time?: string
          funded?: boolean
          id?: never
          post_id?: string | null
          start_time?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'contract_boosts_contract_id_fkey'
            columns: ['contract_id']
            isOneToOne: false
            referencedRelation: 'contracts'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'contract_boosts_post_id_fkey'
            columns: ['post_id']
            isOneToOne: false
            referencedRelation: 'old_posts'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'contract_boosts_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'mv_user_achievement_stats'
            referencedColumns: ['user_id']
          },
          {
            foreignKeyName: 'contract_boosts_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'user_referrals_profit'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'contract_boosts_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          }
        ]
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
          created_time: string
          data: Json
          dislikes: number | null
          likes: number
          user_id: string
          visibility: string | null
        }
        Insert: {
          comment_id: string
          contract_id: string
          created_time: string
          data: Json
          dislikes?: number | null
          likes?: number
          user_id: string
          visibility?: string | null
        }
        Update: {
          comment_id?: string
          contract_id?: string
          created_time?: string
          data?: Json
          dislikes?: number | null
          likes?: number
          user_id?: string
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
          updated_keys: string[] | null
        }
        Insert: {
          contract_id: string
          created_time?: string
          data: Json
          editor_id: string
          id?: number
          idempotency_key?: string | null
          updated_keys?: string[] | null
        }
        Update: {
          contract_id?: string
          created_time?: string
          data?: Json
          editor_id?: string
          id?: number
          idempotency_key?: string | null
          updated_keys?: string[] | null
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
          created_time: string
          follow_id: string
        }
        Insert: {
          contract_id: string
          created_time?: string
          follow_id: string
        }
        Update: {
          contract_id?: string
          created_time?: string
          follow_id?: string
        }
        Relationships: []
      }
      contract_liquidity: {
        Row: {
          contract_id: string
          created_time: string | null
          data: Json
          liquidity_id: string
          user_id: string | null
        }
        Insert: {
          contract_id: string
          created_time?: string | null
          data: Json
          liquidity_id: string
          user_id?: string | null
        }
        Update: {
          contract_id?: string
          created_time?: string | null
          data?: Json
          liquidity_id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      contract_movement_notifications: {
        Row: {
          answer_id: string | null
          contract_id: string
          created_time: string
          destination: string
          id: number
          new_val: number
          new_val_start_time: string
          notification_id: string | null
          prev_val: number
          prev_val_start_time: string
          user_id: string
        }
        Insert: {
          answer_id?: string | null
          contract_id: string
          created_time?: string
          destination: string
          id?: never
          new_val: number
          new_val_start_time?: string
          notification_id?: string | null
          prev_val: number
          prev_val_start_time?: string
          user_id: string
        }
        Update: {
          answer_id?: string | null
          contract_id?: string
          created_time?: string
          destination?: string
          id?: never
          new_val?: number
          new_val_start_time?: string
          notification_id?: string | null
          prev_val?: number
          prev_val_start_time?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'fk_contract_id'
            columns: ['contract_id']
            isOneToOne: false
            referencedRelation: 'contracts'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'fk_user_id'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'mv_user_achievement_stats'
            referencedColumns: ['user_id']
          },
          {
            foreignKeyName: 'fk_user_id'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'user_referrals_profit'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'fk_user_id'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          }
        ]
      }
      contracts: {
        Row: {
          boosted: boolean
          close_time: string | null
          conversion_score: number
          created_time: string | null
          creator_id: string | null
          daily_score: number
          data: Json
          deleted: boolean | null
          description_fts: unknown
          freshness_score: number
          group_slugs: string[] | null
          id: string
          importance_score: number
          is_spice_payout: boolean | null
          last_bet_time: string | null
          last_comment_time: string | null
          last_updated_time: string | null
          mechanism: string | null
          outcome_type: string | null
          popularity_score: number
          question: string | null
          question_fts: unknown
          question_nostop_fts: unknown
          resolution: string | null
          resolution_probability: number | null
          resolution_time: string | null
          slug: string | null
          token: string
          unique_bettor_count: number
          view_count: number
          visibility: string | null
        }
        Insert: {
          boosted?: boolean
          close_time?: string | null
          conversion_score?: number
          created_time?: string | null
          creator_id?: string | null
          daily_score?: number
          data: Json
          deleted?: boolean | null
          description_fts?: unknown
          freshness_score?: number
          group_slugs?: string[] | null
          id: string
          importance_score?: number
          is_spice_payout?: boolean | null
          last_bet_time?: string | null
          last_comment_time?: string | null
          last_updated_time?: string | null
          mechanism?: string | null
          outcome_type?: string | null
          popularity_score?: number
          question?: string | null
          question_fts?: unknown
          question_nostop_fts?: unknown
          resolution?: string | null
          resolution_probability?: number | null
          resolution_time?: string | null
          slug?: string | null
          token?: string
          unique_bettor_count?: number
          view_count?: number
          visibility?: string | null
        }
        Update: {
          boosted?: boolean
          close_time?: string | null
          conversion_score?: number
          created_time?: string | null
          creator_id?: string | null
          daily_score?: number
          data?: Json
          deleted?: boolean | null
          description_fts?: unknown
          freshness_score?: number
          group_slugs?: string[] | null
          id?: string
          importance_score?: number
          is_spice_payout?: boolean | null
          last_bet_time?: string | null
          last_comment_time?: string | null
          last_updated_time?: string | null
          mechanism?: string | null
          outcome_type?: string | null
          popularity_score?: number
          question?: string | null
          question_fts?: unknown
          question_nostop_fts?: unknown
          resolution?: string | null
          resolution_probability?: number | null
          resolution_time?: string | null
          slug?: string | null
          token?: string
          unique_bettor_count?: number
          view_count?: number
          visibility?: string | null
        }
        Relationships: []
      }
      creator_portfolio_history: {
        Row: {
          fees_earned: number
          id: number
          ts: string
          unique_bettors: number
          user_id: string
          views: number
          volume: number
        }
        Insert: {
          fees_earned: number
          id?: never
          ts?: string
          unique_bettors: number
          user_id: string
          views: number
          volume: number
        }
        Update: {
          fees_earned?: number
          id?: never
          ts?: string
          unique_bettors?: number
          user_id?: string
          views?: number
          volume?: number
        }
        Relationships: []
      }
      daily_stats: {
        Row: {
          activation: number | null
          active_d1_to_d3: number | null
          avg_user_actions: number | null
          bet_amount: number | null
          bet_count: number | null
          cash_avg_user_actions: number | null
          cash_bet_amount: number | null
          cash_bet_count: number | null
          cash_comment_count: number | null
          cash_contract_count: number | null
          cash_d1: number | null
          cash_dau: number | null
          cash_m1: number | null
          cash_mau: number | null
          cash_sales: number | null
          cash_w1: number | null
          cash_wau: number | null
          comment_count: number | null
          contract_count: number | null
          d1: number | null
          d1_bet_3_day_average: number | null
          d1_bet_average: number | null
          dau: number | null
          dav: number | null
          engaged_users: number | null
          feed_conversion: number | null
          m1: number | null
          mau: number | null
          mav: number | null
          nd1: number | null
          nw1: number | null
          sales: number | null
          signups: number | null
          signups_real: number | null
          start_date: string
          topic_daus: Json | null
          w1: number | null
          wau: number | null
          wav: number | null
        }
        Insert: {
          activation?: number | null
          active_d1_to_d3?: number | null
          avg_user_actions?: number | null
          bet_amount?: number | null
          bet_count?: number | null
          cash_avg_user_actions?: number | null
          cash_bet_amount?: number | null
          cash_bet_count?: number | null
          cash_comment_count?: number | null
          cash_contract_count?: number | null
          cash_d1?: number | null
          cash_dau?: number | null
          cash_m1?: number | null
          cash_mau?: number | null
          cash_sales?: number | null
          cash_w1?: number | null
          cash_wau?: number | null
          comment_count?: number | null
          contract_count?: number | null
          d1?: number | null
          d1_bet_3_day_average?: number | null
          d1_bet_average?: number | null
          dau?: number | null
          dav?: number | null
          engaged_users?: number | null
          feed_conversion?: number | null
          m1?: number | null
          mau?: number | null
          mav?: number | null
          nd1?: number | null
          nw1?: number | null
          sales?: number | null
          signups?: number | null
          signups_real?: number | null
          start_date: string
          topic_daus?: Json | null
          w1?: number | null
          wau?: number | null
          wav?: number | null
        }
        Update: {
          activation?: number | null
          active_d1_to_d3?: number | null
          avg_user_actions?: number | null
          bet_amount?: number | null
          bet_count?: number | null
          cash_avg_user_actions?: number | null
          cash_bet_amount?: number | null
          cash_bet_count?: number | null
          cash_comment_count?: number | null
          cash_contract_count?: number | null
          cash_d1?: number | null
          cash_dau?: number | null
          cash_m1?: number | null
          cash_mau?: number | null
          cash_sales?: number | null
          cash_w1?: number | null
          cash_wau?: number | null
          comment_count?: number | null
          contract_count?: number | null
          d1?: number | null
          d1_bet_3_day_average?: number | null
          d1_bet_average?: number | null
          dau?: number | null
          dav?: number | null
          engaged_users?: number | null
          feed_conversion?: number | null
          m1?: number | null
          mau?: number | null
          mav?: number | null
          nd1?: number | null
          nw1?: number | null
          sales?: number | null
          signups?: number | null
          signups_real?: number | null
          start_date?: string
          topic_daus?: Json | null
          w1?: number | null
          wau?: number | null
          wav?: number | null
        }
        Relationships: []
      }
      dashboard_follows: {
        Row: {
          created_time: string | null
          dashboard_id: string
          follower_id: string
        }
        Insert: {
          created_time?: string | null
          dashboard_id: string
          follower_id: string
        }
        Update: {
          created_time?: string | null
          dashboard_id?: string
          follower_id?: string
        }
        Relationships: []
      }
      dashboard_groups: {
        Row: {
          dashboard_id: string
          group_id: string
        }
        Insert: {
          dashboard_id: string
          group_id: string
        }
        Update: {
          dashboard_id?: string
          group_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'dashboard_groups_dashboard_id_fkey'
            columns: ['dashboard_id']
            isOneToOne: false
            referencedRelation: 'dashboards'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'public_dashboard_groups_group_id_fkey'
            columns: ['group_id']
            isOneToOne: false
            referencedRelation: 'group_role'
            referencedColumns: ['group_id']
          },
          {
            foreignKeyName: 'public_dashboard_groups_group_id_fkey'
            columns: ['group_id']
            isOneToOne: false
            referencedRelation: 'groups'
            referencedColumns: ['id']
          }
        ]
      }
      dashboards: {
        Row: {
          ai_importance_score: number
          created_time: string
          creator_avatar_url: string
          creator_id: string
          creator_name: string
          creator_username: string
          id: string
          importance_score: number
          items: Json | null
          politics_importance_score: number
          slug: string
          title: string
          title_fts: unknown
          visibility: string | null
        }
        Insert: {
          ai_importance_score?: number
          created_time?: string
          creator_avatar_url: string
          creator_id: string
          creator_name: string
          creator_username: string
          id?: string
          importance_score?: number
          items?: Json | null
          politics_importance_score?: number
          slug: string
          title: string
          title_fts?: unknown
          visibility?: string | null
        }
        Update: {
          ai_importance_score?: number
          created_time?: string
          creator_avatar_url?: string
          creator_id?: string
          creator_name?: string
          creator_username?: string
          id?: string
          importance_score?: number
          items?: Json | null
          politics_importance_score?: number
          slug?: string
          title?: string
          title_fts?: unknown
          visibility?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'dashboards_creator_id_fkey'
            columns: ['creator_id']
            isOneToOne: false
            referencedRelation: 'mv_user_achievement_stats'
            referencedColumns: ['user_id']
          },
          {
            foreignKeyName: 'dashboards_creator_id_fkey'
            columns: ['creator_id']
            isOneToOne: false
            referencedRelation: 'user_referrals_profit'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'dashboards_creator_id_fkey'
            columns: ['creator_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          }
        ]
      }
      delete_after_reading: {
        Row: {
          created_time: string
          data: Json | null
          id: number
          user_id: string
        }
        Insert: {
          created_time?: string
          data?: Json | null
          id?: never
          user_id: string
        }
        Update: {
          created_time?: string
          data?: Json | null
          id?: never
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'delete_after_reading_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'mv_user_achievement_stats'
            referencedColumns: ['user_id']
          },
          {
            foreignKeyName: 'delete_after_reading_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'user_referrals_profit'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'delete_after_reading_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          }
        ]
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
          user_id: string
        }
        Insert: {
          api_key: string
          discord_user_id: string
          user_id: string
        }
        Update: {
          api_key?: string
          discord_user_id?: string
          user_id?: string
        }
        Relationships: []
      }
      gidx_receipts: {
        Row: {
          amount: number | null
          callback_data: Json | null
          created_time: string
          currency: string | null
          id: number
          merchant_session_id: string | null
          merchant_transaction_id: string
          payment_amount_type: string | null
          payment_data: Json | null
          payment_method_type: string | null
          payment_status_code: string | null
          payment_status_message: string | null
          reason_codes: string[] | null
          service_type: string | null
          session_id: string
          session_score: number | null
          status: string | null
          status_code: number | null
          transaction_status_code: string | null
          transaction_status_message: string | null
          txn_id: string | null
          user_id: string | null
        }
        Insert: {
          amount?: number | null
          callback_data?: Json | null
          created_time?: string
          currency?: string | null
          id?: never
          merchant_session_id?: string | null
          merchant_transaction_id: string
          payment_amount_type?: string | null
          payment_data?: Json | null
          payment_method_type?: string | null
          payment_status_code?: string | null
          payment_status_message?: string | null
          reason_codes?: string[] | null
          service_type?: string | null
          session_id: string
          session_score?: number | null
          status?: string | null
          status_code?: number | null
          transaction_status_code?: string | null
          transaction_status_message?: string | null
          txn_id?: string | null
          user_id?: string | null
        }
        Update: {
          amount?: number | null
          callback_data?: Json | null
          created_time?: string
          currency?: string | null
          id?: never
          merchant_session_id?: string | null
          merchant_transaction_id?: string
          payment_amount_type?: string | null
          payment_data?: Json | null
          payment_method_type?: string | null
          payment_status_code?: string | null
          payment_status_message?: string | null
          reason_codes?: string[] | null
          service_type?: string | null
          session_id?: string
          session_score?: number | null
          status?: string | null
          status_code?: number | null
          transaction_status_code?: string | null
          transaction_status_message?: string | null
          txn_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'gidx_receipts_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'mv_user_achievement_stats'
            referencedColumns: ['user_id']
          },
          {
            foreignKeyName: 'gidx_receipts_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'user_referrals_profit'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'gidx_receipts_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          }
        ]
      }
      group_contracts: {
        Row: {
          contract_id: string
          group_id: string
        }
        Insert: {
          contract_id: string
          group_id: string
        }
        Update: {
          contract_id?: string
          group_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'group_contracts_group_id_fkey'
            columns: ['group_id']
            isOneToOne: false
            referencedRelation: 'group_role'
            referencedColumns: ['group_id']
          },
          {
            foreignKeyName: 'group_contracts_group_id_fkey'
            columns: ['group_id']
            isOneToOne: false
            referencedRelation: 'groups'
            referencedColumns: ['id']
          }
        ]
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
        Relationships: [
          {
            foreignKeyName: 'public_group_embeddings_group_id_fkey'
            columns: ['group_id']
            isOneToOne: true
            referencedRelation: 'group_role'
            referencedColumns: ['group_id']
          },
          {
            foreignKeyName: 'public_group_embeddings_group_id_fkey'
            columns: ['group_id']
            isOneToOne: true
            referencedRelation: 'groups'
            referencedColumns: ['id']
          }
        ]
      }
      group_groups: {
        Row: {
          bottom_id: string
          top_id: string
        }
        Insert: {
          bottom_id: string
          top_id: string
        }
        Update: {
          bottom_id?: string
          top_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'group_groups_bottom_id_fkey'
            columns: ['bottom_id']
            isOneToOne: false
            referencedRelation: 'group_role'
            referencedColumns: ['group_id']
          },
          {
            foreignKeyName: 'group_groups_bottom_id_fkey'
            columns: ['bottom_id']
            isOneToOne: false
            referencedRelation: 'groups'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'group_groups_top_id_fkey'
            columns: ['top_id']
            isOneToOne: false
            referencedRelation: 'group_role'
            referencedColumns: ['group_id']
          },
          {
            foreignKeyName: 'group_groups_top_id_fkey'
            columns: ['top_id']
            isOneToOne: false
            referencedRelation: 'groups'
            referencedColumns: ['id']
          }
        ]
      }
      group_invites: {
        Row: {
          created_time: string
          duration: unknown
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
          duration?: unknown
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
          duration?: unknown
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
            foreignKeyName: 'public_group_invites_group_id_fkey'
            columns: ['group_id']
            isOneToOne: false
            referencedRelation: 'group_role'
            referencedColumns: ['group_id']
          },
          {
            foreignKeyName: 'public_group_invites_group_id_fkey'
            columns: ['group_id']
            isOneToOne: false
            referencedRelation: 'groups'
            referencedColumns: ['id']
          }
        ]
      }
      group_members: {
        Row: {
          created_time: string | null
          group_id: string
          member_id: string
          role: string
        }
        Insert: {
          created_time?: string | null
          group_id: string
          member_id: string
          role?: string
        }
        Update: {
          created_time?: string | null
          group_id?: string
          member_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: 'public_group_members_group_id_fkey'
            columns: ['group_id']
            isOneToOne: false
            referencedRelation: 'group_role'
            referencedColumns: ['group_id']
          },
          {
            foreignKeyName: 'public_group_members_group_id_fkey'
            columns: ['group_id']
            isOneToOne: false
            referencedRelation: 'groups'
            referencedColumns: ['id']
          }
        ]
      }
      groups: {
        Row: {
          about: Json | null
          banner_url: string | null
          created_time: string
          creator_id: string | null
          id: string
          importance_score: number | null
          name: string
          name_fts: unknown
          privacy_status: string | null
          slug: string
          total_members: number | null
        }
        Insert: {
          about?: Json | null
          banner_url?: string | null
          created_time?: string
          creator_id?: string | null
          id?: string
          importance_score?: number | null
          name: string
          name_fts?: unknown
          privacy_status?: string | null
          slug: string
          total_members?: number | null
        }
        Update: {
          about?: Json | null
          banner_url?: string | null
          created_time?: string
          creator_id?: string | null
          id?: string
          importance_score?: number | null
          name?: string
          name_fts?: unknown
          privacy_status?: string | null
          slug?: string
          total_members?: number | null
        }
        Relationships: []
      }
      kyc_bonus_rewards: {
        Row: {
          claim_time: string | null
          claimed: boolean | null
          created_time: string | null
          reward_amount: number
          user_id: string
        }
        Insert: {
          claim_time?: string | null
          claimed?: boolean | null
          created_time?: string | null
          reward_amount: number
          user_id: string
        }
        Update: {
          claim_time?: string | null
          claimed?: boolean | null
          created_time?: string | null
          reward_amount?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'kyc_bonus_rewards_user_id_fkey'
            columns: ['user_id']
            isOneToOne: true
            referencedRelation: 'mv_user_achievement_stats'
            referencedColumns: ['user_id']
          },
          {
            foreignKeyName: 'kyc_bonus_rewards_user_id_fkey'
            columns: ['user_id']
            isOneToOne: true
            referencedRelation: 'user_referrals_profit'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'kyc_bonus_rewards_user_id_fkey'
            columns: ['user_id']
            isOneToOne: true
            referencedRelation: 'users'
            referencedColumns: ['id']
          }
        ]
      }
      league_chats: {
        Row: {
          channel_id: string
          cohort: string
          created_time: string
          division: number
          id: number
          owner_id: string | null
          season: number
        }
        Insert: {
          channel_id: string
          cohort: string
          created_time?: string
          division: number
          id?: number
          owner_id?: string | null
          season: number
        }
        Update: {
          channel_id?: string
          cohort?: string
          created_time?: string
          division?: number
          id?: number
          owner_id?: string | null
          season?: number
        }
        Relationships: []
      }
      leagues: {
        Row: {
          cohort: string
          created_time: string
          division: number
          id: string
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
          id?: string
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
          id?: string
          mana_earned?: number
          mana_earned_breakdown?: Json
          rank_snapshot?: number | null
          season?: number
          user_id?: string
        }
        Relationships: []
      }
      leagues_season_end_times: {
        Row: {
          end_time: string
          season: number
          status: string
        }
        Insert: {
          end_time: string
          season: number
          status?: string
        }
        Update: {
          end_time?: string
          season?: number
          status?: string
        }
        Relationships: []
      }
      love_answers: {
        Row: {
          created_time: string
          creator_id: string
          free_response: string | null
          id: number
          integer: number | null
          multiple_choice: number | null
          question_id: number
        }
        Insert: {
          created_time?: string
          creator_id: string
          free_response?: string | null
          id?: never
          integer?: number | null
          multiple_choice?: number | null
          question_id: number
        }
        Update: {
          created_time?: string
          creator_id?: string
          free_response?: string | null
          id?: never
          integer?: number | null
          multiple_choice?: number | null
          question_id?: number
        }
        Relationships: []
      }
      love_compatibility_answers: {
        Row: {
          created_time: string
          creator_id: string
          explanation: string | null
          id: number
          importance: number
          multiple_choice: number
          pref_choices: number[]
          question_id: number
        }
        Insert: {
          created_time?: string
          creator_id: string
          explanation?: string | null
          id?: never
          importance: number
          multiple_choice: number
          pref_choices: number[]
          question_id: number
        }
        Update: {
          created_time?: string
          creator_id?: string
          explanation?: string | null
          id?: never
          importance?: number
          multiple_choice?: number
          pref_choices?: number[]
          question_id?: number
        }
        Relationships: []
      }
      love_likes: {
        Row: {
          created_time: string
          creator_id: string
          like_id: string
          target_id: string
        }
        Insert: {
          created_time?: string
          creator_id: string
          like_id?: string
          target_id: string
        }
        Update: {
          created_time?: string
          creator_id?: string
          like_id?: string
          target_id?: string
        }
        Relationships: []
      }
      love_questions: {
        Row: {
          answer_type: string
          created_time: string
          creator_id: string
          id: number
          importance_score: number
          multiple_choice_options: Json | null
          question: string
        }
        Insert: {
          answer_type?: string
          created_time?: string
          creator_id: string
          id?: never
          importance_score?: number
          multiple_choice_options?: Json | null
          question: string
        }
        Update: {
          answer_type?: string
          created_time?: string
          creator_id?: string
          id?: never
          importance_score?: number
          multiple_choice_options?: Json | null
          question?: string
        }
        Relationships: []
      }
      love_ships: {
        Row: {
          created_time: string
          creator_id: string
          ship_id: string
          target1_id: string
          target2_id: string
        }
        Insert: {
          created_time?: string
          creator_id: string
          ship_id?: string
          target1_id: string
          target2_id: string
        }
        Update: {
          created_time?: string
          creator_id?: string
          ship_id?: string
          target1_id?: string
          target2_id?: string
        }
        Relationships: []
      }
      love_stars: {
        Row: {
          created_time: string
          creator_id: string
          star_id: string
          target_id: string
        }
        Insert: {
          created_time?: string
          creator_id: string
          star_id?: string
          target_id: string
        }
        Update: {
          created_time?: string
          creator_id?: string
          star_id?: string
          target_id?: string
        }
        Relationships: []
      }
      love_waitlist: {
        Row: {
          created_time: string
          email: string
          id: number
        }
        Insert: {
          created_time?: string
          email: string
          id?: never
        }
        Update: {
          created_time?: string
          email?: string
          id?: never
        }
        Relationships: []
      }
      lover_comments: {
        Row: {
          content: Json
          created_time: string
          hidden: boolean
          id: number
          on_user_id: string
          reply_to_comment_id: number | null
          user_avatar_url: string
          user_id: string
          user_name: string
          user_username: string
        }
        Insert: {
          content: Json
          created_time?: string
          hidden?: boolean
          id?: never
          on_user_id: string
          reply_to_comment_id?: number | null
          user_avatar_url: string
          user_id: string
          user_name: string
          user_username: string
        }
        Update: {
          content?: Json
          created_time?: string
          hidden?: boolean
          id?: never
          on_user_id?: string
          reply_to_comment_id?: number | null
          user_avatar_url?: string
          user_id?: string
          user_name?: string
          user_username?: string
        }
        Relationships: []
      }
      lovers: {
        Row: {
          age: number
          bio: Json | null
          born_in_location: string | null
          city: string
          city_latitude: number | null
          city_longitude: number | null
          comments_enabled: boolean
          company: string | null
          country: string | null
          created_time: string
          drinks_per_month: number | null
          education_level: string | null
          ethnicity: string[] | null
          gender: string
          geodb_city_id: string | null
          has_kids: number | null
          height_in_inches: number | null
          id: number
          is_smoker: boolean | null
          is_vegetarian_or_vegan: boolean | null
          last_online_time: string
          looking_for_matches: boolean
          messaging_status: string
          occupation: string | null
          occupation_title: string | null
          photo_urls: string[] | null
          pinned_url: string | null
          political_beliefs: string[] | null
          pref_age_max: number
          pref_age_min: number
          pref_gender: string[]
          pref_relation_styles: string[]
          referred_by_username: string | null
          region_code: string | null
          religious_belief_strength: number | null
          religious_beliefs: string | null
          twitter: string | null
          university: string | null
          user_id: string
          visibility: string
          wants_kids_strength: number
          website: string | null
        }
        Insert: {
          age?: number
          bio?: Json | null
          born_in_location?: string | null
          city: string
          city_latitude?: number | null
          city_longitude?: number | null
          comments_enabled?: boolean
          company?: string | null
          country?: string | null
          created_time?: string
          drinks_per_month?: number | null
          education_level?: string | null
          ethnicity?: string[] | null
          gender: string
          geodb_city_id?: string | null
          has_kids?: number | null
          height_in_inches?: number | null
          id?: never
          is_smoker?: boolean | null
          is_vegetarian_or_vegan?: boolean | null
          last_online_time?: string
          looking_for_matches?: boolean
          messaging_status?: string
          occupation?: string | null
          occupation_title?: string | null
          photo_urls?: string[] | null
          pinned_url?: string | null
          political_beliefs?: string[] | null
          pref_age_max?: number
          pref_age_min?: number
          pref_gender: string[]
          pref_relation_styles: string[]
          referred_by_username?: string | null
          region_code?: string | null
          religious_belief_strength?: number | null
          religious_beliefs?: string | null
          twitter?: string | null
          university?: string | null
          user_id: string
          visibility?: string
          wants_kids_strength?: number
          website?: string | null
        }
        Update: {
          age?: number
          bio?: Json | null
          born_in_location?: string | null
          city?: string
          city_latitude?: number | null
          city_longitude?: number | null
          comments_enabled?: boolean
          company?: string | null
          country?: string | null
          created_time?: string
          drinks_per_month?: number | null
          education_level?: string | null
          ethnicity?: string[] | null
          gender?: string
          geodb_city_id?: string | null
          has_kids?: number | null
          height_in_inches?: number | null
          id?: never
          is_smoker?: boolean | null
          is_vegetarian_or_vegan?: boolean | null
          last_online_time?: string
          looking_for_matches?: boolean
          messaging_status?: string
          occupation?: string | null
          occupation_title?: string | null
          photo_urls?: string[] | null
          pinned_url?: string | null
          political_beliefs?: string[] | null
          pref_age_max?: number
          pref_age_min?: number
          pref_gender?: string[]
          pref_relation_styles?: string[]
          referred_by_username?: string | null
          region_code?: string | null
          religious_belief_strength?: number | null
          religious_beliefs?: string | null
          twitter?: string | null
          university?: string | null
          user_id?: string
          visibility?: string
          wants_kids_strength?: number
          website?: string | null
        }
        Relationships: []
      }
      mana_supply_stats: {
        Row: {
          amm_cash_liquidity: number
          amm_liquidity: number
          balance: number
          cash_balance: number
          cash_investment_value: number
          created_time: string
          end_time: string
          full_investment_value: number | null
          full_loan_total: number | null
          full_mana_balance: number | null
          full_spice_balance: number | null
          full_total_mana_value: number | null
          id: number
          investment_value: number
          loan_total: number
          spice_balance: number
          start_time: string
          total_cash_value: number
          total_value: number
        }
        Insert: {
          amm_cash_liquidity?: number
          amm_liquidity: number
          balance: number
          cash_balance?: number
          cash_investment_value?: number
          created_time?: string
          end_time: string
          full_investment_value?: number | null
          full_loan_total?: number | null
          full_mana_balance?: number | null
          full_spice_balance?: number | null
          full_total_mana_value?: number | null
          id?: never
          investment_value: number
          loan_total: number
          spice_balance: number
          start_time: string
          total_cash_value?: number
          total_value: number
        }
        Update: {
          amm_cash_liquidity?: number
          amm_liquidity?: number
          balance?: number
          cash_balance?: number
          cash_investment_value?: number
          created_time?: string
          end_time?: string
          full_investment_value?: number | null
          full_loan_total?: number | null
          full_mana_balance?: number | null
          full_spice_balance?: number | null
          full_total_mana_value?: number | null
          id?: never
          investment_value?: number
          loan_total?: number
          spice_balance?: number
          start_time?: string
          total_cash_value?: number
          total_value?: number
        }
        Relationships: []
      }
      manachan_tweets: {
        Row: {
          cost: number | null
          created_time: number | null
          id: string
          tweet: string | null
          tweet_id: string | null
          user_id: string | null
          username: string | null
        }
        Insert: {
          cost?: number | null
          created_time?: number | null
          id?: string
          tweet?: string | null
          tweet_id?: string | null
          user_id?: string | null
          username?: string | null
        }
        Update: {
          cost?: number | null
          created_time?: number | null
          id?: string
          tweet?: string | null
          tweet_id?: string | null
          user_id?: string | null
          username?: string | null
        }
        Relationships: []
      }
      manalink_claims: {
        Row: {
          manalink_id: string
          txn_id: string
        }
        Insert: {
          manalink_id: string
          txn_id: string
        }
        Update: {
          manalink_id?: string
          txn_id?: string
        }
        Relationships: []
      }
      manalinks: {
        Row: {
          amount: number
          created_time: string | null
          creator_id: string
          expires_time: string | null
          id: string
          max_uses: number | null
          message: string | null
        }
        Insert: {
          amount: number
          created_time?: string | null
          creator_id: string
          expires_time?: string | null
          id?: string
          max_uses?: number | null
          message?: string | null
        }
        Update: {
          amount?: number
          created_time?: string | null
          creator_id?: string
          expires_time?: string | null
          id?: string
          max_uses?: number | null
          message?: string | null
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
            isOneToOne: false
            referencedRelation: 'contracts'
            referencedColumns: ['id']
          }
        ]
      }
      market_drafts: {
        Row: {
          created_at: string | null
          data: Json
          id: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          data: Json
          id?: never
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          data?: Json
          id?: never
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'market_drafts_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'mv_user_achievement_stats'
            referencedColumns: ['user_id']
          },
          {
            foreignKeyName: 'market_drafts_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'user_referrals_profit'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'market_drafts_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          }
        ]
      }
      mod_reports: {
        Row: {
          comment_id: string
          contract_id: string
          created_time: string
          mod_note: string | null
          report_id: number
          status: Database['public']['Enums']['status_type']
          user_id: string
        }
        Insert: {
          comment_id: string
          contract_id: string
          created_time?: string
          mod_note?: string | null
          report_id?: number
          status?: Database['public']['Enums']['status_type']
          user_id: string
        }
        Update: {
          comment_id?: string
          contract_id?: string
          created_time?: string
          mod_note?: string | null
          report_id?: number
          status?: Database['public']['Enums']['status_type']
          user_id?: string
        }
        Relationships: []
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
      old_post_comments: {
        Row: {
          comment_id: string
          created_time: string | null
          data: Json
          fs_updated_time: string | null
          post_id: string
          user_id: string | null
        }
        Insert: {
          comment_id?: string
          created_time?: string | null
          data: Json
          fs_updated_time?: string | null
          post_id: string
          user_id?: string | null
        }
        Update: {
          comment_id?: string
          created_time?: string | null
          data?: Json
          fs_updated_time?: string | null
          post_id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      old_posts: {
        Row: {
          boosted: boolean
          created_time: string | null
          creator_id: string | null
          data: Json
          group_id: string | null
          id: string
          importance_score: number
          visibility: string | null
        }
        Insert: {
          boosted?: boolean
          created_time?: string | null
          creator_id?: string | null
          data: Json
          group_id?: string | null
          id?: string
          importance_score?: number
          visibility?: string | null
        }
        Update: {
          boosted?: boolean
          created_time?: string | null
          creator_id?: string | null
          data?: Json
          group_id?: string | null
          id?: string
          importance_score?: number
          visibility?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'public_old_posts_group_id_fkey'
            columns: ['group_id']
            isOneToOne: false
            referencedRelation: 'group_role'
            referencedColumns: ['group_id']
          },
          {
            foreignKeyName: 'public_old_posts_group_id_fkey'
            columns: ['group_id']
            isOneToOne: false
            referencedRelation: 'groups'
            referencedColumns: ['id']
          }
        ]
      }
      pending_clarifications: {
        Row: {
          applied_time: string | null
          cancelled_time: string | null
          comment_id: string
          contract_id: string
          created_time: string
          data: Json
          id: number
        }
        Insert: {
          applied_time?: string | null
          cancelled_time?: string | null
          comment_id: string
          contract_id: string
          created_time?: string
          data: Json
          id?: never
        }
        Update: {
          applied_time?: string | null
          cancelled_time?: string | null
          comment_id?: string
          contract_id?: string
          created_time?: string
          data?: Json
          id?: never
        }
        Relationships: [
          {
            foreignKeyName: 'pending_clarifications_contract_id_fkey'
            columns: ['contract_id']
            isOneToOne: false
            referencedRelation: 'contracts'
            referencedColumns: ['id']
          }
        ]
      }
      pending_answers: {
        Row: {
          contract_id: string
          created_time: string
          id: string
          reviewed_by: string | null
          reviewed_time: string | null
          status: string
          text: string
          user_id: string
        }
        Insert: {
          contract_id: string
          created_time?: string
          id?: string
          reviewed_by?: string | null
          reviewed_time?: string | null
          status?: string
          text: string
          user_id: string
        }
        Update: {
          contract_id?: string
          created_time?: string
          id?: string
          reviewed_by?: string | null
          reviewed_time?: string | null
          status?: string
          text?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'pending_answers_contract_id_fkey'
            columns: ['contract_id']
            isOneToOne: false
            referencedRelation: 'contracts'
            referencedColumns: ['id']
          }
        ]
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
      portfolios_processed: {
        Row: {
          last_processed: string
          user_id: string
        }
        Insert: {
          last_processed?: string
          user_id: string
        }
        Update: {
          last_processed?: string
          user_id?: string
        }
        Relationships: []
      }
      post_comment_edits: {
        Row: {
          comment_id: string
          created_time: string
          data: Json
          editor_id: string
          id: number
          post_id: string
        }
        Insert: {
          comment_id: string
          created_time?: string
          data: Json
          editor_id: string
          id?: never
          post_id: string
        }
        Update: {
          comment_id?: string
          created_time?: string
          data?: Json
          editor_id?: string
          id?: never
          post_id?: string
        }
        Relationships: []
      }
      post_follows: {
        Row: {
          created_time: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_time?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_time?: string
          post_id?: string
          user_id?: string
        }
        Relationships: []
      }
      posts: {
        Row: {
          bet_id: string | null
          contract_comment_id: string | null
          contract_id: string | null
          created_time: string
          id: number
          user_avatar_url: string
          user_id: string
          user_name: string
          user_username: string
        }
        Insert: {
          bet_id?: string | null
          contract_comment_id?: string | null
          contract_id?: string | null
          created_time?: string
          id?: never
          user_avatar_url: string
          user_id: string
          user_name: string
          user_username: string
        }
        Update: {
          bet_id?: string | null
          contract_comment_id?: string | null
          contract_id?: string | null
          created_time?: string
          id?: never
          user_avatar_url?: string
          user_id?: string
          user_name?: string
          user_username?: string
        }
        Relationships: []
      }
      predictle_daily: {
        Row: {
          created_time: string | null
          data: Json
          date_pt: string
        }
        Insert: {
          created_time?: string | null
          data: Json
          date_pt: string
        }
        Update: {
          created_time?: string | null
          data?: Json
          date_pt?: string
        }
        Relationships: []
      }
      predictle_results: {
        Row: {
          attempts: number
          created_time: string | null
          id: number
          puzzle_number: number
          user_id: string
          won: boolean
        }
        Insert: {
          attempts: number
          created_time?: string | null
          id?: number
          puzzle_number: number
          user_id: string
          won: boolean
        }
        Update: {
          attempts?: number
          created_time?: string | null
          id?: number
          puzzle_number?: number
          user_id?: string
          won?: boolean
        }
        Relationships: []
      }
      private_user_message_channel_members: {
        Row: {
          channel_id: number
          created_time: string
          id: number
          notify_after_time: string
          role: string
          status: string
          user_id: string
        }
        Insert: {
          channel_id: number
          created_time?: string
          id?: never
          notify_after_time?: string
          role?: string
          status?: string
          user_id: string
        }
        Update: {
          channel_id?: number
          created_time?: string
          id?: never
          notify_after_time?: string
          role?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      private_user_message_channels: {
        Row: {
          created_time: string
          id: number
          last_updated_time: string
          title: string | null
        }
        Insert: {
          created_time?: string
          id?: never
          last_updated_time?: string
          title?: string | null
        }
        Update: {
          created_time?: string
          id?: never
          last_updated_time?: string
          title?: string | null
        }
        Relationships: []
      }
      private_user_messages: {
        Row: {
          channel_id: number
          content: Json
          created_time: string
          id: number
          user_id: string
          visibility: string
        }
        Insert: {
          channel_id: number
          content: Json
          created_time?: string
          id?: never
          user_id: string
          visibility?: string
        }
        Update: {
          channel_id?: number
          content?: Json
          created_time?: string
          id?: never
          user_id?: string
          visibility?: string
        }
        Relationships: []
      }
      private_user_phone_numbers: {
        Row: {
          created_time: string
          id: number
          last_updated_time: string
          phone_number: string
          user_id: string
        }
        Insert: {
          created_time?: string
          id?: never
          last_updated_time?: string
          phone_number: string
          user_id: string
        }
        Update: {
          created_time?: string
          id?: never
          last_updated_time?: string
          phone_number?: string
          user_id?: string
        }
        Relationships: []
      }
      private_user_seen_message_channels: {
        Row: {
          channel_id: number
          created_time: string
          id: number
          user_id: string
        }
        Insert: {
          channel_id: number
          created_time?: string
          id?: never
          user_id: string
        }
        Update: {
          channel_id?: number
          created_time?: string
          id?: never
          user_id?: string
        }
        Relationships: []
      }
      private_users: {
        Row: {
          data: Json
          id: string
          weekly_portfolio_email_sent: boolean | null
          weekly_trending_email_sent: boolean | null
        }
        Insert: {
          data: Json
          id: string
          weekly_portfolio_email_sent?: boolean | null
          weekly_trending_email_sent?: boolean | null
        }
        Update: {
          data?: Json
          id?: string
          weekly_portfolio_email_sent?: boolean | null
          weekly_trending_email_sent?: boolean | null
        }
        Relationships: []
      }
      push_notification_tickets: {
        Row: {
          created_time: string
          id: string
          notification_id: string
          receipt_error: string | null
          receipt_status: string
          status: string
          user_id: string
        }
        Insert: {
          created_time?: string
          id: string
          notification_id: string
          receipt_error?: string | null
          receipt_status: string
          status: string
          user_id: string
        }
        Update: {
          created_time?: string
          id?: string
          notification_id?: string
          receipt_error?: string | null
          receipt_status?: string
          status?: string
          user_id?: string
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
      redemption_status: {
        Row: {
          created_time: string
          id: number
          session_id: string
          status: string
          transaction_id: string
          txn_id: string
          user_id: string
        }
        Insert: {
          created_time?: string
          id?: never
          session_id: string
          status: string
          transaction_id: string
          txn_id: string
          user_id: string
        }
        Update: {
          created_time?: string
          id?: never
          session_id?: string
          status?: string
          transaction_id?: string
          txn_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'redemption_status_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'mv_user_achievement_stats'
            referencedColumns: ['user_id']
          },
          {
            foreignKeyName: 'redemption_status_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'user_referrals_profit'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'redemption_status_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          }
        ]
      }
      reports: {
        Row: {
          content_id: string
          content_owner_id: string
          content_type: string
          created_time: string | null
          description: string | null
          dismissed_by_user_id: string | null
          id: string
          parent_id: string | null
          parent_type: string | null
          user_id: string
        }
        Insert: {
          content_id: string
          content_owner_id: string
          content_type: string
          created_time?: string | null
          description?: string | null
          dismissed_by_user_id?: string | null
          id?: string
          parent_id?: string | null
          parent_type?: string | null
          user_id: string
        }
        Update: {
          content_id?: string
          content_owner_id?: string
          content_type?: string
          created_time?: string | null
          description?: string | null
          dismissed_by_user_id?: string | null
          id?: string
          parent_id?: string | null
          parent_type?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'reports_content_owner_id_fkey'
            columns: ['content_owner_id']
            isOneToOne: false
            referencedRelation: 'mv_user_achievement_stats'
            referencedColumns: ['user_id']
          },
          {
            foreignKeyName: 'reports_content_owner_id_fkey'
            columns: ['content_owner_id']
            isOneToOne: false
            referencedRelation: 'user_referrals_profit'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'reports_content_owner_id_fkey'
            columns: ['content_owner_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'reports_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'mv_user_achievement_stats'
            referencedColumns: ['user_id']
          },
          {
            foreignKeyName: 'reports_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'user_referrals_profit'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'reports_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          }
        ]
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
      scheduler_info: {
        Row: {
          created_time: string
          id: number
          job_name: string
          last_end_time: string | null
          last_start_time: string | null
        }
        Insert: {
          created_time?: string
          id?: never
          job_name: string
          last_end_time?: string | null
          last_start_time?: string | null
        }
        Update: {
          created_time?: string
          id?: never
          job_name?: string
          last_end_time?: string | null
          last_start_time?: string | null
        }
        Relationships: []
      }
      sent_emails: {
        Row: {
          created_time: string
          email_template_id: string
          id: number
          user_id: string
        }
        Insert: {
          created_time?: string
          email_template_id: string
          id?: never
          user_id: string
        }
        Update: {
          created_time?: string
          email_template_id?: string
          id?: never
          user_id?: string
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
      system_trading_status: {
        Row: {
          status: boolean
          token: string
        }
        Insert: {
          status: boolean
          token: string
        }
        Update: {
          status?: boolean
          token?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          archived: boolean
          assignee_id: string
          category_id: number
          completed: boolean
          created_time: string
          creator_id: string
          id: number
          priority: number
          text: string
        }
        Insert: {
          archived?: boolean
          assignee_id: string
          category_id: number
          completed?: boolean
          created_time?: string
          creator_id: string
          id?: never
          priority?: number
          text: string
        }
        Update: {
          archived?: boolean
          assignee_id?: string
          category_id?: number
          completed?: boolean
          created_time?: string
          creator_id?: string
          id?: never
          priority?: number
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: 'tasks_assignee_id_fkey'
            columns: ['assignee_id']
            isOneToOne: false
            referencedRelation: 'mv_user_achievement_stats'
            referencedColumns: ['user_id']
          },
          {
            foreignKeyName: 'tasks_assignee_id_fkey'
            columns: ['assignee_id']
            isOneToOne: false
            referencedRelation: 'user_referrals_profit'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'tasks_assignee_id_fkey'
            columns: ['assignee_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'tasks_creator_id_fkey'
            columns: ['creator_id']
            isOneToOne: false
            referencedRelation: 'mv_user_achievement_stats'
            referencedColumns: ['user_id']
          },
          {
            foreignKeyName: 'tasks_creator_id_fkey'
            columns: ['creator_id']
            isOneToOne: false
            referencedRelation: 'user_referrals_profit'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'tasks_creator_id_fkey'
            columns: ['creator_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          }
        ]
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
      tv_schedule: {
        Row: {
          contract_id: string
          creator_id: string
          end_time: string
          id: number
          is_featured: boolean | null
          schedule_created_time: string | null
          source: string
          start_time: string
          stream_id: string
          title: string
        }
        Insert: {
          contract_id: string
          creator_id: string
          end_time: string
          id?: number
          is_featured?: boolean | null
          schedule_created_time?: string | null
          source: string
          start_time: string
          stream_id: string
          title: string
        }
        Update: {
          contract_id?: string
          creator_id?: string
          end_time?: string
          id?: number
          is_featured?: boolean | null
          schedule_created_time?: string | null
          source?: string
          start_time?: string
          stream_id?: string
          title?: string
        }
        Relationships: []
      }
      txn_summary_stats: {
        Row: {
          category: string
          created_time: string
          end_time: string
          from_type: string
          id: number
          quest_type: string | null
          start_time: string
          to_type: string
          token: string
          total_amount: number
        }
        Insert: {
          category: string
          created_time?: string
          end_time: string
          from_type: string
          id?: never
          quest_type?: string | null
          start_time: string
          to_type: string
          token: string
          total_amount: number
        }
        Update: {
          category?: string
          created_time?: string
          end_time?: string
          from_type?: string
          id?: never
          quest_type?: string | null
          start_time?: string
          to_type?: string
          token?: string
          total_amount?: number
        }
        Relationships: []
      }
      txns: {
        Row: {
          amount: number
          category: string
          created_time: string
          data: Json
          from_id: string
          from_type: string
          id: string
          to_id: string
          to_type: string
          token: string
        }
        Insert: {
          amount: number
          category: string
          created_time?: string
          data: Json
          from_id: string
          from_type: string
          id?: string
          to_id: string
          to_type: string
          token?: string
        }
        Update: {
          amount?: number
          category?: string
          created_time?: string
          data?: Json
          from_id?: string
          from_type?: string
          id?: string
          to_id?: string
          to_type?: string
          token?: string
        }
        Relationships: []
      }
      user_comment_view_events: {
        Row: {
          comment_id: string
          contract_id: string
          created_time: string
          id: number
          user_id: string
        }
        Insert: {
          comment_id: string
          contract_id: string
          created_time?: string
          id?: never
          user_id: string
        }
        Update: {
          comment_id?: string
          contract_id?: string
          created_time?: string
          id?: never
          user_id?: string
        }
        Relationships: []
      }
      user_contract_interactions: {
        Row: {
          bet_group_id: string | null
          bet_id: string | null
          comment_id: string | null
          contract_id: string
          created_time: string
          feed_reasons: string[] | null
          feed_type: string | null
          id: number
          name: string
          user_id: string
        }
        Insert: {
          bet_group_id?: string | null
          bet_id?: string | null
          comment_id?: string | null
          contract_id: string
          created_time?: string
          feed_reasons?: string[] | null
          feed_type?: string | null
          id?: never
          name: string
          user_id: string
        }
        Update: {
          bet_group_id?: string | null
          bet_id?: string | null
          comment_id?: string | null
          contract_id?: string
          created_time?: string
          feed_reasons?: string[] | null
          feed_type?: string | null
          id?: never
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      user_contract_loans: {
        Row: {
          answer_id: string | null
          contract_id: string
          id: number
          last_loan_update_time: number
          loan_day_integral: number
          user_id: string
        }
        Insert: {
          answer_id?: string | null
          contract_id: string
          id?: never
          last_loan_update_time: number
          loan_day_integral?: number
          user_id: string
        }
        Update: {
          answer_id?: string | null
          contract_id?: string
          id?: never
          last_loan_update_time?: number
          loan_day_integral?: number
          user_id?: string
        }
        Relationships: []
      }
      user_contract_metrics: {
        Row: {
          answer_id: string | null
          contract_id: string
          data: Json
          has_no_shares: boolean | null
          has_shares: boolean | null
          has_yes_shares: boolean | null
          id: number
          loan: number
          profit: number | null
          total_shares_no: number | null
          total_shares_yes: number | null
          user_id: string
        }
        Insert: {
          answer_id?: string | null
          contract_id: string
          data: Json
          has_no_shares?: boolean | null
          has_shares?: boolean | null
          has_yes_shares?: boolean | null
          id?: never
          loan?: number
          profit?: number | null
          total_shares_no?: number | null
          total_shares_yes?: number | null
          user_id: string
        }
        Update: {
          answer_id?: string | null
          contract_id?: string
          data?: Json
          has_no_shares?: boolean | null
          has_shares?: boolean | null
          has_yes_shares?: boolean | null
          id?: never
          loan?: number
          profit?: number | null
          total_shares_no?: number | null
          total_shares_yes?: number | null
          user_id?: string
        }
        Relationships: []
      }
      user_contract_views: {
        Row: {
          card_views: number
          contract_id: string
          id: number
          last_card_view_ts: string | null
          last_page_view_ts: string | null
          last_promoted_view_ts: string | null
          page_views: number
          promoted_views: number
          user_id: string | null
        }
        Insert: {
          card_views?: number
          contract_id: string
          id?: never
          last_card_view_ts?: string | null
          last_page_view_ts?: string | null
          last_promoted_view_ts?: string | null
          page_views?: number
          promoted_views?: number
          user_id?: string | null
        }
        Update: {
          card_views?: number
          contract_id?: string
          id?: never
          last_card_view_ts?: string | null
          last_page_view_ts?: string | null
          last_promoted_view_ts?: string | null
          page_views?: number
          promoted_views?: number
          user_id?: string | null
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
          user_id: string
        }
        Insert: {
          contract_view_embedding?: string | null
          created_at?: string
          disinterest_embedding?: string | null
          interest_embedding: string
          user_id: string
        }
        Update: {
          contract_view_embedding?: string | null
          created_at?: string
          disinterest_embedding?: string | null
          interest_embedding?: string
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
          ts: string
          user_id: string | null
        }
        Insert: {
          ad_id?: string | null
          comment_id?: string | null
          contract_id?: string | null
          data: Json
          id?: never
          name: string
          ts?: string
          user_id?: string | null
        }
        Update: {
          ad_id?: string | null
          comment_id?: string | null
          contract_id?: string | null
          data?: Json
          id?: never
          name?: string
          ts?: string
          user_id?: string | null
        }
        Relationships: []
      }
      user_follows: {
        Row: {
          created_time: string
          follow_id: string
          user_id: string
        }
        Insert: {
          created_time?: string
          follow_id: string
          user_id: string
        }
        Update: {
          created_time?: string
          follow_id?: string
          user_id?: string
        }
        Relationships: []
      }
      user_monitor_status: {
        Row: {
          created_time: string | null
          data: Json
          fraud_confidence_score: number | null
          id: number
          identity_confidence_score: number | null
          reason_codes: string[] | null
          user_id: string
        }
        Insert: {
          created_time?: string | null
          data: Json
          fraud_confidence_score?: number | null
          id?: never
          identity_confidence_score?: number | null
          reason_codes?: string[] | null
          user_id: string
        }
        Update: {
          created_time?: string | null
          data?: Json
          fraud_confidence_score?: number | null
          id?: never
          identity_confidence_score?: number | null
          reason_codes?: string[] | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'user_monitor_status_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'mv_user_achievement_stats'
            referencedColumns: ['user_id']
          },
          {
            foreignKeyName: 'user_monitor_status_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'user_referrals_profit'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'user_monitor_status_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          }
        ]
      }
      user_notifications: {
        Row: {
          data: Json
          notification_id: string
          user_id: string
        }
        Insert: {
          data: Json
          notification_id: string
          user_id: string
        }
        Update: {
          data?: Json
          notification_id?: string
          user_id?: string
        }
        Relationships: []
      }
      user_portfolio_history: {
        Row: {
          balance: number | null
          cash_balance: number
          cash_investment_value: number
          id: number
          investment_value: number | null
          loan_total: number | null
          profit: number | null
          spice_balance: number
          total_cash_deposits: number
          total_deposits: number | null
          ts: string | null
          user_id: string
        }
        Insert: {
          balance?: number | null
          cash_balance?: number
          cash_investment_value?: number
          id?: never
          investment_value?: number | null
          loan_total?: number | null
          profit?: number | null
          spice_balance?: number
          total_cash_deposits?: number
          total_deposits?: number | null
          ts?: string | null
          user_id: string
        }
        Update: {
          balance?: number | null
          cash_balance?: number
          cash_investment_value?: number
          id?: never
          investment_value?: number | null
          loan_total?: number | null
          profit?: number | null
          spice_balance?: number
          total_cash_deposits?: number
          total_deposits?: number | null
          ts?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_portfolio_history_archive: {
        Row: {
          balance: number | null
          cash_balance: number
          cash_investment_value: number
          id: number
          investment_value: number | null
          loan_total: number | null
          profit: number | null
          spice_balance: number
          total_cash_deposits: number
          total_deposits: number | null
          ts: string | null
          user_id: string
        }
        Insert: {
          balance?: number | null
          cash_balance?: number
          cash_investment_value?: number
          id?: never
          investment_value?: number | null
          loan_total?: number | null
          profit?: number | null
          spice_balance?: number
          total_cash_deposits?: number
          total_deposits?: number | null
          ts?: string | null
          user_id: string
        }
        Update: {
          balance?: number | null
          cash_balance?: number
          cash_investment_value?: number
          id?: never
          investment_value?: number | null
          loan_total?: number | null
          profit?: number | null
          spice_balance?: number
          total_cash_deposits?: number
          total_deposits?: number | null
          ts?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_portfolio_history_latest: {
        Row: {
          balance: number
          cash_balance: number
          cash_investment_value: number
          investment_value: number
          last_calculated: string
          loan_total: number | null
          profit: number | null
          spice_balance: number
          total_cash_deposits: number
          total_deposits: number
          ts: string
          user_id: string
        }
        Insert: {
          balance: number
          cash_balance?: number
          cash_investment_value?: number
          investment_value: number
          last_calculated: string
          loan_total?: number | null
          profit?: number | null
          spice_balance?: number
          total_cash_deposits?: number
          total_deposits: number
          ts: string
          user_id: string
        }
        Update: {
          balance?: number
          cash_balance?: number
          cash_investment_value?: number
          investment_value?: number
          last_calculated?: string
          loan_total?: number | null
          profit?: number | null
          spice_balance?: number
          total_cash_deposits?: number
          total_deposits?: number
          ts?: string
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
          content_id: string
          content_owner_id: string
          content_type: string
          created_time: string
          reaction_id: string
          reaction_type: string
          user_id: string
        }
        Insert: {
          content_id: string
          content_owner_id: string
          content_type: string
          created_time?: string
          reaction_id?: string
          reaction_type?: string
          user_id: string
        }
        Update: {
          content_id?: string
          content_owner_id?: string
          content_type?: string
          created_time?: string
          reaction_id?: string
          reaction_type?: string
          user_id?: string
        }
        Relationships: []
      }
      user_seen_chats: {
        Row: {
          channel_id: string
          created_time: string
          id: number
          user_id: string
        }
        Insert: {
          channel_id: string
          created_time?: string
          id?: never
          user_id: string
        }
        Update: {
          channel_id?: string
          created_time?: string
          id?: never
          user_id?: string
        }
        Relationships: []
      }
      user_topic_interests: {
        Row: {
          created_time: string
          group_ids_to_activity: Json
          id: number
          user_id: string
        }
        Insert: {
          created_time?: string
          group_ids_to_activity: Json
          id?: never
          user_id: string
        }
        Update: {
          created_time?: string
          group_ids_to_activity?: Json
          id?: never
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
      user_view_events: {
        Row: {
          ad_id: string | null
          comment_id: string | null
          contract_id: string | null
          created_time: string
          id: number
          name: string
          user_id: string
        }
        Insert: {
          ad_id?: string | null
          comment_id?: string | null
          contract_id?: string | null
          created_time?: string
          id?: never
          name: string
          user_id: string
        }
        Update: {
          ad_id?: string | null
          comment_id?: string | null
          contract_id?: string | null
          created_time?: string
          id?: never
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          balance: number
          cash_balance: number
          created_time: string
          data: Json
          id: string
          name: string
          name_username_vector: unknown
          spice_balance: number
          total_cash_deposits: number
          total_deposits: number
          unban_time: string | null
          username: string
        }
        Insert: {
          balance?: number
          cash_balance?: number
          created_time?: string
          data: Json
          id?: string
          name: string
          name_username_vector?: unknown
          spice_balance?: number
          total_cash_deposits?: number
          total_deposits?: number
          unban_time?: string | null
          username: string
        }
        Update: {
          balance?: number
          cash_balance?: number
          created_time?: string
          data?: Json
          id?: string
          name?: string
          name_username_vector?: unknown
          spice_balance?: number
          total_cash_deposits?: number
          total_deposits?: number
          unban_time?: string | null
          username?: string
        }
        Relationships: []
      }
      votes: {
        Row: {
          contract_id: string
          created_time: string
          id: string
          rank: number | null
          user_id: string
        }
        Insert: {
          contract_id: string
          created_time?: string
          id: string
          rank?: number | null
          user_id: string
        }
        Update: {
          contract_id?: string
          created_time?: string
          id?: string
          rank?: number | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      final_pp_balances: {
        Row: {
          amount: number | null
          user_id: string | null
        }
        Insert: {
          amount?: number | null
          user_id?: string | null
        }
        Update: {
          amount?: number | null
          user_id?: string | null
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
      mv_user_achievement_stats: {
        Row: {
          comments_percentile: number | null
          comments_rank: number | null
          highest_balance_mana: number | null
          highest_balance_percentile: number | null
          highest_balance_rank: number | null
          highest_invested_mana: number | null
          highest_invested_percentile: number | null
          highest_invested_rank: number | null
          highest_loan_mana: number | null
          highest_loan_percentile: number | null
          highest_loan_rank: number | null
          highest_networth_mana: number | null
          highest_networth_percentile: number | null
          highest_networth_rank: number | null
          largest_league_season_earnings: number | null
          largest_league_season_earnings_percentile: number | null
          largest_league_season_earnings_rank: number | null
          largest_profitable_trade_percentile: number | null
          largest_profitable_trade_rank: number | null
          largest_profitable_trade_value: number | null
          largest_unprofitable_trade_percentile: number | null
          largest_unprofitable_trade_rank: number | null
          largest_unprofitable_trade_value: number | null
          liquidity_percentile: number | null
          liquidity_rank: number | null
          markets_created_percentile: number | null
          markets_created_rank: number | null
          number_of_comments: number | null
          profitable_markets_count: number | null
          profitable_markets_percentile: number | null
          profitable_markets_rank: number | null
          seasons_diamond_or_higher: number | null
          seasons_gold_or_higher: number | null
          seasons_masters: number | null
          seasons_masters_percentile: number | null
          seasons_masters_rank: number | null
          seasons_platinum_or_higher: number | null
          seasons_rank1_by_cohort: number | null
          seasons_rank1_by_cohort_percentile: number | null
          seasons_rank1_by_cohort_rank: number | null
          seasons_rank1_masters: number | null
          seasons_rank1_masters_percentile: number | null
          seasons_rank1_masters_rank: number | null
          total_liquidity_created_markets: number | null
          total_markets_created: number | null
          total_trades_count: number | null
          total_volume_mana: number | null
          trades_percentile: number | null
          trades_rank: number | null
          unprofitable_markets_count: number | null
          unprofitable_markets_percentile: number | null
          unprofitable_markets_rank: number | null
          user_id: string | null
          volume_percentile: number | null
          volume_rank: number | null
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
      user_referrals_profit: {
        Row: {
          id: string | null
          rank: number | null
          total_referrals: number | null
          total_referred_cash_profit: number | null
          total_referred_profit: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      add_creator_name_to_description: { Args: { data: Json }; Returns: string }
      calculate_earth_distance_km: {
        Args: { lat1: number; lat2: number; lon1: number; lon2: number }
        Returns: number
      }
      can_access_private_messages: {
        Args: { channel_id: number; user_id: string }
        Returns: boolean
      }
      close_contract_embeddings: {
        Args: {
          input_contract_id: string
          match_count: number
          similarity_threshold: number
        }
        Returns: {
          contract_id: string
          data: Json
          similarity: number
        }[]
      }
      count_recent_comments: { Args: { contract_id: string }; Returns: number }
      count_recent_comments_by_contract: {
        Args: never
        Returns: {
          comment_count: number
          contract_id: string
        }[]
      }
      creator_leaderboard: {
        Args: { limit_n: number }
        Returns: {
          avatar_url: string
          name: string
          total_traders: number
          user_id: string
          username: string
        }[]
      }
      creator_rank: { Args: { uid: string }; Returns: number }
      date_to_midnight_pt: { Args: { d: string }; Returns: string }
      extract_text_from_rich_text_json: {
        Args: { description: Json }
        Returns: string
      }
      firebase_uid: { Args: never; Returns: string }
      get_average_rating: { Args: { user_id: string }; Returns: number }
      get_compatibility_questions_with_answer_count: {
        Args: never
        Returns: Database['public']['CompositeTypes']['love_question_with_count_type'][]
        SetofOptions: {
          from: '*'
          to: 'love_question_with_count_type'
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_contract_voters: {
        Args: { this_contract_id: string }
        Returns: {
          data: Json
        }[]
      }
      get_contracts_in_group_slugs_1: {
        Args: {
          contract_ids: string[]
          ignore_slugs: string[]
          p_group_slugs: string[]
        }
        Returns: {
          data: Json
          importance_score: number
        }[]
      }
      get_cpmm_pool_prob: { Args: { p: number; pool: Json }; Returns: number }
      get_daily_claimed_boosts: {
        Args: { user_id: string }
        Returns: {
          total: number
        }[]
      }
      get_donations_by_charity: {
        Args: never
        Returns: {
          charity_id: string
          num_supporters: number
          total: number
        }[]
      }
      get_group_contracts: {
        Args: { this_group_id: string }
        Returns: {
          data: Json
        }[]
      }
      get_love_question_answers_and_lovers: {
        Args: { p_question_id: number }
        Returns: Database['public']['CompositeTypes']['other_lover_answers_type'][]
        SetofOptions: {
          from: '*'
          to: 'other_lover_answers_type'
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_non_empty_private_message_channel_ids:
        | {
            Args: {
              p_ignored_statuses: string[]
              p_limit: number
              p_user_id: string
            }
            Returns: {
              created_time: string
              id: number
              last_updated_time: string
              title: string | null
            }[]
            SetofOptions: {
              from: '*'
              to: 'private_user_message_channels'
              isOneToOne: false
              isSetofReturn: true
            }
          }
        | {
            Args: { p_limit?: number; p_user_id: string }
            Returns: {
              id: number
            }[]
          }
      get_noob_questions: {
        Args: never
        Returns: {
          boosted: boolean
          close_time: string | null
          conversion_score: number
          created_time: string | null
          creator_id: string | null
          daily_score: number
          data: Json
          deleted: boolean | null
          description_fts: unknown
          freshness_score: number
          group_slugs: string[] | null
          id: string
          importance_score: number
          is_spice_payout: boolean | null
          last_bet_time: string | null
          last_comment_time: string | null
          last_updated_time: string | null
          mechanism: string | null
          outcome_type: string | null
          popularity_score: number
          question: string | null
          question_fts: unknown
          question_nostop_fts: unknown
          resolution: string | null
          resolution_probability: number | null
          resolution_time: string | null
          slug: string | null
          token: string
          unique_bettor_count: number
          view_count: number
          visibility: string | null
        }[]
        SetofOptions: {
          from: '*'
          to: 'contracts'
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_option_voters: {
        Args: { this_contract_id: string; this_option_id: string }
        Returns: {
          data: Json
        }[]
      }
      get_rating: {
        Args: { user_id: string }
        Returns: {
          count: number
          rating: number
        }[]
      }
      get_recently_active_contracts_in_group_slugs_1: {
        Args: { ignore_slugs: string[]; max: number; p_group_slugs: string[] }
        Returns: {
          data: Json
          importance_score: number
        }[]
      }
      get_user_bet_contracts: {
        Args: { this_limit: number; this_user_id: string }
        Returns: {
          data: Json
        }[]
      }
      get_user_group_id_for_current_user: { Args: never; Returns: string }
      get_user_manalink_claims: {
        Args: { creator_id: string }
        Returns: {
          claimant_id: string
          manalink_id: string
          ts: number
        }[]
      }
      get_user_topic_interests_2: {
        Args: { p_user_id: string }
        Returns: {
          group_id: string
          score: number
        }[]
      }
      get_your_contract_ids:
        | {
            Args: { uid: string }
            Returns: {
              contract_id: string
            }[]
          }
        | {
            Args: { n: number; start: number; uid: string }
            Returns: {
              contract_id: string
            }[]
          }
      get_your_daily_changed_contracts: {
        Args: { n: number; start: number; uid: string }
        Returns: {
          daily_score: number
          data: Json
        }[]
      }
      get_your_recent_contracts: {
        Args: { n: number; start: number; uid: string }
        Returns: {
          data: Json
          max_ts: number
        }[]
      }
      has_moderator_or_above_role: {
        Args: { this_group_id: string; this_user_id: string }
        Returns: boolean
      }
      install_available_extensions_and_test: { Args: never; Returns: boolean }
      is_admin: { Args: { input_string: string }; Returns: boolean }
      is_group_member: {
        Args: { this_group_id: string; this_user_id: string }
        Returns: boolean
      }
      is_valid_contract: {
        Args: { ct: Database['public']['Tables']['contracts']['Row'] }
        Returns: boolean
      }
      jsonb_array_to_text_array: { Args: { _js: Json }; Returns: string[] }
      millis_interval: {
        Args: { end_millis: number; start_millis: number }
        Returns: unknown
      }
      millis_to_ts: { Args: { millis: number }; Returns: string }
      normalize_hyphens: { Args: { input_text: string }; Returns: string }
      profit_leaderboard: {
        Args: { limit_n: number }
        Returns: {
          avatar_url: string
          name: string
          profit: number
          user_id: string
          username: string
        }[]
      }
      profit_rank: {
        Args: { excluded_ids?: string[]; uid: string }
        Returns: number
      }
      random_alphanumeric: { Args: { length: number }; Returns: string }
      recently_liked_contract_counts: {
        Args: { since: number }
        Returns: {
          contract_id: string
          n: number
        }[]
      }
      sample_resolved_bets: {
        Args: { p: number; trader_threshold: number }
        Returns: {
          is_yes: boolean
          prob: number
        }[]
      }
      save_user_topics_blank: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      search_contract_embeddings: {
        Args: {
          match_count: number
          query_embedding: string
          similarity_threshold: number
        }
        Returns: {
          contract_id: string
          similarity: number
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { '': string }; Returns: string[] }
      test: { Args: never; Returns: undefined }
      to_jsonb: { Args: { '': Json }; Returns: Json }
      ts_to_millis:
        | {
            Args: { ts: string }
            Returns: {
              error: true
            } & 'Could not choose the best candidate function between: public.ts_to_millis(ts => timestamp), public.ts_to_millis(ts => timestamptz). Try renaming the parameters or the function itself in the database so function overloading can be resolved'
          }
        | {
            Args: { ts: string }
            Returns: {
              error: true
            } & 'Could not choose the best candidate function between: public.ts_to_millis(ts => timestamp), public.ts_to_millis(ts => timestamptz). Try renaming the parameters or the function itself in the database so function overloading can be resolved'
          }
    }
    Enums: {
      status_type: 'new' | 'under review' | 'resolved' | 'needs admin'
    }
    CompositeTypes: {
      love_question_with_count_type: {
        id: number | null
        creator_id: string | null
        created_time: string | null
        question: string | null
        importance_score: number | null
        answer_type: string | null
        multiple_choice_options: Json | null
        answer_count: number | null
      }
      other_lover_answers_type: {
        question_id: number | null
        created_time: string | null
        free_response: string | null
        multiple_choice: number | null
        integer: number | null
        age: number | null
        gender: string | null
        city: string | null
        data: Json | null
      }
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] &
      DefaultSchema['Views'])
  ? (DefaultSchema['Tables'] &
      DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
  ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
  ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
  ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
  ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  public: {
    Enums: {
      status_type: ['new', 'under review', 'resolved', 'needs admin'],
    },
  },
} as const
