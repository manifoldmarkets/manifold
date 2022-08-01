import { LiteMarket, Bet } from "common/manifold-defs";
import { FullBet } from "common/transaction";
import App from "./app";
import log from "./logger";
import * as Manifold from "./manifold-api";

export class Market {
    private readonly app: App;

    data: LiteMarket;
    slug: string;

    private latestLoadedBetId: string = null;

    pendingBets: Bet[] = [];

    constructor(app: App, data: LiteMarket, slug: string) {
        this.app = app;
        this.data = data;
        this.slug = slug;

        setInterval(() => this.pollBets(), 1000);
    }

    async pollBets(numBetsToLoad = 10) {
        try {
            const bets = await Manifold.getLatestMarketBets(this.slug, numBetsToLoad);
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
                const username = this.app.userIdToNameMap[bet.userId];
                if (!bet.isRedemption) {
                    if (!username) {
                        this.app.loadUser(bet.userId);
                        this.pendingBets.push(bet);
                    } else {
                        const fullBet: FullBet = {
                            ...bet,
                            username: username,
                        };
                        this.app.addBet(fullBet);
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
}
