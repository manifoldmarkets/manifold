export default class Transaction {
    name: string;
    amount: number;
    yes: boolean;
    timestamp: number;

    constructor(name: string, amount: number, yes: boolean, timestamp: number) {
        this.name = name;
        this.amount = amount;
        this.yes = yes;
        this.timestamp = timestamp;
    }
}