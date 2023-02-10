import { Bet, NumericBet } from './bet';
import { CPMMBinaryContract, DPMBinaryContract, FreeResponseContract, NumericContract, CPMM2Contract, DpmMultipleChoiceContract } from './contract';
import { User } from './user';
import { LiquidityProvision } from './liquidity-provision';
import { Answer } from './answer';
export declare const HOUSE_LIQUIDITY_PROVIDER_ID = "IPTOzEqrpkWmEzh6hwvAyY9PqFb2";
export declare const DEV_HOUSE_LIQUIDITY_PROVIDER_ID = "94YYTk1AFWfbWMpfYcvnnwI1veP2";
export declare const UNIQUE_BETTOR_LIQUIDITY_AMOUNT = 20;
type NormalizedBet<T extends Bet = Bet> = Omit<T, 'userAvatarUrl' | 'userName' | 'userUsername'>;
export declare function getCpmmInitialLiquidity(providerId: string, contract: CPMMBinaryContract, anteId: string, amount: number): LiquidityProvision;
export declare function getCpmm2InitialLiquidity(providerId: string, contract: CPMM2Contract, anteId: string, amount: number): LiquidityProvision;
export declare function getMultipleChoiceAntes(creator: User, contract: DpmMultipleChoiceContract, answers: string[], betDocIds: string[]): {
    bets: NormalizedBet<Bet>[];
    answerObjects: Answer[];
};
export declare function getAnteBets(creator: User, contract: DPMBinaryContract, yesAnteId: string, noAnteId: string): {
    yesBet: NormalizedBet<Bet>;
    noBet: NormalizedBet<Bet>;
};
export declare function getFreeAnswerAnte(anteBettorId: string, contract: FreeResponseContract, anteBetId: string): NormalizedBet<Bet>;
export declare function getNumericAnte(anteBettorId: string, contract: NumericContract, ante: number, newBetId: string): NormalizedBet<NumericBet>;
export {};
