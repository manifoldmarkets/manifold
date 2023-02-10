import * as pgPromise from 'pg-promise';
export declare const pgp: pgPromise.IMain<{}, import("pg-promise/typescript/pg-subset").IClient>;
export type SupabaseDirectClient = ReturnType<typeof createSupabaseDirectClient>;
export declare function createSupabaseClient(): import("../../../common/supabase/utils").SupabaseClient;
export declare function createSupabaseDirectClient(): pgPromise.IDatabase<{}, import("pg-promise/typescript/pg-subset").IClient>;
