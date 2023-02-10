import { PostgrestResponse, PostgrestSingleResponse, SupabaseClient as SupabaseClientGeneric, SupabaseClientOptions as SupabaseClientOptionsGeneric } from '@supabase/supabase-js';
import { Database } from './schema';
import { User, PortfolioMetrics } from '../user';
import { Contract } from '../contract';
import { Bet } from '../bet';
import { ContractMetrics } from '../calculate-metrics';
import { Group, GroupMemberDoc, GroupContractDoc } from '../group';
import { UserEvent } from '../events';
export type Schema = Database['public'];
export type Tables = Schema['Tables'];
export type TableName = keyof Tables;
export type SupabaseClient = SupabaseClientGeneric<Database, 'public', Schema>;
export declare function getInstanceHostname(instanceId: string): string;
export declare function createClient(instanceId: string, key: string, opts?: SupabaseClientOptionsGeneric<'public'>): SupabaseClient;
export type QueryResponse<T> = PostgrestResponse<T> | PostgrestSingleResponse<T>;
export type QueryMultiSuccessResponse<T> = {
    data: T[];
    count: number;
};
export type QuerySingleSuccessResponse<T> = {
    data: T;
    count: number;
};
export declare function run<T>(q: PromiseLike<PostgrestResponse<T>>): Promise<QueryMultiSuccessResponse<T>>;
export declare function run<T>(q: PromiseLike<PostgrestSingleResponse<T>>): Promise<QuerySingleSuccessResponse<T>>;
type TableJsonTypes = {
    users: User;
    user_events: UserEvent;
    user_contract_metrics: ContractMetrics;
    user_portfolio_history: PortfolioMetrics;
    contracts: Contract;
    contract_bets: Bet;
    groups: Group;
    group_members: GroupMemberDoc;
    group_contracts: GroupContractDoc;
};
type DataFor<T extends TableName> = T extends keyof TableJsonTypes ? TableJsonTypes[T] : any;
export declare function selectJson<T extends TableName>(db: SupabaseClient, table: T): import("@supabase/postgrest-js").PostgrestFilterBuilder<{
    Tables: {
        contract_answers: {
            Row: {
                answer_id: string;
                contract_id: string;
                data: import("./schema").Json;
                fs_updated_time: string;
            };
            Insert: {
                answer_id: string;
                contract_id: string;
                data: import("./schema").Json;
                fs_updated_time: string;
            };
            Update: {
                answer_id?: string | undefined;
                contract_id?: string | undefined;
                data?: import("./schema").Json | undefined;
                fs_updated_time?: string | undefined;
            };
        };
        contract_bets: {
            Row: {
                bet_id: string;
                contract_id: string;
                data: import("./schema").Json;
                fs_updated_time: string;
            };
            Insert: {
                bet_id: string;
                contract_id: string;
                data: import("./schema").Json;
                fs_updated_time: string;
            };
            Update: {
                bet_id?: string | undefined;
                contract_id?: string | undefined;
                data?: import("./schema").Json | undefined;
                fs_updated_time?: string | undefined;
            };
        };
        contract_comments: {
            Row: {
                comment_id: string;
                contract_id: string;
                data: import("./schema").Json;
                fs_updated_time: string;
            };
            Insert: {
                comment_id: string;
                contract_id: string;
                data: import("./schema").Json;
                fs_updated_time: string;
            };
            Update: {
                comment_id?: string | undefined;
                contract_id?: string | undefined;
                data?: import("./schema").Json | undefined;
                fs_updated_time?: string | undefined;
            };
        };
        contract_follows: {
            Row: {
                contract_id: string;
                data: import("./schema").Json;
                follow_id: string;
                fs_updated_time: string;
            };
            Insert: {
                contract_id: string;
                data: import("./schema").Json;
                follow_id: string;
                fs_updated_time: string;
            };
            Update: {
                contract_id?: string | undefined;
                data?: import("./schema").Json | undefined;
                follow_id?: string | undefined;
                fs_updated_time?: string | undefined;
            };
        };
        contract_liquidity: {
            Row: {
                contract_id: string;
                data: import("./schema").Json;
                fs_updated_time: string;
                liquidity_id: string;
            };
            Insert: {
                contract_id: string;
                data: import("./schema").Json;
                fs_updated_time: string;
                liquidity_id: string;
            };
            Update: {
                contract_id?: string | undefined;
                data?: import("./schema").Json | undefined;
                fs_updated_time?: string | undefined;
                liquidity_id?: string | undefined;
            };
        };
        contract_recommendation_features: {
            Row: {
                contract_id: string;
                f0: number;
                f1: number;
                f2: number;
                f3: number;
                f4: number;
            };
            Insert: {
                contract_id: string;
                f0: number;
                f1: number;
                f2: number;
                f3: number;
                f4: number;
            };
            Update: {
                contract_id?: string | undefined;
                f0?: number | undefined;
                f1?: number | undefined;
                f2?: number | undefined;
                f3?: number | undefined;
                f4?: number | undefined;
            };
        };
        contracts: {
            Row: {
                data: import("./schema").Json;
                fs_updated_time: string;
                id: string;
            };
            Insert: {
                data: import("./schema").Json;
                fs_updated_time: string;
                id: string;
            };
            Update: {
                data?: import("./schema").Json | undefined;
                fs_updated_time?: string | undefined;
                id?: string | undefined;
            };
        };
        group_contracts: {
            Row: {
                contract_id: string;
                data: import("./schema").Json;
                fs_updated_time: string;
                group_id: string;
            };
            Insert: {
                contract_id: string;
                data: import("./schema").Json;
                fs_updated_time: string;
                group_id: string;
            };
            Update: {
                contract_id?: string | undefined;
                data?: import("./schema").Json | undefined;
                fs_updated_time?: string | undefined;
                group_id?: string | undefined;
            };
        };
        group_members: {
            Row: {
                data: import("./schema").Json;
                fs_updated_time: string;
                group_id: string;
                member_id: string;
            };
            Insert: {
                data: import("./schema").Json;
                fs_updated_time: string;
                group_id: string;
                member_id: string;
            };
            Update: {
                data?: import("./schema").Json | undefined;
                fs_updated_time?: string | undefined;
                group_id?: string | undefined;
                member_id?: string | undefined;
            };
        };
        groups: {
            Row: {
                data: import("./schema").Json;
                fs_updated_time: string;
                id: string;
            };
            Insert: {
                data: import("./schema").Json;
                fs_updated_time: string;
                id: string;
            };
            Update: {
                data?: import("./schema").Json | undefined;
                fs_updated_time?: string | undefined;
                id?: string | undefined;
            };
        };
        incoming_writes: {
            Row: {
                data: import("./schema").Json;
                doc_id: string;
                event_id: string | null;
                id: number;
                parent_id: string | null;
                table_id: string;
                ts: string;
                write_kind: string;
            };
            Insert: {
                data?: import("./schema").Json | undefined;
                doc_id: string;
                event_id?: string | null | undefined;
                id?: undefined;
                parent_id?: string | null | undefined;
                table_id: string;
                ts: string;
                write_kind: string;
            };
            Update: {
                data?: import("./schema").Json | undefined;
                doc_id?: string | undefined;
                event_id?: string | null | undefined;
                id?: undefined;
                parent_id?: string | null | undefined;
                table_id?: string | undefined;
                ts?: string | undefined;
                write_kind?: string | undefined;
            };
        };
        manalinks: {
            Row: {
                data: import("./schema").Json;
                fs_updated_time: string;
                id: string;
            };
            Insert: {
                data: import("./schema").Json;
                fs_updated_time: string;
                id: string;
            };
            Update: {
                data?: import("./schema").Json | undefined;
                fs_updated_time?: string | undefined;
                id?: string | undefined;
            };
        };
        posts: {
            Row: {
                data: import("./schema").Json;
                fs_updated_time: string;
                id: string;
            };
            Insert: {
                data: import("./schema").Json;
                fs_updated_time: string;
                id: string;
            };
            Update: {
                data?: import("./schema").Json | undefined;
                fs_updated_time?: string | undefined;
                id?: string | undefined;
            };
        };
        test: {
            Row: {
                data: import("./schema").Json;
                fs_updated_time: string;
                id: string;
            };
            Insert: {
                data: import("./schema").Json;
                fs_updated_time: string;
                id: string;
            };
            Update: {
                data?: import("./schema").Json | undefined;
                fs_updated_time?: string | undefined;
                id?: string | undefined;
            };
        };
        tombstones: {
            Row: {
                doc_id: string;
                fs_deleted_at: string;
                id: number;
                parent_id: string | null;
                table_id: string;
            };
            Insert: {
                doc_id: string;
                fs_deleted_at: string;
                id?: undefined;
                parent_id?: string | null | undefined;
                table_id: string;
            };
            Update: {
                doc_id?: string | undefined;
                fs_deleted_at?: string | undefined;
                id?: undefined;
                parent_id?: string | null | undefined;
                table_id?: string | undefined;
            };
        };
        txns: {
            Row: {
                data: import("./schema").Json;
                fs_updated_time: string;
                id: string;
            };
            Insert: {
                data: import("./schema").Json;
                fs_updated_time: string;
                id: string;
            };
            Update: {
                data?: import("./schema").Json | undefined;
                fs_updated_time?: string | undefined;
                id?: string | undefined;
            };
        };
        user_contract_metrics: {
            Row: {
                contract_id: string;
                data: import("./schema").Json;
                fs_updated_time: string;
                user_id: string;
            };
            Insert: {
                contract_id: string;
                data: import("./schema").Json;
                fs_updated_time: string;
                user_id: string;
            };
            Update: {
                contract_id?: string | undefined;
                data?: import("./schema").Json | undefined;
                fs_updated_time?: string | undefined;
                user_id?: string | undefined;
            };
        };
        user_events: {
            Row: {
                data: import("./schema").Json;
                event_id: string;
                fs_updated_time: string;
                user_id: string;
            };
            Insert: {
                data: import("./schema").Json;
                event_id: string;
                fs_updated_time: string;
                user_id: string;
            };
            Update: {
                data?: import("./schema").Json | undefined;
                event_id?: string | undefined;
                fs_updated_time?: string | undefined;
                user_id?: string | undefined;
            };
        };
        user_follows: {
            Row: {
                data: import("./schema").Json;
                follow_id: string;
                fs_updated_time: string;
                user_id: string;
            };
            Insert: {
                data: import("./schema").Json;
                follow_id: string;
                fs_updated_time: string;
                user_id: string;
            };
            Update: {
                data?: import("./schema").Json | undefined;
                follow_id?: string | undefined;
                fs_updated_time?: string | undefined;
                user_id?: string | undefined;
            };
        };
        user_portfolio_history: {
            Row: {
                data: import("./schema").Json;
                fs_updated_time: string;
                portfolio_id: string;
                user_id: string;
            };
            Insert: {
                data: import("./schema").Json;
                fs_updated_time: string;
                portfolio_id: string;
                user_id: string;
            };
            Update: {
                data?: import("./schema").Json | undefined;
                fs_updated_time?: string | undefined;
                portfolio_id?: string | undefined;
                user_id?: string | undefined;
            };
        };
        user_reactions: {
            Row: {
                data: import("./schema").Json;
                fs_updated_time: string;
                reaction_id: string;
                user_id: string;
            };
            Insert: {
                data: import("./schema").Json;
                fs_updated_time: string;
                reaction_id: string;
                user_id: string;
            };
            Update: {
                data?: import("./schema").Json | undefined;
                fs_updated_time?: string | undefined;
                reaction_id?: string | undefined;
                user_id?: string | undefined;
            };
        };
        user_recommendation_features: {
            Row: {
                f0: number;
                f1: number;
                f2: number;
                f3: number;
                f4: number;
                user_id: string;
            };
            Insert: {
                f0: number;
                f1: number;
                f2: number;
                f3: number;
                f4: number;
                user_id: string;
            };
            Update: {
                f0?: number | undefined;
                f1?: number | undefined;
                f2?: number | undefined;
                f3?: number | undefined;
                f4?: number | undefined;
                user_id?: string | undefined;
            };
        };
        user_seen_markets: {
            Row: {
                contract_id: string;
                data: import("./schema").Json;
                fs_updated_time: string;
                user_id: string;
            };
            Insert: {
                contract_id: string;
                data: import("./schema").Json;
                fs_updated_time: string;
                user_id: string;
            };
            Update: {
                contract_id?: string | undefined;
                data?: import("./schema").Json | undefined;
                fs_updated_time?: string | undefined;
                user_id?: string | undefined;
            };
        };
        users: {
            Row: {
                data: import("./schema").Json;
                fs_updated_time: string;
                id: string;
            };
            Insert: {
                data: import("./schema").Json;
                fs_updated_time: string;
                id: string;
            };
            Update: {
                data?: import("./schema").Json | undefined;
                fs_updated_time?: string | undefined;
                id?: string | undefined;
            };
        };
    };
    Views: {
        group_role: {
            Row: {
                avatar_url: import("./schema").Json;
                createdtime: import("./schema").Json;
                creator_id: import("./schema").Json;
                group_data: import("./schema").Json;
                group_id: string | null;
                group_name: import("./schema").Json;
                group_slug: import("./schema").Json;
                member_id: string | null;
                name: import("./schema").Json;
                role: string | null;
                username: import("./schema").Json;
            };
        };
    };
    Functions: {
        calculate_distance: {
            Args: {
                row1: unknown;
                row2: unknown;
            };
            Returns: number;
        };
        dot: {
            Args: {
                urf: unknown;
                crf: unknown;
            };
            Returns: number;
        };
        dot_bigint: {
            Args: {
                urf: unknown;
                crf: unknown;
            };
            Returns: number;
        };
        get_contract_metrics_with_contracts: {
            Args: {
                uid: string;
                count: number;
            };
            Returns: {
                contract_id: string;
                metrics: import("./schema").Json;
                contract: import("./schema").Json;
            }[];
        };
        get_document_table: {
            Args: {
                doc_kind: string;
            };
            Returns: string;
        };
        get_document_table_spec: {
            Args: {
                table_id: string;
            };
            Returns: unknown;
        };
        get_open_limit_bets_with_contracts: {
            Args: {
                uid: string;
                count: number;
            };
            Returns: {
                contract_id: string;
                bets: import("./schema").Json[];
                contract: import("./schema").Json;
            }[];
        };
        get_recommended_contract_scores: {
            Args: {
                uid: string;
            };
            Returns: {
                contract_id: string;
                rec_score: number;
            }[];
        };
        get_recommended_contracts: {
            Args: {
                uid: string;
                count: number;
            };
            Returns: import("./schema").Json[];
        };
        get_recommended_contracts_by_score: {
            Args: {
                uid: string;
            };
            Returns: {
                data: import("./schema").Json;
                score: number;
            }[];
        };
        get_related_contract_ids: {
            Args: {
                source_id: string;
            };
            Returns: {
                contract_id: string;
                distance: number;
            }[];
        };
        get_related_contracts: {
            Args: {
                cid: string;
                lim: number;
                start: number;
            };
            Returns: import("./schema").Json[];
        };
        get_time: {
            Args: Record<PropertyKey, never>;
            Returns: number;
        };
        gtrgm_compress: {
            Args: {
                "": unknown;
            };
            Returns: unknown;
        };
        gtrgm_decompress: {
            Args: {
                "": unknown;
            };
            Returns: unknown;
        };
        gtrgm_in: {
            Args: {
                "": unknown;
            };
            Returns: unknown;
        };
        gtrgm_options: {
            Args: {
                "": unknown;
            };
            Returns: undefined;
        };
        gtrgm_out: {
            Args: {
                "": unknown;
            };
            Returns: unknown;
        };
        install_available_extensions_and_test: {
            Args: Record<PropertyKey, never>;
            Returns: boolean;
        };
        is_valid_contract: {
            Args: {
                data: import("./schema").Json;
            };
            Returns: boolean;
        };
        recently_liked_contract_counts: {
            Args: {
                since: number;
            };
            Returns: {
                contract_id: string;
                n: number;
            }[];
        };
        replicate_writes_process_one: {
            Args: {
                r: unknown;
            };
            Returns: boolean;
        };
        replicate_writes_process_since: {
            Args: {
                since: string;
            };
            Returns: {
                id: number;
                succeeded: boolean;
            }[];
        };
        search_contracts_by_group_slugs: {
            Args: {
                group_slugs: string[];
                lim: number;
                start: number;
            };
            Returns: import("./schema").Json[];
        };
        search_contracts_by_group_slugs_for_creator: {
            Args: {
                creator_id: string;
                group_slugs: string[];
                lim: number;
                start: number;
            };
            Returns: import("./schema").Json[];
        };
        set_limit: {
            Args: {
                "": number;
            };
            Returns: number;
        };
        show_limit: {
            Args: Record<PropertyKey, never>;
            Returns: number;
        };
        show_trgm: {
            Args: {
                "": string;
            };
            Returns: string[];
        };
        to_jsonb: {
            Args: {
                "": import("./schema").Json;
            };
            Returns: import("./schema").Json;
        };
    };
    Enums: {};
}, {
    contract_answers: {
        Row: {
            answer_id: string;
            contract_id: string;
            data: import("./schema").Json;
            fs_updated_time: string;
        };
        Insert: {
            answer_id: string;
            contract_id: string;
            data: import("./schema").Json;
            fs_updated_time: string;
        };
        Update: {
            answer_id?: string | undefined;
            contract_id?: string | undefined;
            data?: import("./schema").Json | undefined;
            fs_updated_time?: string | undefined;
        };
    };
    contract_bets: {
        Row: {
            bet_id: string;
            contract_id: string;
            data: import("./schema").Json;
            fs_updated_time: string;
        };
        Insert: {
            bet_id: string;
            contract_id: string;
            data: import("./schema").Json;
            fs_updated_time: string;
        };
        Update: {
            bet_id?: string | undefined;
            contract_id?: string | undefined;
            data?: import("./schema").Json | undefined;
            fs_updated_time?: string | undefined;
        };
    };
    contract_comments: {
        Row: {
            comment_id: string;
            contract_id: string;
            data: import("./schema").Json;
            fs_updated_time: string;
        };
        Insert: {
            comment_id: string;
            contract_id: string;
            data: import("./schema").Json;
            fs_updated_time: string;
        };
        Update: {
            comment_id?: string | undefined;
            contract_id?: string | undefined;
            data?: import("./schema").Json | undefined;
            fs_updated_time?: string | undefined;
        };
    };
    contract_follows: {
        Row: {
            contract_id: string;
            data: import("./schema").Json;
            follow_id: string;
            fs_updated_time: string;
        };
        Insert: {
            contract_id: string;
            data: import("./schema").Json;
            follow_id: string;
            fs_updated_time: string;
        };
        Update: {
            contract_id?: string | undefined;
            data?: import("./schema").Json | undefined;
            follow_id?: string | undefined;
            fs_updated_time?: string | undefined;
        };
    };
    contract_liquidity: {
        Row: {
            contract_id: string;
            data: import("./schema").Json;
            fs_updated_time: string;
            liquidity_id: string;
        };
        Insert: {
            contract_id: string;
            data: import("./schema").Json;
            fs_updated_time: string;
            liquidity_id: string;
        };
        Update: {
            contract_id?: string | undefined;
            data?: import("./schema").Json | undefined;
            fs_updated_time?: string | undefined;
            liquidity_id?: string | undefined;
        };
    };
    contract_recommendation_features: {
        Row: {
            contract_id: string;
            f0: number;
            f1: number;
            f2: number;
            f3: number;
            f4: number;
        };
        Insert: {
            contract_id: string;
            f0: number;
            f1: number;
            f2: number;
            f3: number;
            f4: number;
        };
        Update: {
            contract_id?: string | undefined;
            f0?: number | undefined;
            f1?: number | undefined;
            f2?: number | undefined;
            f3?: number | undefined;
            f4?: number | undefined;
        };
    };
    contracts: {
        Row: {
            data: import("./schema").Json;
            fs_updated_time: string;
            id: string;
        };
        Insert: {
            data: import("./schema").Json;
            fs_updated_time: string;
            id: string;
        };
        Update: {
            data?: import("./schema").Json | undefined;
            fs_updated_time?: string | undefined;
            id?: string | undefined;
        };
    };
    group_contracts: {
        Row: {
            contract_id: string;
            data: import("./schema").Json;
            fs_updated_time: string;
            group_id: string;
        };
        Insert: {
            contract_id: string;
            data: import("./schema").Json;
            fs_updated_time: string;
            group_id: string;
        };
        Update: {
            contract_id?: string | undefined;
            data?: import("./schema").Json | undefined;
            fs_updated_time?: string | undefined;
            group_id?: string | undefined;
        };
    };
    group_members: {
        Row: {
            data: import("./schema").Json;
            fs_updated_time: string;
            group_id: string;
            member_id: string;
        };
        Insert: {
            data: import("./schema").Json;
            fs_updated_time: string;
            group_id: string;
            member_id: string;
        };
        Update: {
            data?: import("./schema").Json | undefined;
            fs_updated_time?: string | undefined;
            group_id?: string | undefined;
            member_id?: string | undefined;
        };
    };
    groups: {
        Row: {
            data: import("./schema").Json;
            fs_updated_time: string;
            id: string;
        };
        Insert: {
            data: import("./schema").Json;
            fs_updated_time: string;
            id: string;
        };
        Update: {
            data?: import("./schema").Json | undefined;
            fs_updated_time?: string | undefined;
            id?: string | undefined;
        };
    };
    incoming_writes: {
        Row: {
            data: import("./schema").Json;
            doc_id: string;
            event_id: string | null;
            id: number;
            parent_id: string | null;
            table_id: string;
            ts: string;
            write_kind: string;
        };
        Insert: {
            data?: import("./schema").Json | undefined;
            doc_id: string;
            event_id?: string | null | undefined;
            id?: undefined;
            parent_id?: string | null | undefined;
            table_id: string;
            ts: string;
            write_kind: string;
        };
        Update: {
            data?: import("./schema").Json | undefined;
            doc_id?: string | undefined;
            event_id?: string | null | undefined;
            id?: undefined;
            parent_id?: string | null | undefined;
            table_id?: string | undefined;
            ts?: string | undefined;
            write_kind?: string | undefined;
        };
    };
    manalinks: {
        Row: {
            data: import("./schema").Json;
            fs_updated_time: string;
            id: string;
        };
        Insert: {
            data: import("./schema").Json;
            fs_updated_time: string;
            id: string;
        };
        Update: {
            data?: import("./schema").Json | undefined;
            fs_updated_time?: string | undefined;
            id?: string | undefined;
        };
    };
    posts: {
        Row: {
            data: import("./schema").Json;
            fs_updated_time: string;
            id: string;
        };
        Insert: {
            data: import("./schema").Json;
            fs_updated_time: string;
            id: string;
        };
        Update: {
            data?: import("./schema").Json | undefined;
            fs_updated_time?: string | undefined;
            id?: string | undefined;
        };
    };
    test: {
        Row: {
            data: import("./schema").Json;
            fs_updated_time: string;
            id: string;
        };
        Insert: {
            data: import("./schema").Json;
            fs_updated_time: string;
            id: string;
        };
        Update: {
            data?: import("./schema").Json | undefined;
            fs_updated_time?: string | undefined;
            id?: string | undefined;
        };
    };
    tombstones: {
        Row: {
            doc_id: string;
            fs_deleted_at: string;
            id: number;
            parent_id: string | null;
            table_id: string;
        };
        Insert: {
            doc_id: string;
            fs_deleted_at: string;
            id?: undefined;
            parent_id?: string | null | undefined;
            table_id: string;
        };
        Update: {
            doc_id?: string | undefined;
            fs_deleted_at?: string | undefined;
            id?: undefined;
            parent_id?: string | null | undefined;
            table_id?: string | undefined;
        };
    };
    txns: {
        Row: {
            data: import("./schema").Json;
            fs_updated_time: string;
            id: string;
        };
        Insert: {
            data: import("./schema").Json;
            fs_updated_time: string;
            id: string;
        };
        Update: {
            data?: import("./schema").Json | undefined;
            fs_updated_time?: string | undefined;
            id?: string | undefined;
        };
    };
    user_contract_metrics: {
        Row: {
            contract_id: string;
            data: import("./schema").Json;
            fs_updated_time: string;
            user_id: string;
        };
        Insert: {
            contract_id: string;
            data: import("./schema").Json;
            fs_updated_time: string;
            user_id: string;
        };
        Update: {
            contract_id?: string | undefined;
            data?: import("./schema").Json | undefined;
            fs_updated_time?: string | undefined;
            user_id?: string | undefined;
        };
    };
    user_events: {
        Row: {
            data: import("./schema").Json;
            event_id: string;
            fs_updated_time: string;
            user_id: string;
        };
        Insert: {
            data: import("./schema").Json;
            event_id: string;
            fs_updated_time: string;
            user_id: string;
        };
        Update: {
            data?: import("./schema").Json | undefined;
            event_id?: string | undefined;
            fs_updated_time?: string | undefined;
            user_id?: string | undefined;
        };
    };
    user_follows: {
        Row: {
            data: import("./schema").Json;
            follow_id: string;
            fs_updated_time: string;
            user_id: string;
        };
        Insert: {
            data: import("./schema").Json;
            follow_id: string;
            fs_updated_time: string;
            user_id: string;
        };
        Update: {
            data?: import("./schema").Json | undefined;
            follow_id?: string | undefined;
            fs_updated_time?: string | undefined;
            user_id?: string | undefined;
        };
    };
    user_portfolio_history: {
        Row: {
            data: import("./schema").Json;
            fs_updated_time: string;
            portfolio_id: string;
            user_id: string;
        };
        Insert: {
            data: import("./schema").Json;
            fs_updated_time: string;
            portfolio_id: string;
            user_id: string;
        };
        Update: {
            data?: import("./schema").Json | undefined;
            fs_updated_time?: string | undefined;
            portfolio_id?: string | undefined;
            user_id?: string | undefined;
        };
    };
    user_reactions: {
        Row: {
            data: import("./schema").Json;
            fs_updated_time: string;
            reaction_id: string;
            user_id: string;
        };
        Insert: {
            data: import("./schema").Json;
            fs_updated_time: string;
            reaction_id: string;
            user_id: string;
        };
        Update: {
            data?: import("./schema").Json | undefined;
            fs_updated_time?: string | undefined;
            reaction_id?: string | undefined;
            user_id?: string | undefined;
        };
    };
    user_recommendation_features: {
        Row: {
            f0: number;
            f1: number;
            f2: number;
            f3: number;
            f4: number;
            user_id: string;
        };
        Insert: {
            f0: number;
            f1: number;
            f2: number;
            f3: number;
            f4: number;
            user_id: string;
        };
        Update: {
            f0?: number | undefined;
            f1?: number | undefined;
            f2?: number | undefined;
            f3?: number | undefined;
            f4?: number | undefined;
            user_id?: string | undefined;
        };
    };
    user_seen_markets: {
        Row: {
            contract_id: string;
            data: import("./schema").Json;
            fs_updated_time: string;
            user_id: string;
        };
        Insert: {
            contract_id: string;
            data: import("./schema").Json;
            fs_updated_time: string;
            user_id: string;
        };
        Update: {
            contract_id?: string | undefined;
            data?: import("./schema").Json | undefined;
            fs_updated_time?: string | undefined;
            user_id?: string | undefined;
        };
    };
    users: {
        Row: {
            data: import("./schema").Json;
            fs_updated_time: string;
            id: string;
        };
        Insert: {
            data: import("./schema").Json;
            fs_updated_time: string;
            id: string;
        };
        Update: {
            data?: import("./schema").Json | undefined;
            fs_updated_time?: string | undefined;
            id?: string | undefined;
        };
    };
}[T]["Row"], {
    data: DataFor<T>;
}>;
export declare function selectFrom<T extends TableName, TData extends DataFor<T>, TFields extends (string & keyof TData)[], TResult = Pick<TData, TFields[number]>>(db: SupabaseClient, table: T, ...fields: TFields): import("@supabase/postgrest-js").PostgrestFilterBuilder<{
    Tables: {
        contract_answers: {
            Row: {
                answer_id: string;
                contract_id: string;
                data: import("./schema").Json;
                fs_updated_time: string;
            };
            Insert: {
                answer_id: string;
                contract_id: string;
                data: import("./schema").Json;
                fs_updated_time: string;
            };
            Update: {
                answer_id?: string | undefined;
                contract_id?: string | undefined;
                data?: import("./schema").Json | undefined;
                fs_updated_time?: string | undefined;
            };
        };
        contract_bets: {
            Row: {
                bet_id: string;
                contract_id: string;
                data: import("./schema").Json;
                fs_updated_time: string;
            };
            Insert: {
                bet_id: string;
                contract_id: string;
                data: import("./schema").Json;
                fs_updated_time: string;
            };
            Update: {
                bet_id?: string | undefined;
                contract_id?: string | undefined;
                data?: import("./schema").Json | undefined;
                fs_updated_time?: string | undefined;
            };
        };
        contract_comments: {
            Row: {
                comment_id: string;
                contract_id: string;
                data: import("./schema").Json;
                fs_updated_time: string;
            };
            Insert: {
                comment_id: string;
                contract_id: string;
                data: import("./schema").Json;
                fs_updated_time: string;
            };
            Update: {
                comment_id?: string | undefined;
                contract_id?: string | undefined;
                data?: import("./schema").Json | undefined;
                fs_updated_time?: string | undefined;
            };
        };
        contract_follows: {
            Row: {
                contract_id: string;
                data: import("./schema").Json;
                follow_id: string;
                fs_updated_time: string;
            };
            Insert: {
                contract_id: string;
                data: import("./schema").Json;
                follow_id: string;
                fs_updated_time: string;
            };
            Update: {
                contract_id?: string | undefined;
                data?: import("./schema").Json | undefined;
                follow_id?: string | undefined;
                fs_updated_time?: string | undefined;
            };
        };
        contract_liquidity: {
            Row: {
                contract_id: string;
                data: import("./schema").Json;
                fs_updated_time: string;
                liquidity_id: string;
            };
            Insert: {
                contract_id: string;
                data: import("./schema").Json;
                fs_updated_time: string;
                liquidity_id: string;
            };
            Update: {
                contract_id?: string | undefined;
                data?: import("./schema").Json | undefined;
                fs_updated_time?: string | undefined;
                liquidity_id?: string | undefined;
            };
        };
        contract_recommendation_features: {
            Row: {
                contract_id: string;
                f0: number;
                f1: number;
                f2: number;
                f3: number;
                f4: number;
            };
            Insert: {
                contract_id: string;
                f0: number;
                f1: number;
                f2: number;
                f3: number;
                f4: number;
            };
            Update: {
                contract_id?: string | undefined;
                f0?: number | undefined;
                f1?: number | undefined;
                f2?: number | undefined;
                f3?: number | undefined;
                f4?: number | undefined;
            };
        };
        contracts: {
            Row: {
                data: import("./schema").Json;
                fs_updated_time: string;
                id: string;
            };
            Insert: {
                data: import("./schema").Json;
                fs_updated_time: string;
                id: string;
            };
            Update: {
                data?: import("./schema").Json | undefined;
                fs_updated_time?: string | undefined;
                id?: string | undefined;
            };
        };
        group_contracts: {
            Row: {
                contract_id: string;
                data: import("./schema").Json;
                fs_updated_time: string;
                group_id: string;
            };
            Insert: {
                contract_id: string;
                data: import("./schema").Json;
                fs_updated_time: string;
                group_id: string;
            };
            Update: {
                contract_id?: string | undefined;
                data?: import("./schema").Json | undefined;
                fs_updated_time?: string | undefined;
                group_id?: string | undefined;
            };
        };
        group_members: {
            Row: {
                data: import("./schema").Json;
                fs_updated_time: string;
                group_id: string;
                member_id: string;
            };
            Insert: {
                data: import("./schema").Json;
                fs_updated_time: string;
                group_id: string;
                member_id: string;
            };
            Update: {
                data?: import("./schema").Json | undefined;
                fs_updated_time?: string | undefined;
                group_id?: string | undefined;
                member_id?: string | undefined;
            };
        };
        groups: {
            Row: {
                data: import("./schema").Json;
                fs_updated_time: string;
                id: string;
            };
            Insert: {
                data: import("./schema").Json;
                fs_updated_time: string;
                id: string;
            };
            Update: {
                data?: import("./schema").Json | undefined;
                fs_updated_time?: string | undefined;
                id?: string | undefined;
            };
        };
        incoming_writes: {
            Row: {
                data: import("./schema").Json;
                doc_id: string;
                event_id: string | null;
                id: number;
                parent_id: string | null;
                table_id: string;
                ts: string;
                write_kind: string;
            };
            Insert: {
                data?: import("./schema").Json | undefined;
                doc_id: string;
                event_id?: string | null | undefined;
                id?: undefined;
                parent_id?: string | null | undefined;
                table_id: string;
                ts: string;
                write_kind: string;
            };
            Update: {
                data?: import("./schema").Json | undefined;
                doc_id?: string | undefined;
                event_id?: string | null | undefined;
                id?: undefined;
                parent_id?: string | null | undefined;
                table_id?: string | undefined;
                ts?: string | undefined;
                write_kind?: string | undefined;
            };
        };
        manalinks: {
            Row: {
                data: import("./schema").Json;
                fs_updated_time: string;
                id: string;
            };
            Insert: {
                data: import("./schema").Json;
                fs_updated_time: string;
                id: string;
            };
            Update: {
                data?: import("./schema").Json | undefined;
                fs_updated_time?: string | undefined;
                id?: string | undefined;
            };
        };
        posts: {
            Row: {
                data: import("./schema").Json;
                fs_updated_time: string;
                id: string;
            };
            Insert: {
                data: import("./schema").Json;
                fs_updated_time: string;
                id: string;
            };
            Update: {
                data?: import("./schema").Json | undefined;
                fs_updated_time?: string | undefined;
                id?: string | undefined;
            };
        };
        test: {
            Row: {
                data: import("./schema").Json;
                fs_updated_time: string;
                id: string;
            };
            Insert: {
                data: import("./schema").Json;
                fs_updated_time: string;
                id: string;
            };
            Update: {
                data?: import("./schema").Json | undefined;
                fs_updated_time?: string | undefined;
                id?: string | undefined;
            };
        };
        tombstones: {
            Row: {
                doc_id: string;
                fs_deleted_at: string;
                id: number;
                parent_id: string | null;
                table_id: string;
            };
            Insert: {
                doc_id: string;
                fs_deleted_at: string;
                id?: undefined;
                parent_id?: string | null | undefined;
                table_id: string;
            };
            Update: {
                doc_id?: string | undefined;
                fs_deleted_at?: string | undefined;
                id?: undefined;
                parent_id?: string | null | undefined;
                table_id?: string | undefined;
            };
        };
        txns: {
            Row: {
                data: import("./schema").Json;
                fs_updated_time: string;
                id: string;
            };
            Insert: {
                data: import("./schema").Json;
                fs_updated_time: string;
                id: string;
            };
            Update: {
                data?: import("./schema").Json | undefined;
                fs_updated_time?: string | undefined;
                id?: string | undefined;
            };
        };
        user_contract_metrics: {
            Row: {
                contract_id: string;
                data: import("./schema").Json;
                fs_updated_time: string;
                user_id: string;
            };
            Insert: {
                contract_id: string;
                data: import("./schema").Json;
                fs_updated_time: string;
                user_id: string;
            };
            Update: {
                contract_id?: string | undefined;
                data?: import("./schema").Json | undefined;
                fs_updated_time?: string | undefined;
                user_id?: string | undefined;
            };
        };
        user_events: {
            Row: {
                data: import("./schema").Json;
                event_id: string;
                fs_updated_time: string;
                user_id: string;
            };
            Insert: {
                data: import("./schema").Json;
                event_id: string;
                fs_updated_time: string;
                user_id: string;
            };
            Update: {
                data?: import("./schema").Json | undefined;
                event_id?: string | undefined;
                fs_updated_time?: string | undefined;
                user_id?: string | undefined;
            };
        };
        user_follows: {
            Row: {
                data: import("./schema").Json;
                follow_id: string;
                fs_updated_time: string;
                user_id: string;
            };
            Insert: {
                data: import("./schema").Json;
                follow_id: string;
                fs_updated_time: string;
                user_id: string;
            };
            Update: {
                data?: import("./schema").Json | undefined;
                follow_id?: string | undefined;
                fs_updated_time?: string | undefined;
                user_id?: string | undefined;
            };
        };
        user_portfolio_history: {
            Row: {
                data: import("./schema").Json;
                fs_updated_time: string;
                portfolio_id: string;
                user_id: string;
            };
            Insert: {
                data: import("./schema").Json;
                fs_updated_time: string;
                portfolio_id: string;
                user_id: string;
            };
            Update: {
                data?: import("./schema").Json | undefined;
                fs_updated_time?: string | undefined;
                portfolio_id?: string | undefined;
                user_id?: string | undefined;
            };
        };
        user_reactions: {
            Row: {
                data: import("./schema").Json;
                fs_updated_time: string;
                reaction_id: string;
                user_id: string;
            };
            Insert: {
                data: import("./schema").Json;
                fs_updated_time: string;
                reaction_id: string;
                user_id: string;
            };
            Update: {
                data?: import("./schema").Json | undefined;
                fs_updated_time?: string | undefined;
                reaction_id?: string | undefined;
                user_id?: string | undefined;
            };
        };
        user_recommendation_features: {
            Row: {
                f0: number;
                f1: number;
                f2: number;
                f3: number;
                f4: number;
                user_id: string;
            };
            Insert: {
                f0: number;
                f1: number;
                f2: number;
                f3: number;
                f4: number;
                user_id: string;
            };
            Update: {
                f0?: number | undefined;
                f1?: number | undefined;
                f2?: number | undefined;
                f3?: number | undefined;
                f4?: number | undefined;
                user_id?: string | undefined;
            };
        };
        user_seen_markets: {
            Row: {
                contract_id: string;
                data: import("./schema").Json;
                fs_updated_time: string;
                user_id: string;
            };
            Insert: {
                contract_id: string;
                data: import("./schema").Json;
                fs_updated_time: string;
                user_id: string;
            };
            Update: {
                contract_id?: string | undefined;
                data?: import("./schema").Json | undefined;
                fs_updated_time?: string | undefined;
                user_id?: string | undefined;
            };
        };
        users: {
            Row: {
                data: import("./schema").Json;
                fs_updated_time: string;
                id: string;
            };
            Insert: {
                data: import("./schema").Json;
                fs_updated_time: string;
                id: string;
            };
            Update: {
                data?: import("./schema").Json | undefined;
                fs_updated_time?: string | undefined;
                id?: string | undefined;
            };
        };
    };
    Views: {
        group_role: {
            Row: {
                avatar_url: import("./schema").Json;
                createdtime: import("./schema").Json;
                creator_id: import("./schema").Json;
                group_data: import("./schema").Json;
                group_id: string | null;
                group_name: import("./schema").Json;
                group_slug: import("./schema").Json;
                member_id: string | null;
                name: import("./schema").Json;
                role: string | null;
                username: import("./schema").Json;
            };
        };
    };
    Functions: {
        calculate_distance: {
            Args: {
                row1: unknown;
                row2: unknown;
            };
            Returns: number;
        };
        dot: {
            Args: {
                urf: unknown;
                crf: unknown;
            };
            Returns: number;
        };
        dot_bigint: {
            Args: {
                urf: unknown;
                crf: unknown;
            };
            Returns: number;
        };
        get_contract_metrics_with_contracts: {
            Args: {
                uid: string;
                count: number;
            };
            Returns: {
                contract_id: string;
                metrics: import("./schema").Json;
                contract: import("./schema").Json;
            }[];
        };
        get_document_table: {
            Args: {
                doc_kind: string;
            };
            Returns: string;
        };
        get_document_table_spec: {
            Args: {
                table_id: string;
            };
            Returns: unknown;
        };
        get_open_limit_bets_with_contracts: {
            Args: {
                uid: string;
                count: number;
            };
            Returns: {
                contract_id: string;
                bets: import("./schema").Json[];
                contract: import("./schema").Json;
            }[];
        };
        get_recommended_contract_scores: {
            Args: {
                uid: string;
            };
            Returns: {
                contract_id: string;
                rec_score: number;
            }[];
        };
        get_recommended_contracts: {
            Args: {
                uid: string;
                count: number;
            };
            Returns: import("./schema").Json[];
        };
        get_recommended_contracts_by_score: {
            Args: {
                uid: string;
            };
            Returns: {
                data: import("./schema").Json;
                score: number;
            }[];
        };
        get_related_contract_ids: {
            Args: {
                source_id: string;
            };
            Returns: {
                contract_id: string;
                distance: number;
            }[];
        };
        get_related_contracts: {
            Args: {
                cid: string;
                lim: number;
                start: number;
            };
            Returns: import("./schema").Json[];
        };
        get_time: {
            Args: Record<PropertyKey, never>;
            Returns: number;
        };
        gtrgm_compress: {
            Args: {
                "": unknown;
            };
            Returns: unknown;
        };
        gtrgm_decompress: {
            Args: {
                "": unknown;
            };
            Returns: unknown;
        };
        gtrgm_in: {
            Args: {
                "": unknown;
            };
            Returns: unknown;
        };
        gtrgm_options: {
            Args: {
                "": unknown;
            };
            Returns: undefined;
        };
        gtrgm_out: {
            Args: {
                "": unknown;
            };
            Returns: unknown;
        };
        install_available_extensions_and_test: {
            Args: Record<PropertyKey, never>;
            Returns: boolean;
        };
        is_valid_contract: {
            Args: {
                data: import("./schema").Json;
            };
            Returns: boolean;
        };
        recently_liked_contract_counts: {
            Args: {
                since: number;
            };
            Returns: {
                contract_id: string;
                n: number;
            }[];
        };
        replicate_writes_process_one: {
            Args: {
                r: unknown;
            };
            Returns: boolean;
        };
        replicate_writes_process_since: {
            Args: {
                since: string;
            };
            Returns: {
                id: number;
                succeeded: boolean;
            }[];
        };
        search_contracts_by_group_slugs: {
            Args: {
                group_slugs: string[];
                lim: number;
                start: number;
            };
            Returns: import("./schema").Json[];
        };
        search_contracts_by_group_slugs_for_creator: {
            Args: {
                creator_id: string;
                group_slugs: string[];
                lim: number;
                start: number;
            };
            Returns: import("./schema").Json[];
        };
        set_limit: {
            Args: {
                "": number;
            };
            Returns: number;
        };
        show_limit: {
            Args: Record<PropertyKey, never>;
            Returns: number;
        };
        show_trgm: {
            Args: {
                "": string;
            };
            Returns: string[];
        };
        to_jsonb: {
            Args: {
                "": import("./schema").Json;
            };
            Returns: import("./schema").Json;
        };
    };
    Enums: {};
}, {
    contract_answers: {
        Row: {
            answer_id: string;
            contract_id: string;
            data: import("./schema").Json;
            fs_updated_time: string;
        };
        Insert: {
            answer_id: string;
            contract_id: string;
            data: import("./schema").Json;
            fs_updated_time: string;
        };
        Update: {
            answer_id?: string | undefined;
            contract_id?: string | undefined;
            data?: import("./schema").Json | undefined;
            fs_updated_time?: string | undefined;
        };
    };
    contract_bets: {
        Row: {
            bet_id: string;
            contract_id: string;
            data: import("./schema").Json;
            fs_updated_time: string;
        };
        Insert: {
            bet_id: string;
            contract_id: string;
            data: import("./schema").Json;
            fs_updated_time: string;
        };
        Update: {
            bet_id?: string | undefined;
            contract_id?: string | undefined;
            data?: import("./schema").Json | undefined;
            fs_updated_time?: string | undefined;
        };
    };
    contract_comments: {
        Row: {
            comment_id: string;
            contract_id: string;
            data: import("./schema").Json;
            fs_updated_time: string;
        };
        Insert: {
            comment_id: string;
            contract_id: string;
            data: import("./schema").Json;
            fs_updated_time: string;
        };
        Update: {
            comment_id?: string | undefined;
            contract_id?: string | undefined;
            data?: import("./schema").Json | undefined;
            fs_updated_time?: string | undefined;
        };
    };
    contract_follows: {
        Row: {
            contract_id: string;
            data: import("./schema").Json;
            follow_id: string;
            fs_updated_time: string;
        };
        Insert: {
            contract_id: string;
            data: import("./schema").Json;
            follow_id: string;
            fs_updated_time: string;
        };
        Update: {
            contract_id?: string | undefined;
            data?: import("./schema").Json | undefined;
            follow_id?: string | undefined;
            fs_updated_time?: string | undefined;
        };
    };
    contract_liquidity: {
        Row: {
            contract_id: string;
            data: import("./schema").Json;
            fs_updated_time: string;
            liquidity_id: string;
        };
        Insert: {
            contract_id: string;
            data: import("./schema").Json;
            fs_updated_time: string;
            liquidity_id: string;
        };
        Update: {
            contract_id?: string | undefined;
            data?: import("./schema").Json | undefined;
            fs_updated_time?: string | undefined;
            liquidity_id?: string | undefined;
        };
    };
    contract_recommendation_features: {
        Row: {
            contract_id: string;
            f0: number;
            f1: number;
            f2: number;
            f3: number;
            f4: number;
        };
        Insert: {
            contract_id: string;
            f0: number;
            f1: number;
            f2: number;
            f3: number;
            f4: number;
        };
        Update: {
            contract_id?: string | undefined;
            f0?: number | undefined;
            f1?: number | undefined;
            f2?: number | undefined;
            f3?: number | undefined;
            f4?: number | undefined;
        };
    };
    contracts: {
        Row: {
            data: import("./schema").Json;
            fs_updated_time: string;
            id: string;
        };
        Insert: {
            data: import("./schema").Json;
            fs_updated_time: string;
            id: string;
        };
        Update: {
            data?: import("./schema").Json | undefined;
            fs_updated_time?: string | undefined;
            id?: string | undefined;
        };
    };
    group_contracts: {
        Row: {
            contract_id: string;
            data: import("./schema").Json;
            fs_updated_time: string;
            group_id: string;
        };
        Insert: {
            contract_id: string;
            data: import("./schema").Json;
            fs_updated_time: string;
            group_id: string;
        };
        Update: {
            contract_id?: string | undefined;
            data?: import("./schema").Json | undefined;
            fs_updated_time?: string | undefined;
            group_id?: string | undefined;
        };
    };
    group_members: {
        Row: {
            data: import("./schema").Json;
            fs_updated_time: string;
            group_id: string;
            member_id: string;
        };
        Insert: {
            data: import("./schema").Json;
            fs_updated_time: string;
            group_id: string;
            member_id: string;
        };
        Update: {
            data?: import("./schema").Json | undefined;
            fs_updated_time?: string | undefined;
            group_id?: string | undefined;
            member_id?: string | undefined;
        };
    };
    groups: {
        Row: {
            data: import("./schema").Json;
            fs_updated_time: string;
            id: string;
        };
        Insert: {
            data: import("./schema").Json;
            fs_updated_time: string;
            id: string;
        };
        Update: {
            data?: import("./schema").Json | undefined;
            fs_updated_time?: string | undefined;
            id?: string | undefined;
        };
    };
    incoming_writes: {
        Row: {
            data: import("./schema").Json;
            doc_id: string;
            event_id: string | null;
            id: number;
            parent_id: string | null;
            table_id: string;
            ts: string;
            write_kind: string;
        };
        Insert: {
            data?: import("./schema").Json | undefined;
            doc_id: string;
            event_id?: string | null | undefined;
            id?: undefined;
            parent_id?: string | null | undefined;
            table_id: string;
            ts: string;
            write_kind: string;
        };
        Update: {
            data?: import("./schema").Json | undefined;
            doc_id?: string | undefined;
            event_id?: string | null | undefined;
            id?: undefined;
            parent_id?: string | null | undefined;
            table_id?: string | undefined;
            ts?: string | undefined;
            write_kind?: string | undefined;
        };
    };
    manalinks: {
        Row: {
            data: import("./schema").Json;
            fs_updated_time: string;
            id: string;
        };
        Insert: {
            data: import("./schema").Json;
            fs_updated_time: string;
            id: string;
        };
        Update: {
            data?: import("./schema").Json | undefined;
            fs_updated_time?: string | undefined;
            id?: string | undefined;
        };
    };
    posts: {
        Row: {
            data: import("./schema").Json;
            fs_updated_time: string;
            id: string;
        };
        Insert: {
            data: import("./schema").Json;
            fs_updated_time: string;
            id: string;
        };
        Update: {
            data?: import("./schema").Json | undefined;
            fs_updated_time?: string | undefined;
            id?: string | undefined;
        };
    };
    test: {
        Row: {
            data: import("./schema").Json;
            fs_updated_time: string;
            id: string;
        };
        Insert: {
            data: import("./schema").Json;
            fs_updated_time: string;
            id: string;
        };
        Update: {
            data?: import("./schema").Json | undefined;
            fs_updated_time?: string | undefined;
            id?: string | undefined;
        };
    };
    tombstones: {
        Row: {
            doc_id: string;
            fs_deleted_at: string;
            id: number;
            parent_id: string | null;
            table_id: string;
        };
        Insert: {
            doc_id: string;
            fs_deleted_at: string;
            id?: undefined;
            parent_id?: string | null | undefined;
            table_id: string;
        };
        Update: {
            doc_id?: string | undefined;
            fs_deleted_at?: string | undefined;
            id?: undefined;
            parent_id?: string | null | undefined;
            table_id?: string | undefined;
        };
    };
    txns: {
        Row: {
            data: import("./schema").Json;
            fs_updated_time: string;
            id: string;
        };
        Insert: {
            data: import("./schema").Json;
            fs_updated_time: string;
            id: string;
        };
        Update: {
            data?: import("./schema").Json | undefined;
            fs_updated_time?: string | undefined;
            id?: string | undefined;
        };
    };
    user_contract_metrics: {
        Row: {
            contract_id: string;
            data: import("./schema").Json;
            fs_updated_time: string;
            user_id: string;
        };
        Insert: {
            contract_id: string;
            data: import("./schema").Json;
            fs_updated_time: string;
            user_id: string;
        };
        Update: {
            contract_id?: string | undefined;
            data?: import("./schema").Json | undefined;
            fs_updated_time?: string | undefined;
            user_id?: string | undefined;
        };
    };
    user_events: {
        Row: {
            data: import("./schema").Json;
            event_id: string;
            fs_updated_time: string;
            user_id: string;
        };
        Insert: {
            data: import("./schema").Json;
            event_id: string;
            fs_updated_time: string;
            user_id: string;
        };
        Update: {
            data?: import("./schema").Json | undefined;
            event_id?: string | undefined;
            fs_updated_time?: string | undefined;
            user_id?: string | undefined;
        };
    };
    user_follows: {
        Row: {
            data: import("./schema").Json;
            follow_id: string;
            fs_updated_time: string;
            user_id: string;
        };
        Insert: {
            data: import("./schema").Json;
            follow_id: string;
            fs_updated_time: string;
            user_id: string;
        };
        Update: {
            data?: import("./schema").Json | undefined;
            follow_id?: string | undefined;
            fs_updated_time?: string | undefined;
            user_id?: string | undefined;
        };
    };
    user_portfolio_history: {
        Row: {
            data: import("./schema").Json;
            fs_updated_time: string;
            portfolio_id: string;
            user_id: string;
        };
        Insert: {
            data: import("./schema").Json;
            fs_updated_time: string;
            portfolio_id: string;
            user_id: string;
        };
        Update: {
            data?: import("./schema").Json | undefined;
            fs_updated_time?: string | undefined;
            portfolio_id?: string | undefined;
            user_id?: string | undefined;
        };
    };
    user_reactions: {
        Row: {
            data: import("./schema").Json;
            fs_updated_time: string;
            reaction_id: string;
            user_id: string;
        };
        Insert: {
            data: import("./schema").Json;
            fs_updated_time: string;
            reaction_id: string;
            user_id: string;
        };
        Update: {
            data?: import("./schema").Json | undefined;
            fs_updated_time?: string | undefined;
            reaction_id?: string | undefined;
            user_id?: string | undefined;
        };
    };
    user_recommendation_features: {
        Row: {
            f0: number;
            f1: number;
            f2: number;
            f3: number;
            f4: number;
            user_id: string;
        };
        Insert: {
            f0: number;
            f1: number;
            f2: number;
            f3: number;
            f4: number;
            user_id: string;
        };
        Update: {
            f0?: number | undefined;
            f1?: number | undefined;
            f2?: number | undefined;
            f3?: number | undefined;
            f4?: number | undefined;
            user_id?: string | undefined;
        };
    };
    user_seen_markets: {
        Row: {
            contract_id: string;
            data: import("./schema").Json;
            fs_updated_time: string;
            user_id: string;
        };
        Insert: {
            contract_id: string;
            data: import("./schema").Json;
            fs_updated_time: string;
            user_id: string;
        };
        Update: {
            contract_id?: string | undefined;
            data?: import("./schema").Json | undefined;
            fs_updated_time?: string | undefined;
            user_id?: string | undefined;
        };
    };
    users: {
        Row: {
            data: import("./schema").Json;
            fs_updated_time: string;
            id: string;
        };
        Insert: {
            data: import("./schema").Json;
            fs_updated_time: string;
            id: string;
        };
        Update: {
            data?: import("./schema").Json | undefined;
            fs_updated_time?: string | undefined;
            id?: string | undefined;
        };
    };
}[T]["Row"], TResult>;
export {};
