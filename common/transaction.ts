import moment from "moment";
import Manifold from "./manifold-defs";

export type FullBet = Manifold.Bet & {
    username: string;
};

export class Transaction {
    name: string;
    amount: number;
    yes: boolean;
    timestamp: number;
    displayText: string = "";

    constructor(name: string, amount: number, yes: boolean, timestamp: number) {
        this.name = name;
        this.amount = amount;
        this.yes = yes;
        this.timestamp = timestamp;

        this.computeDisplayText();
    }

    private computeDisplayText() {
        let t = {
            outcome: "NO",
            probBefore: 1
        }
        this.displayText = `${this.name} ${this.amount > 0 ? "bought" : "sold"} M$${Math.floor(Math.abs(this.amount)).toFixed(0)} of ${t.outcome} at ${(100 * t.probBefore).toFixed(0)}% ${moment(this.timestamp).fromNow()}`;
    }
}