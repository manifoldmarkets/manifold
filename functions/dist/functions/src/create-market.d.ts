import { Contract } from '../../common/contract';
import { AuthedUser } from './api';
export declare const createmarket: import("./api").EndpointDefinition;
export declare function createMarketHelper(body: any, auth: AuthedUser): Promise<Contract<import("../../common/contract").AnyContractType>>;
export declare function getContractFromSlug(slug: string): Promise<Contract<import("../../common/contract").AnyContractType> | undefined>;
