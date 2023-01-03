import { ResolutionOutcome } from '@common/outcome';
import { LiteMarket } from '@common/types/manifold-api-types';
import { Response } from 'node-fetch';
import * as Manifold from './manifold-api';

/**
 * This data is written as-is to Firestore. Do not change without being aware of the consquences!
 */
export type UserData = {
  twitchLogin: string;
  manifoldID: string;
  APIKey: string;
  controlToken: string;
  botEnabled?: boolean;
  selectedMarket?: string;
  admin?: boolean;
  metrics?: {
    lastOverlayFeatured_day?: number;
    hasUsedBot?: boolean;
    lastCommand_day?: number;
  };
};

export default class User {
  readonly data: UserData; // Saved in Firestore
  twitchDisplayName: string;

  constructor(data: UserData) {
    this.data = data;
  }

  public async getBalance(): Promise<number> {
    return (await Manifold.getUserByID(this.data.manifoldID)).balance;
  }

  public async allIn(marketID: string, yes: boolean): Promise<Response> {
    return this.placeBet(marketID, Math.floor(await this.getBalance()), yes);
  }

  async sellAllShares(marketID: string): Promise<Response> {
    return Manifold.sellShares(marketID, this.data.APIKey);
  }

  public async createBinaryMarket(question: string, description: string, initialProb_percent: number, options?: { visibility?: 'public' | 'unlisted'; groupID?: string }): Promise<LiteMarket> {
    return Manifold.createBinaryMarket(this.data.APIKey, question, description, initialProb_percent, options);
  }

  public async resolveBinaryMarket(marketID: string, outcome: ResolutionOutcome) {
    return Manifold.resolveBinaryMarket(marketID, this.data.APIKey, outcome);
  }

  public async placeBet(marketID: string, amount: number, yes: boolean): Promise<Response> {
    return Manifold.placeBet(marketID, this.data.APIKey, amount, yes ? 'YES' : 'NO');
  }
}
