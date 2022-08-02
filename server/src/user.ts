import * as ManifoldAPI from "common/manifold-defs";
import { Response } from "node-fetch";
import * as Manifold from "./manifold-api";

export default class User {
    twitchLogin: string;
    twitchDisplayName: string;
    manifoldUsername: string;
    APIKey: string;

    constructor(twitchLogin: string, manifoldUsername: string, APIKey: string) {
        this.twitchLogin = twitchLogin;
        this.manifoldUsername = manifoldUsername;
        this.APIKey = APIKey;
    }

    public async getBalance(): Promise<number> {
        return (await Manifold.getUserByManifoldUsername(this.manifoldUsername)).balance;
    }

    public async getStakeInMarket_shares(marketSlug: string): Promise<{ shares: number; outcome: "YES" | "NO" }> {
        return Manifold.getUsersStakeInMarket_shares(marketSlug, this.manifoldUsername);
    }

    public async allIn(marketID: string, yes: boolean): Promise<Response> {
        return this.placeBet(marketID, Math.floor(await this.getBalance()), yes);
    }

    async sellAllShares(marketID: string): Promise<Response> {
        return Manifold.sellShares(marketID, this.APIKey, "YES");
    }

    public async createBinaryMarket(question: string, description: string, initialProb_percent: number): Promise<ManifoldAPI.LiteMarket> {
        return Manifold.createBinaryMarket(this.APIKey, question, description, initialProb_percent);
    }

    public async resolveBinaryMarket(marketID: string, outcome: ManifoldAPI.ResolutionOutcome) {
        return Manifold.resolveBinaryMarket(marketID, this.APIKey, outcome);
    }

    public async placeBet(marketID: string, amount: number, yes: boolean): Promise<Response> {
        return Manifold.placeBet(marketID, this.APIKey, amount, yes ? "YES" : "NO");
    }
}