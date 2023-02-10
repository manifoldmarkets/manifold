import { Contract, PseudoNumericContract } from './contract';
export declare function formatNumericProbability(p: number, contract: PseudoNumericContract): string;
export declare const getMappedValue: (contract: Contract, p: number) => number;
export declare const getFormattedMappedValue: (contract: Contract, p: number) => string;
export declare const getPseudoProbability: (value: number, min: number, max: number, isLogScale?: boolean) => number;
