/* Pulled from Manifold code (web/pages/api/_types.ts) on 17/10/2022 */

import { Answer, Bet } from './manifold-internal-types';

// Information about a market, but without bets or comments
export type LiteMarket = {
  // Unique identifer for this market
  id: string;

  // Attributes about the creator
  creatorId: string;
  creatorUsername: string;
  creatorName: string;
  createdTime: number;
  creatorAvatarUrl?: string;

  // Market attributes. All times are in milliseconds since epoch
  closeTime?: number;
  question: string;
  url: string;
  outcomeType: string;
  mechanism: string;

  pool: { [outcome: string]: number };
  probability?: number;
  p?: number;
  totalLiquidity?: number;

  volume: number;
  volume24Hours: number;

  isResolved: boolean;
  resolution?: string;
  resolutionTime?: number;
  resolutionProbability?: number;

  lastUpdatedTime?: number;
};

export type LiteUser = {
  id: string;
  createdTime: number;

  name: string;
  username: string;
  url: string;
  avatarUrl?: string;

  bio?: string;
  website?: string;
  twitterHandle?: string;
  discordHandle?: string;

  balance: number;
  totalDeposits: number;

  profitCached: {
    daily: number;
    weekly: number;
    monthly: number;
    allTime: number;
  };

  isBot: boolean;
  isAdmin: boolean;
  isTrustworthy: boolean;

  isBannedFromPosting?: boolean;
  userDeleted?: boolean;

  followerCountCached: number;
  currentBettingStreak?: number;
  lastBetTime?: number;
};

export type ApiAnswer = Answer & {
  probability?: number;
};

export type FullMarket = LiteMarket & {
  bets: Bet[];
  comments: any[];
  answers?: ApiAnswer[];
  description: any;
  textDescription: string; // string version of description
};

export type ApiError = {
  error: string;
};
