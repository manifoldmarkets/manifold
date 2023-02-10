import { SupabaseDirectClient } from './init';
import { Tables, TableName } from '../../../common/supabase/utils';
export declare function bulkInsert<T extends TableName, ColumnValues extends Tables[T]['Insert']>(db: SupabaseDirectClient, table: T, values: ColumnValues[]): Promise<void>;
