import { ResolutionOutcome } from '@common/outcome';
import { LiteQuestion } from '@common/types/manifold-api-types';
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
  selectedQuestion?: string;
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

  public async allIn(questionID: string, yes: boolean): Promise<Response> {
    return this.placeBet(questionID, Math.floor(await this.getBalance()), yes);
  }

  async sellAllShares(questionID: string): Promise<Response> {
    return Manifold.sellShares(questionID, this.data.APIKey);
  }

  public async createBinaryQuestion(question: string, description: string, initialProb_percent: number, options?: { visibility?: 'public' | 'unlisted'; groupID?: string }): Promise<LiteQuestion> {
    return Manifold.createBinaryQuestion(this.data.APIKey, question, description, initialProb_percent, options);
  }

  public async resolveBinaryQuestion(questionID: string, outcome: ResolutionOutcome) {
    return Manifold.resolveBinaryQuestion(questionID, this.data.APIKey, outcome);
  }

  public async placeBet(questionID: string, amount: number, yes: boolean): Promise<Response> {
    return Manifold.placeBet(questionID, this.data.APIKey, amount, yes ? 'YES' : 'NO');
  }
}
