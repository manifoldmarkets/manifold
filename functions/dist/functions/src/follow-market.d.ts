import * as admin from 'firebase-admin';
export declare const addUserToContractFollowers: (contractId: string, userId: string) => Promise<admin.firestore.WriteResult | undefined>;
export declare const removeUserFromContractFollowers: (contractId: string, userId: string) => Promise<admin.firestore.WriteResult>;
