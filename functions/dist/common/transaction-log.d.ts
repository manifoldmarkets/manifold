import { Database } from './supabase/schema';
export type WriteKind = 'create' | 'update' | 'delete';
export type WriteDocument = {
    [k: string]: any;
};
export type TLEntry<T extends WriteDocument = WriteDocument> = {
    eventId: string;
    tableId: keyof Database['public']['Tables'];
    writeKind: WriteKind;
    docId: string;
    parentId: string | null;
    path: string;
    data: T | null;
    ts: number;
};
