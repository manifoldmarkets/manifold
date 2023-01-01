import { getOutcomeForString } from '@common/outcome';
import { PacketResolved } from '@common/packets';
import { AbstractMarket, NamedBet } from '@common/types/manifold-abstract-types';
import { LiteUser } from '@common/types/manifold-api-types';
import { Bet, CPMMBinaryContract } from '@common/types/manifold-internal-types';
import { onSnapshot, Unsubscribe } from 'firebase/firestore';
import { default as lodash, default as _ } from 'lodash';
import App from './app';
import { MANIFOLD_URLS, TARGET } from './envs';
import * as Manifold from './manifold-api';
import { TwitchStream } from './stream';
import User from './user';

const { keyBy, mapValues, sumBy, groupBy } = lodash;

export class Market {
  private readonly app: App;
  private readonly stream: TwitchStream;
  private readonly firestoreSubscriptions: Unsubscribe[] = [];

  public data: AbstractMarket;
  public resolveData: PacketResolved = null;

  private constructor(app: App, stream: TwitchStream) {
    this.app = app;
    this.stream = stream;
  }

  static async loadFromManifoldID(app: App, manifoldID: string, stream: TwitchStream) {
    const market = new Market(app, stream);
    try {
      const [contractDoc, betCollection] = await app.manifoldFirestore.getFullMarketByID(manifoldID);
      let initializing = true;
      await new Promise<void>((resolve, reject) =>
        market.firestoreSubscriptions.push(
          onSnapshot(contractDoc, (update) => {
            try {
              const contract = update.data();
              const binaryContract = <CPMMBinaryContract>contract;
              const {
                id,
                creatorUsername,
                creatorName,
                creatorId,
                createdTime,
                closeTime,
                question,
                slug,
                isResolved,
                resolutionTime,
                resolution,
                description,
                p,
                mechanism,
                outcomeType,
                pool,
                resolutionProbability,
              } = binaryContract;

              market.data = {
                ...market.data,
                id,
                creatorUsername,
                creatorName,
                creatorId,
                createdTime,
                closeTime,
                question,
                description,
                url: `${MANIFOLD_URLS[TARGET]}${creatorUsername}/${slug}`,
                probability: contract.outcomeType === 'BINARY' ? Market.getProbability(binaryContract) : undefined,
                isResolved,
                resolutionTime,
                resolution,
                p,
                mechanism,
                outcomeType,
                pool,
                resolutionProbability,
                ...(initializing && { bets: [] }),
              };
              if (update.data().isResolved) {
                if (initializing) {
                  throw new Error('Marked already resolved.');
                } else {
                  market.resolve();
                }
              }
              resolve();
            } catch (e) {
              reject(e);
            }
          })
        )
      );
      await new Promise<void>((r) =>
        market.firestoreSubscriptions.push(
          onSnapshot(betCollection, async (update) => {
            if (initializing) {
              const bets = update.docs.map((d) => d.data());
              bets.filter((b) => Market.isBetValid(b));
              bets.sort((a, b) => a.createdTime - b.createdTime); // Sort oldest bets first !!! check
              await Promise.all(_.uniq(bets.map((b) => b.userId)).map(async (id) => await app.getDisplayNameForUserID(id)));
              await Promise.all(bets.map(async (b) => <NamedBet>{ ...b, username: await app.getDisplayNameForUserID(b.userId) })).then((bets) => (market.data.bets = bets));
              r();
              return;
            }
            const changes = update.docChanges();
            for (const changedBet of changes) {
              if (changedBet.type === 'added') {
                market.onNewBet(changedBet.doc.data());
              }
            }
          })
        )
      );
      initializing = false;
      return market;
    } catch (e) {
      market.unfeature();
      throw e;
    }
  }

  private static isBetValid(bet: Bet): boolean {
    return !bet.isRedemption && bet.shares !== 0;
  }

  async onNewBet(bet: Bet) {
    if (Market.isBetValid(bet)) {
      this.addBet(await this.betToFullBet(bet));
    }
  }

  private async resolve() {
    if (this.resolveData) return; // Already processed resolve

    const resolutionOutcome = getOutcomeForString(this.data.resolution);
    const winners = (await this.calculateWinners()).filter((w) => Math.abs(Math.round(w.profit)) !== 0); // Ignore profit/losses of 0
    const uniqueTraderCount = _(this.data.bets).groupBy('userId').size();

    type Result = { displayName: string; profit: number };
    const topWinners: Result[] = [];
    const topLosers: Result[] = [];
    for (const winner of winners) {
      if (winner.profit > 0) {
        topWinners.push({ displayName: winner.user.name, profit: winner.profit });
      } else {
        topLosers.push({ displayName: winner.user.name, profit: winner.profit });
      }
    }
    const sortFunction = (a: Result, b: Result) => (Math.abs(a.profit) > Math.abs(b.profit) ? -1 : 1);
    topWinners.sort(sortFunction);
    topLosers.sort(sortFunction);

    this.resolveData = {
      outcome: resolutionOutcome,
      uniqueTraders: uniqueTraderCount,
      topWinners: topWinners,
      topLosers: topLosers,
    };

    this.stream.marketResolved(this);
  }

  /**
   * Positive value represents net YES shares, negative value represents NO shares
   */
  getUsersExpectedPayout(user: User) {
    let totalShares = 0;
    for (const bet of this.data.bets) {
      if (bet.userId === user.data.manifoldID) {
        totalShares += bet.shares * (bet.outcome === 'YES' ? 1 : -1); //!!! Types
      }
    }
    return totalShares;
  }

  static calculateFixedPayout(contract: AbstractMarket, bet: Bet, outcome: string) {
    if (outcome === 'CANCEL') return this.calculateFixedCancelPayout(bet);
    if (outcome === 'MKT') return this.calculateFixedMktPayout(contract, bet);

    return this.calculateStandardFixedPayout(bet, outcome);
  }

  static calculateFixedCancelPayout(bet: Bet) {
    return bet.amount;
  }

  static calculateStandardFixedPayout(bet: Bet, outcome: string) {
    const { outcome: betOutcome, shares } = bet;
    if (betOutcome !== outcome) return 0;
    return shares;
  }

  static getProbability(contract: { pool: { [outcome: string]: number }; p: number; mechanism: string }) {
    if (contract.mechanism === 'cpmm-1') {
      return this.getCpmmProbability(contract.pool, contract.p);
    }
    throw new Error('DPM probability not supported.');
  }

  static getCpmmProbability(pool: { [outcome: string]: number }, p: number) {
    const { YES, NO } = pool;
    return (p * NO) / ((1 - p) * YES + p * NO);
  }

  static calculateFixedMktPayout(contract: AbstractMarket, bet: Bet) {
    const { resolutionProbability } = contract;
    const p = resolutionProbability !== undefined ? resolutionProbability : this.getProbability(contract);

    const { outcome, shares } = bet;

    const betP = outcome === 'YES' ? p : 1 - p;

    return betP * shares;
  }

  static resolvedPayout(contract: AbstractMarket, bet: Bet) {
    const outcome = contract.resolution;
    if (!outcome) throw new Error('Contract not resolved');

    if (contract.mechanism === 'cpmm-1' && (contract.outcomeType === 'BINARY' || contract.outcomeType === 'PSEUDO_NUMERIC')) {
      return this.calculateFixedPayout(contract, bet, outcome);
    }
    throw new Error('DPM payout not supported.'); //this.calculateDpmPayout(contract, bet, outcome);
  }

  async calculateWinners(): Promise<{ user: LiteUser; profit: number }[]> {
    const bets = this.data.bets;

    // If 'id2' is the sale of 'id1', both are logged with (id2 - id1) of profit
    // Otherwise, we record the profit at resolution time
    const profitById: Record<string, number> = {};
    const betsById = keyBy(bets, 'id');
    for (const bet of bets) {
      if (bet.sale) {
        const originalBet = betsById[bet.sale.betId];
        const profit = bet.sale.amount - originalBet.amount;
        profitById[bet.id] = profit;
        profitById[originalBet.id] = profit;
      } else {
        profitById[bet.id] = Market.resolvedPayout(this.data, bet) - bet.amount;
      }
    }

    const openBets = bets.filter((bet) => !bet.isSold && !bet.sale);
    const betsByUser = groupBy(openBets, 'userId');
    const userProfits = mapValues(betsByUser, (bets) => sumBy(bets, (bet) => Market.resolvedPayout(this.data, bet) - bet.amount));

    const userObjectProfits: { user: LiteUser; profit: number }[] = [];

    for (const userID of Object.keys(userProfits)) {
      const user = await Manifold.getUserByID(userID);
      userObjectProfits.push({ user: user, profit: userProfits[userID] });
    }
    return userObjectProfits;
  }

  private addBet(bet: NamedBet, transmit = true) {
    this.data.bets.push(bet);
    if (transmit) {
      this.stream.onNewBet(bet);
    }
  }

  private async betToFullBet(bet: Bet): Promise<NamedBet> {
    const username = await this.app.getDisplayNameForUserID(bet.userId);
    return {
      ...bet,
      username,
    };
  }

  public unfeature(): void {
    this.firestoreSubscriptions.forEach((unsubscribe) => unsubscribe());
  }
}
