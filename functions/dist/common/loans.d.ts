import { Bet } from './bet';
import { Contract } from './contract';
import { PortfolioMetrics } from './user';
export declare const getUserLoanUpdates: (betsByContractId: {
    [contractId: string]: Bet[];
}, contractsById: {
    [contractId: string]: Contract<import("./contract").AnyContractType>;
}) => {
    updates: ({
        userId: string;
        contractId: string;
        betId: string;
        newLoan: number;
        loanTotal: number;
    } | {
        userId: string;
        contractId: string;
        betId: string;
        newLoan: number;
        loanTotal: number;
    })[];
    payout: number;
};
export declare const isUserEligibleForLoan: (portfolio: PortfolioMetrics | undefined) => boolean;
