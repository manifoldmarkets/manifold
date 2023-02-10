import { PostgrestResponse, PostgrestSingleResponse, SupabaseClientOptions } from '@supabase/supabase-js';
type QueryResponse = PostgrestResponse<any> | PostgrestSingleResponse<any>;
export declare function createSupabaseClient(opts?: SupabaseClientOptions<'public'>): import("@supabase/supabase-js").SupabaseClient<any, "public", any>;
export declare function run<T extends QueryResponse = QueryResponse>(q: PromiseLike<T>): Promise<{
    data: any;
    count: number | null;
}>;
export {};
