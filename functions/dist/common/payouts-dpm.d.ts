import { Bet, NumericBet } from './bet';
import { DPMContract, FreeResponseContract, MultipleChoiceContract } from './contract';
export declare const getDpmCancelPayouts: (contract: DPMContract, bets: Bet[]) => {
    payouts: {
        userId: string;
        payout: number;
    }[];
    creatorPayout: number;
    liquidityPayouts: never[];
    collectedFees: import("./fees").Fees;
};
export declare const getDpmStandardPayouts: (outcome: string, contract: DPMContract, bets: Bet[]) => {
    payouts: {
        userId: string;
        payout: number;
    }[];
    creatorPayout: number;
    liquidityPayouts: never[];
    collectedFees: {
        creatorFee: number;
        platformFee: number;
        liquidityFee: number;
    };
};
export declare const getNumericDpmPayouts: (outcome: string, contract: DPMContract, bets: NumericBet[]) => {
    payouts: {
        userId: string;
        payout: number;
    }[];
    creatorPayout: number;
    liquidityPayouts: never[];
    collectedFees: {
        creatorFee: number;
        platformFee: number;
        liquidityFee: number;
    };
};
export declare const getDpmMktPayouts: (contract: DPMContract, bets: Bet[], resolutionProbability?: number) => {
    payouts: {
        userId: string;
        payout: number;
    }[];
    creatorPayout: number;
    liquidityPayouts: never[];
    collectedFees: {
        creatorFee: number;
        platformFee: number;
        liquidityFee: number;
    };
};
export declare const getPayoutsMultiOutcome: (resolutions: {
    [outcome: string]: number;
}, contract: FreeResponseContract | MultipleChoiceContract, bets: Bet[]) => {
    payouts: {
        userId: string;
        payout: number;
    }[];
    creatorPayout: number;
    liquidityPayouts: never[];
    collectedFees: {
        creatorFee: number;
        platformFee: number;
        liquidityFee: number;
    };
};
