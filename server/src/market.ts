import { LiteMarket, Bet, LiteUser, ResolutionOutcome, FullMarket } from "common/manifold-defs";
import { FullBet } from "common/transaction";
import App from "./app";
import log from "./logger";
import * as Manifold from "./manifold-api";
import moment from "moment";
import lodash from "lodash";
import { Socket } from "socket.io";
import { ADD_BETS } from "common/packet-ids";
import { PacketResolved } from "common/packets";
const { keyBy, mapValues, sumBy, groupBy } = lodash;
import * as Packet from "common/packet-ids";
import _ from "lodash";

export class Market {
    private readonly app: App;
    readonly bets: FullBet[] = [];
    private latestLoadedBetId: string = null;

    data: FullMarket;
    pendingBets: Bet[] = [];
    pendingFetches = {};
    userIdToNameMap: Record<string, string> = {}; //!!! This should really be shared between markets

    overlaySockets: Socket[] = [];

    constructor(app: App, data: FullMarket) {
        this.app = app;
        this.data = data;

        for (const bet of this.data.bets) {
            // const fullBet: FullBet = {
            //     ...bet,
            //     username: "Bob", //!!!
            // };
            // this.bets.push(fullBet);

            this.pendingBets.push(bet);
            this.loadUser(bet.userId);
        }

        const pollTask = async () => {
            let continuePolling = true;
            try {
                this.pollBets();
                if (await this.detectResolution()) {
                    this.data = await Manifold.getFullMarketByID(this.data.id);

                    continuePolling = false;
                    const winners = await this.calculateWinners();

                    const channel = this.app.getChannelForMarketID(this.data.id);
                    this.app.bot.resolveMarket(channel, this.data.resolution == "YES" ? ResolutionOutcome.YES : ResolutionOutcome.NO, winners); //!!! Proper outcomes

                    const uniqueTraderCount = _(this.data.bets).groupBy("userId").size();

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
                    const sortFunction = (a: Result, b: Result) => Math.abs(a.profit) > Math.abs(b.profit) ? 1 : -1;
                    topWinners.sort(sortFunction);
                    topLosers.sort(sortFunction);

                    const resolveData: PacketResolved = {
                        outcome: this.data.resolution === "YES" ? "YES" : this.data.resolution === "NO" ? "NO" : "NA", //!!! Proper outcomes
                        uniqueTraders: uniqueTraderCount,
                        topWinners: topWinners,
                        topLosers: topLosers,
                    };
                    for (const packet of this.overlaySockets) {
                        packet.emit(Packet.RESOLVE, resolveData); //!!!
                    }
                }
            } catch (e) {
                log.trace(e);
            } finally {
                if (continuePolling) {
                    setTimeout(pollTask, 1000);
                }
            }
        };
        setTimeout(pollTask, 1000);
    }

    calculateFixedPayout(contract: LiteMarket, bet: Bet, outcome: string) {
        if (outcome === "CANCEL") return this.calculateFixedCancelPayout(bet);
        if (outcome === "MKT") return this.calculateFixedMktPayout(contract, bet);

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
        if (contract.mechanism === "cpmm-1") {
            return this.getCpmmProbability(contract.pool, contract.p);
        }
        throw new Error("DPM probability not supported.");
    }

    getCpmmProbability(pool: { [outcome: string]: number }, p: number) {
        const { YES, NO } = pool;
        return (p * NO) / ((1 - p) * YES + p * NO);
    }

    calculateFixedMktPayout(contract: LiteMarket, bet: Bet) {
        const { resolutionProbability } = contract;
        const p = resolutionProbability !== undefined ? resolutionProbability : this.getProbability(contract);

        const { outcome, shares } = bet;

        const betP = outcome === "YES" ? p : 1 - p;

        return betP * shares;
    }

    resolvedPayout(contract: LiteMarket, bet: Bet) {
        const outcome = contract.resolution;
        if (!outcome) throw new Error("Contract not resolved");

        if (contract.mechanism === "cpmm-1" && (contract.outcomeType === "BINARY" || contract.outcomeType === "PSEUDO_NUMERIC")) {
            return this.calculateFixedPayout(contract, bet, outcome);
        }
        throw new Error("DPM payout not supported."); //this.calculateDpmPayout(contract, bet, outcome);
    }

    async calculateWinners(): Promise<{ user: LiteUser; profit: number }[]> {
        const bets = this.data.bets;

        // If 'id2' is the sale of 'id1', both are logged with (id2 - id1) of profit
        // Otherwise, we record the profit at resolution time
        const profitById: Record<string, number> = {};
        const betsById = keyBy(bets, "id");
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
        const betsByUser = groupBy(openBets, "userId");
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
        const slug = url.substring(url.lastIndexOf("/") + 1);
        return slug;
    }

    private addBet(bet: FullBet) {
        if (this.bets.length >= 3) {
            this.bets.shift();
        }
        this.bets.push(bet);
        // this.io.emit(Packet.ADD_BETS, [bet]); //!!!

        for (const socket of this.overlaySockets) {
            if (!socket.disconnected) {
                //!!!
                socket.emit(ADD_BETS, [bet]);
            }
        }

        log.info(
            `${bet.username} ${bet.amount > 0 ? "bought" : "sold"} M$${Math.floor(Math.abs(bet.amount)).toFixed(0)} of ${bet.outcome} at ${(100 * bet.probAfter).toFixed(0)}% ${moment(
                bet.createdTime
            ).fromNow()}`
        );
    }

    private async loadUser(userId: string) {
        if (this.pendingFetches[userId]) return;

        this.pendingFetches[userId] = userId;
        try {
            const user = await Manifold.getUserByID(userId);
            log.info(`Loaded user ${user.name}.`);
            delete this.pendingFetches[userId];
            this.userIdToNameMap[user.id] = user.name;

            const betsToRemove = [];
            while (this.pendingBets.length) {
                //!!! This incorrectly re-orders the bets
                const bet = this.pendingBets[0];
                if (user.id == bet.userId) {
                    const fullBet: FullBet = {
                        ...bet,
                        username: user.name,
                    };
                    this.addBet(fullBet);
                    betsToRemove.push(bet);
                }
                this.pendingBets.splice(0, 1);
            }
            // this.pendingBets = this.pendingBets.filter((e) => {
            //     return betsToRemove.indexOf(e) < 0;
            // });
        } catch (e) {
            log.trace(e);
        }
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
                const username = this.userIdToNameMap[bet.userId];
                if (!bet.isRedemption) {
                    if (!username) {
                        this.loadUser(bet.userId);
                        this.pendingBets.push(bet);
                    } else {
                        const fullBet: FullBet = {
                            ...bet,
                            username: username,
                        };
                        this.addBet(fullBet);
                    }
                }
            }
            if (!foundPreviouslyLoadedBet) {
                log.info("Failed to find previously loaded bet. Expanding search...");
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
