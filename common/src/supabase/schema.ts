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
          contract_id: string | null
          created_time: string | null
          data: Json
          fs_updated_time: string
          id: string
          index: number | null
          pool_no: number | null
          pool_yes: number | null
          prob: number | null
          subsidy_pool: number | null
          text: string | null
          text_fts: unknown | null
          total_liquidity: number | null
          user_id: string | null
        }
        Insert: {
          contract_id?: string | null
          created_time?: string | null
          data: Json
          fs_updated_time: string
          id: string
          index?: number | null
          pool_no?: number | null
          pool_yes?: number | null
          prob?: number | null
          subsidy_pool?: number | null
          text?: string | null
          text_fts?: unknown | null
          total_liquidity?: number | null
          user_id?: string | null
        }
        Update: {
          contract_id?: string | null
          created_time?: string | null
          data?: Json
          fs_updated_time?: string
          id?: string
          index?: number | null
          pool_no?: number | null
          pool_yes?: number | null
          prob?: number | null
          subsidy_pool?: number | null
          text?: string | null
          text_fts?: unknown | null
          total_liquidity?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      audit_events: {
        Row: {
          comment_id: string | null
          contract_id: string | null
          created_time: string
          data: Json | null
          id: number
          name: string
          user_id: string
        }
        Insert: {
          comment_id?: string | null
          contract_id?: string | null
          created_time?: string
          data?: Json | null
          id?: never
          name: string
          user_id: string
        }
        Update: {
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
          answer_id: string | null
          bet_id: string
          contract_id: string
          created_time: string
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
          user_id: string
          visibility: string | null
        }
        Insert: {
          amount?: number | null
          answer_id?: string | null
          bet_id: string
          contract_id: string
          created_time: string
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
          user_id: string
          visibility?: string | null
        }
        Update: {
          amount?: number | null
          answer_id?: string | null
          bet_id?: string
          contract_id?: string
          created_time?: string
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
          user_id?: string
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
          created_time: string
          data: Json
          fs_updated_time: string
          is_api: boolean
          user_id: string
          visibility: string | null
        }
        Insert: {
          comment_id: string
          contract_id: string
          created_time: string
          data: Json
          fs_updated_time: string
          is_api?: boolean
          user_id: string
          visibility?: string | null
        }
        Update: {
          comment_id?: string
          contract_id?: string
          created_time?: string
          data?: Json
          fs_updated_time?: string
          is_api?: boolean
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
          deleted: boolean | null
          description_fts: unknown | null
          fs_updated_time: string
          group_slugs: string[] | null
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
          deleted?: boolean | null
          description_fts?: unknown | null
          fs_updated_time: string
          group_slugs?: string[] | null
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
          deleted?: boolean | null
          description_fts?: unknown | null
          fs_updated_time?: string
          group_slugs?: string[] | null
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
            foreignKeyName: "dashboard_groups_dashboard_id_fkey"
            columns: ["dashboard_id"]
            isOneToOne: false
            referencedRelation: "dashboards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dashboard_groups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "group_role"
            referencedColumns: ["group_id"]
          },
          {
            foreignKeyName: "dashboard_groups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dashboard_groups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups_rbac"
            referencedColumns: ["id"]
          }
        ]
      }
      dashboards: {
        Row: {
          created_time: string
          creator_avatar_url: string
          creator_id: string
          creator_name: string
          creator_username: string
          description: Json | null
          id: string
          importance_score: number
          items: Json | null
          slug: string
          title: string
          title_fts: unknown | null
          visibility: string | null
        }
        Insert: {
          created_time?: string
          creator_avatar_url: string
          creator_id: string
          creator_name: string
          creator_username: string
          description?: Json | null
          id?: string
          importance_score?: number
          items?: Json | null
          slug: string
          title: string
          title_fts?: unknown | null
          visibility?: string | null
        }
        Update: {
          created_time?: string
          creator_avatar_url?: string
          creator_id?: string
          creator_name?: string
          creator_username?: string
          description?: Json | null
          id?: string
          importance_score?: number
          items?: Json | null
          slug?: string
          title?: string
          title_fts?: unknown | null
          visibility?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dashboards_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "user_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dashboards_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "user_referrals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dashboards_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "user_referrals_profit"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dashboards_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
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
            foreignKeyName: "group_invites_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "group_role"
            referencedColumns: ["group_id"]
          },
          {
            foreignKeyName: "group_invites_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_invites_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups_rbac"
            referencedColumns: ["id"]
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
          mana_earned: number
          mana_earned_breakdown: Json
          "Primary Key": string
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
          "Primary Key"?: string
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
          "Primary Key"?: string
          rank_snapshot?: number | null
          season?: number
          user_id?: string
        }
        Relationships: []
      }
        love_compatibility_answers: {
        Row: {
          created_time: string
          creator_id: string
          explanation: string | null
          id: number
          importance: number | null
          multiple_choice: number | null
          pref_choices: number[] | null
          question_id: number
        }
        Insert: {
          created_time?: string
          creator_id: string
          explanation?: string | null
          id?: never
          importance?: number | null
          multiple_choice?: number | null
          pref_choices?: number[] | null
          question_id: number
        }
        Update: {
          created_time?: string
          creator_id?: string
          explanation?: string | null
          id?: never
          importance?: number | null
          multiple_choice?: number | null
          pref_choices?: number[] | null
          question_id?: number
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
          amount: number | null
          created_time: string | null
          creator_id: string | null
          data: Json
          expires_time: string | null
          fs_updated_time: string
          id: string
          max_uses: number | null
          message: string | null
        }
        Insert: {
          amount?: number | null
          created_time?: string | null
          creator_id?: string | null
          data: Json
          expires_time?: string | null
          fs_updated_time: string
          id: string
          max_uses?: number | null
          message?: string | null
        }
        Update: {
          amount?: number | null
          created_time?: string | null
          creator_id?: string | null
          data?: Json
          expires_time?: string | null
          fs_updated_time?: string
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
            foreignKeyName: "market_ads_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_ads_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "contracts_rbac"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_ads_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "contracts_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_ads_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "listed_open_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_ads_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "public_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_ads_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "public_open_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_ads_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "trending_contracts"
            referencedColumns: ["id"]
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
      reports: {
        Row: {
          content_id: string
          content_owner_id: string
          content_type: string
          created_time: string | null
          description: string | null
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
          id?: string
          parent_id?: string | null
          parent_type?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_content_owner_id_fkey"
            columns: ["content_owner_id"]
            isOneToOne: false
            referencedRelation: "user_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_content_owner_id_fkey"
            columns: ["content_owner_id"]
            isOneToOne: false
            referencedRelation: "user_referrals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_content_owner_id_fkey"
            columns: ["content_owner_id"]
            isOneToOne: false
            referencedRelation: "user_referrals_profit"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_content_owner_id_fkey"
            columns: ["content_owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_referrals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_referrals_profit"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
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
          answer_id: string | null
          contract_id: string
          data: Json
          fs_updated_time: string | null
          has_no_shares: boolean | null
          has_shares: boolean | null
          has_yes_shares: boolean | null
          id: number
          profit: number | null
          total_shares_no: number | null
          total_shares_yes: number | null
          user_id: string
        }
        Insert: {
          answer_id?: string | null
          contract_id: string
          data: Json
          fs_updated_time?: string | null
          has_no_shares?: boolean | null
          has_shares?: boolean | null
          has_yes_shares?: boolean | null
          id?: never
          profit?: number | null
          total_shares_no?: number | null
          total_shares_yes?: number | null
          user_id: string
        }
        Update: {
          answer_id?: string | null
          contract_id?: string
          data?: Json
          fs_updated_time?: string | null
          has_no_shares?: boolean | null
          has_shares?: boolean | null
          has_yes_shares?: boolean | null
          id?: never
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
          answer_ids: string[] | null
          bet_data: Json | null
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
          reasons: string[] | null
          relevance_score: number | null
          seen_duration: number | null
          seen_time: string | null
          user_id: string
        }
        Insert: {
          answer_ids?: string[] | null
          bet_data?: Json | null
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
          reasons?: string[] | null
          relevance_score?: number | null
          seen_duration?: number | null
          seen_time?: string | null
          user_id: string
        }
        Update: {
          answer_ids?: string[] | null
          bet_data?: Json | null
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
          reasons?: string[] | null
          relevance_score?: number | null
          seen_duration?: number | null
          seen_time?: string | null
          user_id?: string
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
          id: number
          investment_value: number | null
          loan_total: number | null
          total_deposits: number | null
          ts: string | null
          user_id: string
        }
        Insert: {
          balance?: number | null
          id?: never
          investment_value?: number | null
          loan_total?: number | null
          total_deposits?: number | null
          ts?: string | null
          user_id: string
        }
        Update: {
          balance?: number | null
          id?: never
          investment_value?: number | null
          loan_total?: number | null
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
          created_time: string | null
          data: Json
          fs_updated_time: string
          id: string
          name: string
          name_username_vector: unknown | null
          username: string
        }
        Insert: {
          created_time?: string | null
          data: Json
          fs_updated_time: string
          id: string
          name: string
          name_username_vector?: unknown | null
          username: string
        }
        Update: {
          created_time?: string | null
          data?: Json
          fs_updated_time?: string
          id?: string
          name?: string
          name_username_vector?: unknown | null
          username?: string
        }
        Relationships: []
      }
      votes: {
        Row: {
          contract_id: string
          created_time: string
          id: string
          user_id: string
        }
        Insert: {
          contract_id: string
          created_time?: string
          id: string
          user_id: string
        }
        Update: {
          contract_id?: string
          created_time?: string
          id?: string
          user_id?: string
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
          description_fts: unknown | null
          fs_updated_time: string | null
          id: string | null
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
          data?: Json | null
          description_fts?: unknown | null
          fs_updated_time?: string | null
          id?: string | null
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
          data?: Json | null
          description_fts?: unknown | null
          fs_updated_time?: string | null
          id?: string | null
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
          deleted: boolean | null
          description_fts: unknown | null
          fs_updated_time: string | null
          group_slugs: string[] | null
          id: string | null
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
          data?: Json | null
          deleted?: boolean | null
          description_fts?: unknown | null
          fs_updated_time?: string | null
          group_slugs?: string[] | null
          id?: string | null
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
          data?: Json | null
          deleted?: boolean | null
          description_fts?: unknown | null
          fs_updated_time?: string | null
          group_slugs?: string[] | null
          id?: string | null
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
      public_open_contracts: {
        Row: {
          close_time: string | null
          created_time: string | null
          creator_id: string | null
          data: Json | null
          description_fts: unknown | null
          fs_updated_time: string | null
          id: string | null
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
          data?: Json | null
          description_fts?: unknown | null
          fs_updated_time?: string | null
          id?: string | null
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
          data?: Json | null
          description_fts?: unknown | null
          fs_updated_time?: string | null
          id?: string | null
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
      can_access_private_messages: {
        Args: {
          channel_id: number
          user_id: string
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
              is_admin?: boolean
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
          deleted: boolean | null
          description_fts: unknown | null
          fs_updated_time: string
          group_slugs: string[] | null
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
      get_average_rating: {
        Args: {
          user_id: string
        }
        Returns: number
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
      get_contract_voters: {
        Args: {
          this_contract_id: string
        }
        Returns: {
          data: Json
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
      get_contracts_in_group_slugs: {
        Args: {
          contract_ids: string[]
          group_slugs: string[]
          ignore_slugs: string[]
        }
        Returns: {
          data: Json
          importance_score: number
        }[]
      }
      get_contracts_in_group_slugs_1: {
        Args: {
          contract_ids: string[]
          p_group_slugs: string[]
          ignore_slugs: string[]
        }
        Returns: {
          data: Json
          importance_score: number
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
              c: unknown
            }
            Returns: number
          }
        | {
            Args: {
              data: Json
            }
            Returns: number
          }
      get_daily_claimed_boosts: {
        Args: {
          user_id: string
        }
        Returns: {
          total: number
        }[]
      }
      get_document_table_spec: {
        Args: {
          table_id: string
        }
        Returns: Database["public"]["CompositeTypes"]["table_spec"]
      }
      get_donations_by_charity: {
        Args: Record<PropertyKey, never>
        Returns: {
          charity_id: string
          total: number
        }[]
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
      get_groups_and_scores_from_user_seen_markets: {
        Args: {
          uid: string
        }
        Returns: Database["public"]["CompositeTypes"]["group_with_score_and_bet_flag"][]
      }
      get_groups_from_user_seen_markets: {
        Args: {
          uid: string
        }
        Returns: Database["public"]["CompositeTypes"]["group_with_bet_flag"][]
      }
      get_last_week_long_link: {
        Args: {
          this_group_id: string
        }
        Returns: string
      }
      get_non_empty_private_message_channel_ids:
        | {
            Args: {
              p_user_id: string
              p_ignored_statuses: string[]
              p_limit: number
            }
            Returns: {
              created_time: string
              id: number
              last_updated_time: string
              title: string | null
            }[]
          }
        | {
            Args: {
              p_user_id: string
              p_limit?: number
            }
            Returns: {
              id: number
            }[]
          }
      get_noob_questions: {
        Args: Record<PropertyKey, never>
        Returns: {
          close_time: string | null
          created_time: string | null
          creator_id: string | null
          data: Json
          deleted: boolean | null
          description_fts: unknown | null
          fs_updated_time: string
          group_slugs: string[] | null
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
      get_option_voters: {
        Args: {
          this_contract_id: string
          this_option_id: string
        }
        Returns: {
          data: Json
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
      get_rating_info: {
        Args: {
          p_vendor_id: string
        }
        Returns: {
          avg_rating: number
          count: number
        }[]
      }
      get_recently_active_contracts_in_group_slugs: {
        Args: {
          group_slugs: string[]
          ignore_slugs: string[]
          max: number
        }
        Returns: {
          data: Json
          importance_score: number
        }[]
      }
      get_recently_active_contracts_in_group_slugs_1: {
        Args: {
          p_group_slugs: string[]
          ignore_slugs: string[]
          max: number
        }
        Returns: {
          data: Json
          importance_score: number
        }[]
      }
      get_recently_active_contracts_in_group_slugs_2: {
        Args: {
          group_slugs: string[]
          ignore_slugs: string[]
          max: number
        }
        Returns: {
          data: Json
          importance_score: number
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
      get_sigmoid_rating: {
        Args: {
          user_id: string
        }
        Returns: {
          count: number
          rating: number
        }[]
      }
      get_time: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      get_top_market_ads: {
        Args: {
          uid: string
          distance_threshold: number
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
      get_user_manalink_claims: {
        Args: {
          creator_id: string
        }
        Returns: {
          manalink_id: string
          claimant_id: string
          ts: number
        }[]
      }
      get_your_contract_ids:
        | {
            Args: {
              uid: string
            }
            Returns: {
              contract_id: string
            }[]
          }
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
      is_valid_contract_2: {
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
      save_user_topic_2: {
        Args: {
          p_user_id: string
          p_topics: string[]
        }
        Returns: undefined
      }
      save_user_topics: {
        Args: {
          p_user_id: string
          p_topics: string[]
        }
        Returns: undefined
      }
      save_user_topics_2: {
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
      save_user_topics_blank_2: {
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
      search_contracts_by_group_slugs_1: {
        Args: {
          p_group_slugs: string[]
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
      search_contracts_by_group_slugs_for_creator_1: {
        Args: {
          creator_id: string
          p_group_slugs: string[]
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
          created_time: string | null
          data: Json
          fs_updated_time: string
          id: string
          name: string
          name_username_vector: unknown | null
          username: string
        }[]
      }
      search_users_2: {
        Args: {
          query: string
          count: number
        }
        Returns: {
          created_time: string | null
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
          "": number[]
        }
        Returns: string
      }
      vector_dims: {
        Args: {
          "": string
        }
        Returns: number
      }
      vector_norm: {
        Args: {
          "": string
        }
        Returns: number
      }
      vector_out: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      vector_send: {
        Args: {
          "": string
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
      group_with_bet_flag: {
        id: string
        data: Json
        has_bet: boolean
      }
      group_with_score_and_bet_flag: {
        id: string
        data: Json
        importance_score: number
        has_bet: boolean
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