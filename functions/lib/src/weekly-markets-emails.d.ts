import * as functions from 'firebase-functions';
import { Contract } from '../../common/contract';
export declare const weeklyMarketsEmails: functions.CloudFunction<unknown>;
export declare function getTrendingContracts(): Promise<Contract<import("../../common/contract").AnyContractType>[]>;
export declare function sendTrendingMarketsEmailsToAllUsers(): Promise<void>;
