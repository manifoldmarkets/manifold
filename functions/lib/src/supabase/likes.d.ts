import { SupabaseClient } from 'common/supabase/utils';
export declare function getRecentContractLikes(db: SupabaseClient, since: number): Promise<{
    [k: string]: number;
}>;
