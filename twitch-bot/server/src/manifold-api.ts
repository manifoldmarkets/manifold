import fetch, { Response } from 'node-fetch';

import { ForbiddenException, InsufficientBalanceException, ResourceNotFoundException, TradingClosedException } from '@common/exceptions';
import { ResolutionOutcome } from '@common/outcome';
import * as ManifoldAPITypes from '@common/types/manifold-api-types';
import * as ManifoldInternalTypes from '@common/types/manifold-internal-types';
import { MANIFOLD_API_BASE_URL } from './envs';
import log from './logger';

async function post(url: string, APIKey: string, requestData: unknown): Promise<Response> {
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Key ${APIKey}`,
    },
    ...(requestData && {
      body: JSON.stringify(requestData),
    }),
  });
  if (r.status !== 200) {
    type ResponseMessage = {
      message?: string;
      details?: string;
    };
    let error: ResponseMessage = { message: '' };
    try {
      error = <ResponseMessage>await r.json();
    } catch (e) {
      // Empty
    }
    const errorMessage = error.message;
    if (errorMessage === 'Insufficient balance.') throw new InsufficientBalanceException();
    if (errorMessage === 'Balance must be at least 100.') throw new InsufficientBalanceException();
    if (errorMessage === 'Trading is closed.') throw new TradingClosedException();
    if (r.status === 403) throw new ForbiddenException(errorMessage);
    if (r.status === 404) throw new ResourceNotFoundException(url);
    throw new Error(errorMessage + (error.details ? ' Details: ' + JSON.stringify(error.details) : '') + ` Request: [${url}]: ${JSON.stringify(requestData)}`);
  }
  return r;
}

async function get(url: string): Promise<Response> {
  try {
    const r = await fetch(url);
    if (r.status != 200) {
      let error: { error: string } = { error: '' };
      try {
        error = <{ error: string }>await r.json();
      } catch (e) {
        // Empty
      }
      const errorMessage = error.error;
      if (r.status === 404) throw new ResourceNotFoundException(errorMessage);
      throw new Error(errorMessage);
    }
    return r;
  } catch (e) {
    log.trace(e);
    throw e;
  }
}

export async function getUserByID(userID: string): Promise<ManifoldAPITypes.LiteUser> {
  return <Promise<ManifoldAPITypes.LiteUser>>(await get(`${MANIFOLD_API_BASE_URL}user/by-id/${userID}`)).json();
}

/**
 * @deprecated Username is volatile. Aim to use user ID instead.
 */
export async function getUserByManifoldUsername(manifoldUsername: string): Promise<ManifoldAPITypes.LiteUser> {
  return <Promise<ManifoldAPITypes.LiteUser>>(await get(`${MANIFOLD_API_BASE_URL}user/${manifoldUsername}`)).json();
}

/**
 * @deprecated This is generally a messy function as it uses a market's slug and user's username instead of the relevant IDs. Avoid using if possible.
 */
export async function getUsersStakeInMarket_shares(marketSlug: string, manifoldUsername: string): Promise<{ shares: number; outcome: 'YES' | 'NO' }> {
  return fetch(`${MANIFOLD_API_BASE_URL}bets?market=${marketSlug}&username=${manifoldUsername}`)
    .then((r) => <Promise<ManifoldInternalTypes.Bet[]>>r.json())
    .then((bets) => {
      let total = 0;
      for (const bet of bets) {
        if (bet.outcome == 'YES') total += bet.shares;
        else total -= bet.shares;
      }
      return { shares: Math.abs(total), outcome: total > 0 ? 'YES' : 'NO' };
    });
}

export async function sellShares(marketID: string, APIKey: string, outcome?: 'YES' | 'NO' | number, shares?: number): Promise<Response> {
  const parameters = {
    ...(outcome && { outcome }),
    ...(shares && { shares }),
  };
  return post(`${MANIFOLD_API_BASE_URL}market/${marketID}/sell`, APIKey, parameters);
}

export async function createBinaryMarket(
  APIKey: string,
  question: string,
  description: string,
  initialProb_percent: number,
  options?: { visibility?: 'public' | 'unlisted'; groupID?: string }
): Promise<ManifoldAPITypes.LiteMarket> {
  const { visibility = 'public', groupID } = options;

  const outcomeType: 'BINARY' | 'FREE_RESPONSE' | 'NUMERIC' = 'BINARY';
  const descriptionObject = {
    type: 'doc',
    content: [
      ...(description
        ? [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: question,
                },
              ],
            },
          ]
        : []),
    ],
  };
  const requestData = {
    outcomeType,
    question,
    description: descriptionObject,
    closeTime: Date.now() + 1e12, // Arbitrarily long time in the future
    initialProb: initialProb_percent,
    ...(groupID && { groupId: groupID }),
    visibility,
    isTwitchContract: true,
  };
  return <Promise<ManifoldAPITypes.LiteMarket>>(await post(`${MANIFOLD_API_BASE_URL}market`, APIKey, requestData)).json();
}

export async function resolveBinaryMarket(marketID: string, APIKey: string, outcome: ResolutionOutcome): Promise<Response> {
  return post(`${MANIFOLD_API_BASE_URL}market/${marketID}/resolve`, APIKey, { outcome: outcome });
}

export async function placeBet(marketID: string, APIKey: string, amount: number, outcome: 'YES' | 'NO'): Promise<Response> {
  const requestData = {
    amount: amount,
    contractId: marketID,
    outcome: outcome,
  };
  return post(`${MANIFOLD_API_BASE_URL}bet`, APIKey, requestData);
}

export async function verifyAPIKey(APIKey: string): Promise<boolean> {
  try {
    await post(`${MANIFOLD_API_BASE_URL}bet`, APIKey, null);
  } catch (e) {
    if (e instanceof ForbiddenException) return false;
  }
  return true;
}

export async function getLatestMarketBets(marketSlug: string, numBetsToLoad?: number): Promise<ManifoldInternalTypes.Bet[]> {
  return <Promise<ManifoldInternalTypes.Bet[]>>(await get(`${MANIFOLD_API_BASE_URL}bets?market=${marketSlug}${numBetsToLoad ? `&limit=${numBetsToLoad}` : ''}`)).json();
}

export async function getMarketBySlug(marketSlug: string): Promise<ManifoldAPITypes.LiteMarket> {
  return <Promise<ManifoldAPITypes.LiteMarket>>(await get(`${MANIFOLD_API_BASE_URL}slug/${marketSlug}`)).json();
}

export async function getFullMarketByID(marketID: string): Promise<ManifoldAPITypes.FullMarket> {
  const fullMarket = <ManifoldAPITypes.FullMarket>await (await get(`${MANIFOLD_API_BASE_URL}market/${marketID}`)).json();
  fullMarket.bets.sort((a, b) => a.createdTime - b.createdTime); // Ensure that bets are oldest-first. The Manifold API doesn't consistently order them.
  return fullMarket;
}

export async function getLiteMarketByID(marketID: string): Promise<ManifoldAPITypes.LiteMarket> {
  return <Promise<ManifoldAPITypes.LiteMarket>>(await get(`${MANIFOLD_API_BASE_URL}market/${marketID}/lite`)).json();
}

export async function getGroupBySlug(groupSlug: string): Promise<ManifoldInternalTypes.Group> {
  return <Promise<ManifoldInternalTypes.Group>>(await get(`${MANIFOLD_API_BASE_URL}group/${groupSlug}`)).json();
}

export async function saveTwitchDetails(APIKey: string, twitchName: string, controlToken: string): Promise<void> {
  const requestData = {
    twitchInfo: {
      // These names match the variables in Manifold User.ts. DO NOT CHANGE
      twitchName,
      controlToken,
    },
  };
  await post(`${MANIFOLD_API_BASE_URL}twitch/save`, APIKey, requestData);
}
