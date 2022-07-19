import express, { Express } from "express";
import { AddressInfo } from "net";
import fetch from "node-fetch";
import { Client } from "tmi.js";
import moment from "moment";

import { Bet, LiteUser } from "../../common/defs";//"common/defs";
import Transaction from "../../common/transaction";

const APIBase = "https://dev.manifold.markets/api/v0/";

// class Transaction {
//     name: string;
//     amount: number;
//     yes: boolean;
//     timestamp: number;

//     constructor(name: string, amount: number, yes: boolean, timestamp: number) {
//         this.name = name;
//         this.amount = amount;
//         this.yes = yes;
//         this.timestamp = timestamp;
//     }
// }

const regexpCommand = new RegExp(/!([a-zA-Z0-9]+)\s?(\S*)?/);

export default class App {
    readonly app: Express;
    readonly latestTransactions: Transaction[] = [];

    userIdToNameMap: Record<string, string> = {};

    constructor() {
        this.app = express();

        moment.locale("en", {
            relativeTime: {
                future: "in %s",
                past: "%s ago",
                s: "<1m",
                ss: "%ss",
                m: "1m",
                mm: "%dm",
                h: "1h",
                hh: "%dh",
                d: "1d",
                dd: "%dd",
                M: "1m",
                MM: "%dM",
                y: "1y",
                yy: "%dY",
            },
        });

        // Load all users:
        fetch(`${APIBase}users`)
            .then((r) => <Promise<LiteUser[]>>r.json())
            .then((r) => {
                for (const user of r) {
                    this.userIdToNameMap[user.id] = user.name;
                }
                console.log("Loaded users.");
            });
    }

    loadUser(userId: string) {
        fetch(`${APIBase}user/by-id/${userId}`)
            .then((r) => <Promise<LiteUser>>r.json())
            .then((user) => {
                console.log(`Loaded user ${user.name}.`);
                this.userIdToNameMap[user.id] = user.name;
            });
    }

    addTransaction(transaction: Transaction) {
        if (this.latestTransactions.length >= 3) {
            this.latestTransactions.shift();
        }
        this.latestTransactions.push(transaction);
    }

    launch() {
        const commands = {
            help: {
                response: () =>
                    "- !bet yes# - bets on yes (where # is the number of mana bet)\n" +
                    "- !bet no# - bets on no (where # is the number of mana bet)\n" +
                    "- !allin\n" +
                    "- !sell - sells all shares\n" +
                    "- !balance - Manifold Bot replies your balance to you in main chat\n" +
                    "- !help - Manifold Bot sends a DM showing list of commands\n" +
                    "- !signup - Manifold Bot sends a DM explaining how to link accounts and free Mana on sign up.",
            },
            upvote: {
                response: (username: string, argument: string) => `Successfully upvoted ${argument}`,
            },
            bet: {
                response: (username: string, argument: string) => {
                    if (argument.startsWith("yes")) {
                        try {
                            const value = Number.parseInt(argument.substring(3));
                            if (isNaN(value)) {
                                return null; //!!!
                            }
                            this.addTransaction(new Transaction(username, value, true, Date.now()));
                            return ""; //`@${username} has bet ${value} on YES!`;
                        } catch (e) {
                            return null; //!!!
                        }
                    } else if (argument.startsWith("no")) {
                        try {
                            const value = Number.parseInt(argument.substring(2));
                            if (isNaN(value)) {
                                return null; //!!!
                            }
                            this.addTransaction(new Transaction(username, value, false, Date.now()));
                            return ""; //`@${username} has bet ${value} on NO!`;
                        } catch (e) {
                            return null; //!!!
                        }
                    } else {
                        return null; //!!!
                    }
                },
            },
            sell: {
                response: () => `Sold all shares.`,
            },
            balance: {
                response: () => `Your balance is ${0}.`, //!!!
            },
        };

        setInterval(() => {
            const numUsers = 3;
            const marketSlug = "this-is-a-local-market"; //will-elon-musk-buy-twitter-this-yea
            fetch(`${APIBase}bets?market=${marketSlug}&limit=${numUsers}`)
                .then((r) => <Promise<Bet[]>>r.json())
                .then((r) => {
                    this.latestTransactions.splice(0, this.latestTransactions.length);
                    for (let i = 0; i < numUsers; i++) {
                        const t = r[i];
                        try {
                            const amount = t.amount;

                            if (!this.userIdToNameMap[t.userId]) {
                                this.loadUser(t.userId);
                            }

                            const dummyObject: Record<string, string | number> = {};
                            dummyObject["userId"] = t.userId;
                            dummyObject["username"] = this.userIdToNameMap[t.userId];
                            dummyObject["amount"] = amount;
                            dummyObject["outcome"] = t.outcome;

                            console.log(
                                `${this.userIdToNameMap[t.userId]} ${amount > 0 ? "bought" : "sold"} M$${Math.floor(Math.abs(amount)).toFixed(0)} of ${t.outcome} at ${(100 * t.probBefore).toFixed(
                                    0
                                )}% ${moment(t.createdTime).fromNow()}`
                            );

                            if (i < 3) {
                                this.addTransaction(new Transaction(this.userIdToNameMap[t.userId], amount, t.outcome == "YES", t.createdTime));
                            }
                        } catch (e) {
                            // Empty
                        }
                    }
                })
                .catch((e) => console.error(e));
        }, 1000);

        this.app.get("/transactions", (request, response) => {
            response.json(this.latestTransactions);
        });

        const server = this.app.listen(9172, () => {
            const host = (<AddressInfo>server.address()).address;
            const port = (<AddressInfo>server.address()).port;
            console.log("Example app listening at http://%s:%s", host, port);
        });

        const client = new Client({
            options: { debug: true },
            connection: {
                secure: true,
                reconnect: true,
            },
            identity: {
                username: "manifoldbot",
                password: process.env.TWITCH_OAUTH_TOKEN,
            },
            channels: ["philbladen"],
        });

        client.connect();

        client.on("message", (channel, tags, message, self) => {
            if (self) return; // Ignore echoed messages.

            const found = message.match(regexpCommand);
            // console.log(found);
            if (!found) return;
            if (found.length < 2) return;

            const command: string = found[1];
            const argument: string = found[2];

            console.log(`Command: ${command}`);
            const response: (a: string, b: string) => string | null = commands[command as keyof typeof commands].response;
            console.log(response);

            let responseMessage;

            if (tags.username) {
                responseMessage = response(tags.username, argument);
            }

            if (responseMessage) {
                const lines = responseMessage.split("\n");
                console.log(`Responding to command !${command}`);
                for (const line of lines) {
                    client.say(channel, line);
                    // client.whisper(tags.username, line).catch(() => {});
                }
            }
        });

        client.on("whisper", (from, userstate, message, self) => {
            if (self) return;

            console.log("Whisper");
        });

        client.on("connected", () => {
            const options = client.getOptions();
            if (!options.channels) {
                return;
            }
            const channel = options.channels[0];
            client.say(channel, "/clear");
            client.say(channel, "/color BlueViolet");
        });
    }
}
