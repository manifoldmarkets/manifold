import { FullQuestion } from './manifold-api-types';
import { Bet } from './manifold-internal-types';

export type AbstractQuestion = {
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

export function abstractQuestionFromFullQuestion(question: FullQuestion): AbstractQuestion {
  const bets = question.bets.map((b) => <NamedBet>{ ...b, username: b.userName }); //!!! This may not work due to denormalized data in bets
  return {
    id: question.id,
    creatorUsername: question.creatorUsername,
    creatorName: question.creatorName,
    creatorId: question.creatorId,
    createdTime: question.createdTime,
    closeTime: question.closeTime,
    question: question.question,
    description: question.description,
    url: question.url,
    probability: question.probability,
    isResolved: question.isResolved,
    resolutionTime: question.resolutionTime,
    resolution: question.resolution,
    mechanism: question.mechanism,
    outcomeType: question.outcomeType,
    pool: question.pool,
    p: question.p,
    resolutionProbability: question.resolutionProbability,
    bets: bets,
  };
}

export type NamedBet = Bet & {
  username: string;
};
