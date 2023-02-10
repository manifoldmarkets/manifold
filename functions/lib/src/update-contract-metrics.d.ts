import * as functions from 'firebase-functions';
import { Contract } from '../../common/contract';
export declare const scheduleUpdateContractMetrics: functions.CloudFunction<unknown>;
export declare const updatecontractmetrics: import("./api").EndpointDefinition;
export declare function updateContractMetrics(): Promise<void>;
export declare const computeContractMetricUpdates: (contract: Contract, now: number) => Promise<{
    mechanism?: "cpmm-1" | undefined;
    pool?: {
        [outcome: string]: number;
    } | undefined;
    p?: number | undefined;
    totalLiquidity?: number | undefined;
    subsidyPool?: number | undefined;
    prob?: number | undefined;
    probChanges?: {
        day: number;
        week: number;
        month: number;
    } | undefined;
    volume24Hours: number;
    elasticity: number;
    uniqueBettors24Hours: number;
    uniqueBettors7Days: number;
    uniqueBettors30Days: number;
}>;
