import express, { Express } from "express";
import { AddressInfo } from "net";
import fetch from 'node-fetch';
import { Client } from "tmi.js";
import { Bet, LiteUser } from "../../common/defs";
import moment from 'moment';
import Transaction from "../../common/transaction";

const regexpCommand = new RegExp(/!([a-zA-Z0-9]+)\s?(\S*)?/);

export default class App {
    readonly app: Express;
    readonly latestTransactions: Transaction[] = [];

    userIdToNameMap: any = {};

    constructor() {
        this.app = express();

        // Load all users:        
        fetch("https://dev.manifold.markets/api/v0/users")
        .then(r => <Promise<LiteUser[]>> r.json())
        .then(r => {
            for (let user of r) {
                this.userIdToNameMap[user.id] = user.name;
            }
            console.log("Loaded users.");
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
                response: (username: string, argument: string) =>
                    "- !bet yes# - bets on yes (where # is the number of mana bet)\n" +
                    "- !bet no# - bets on no (where # is the number of mana bet)\n" +
                    "- !allin\n" +
                    "- !sell - sells all shares\n" +
                    "- !balance - Manifold Bot replies your balance to you in main chat\n" +
                    "- !help - Manifold Bot sends a DM showing list of commands\n" +
                    "- !signup - Manifold Bot sends a DM explaining how to link accounts and free Mana on sign up.",
            },
            upvote: {
                response: (username: string, argument: string) =>
                    `Successfully upvoted ${argument}`,
            },
            bet: {
                response: (username: string, argument: string) => {
                    if (argument.startsWith("yes")) {
                        try {
                            let value = Number.parseInt(argument.substring(3));
                            if (value == NaN) {
                                return null; //!!!
                            }
                            this.addTransaction(new Transaction(username, value, true, Date.now()));
                            return "";//`@${username} has bet ${value} on YES!`;
                        } catch (e) {
                            return null; //!!!
                        }
                    } else if (argument.startsWith("no")) {
                        try {
                            let value = Number.parseInt(argument.substring(2));
                            if (value == NaN) {
                                return null; //!!!
                            }
                            this.addTransaction(new Transaction(username, value, false, Date.now()));
                            return "";//`@${username} has bet ${value} on NO!`;
                        } catch (e) {
                            return null; //!!!
                        }
                    } else {
                        return null; //!!!
                    }
                },
            },
            sell: {
                response: (username: string, argument: string) => `Sold all shares.`,
            },
            balance: {
                response: (username: string, argument: string) =>
                    `Your balance is ${0}.`, //!!!
            },
        };

        setInterval(() => {
            const numUsers = 3;
            const useDevBackend: boolean = true;
            const marketSlug = "this-is-a-local-market"; //will-elon-musk-buy-twitter-this-yea
            fetch(`https://${useDevBackend ? "dev." : ""}manifold.markets/api/v0/bets?market=${marketSlug}&limit=${numUsers}`)
            .then(r => <Promise<Bet[]>> r.json())
            .then(r => {
                // console.log(r);
                // r.reverse();
                // let date = new Date();
        
                this.latestTransactions.splice(0, this.latestTransactions.length);
                for (let i = 0; i < numUsers; i++) {
                    let t = r[i];
                    try 
                    {
                        const amount = t.amount;

                        let dummyObject: any = {};
                        dummyObject["userId"] = t.userId;
                        dummyObject["username"] = this.userIdToNameMap[t.userId];
                        dummyObject["amount"] = amount;
                        dummyObject["outcome"] = t.outcome;
                        // console.log(dummyObject);

                        
                        console.log(`${this.userIdToNameMap[t.userId]} ${amount > 0 ? "bought" : "sold"} M$${Math.floor(Math.abs(amount)).toFixed(0)} of ${t.outcome} at ${(100 * t.probBefore).toFixed(0)}% ${moment(t.createdTime).fromNow()}`);
                        // console.log(`${this.userIdToNameMap[t.userId]} ${t.orderAmount > 0 ? "bought" : "sold"} M$${Math.abs(t.orderAmount).toFixed(0)} of ${t.outcome} ${new Date(msAgo).getUTCHours()} hours ago`);
                        
                        if (i < 3) {
                            this.addTransaction(new Transaction(this.userIdToNameMap[t.userId], amount, t.outcome == "YES", t.createdTime));
                        }
                        // date.setUTCMilliseconds(t.createdTime);
                        // console.log(new Date(t.createdTime).toTimeString());
                    }
                    catch (e) {
                        
                    }
                }
            })
            .catch(e => console.error(e));
        }, 1000);
        
        this.app.get("/transactions", (request, response) => {
            response.json(this.latestTransactions);
        });
        
        let server = this.app.listen(9172, () => {
            let host = (<AddressInfo> server.address()).address;
            let port = (<AddressInfo> server.address()).port;
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
        
            let command: string = found[1];
            let argument: string = found[2];
        
            console.log(`Command: ${command}`);
            const response: any =
                commands[command as keyof typeof commands].response || {};
            console.log(response);
        
            let responseMessage = response;
        
            if (typeof responseMessage === "function") {
                responseMessage = response(tags.username, argument);
            }
        
            if (responseMessage) {
                let lines = responseMessage.split("\n");
                console.log(`Responding to command !${command}`);
                for (let line of lines) {
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
            let options: any = client.getOptions();
            let channel = options.channels[0];
            client.say(channel, "/clear");
            client.say(channel, "/color BlueViolet");
        });
    }
}