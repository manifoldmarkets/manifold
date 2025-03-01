import { FullMarket } from './manifold-api-types';
import { Bet } from './manifold-internal-types';

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

  mechanism: string;
  outcomeType: string;
  pool: { [outcome: string]: number };
  p: number;
  resolutionProbability: number;

  bets: NamedBet[];
};

export function abstractMarketFromFullMarket(market: FullMarket): AbstractMarket {
  const bets = market.bets.map((b) => <NamedBet>{ ...b, username: b.userName }); //!!! This may not work due to denormalized data in bets
  return {
    id: market.id,
    creatorUsername: market.creatorUsername,
    creatorName: market.creatorName,
    creatorId: market.creatorId,
    createdTime: market.createdTime,
    closeTime: market.closeTime,
    question: market.question,
    description: market.description,
    url: market.url,
    probability: market.probability,
    isResolved: market.isResolved,
    resolutionTime: market.resolutionTime,
    resolution: market.resolution,
    mechanism: market.mechanism,
    outcomeType: market.outcomeType,
    pool: market.pool,
    p: market.p,
    resolutionProbability: market.resolutionProbability,
    bets: bets,
  };
}

export type NamedBet = Bet & {
  username: string;
};
