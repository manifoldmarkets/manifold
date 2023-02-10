import * as admin from 'firebase-admin';
import { ContractResolutionPayoutTxn, Txn } from '../../common/txn';
export type TxnData = Omit<Txn, 'id' | 'createdTime'>;
export declare function runTxn(fbTransaction: admin.firestore.Transaction, data: TxnData): Promise<{
    status: string;
    message: string;
    txn?: undefined;
} | {
    status: string;
    txn: {
        description?: string | undefined;
        fromId: string;
        fromType: "USER" | "CONTRACT" | "BANK";
        toId: string;
        toType: "USER" | "CONTRACT" | "CHARITY" | "BANK";
        amount: number;
        token: "M$" | "SHARE";
        category: "CHARITY" | "MANALINK" | "TIP" | "REFERRAL" | "UNIQUE_BETTOR_BONUS" | "BETTING_STREAK_BONUS" | "CANCEL_UNIQUE_BETTOR_BONUS" | "MANA_PURCHASE" | "SIGNUP_BONUS" | "CERT_MINT" | "CERT_TRANSFER" | "CERT_PAY_MANA" | "CERT_DIVIDEND" | "CERT_BURN" | "CONTRACT_RESOLUTION_PAYOUT" | "QF_PAYMENT" | "QF_ADD_POOL" | "QF_DIVIDEND";
        data?: {
            [key: string]: any;
        } | ({
            [key: string]: any;
        } & {
            commentId: string;
            contractId?: string | undefined;
            groupId?: string | undefined;
        }) | ({
            [key: string]: any;
        } & {
            contractId: string;
            uniqueNewBettorId?: string | undefined;
            uniqueBettorIds?: string[] | undefined;
        }) | ({
            [key: string]: any;
        } & {
            currentBettingStreak?: number | undefined;
        }) | ({
            [key: string]: any;
        } & {
            contractId: string;
        }) | ({
            [key: string]: any;
        } & {
            iapTransactionId: string;
            type: "apple";
        }) | ({
            [key: string]: any;
        } & {
            answerId: string;
        }) | undefined;
        id: string;
        createdTime: number;
    };
    message?: undefined;
}>;
export declare function runContractPayoutTxn(fbTransaction: admin.firestore.Transaction, data: Omit<ContractResolutionPayoutTxn, 'id' | 'createdTime'>, deposit: number): {
    status: string;
    txn: {
        description?: string | undefined;
        fromId: string;
        fromType: "CONTRACT";
        toId: string;
        toType: "USER";
        amount: number;
        token: "M$";
        category: "CONTRACT_RESOLUTION_PAYOUT";
        data?: {
            [key: string]: any;
        } | undefined;
        id: string;
        createdTime: number;
    };
};
