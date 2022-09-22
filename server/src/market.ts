import { Bet, FullMarket, LiteMarket, LiteUser } from 'common/manifold-defs';
import { getOutcomeForString } from 'common/outcome';
import * as Packet from 'common/packet-ids';
import { PacketResolved } from 'common/packets';
import { FullBet } from 'common/transaction';
import { default as lodash, default as _ } from 'lodash';
import moment from 'moment';
import App from './app';
import log from './logger';
import * as Manifold from './manifold-api';

const { keyBy, mapValues, sumBy, groupBy } = lodash;

export class Market {
  private readonly app: App;
  private readonly twitchChannel: string;
  private latestLoadedBetId: string = null;
  private userIdToNameMap: Record<string, string> = {}; //!!! This should really be shared between markets
  private readonly pollTask: () => void;

  public readonly bets: FullBet[] = [];
  public data: FullMarket;
  public resolveData: PacketResolved = null;
  public continuePolling = false;

  constructor(app: App, data: FullMarket, twitchChannel: string) {
    this.app = app;
    this.data = data;

    this.twitchChannel = twitchChannel;

    this.pollTask = async () => {
      try {
        this.pollBets();
        if (await this.detectResolution()) {
          this.data = await Manifold.getFullMarketByID(this.data.id);

          this.continuePolling = false;

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

          this.app.marketResolved(this);
          app.io.to(this.twitchChannel).emit(Packet.RESOLVE, this.resolveData);
          app.io.to(this.twitchChannel).emit(Packet.RESOLVED);
        }
      } catch (e) {
        log.trace(e);
      } finally {
        if (this.continuePolling) {
          setTimeout(this.pollTask, 1000);
        } else {
          log.info('Market poll task terminated.');
        }
      }
    };

    this.loadInitialBets().then(() => {
      this.continuePolling = true;
      setTimeout(this.pollTask, 1000);
    });
  }

  async loadInitialBets() {
    let numLoadedBets = 0;
    let mostRecentBet: FullBet = undefined;
    const betsToAdd = [];
    // Bets are in oldest-first order, so must iterate backwards to get most recent bets:
    for (let betIndex = this.data.bets.length - 1; betIndex >= 0; betIndex--) {
      const bet = this.data.bets[betIndex];
      if (bet.isRedemption) {
        continue;
      }
      const displayName = await this.getDisplayNameForUserID(bet.userId);
      const fullBet: FullBet = {
        ...bet,
        username: displayName,
      };
      if (!mostRecentBet) {
        mostRecentBet = fullBet;
      }
      betsToAdd.push(fullBet);
      numLoadedBets++;
      if (numLoadedBets >= 3) {
        break;
      }
    }

    betsToAdd.reverse(); // Bets must be pushed oldest first, but betsToAdd is newest-first
    for (const bet of betsToAdd) {
      this.addBet(bet);
    }

    log.debug(`Market '${this.data.question}' loaded ${this.data.bets.length} initial bets.`);
    if (mostRecentBet) {
      this.latestLoadedBetId = mostRecentBet.id;
      log.debug(`Latest loaded bet: ${this.userIdToNameMap[mostRecentBet.userId]} : ${mostRecentBet.id}`);
    }
    this.app.io.to(this.twitchChannel).emit(Packet.MARKET_LOAD_COMPLETE);
  }

  calculateFixedPayout(contract: LiteMarket, bet: Bet, outcome: string) {
    if (outcome === 'CANCEL') return this.calculateFixedCancelPayout(bet);
    if (outcome === 'MKT') return this.calculateFixedMktPayout(contract, bet);

    return this.calculateStandardFixedPayout(bet, outcome);
  }

  calculateFixedCancelPayout(bet: Bet) {
    return bet.amount;
  }

  calculateStandardFixedPayout(bet: Bet, outcome: string) {
    const { outcome: betOutcome, shares } = bet;
    if (betOutcome !== outcome) return 0;
    return shares;
  }

  getProbability(contract: LiteMarket) {
    if (contract.mechanism === 'cpmm-1') {
      return this.getCpmmProbability(contract.pool, contract.p);
    }
    throw new Error('DPM probability not supported.');
  }

  getCpmmProbability(pool: { [outcome: string]: number }, p: number) {
    const { YES, NO } = pool;
    return (p * NO) / ((1 - p) * YES + p * NO);
  }

  calculateFixedMktPayout(contract: LiteMarket, bet: Bet) {
    const { resolutionProbability } = contract;
    const p = resolutionProbability !== undefined ? resolutionProbability : this.getProbability(contract);

    const { outcome, shares } = bet;

    const betP = outcome === 'YES' ? p : 1 - p;

    return betP * shares;
  }

  resolvedPayout(contract: LiteMarket, bet: Bet) {
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
        profitById[bet.id] = this.resolvedPayout(this.data, bet) - bet.amount;
      }
    }

    const openBets = bets.filter((bet) => !bet.isSold && !bet.sale);
    const betsByUser = groupBy(openBets, 'userId');
    const userProfits = mapValues(betsByUser, (bets) => sumBy(bets, (bet) => this.resolvedPayout(this.data, bet) - bet.amount));

    const userObjectProfits: { user: LiteUser; profit: number }[] = [];

    for (const userID of Object.keys(userProfits)) {
      const user = await Manifold.getUserByID(userID);
      userObjectProfits.push({ user: user, profit: userProfits[userID] });
    }
    return userObjectProfits;
  }

  /**
   * @deprecated The market ID should be used instead of the slug wherever possible
   */
  public getSlug() {
    const url = this.data.url;
    const slug = url.substring(url.lastIndexOf('/') + 1);
    return slug;
  }

  private addBet(bet: FullBet) {
    if (this.bets.length >= 3) {
      this.bets.shift();
    }
    this.bets.push(bet);

    this.app.io.to(this.twitchChannel).emit(Packet.ADD_BETS, [bet]);

    log.info(
      `${bet.username} ${bet.amount > 0 ? 'bought' : 'sold'} M$${Math.floor(Math.abs(bet.amount)).toFixed(0)} of ${bet.outcome} at ${(100 * bet.probAfter).toFixed(0)}% ${moment(
        bet.createdTime
      ).fromNow()}`
    );
  }

  private async getDisplayNameForUserID(userID: string) {
    if (this.userIdToNameMap[userID]) {
      return this.userIdToNameMap[userID];
    }
    let name: string;
    try {
      const user = await this.app.firestore.getUserForManifoldID(userID);
      name = user.data.twitchLogin;
    } catch {
      const user = await Manifold.getUserByID(userID);
      name = user.name;
    }
    log.info(`Loaded user ${name}`);
    return (this.userIdToNameMap[userID] = name);
  }

  async pollBets(numBetsToLoad = 10) {
    try {
      const bets = await Manifold.getLatestMarketBets(this.getSlug(), numBetsToLoad);
      if (bets.length == 0) return;

      const newBets: Bet[] = [];

      let foundPreviouslyLoadedBet = this.latestLoadedBetId == null;
      for (const bet of bets) {
        try {
          if (bet.id == this.latestLoadedBetId) {
            foundPreviouslyLoadedBet = true;
            break;
          }

          newBets.push(bet);
        } catch (e) {
          // Empty
        }
      }
      newBets.reverse();
      for (const bet of newBets) {
        if (bet.isRedemption) continue;
        const username = await this.getDisplayNameForUserID(bet.userId);
        const fullBet: FullBet = {
          ...bet,
          username,
        };
        this.addBet(fullBet);
      }
      if (!foundPreviouslyLoadedBet) {
        log.info('Failed to find previously loaded bet. Expanding search...');
        this.pollBets(10); //!!! Need to test
      }
      this.latestLoadedBetId = bets[0].id;
    } catch (e) {
      log.trace(e);
    }
  }

  async detectResolution() {
    const liteMarket = await Manifold.getLiteMarketByID(this.data.id);
    return liteMarket.isResolved;
  }
}
