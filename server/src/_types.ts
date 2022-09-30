import { FullBet } from 'common/transaction';

export type AbstractMarket = {
  id: string;

  creatorUsername: string;
  creatorName: string;
  creatorId: string;
  createdTime: number; // milliseconds since epoch

  closeTime?: number; // Min of creator's chosen date, and resolutionTime
  question: string;
  description: string;
  url: string;
  probability: number;

  isResolved: boolean;
  resolutionTime?: number;
  resolution?: string;

  bets: FullBet[];
};
