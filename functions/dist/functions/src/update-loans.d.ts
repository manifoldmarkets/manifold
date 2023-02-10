import * as functions from 'firebase-functions';
export declare const scheduleUpdateLoans: functions.CloudFunction<unknown>;
export declare const updateloans: import("./api").EndpointDefinition;
export declare function updateLoansCore(): Promise<void>;
