import { ChatUserstate, Client } from "tmi.js";
import App from "./app";
import fs from "fs";
import { InsufficientBalanceException, UserNotRegisteredException } from "./exceptions";
import { ResolutionOutcome, LiteMarket } from "common/manifold-defs";
import log from "./logger";

// const regexpCommand = new RegExp(/!([a-zA-Z0-9]+)\s?(\S*)?/);
const regexpCommand = new RegExp(/!([a-zA-Z0-9]+)\s?([\s\S]*)?/); // Support for multi-argument commands

const BOT_USERNAME = "manifoldbot";

const signupLink = "http://localhost:3000/profile"; //!!!

const MSG_NOT_ENOUGH_MANA_CREATE_MARKET = (username: string, balance: number) => `Sorry ${username}, you don't have enough Mana (M$${Math.floor(balance).toFixed(0)}/M$100) to create a market LUL`;
const MSG_NOT_ENOUGH_MANA_PLACE_BET = (username: string) => `Sorry ${username}, you don't have enough Mana to place that bet`;
const MSG_SIGNUP = (username: string) => `Hello ${username}! Click here to play: ${signupLink}!`;
const MSG_HELP = () => `Check out the full list of commands and how to play here: ${signupLink}`;
const MSG_RESOLVED = (outcome: ResolutionOutcome) => `The market has resolved to ${outcome}! The top 10 bettors are name (+#), name2…`; //!!! Needs some work
const MSG_BALANCE = (username: string, balance: number) => `${username} currently has M$${Math.floor(balance).toFixed(0)}`;
const MSG_MARKET_CREATED = (username: string, question: string) => `${username}'s market '${question}' has been created!`;
const MSG_COMMAND_FAILED = (username: string, message: string) => `Sorry ${username} but that command failed: ${message}`;

export default class TwitchBot {
    private readonly app: App;

    private readonly client: Client;

    constructor(app: App) {
        this.app = app;

        const commands: { [k: string]: (username: string, tags: ChatUserstate, args: string[], client: Client, channel: string) => void } = {
            commands: (username: string, tags: ChatUserstate, args: string[], client: Client, channel: string) => {
                client.say(channel, MSG_HELP());
            },
            help: (username: string, tags: ChatUserstate, args: string[], client: Client, channel: string) => {
                client.say(channel, MSG_HELP());
            },
            bet: (username: string, tags: ChatUserstate, args: string[], client: Client, channel: string) => { // Handle bet commands in opposing order i.e. bet 50 yes
                if (args.length < 1) return;
                let arg = args[0].toLocaleLowerCase();
                if (args.length >= 2) {
                    arg += args[1].toLocaleLowerCase();
                }
                let yes: boolean;
                if (arg.startsWith("yes")) {
                    yes = true;
                    arg = arg.substring(3);
                } else if (arg.startsWith("no")) {
                    yes = false;
                    arg = arg.substring(2);
                } else {
                    return;
                }

                const value = Number.parseInt(arg);
                if (isNaN(value)) {
                    return;
                }

                app.placeBet(username, value, yes).catch((e) => {
                    if (e instanceof UserNotRegisteredException) {
                        client.say(channel, MSG_SIGNUP(username));
                    } else if (e instanceof InsufficientBalanceException) {
                        client.say(channel, MSG_NOT_ENOUGH_MANA_PLACE_BET(username));
                    } else {
                        log.trace(e);
                    }
                });
            },
            sell: (username: string, tags: ChatUserstate, args: string[], client: Client, channel: string) => {
                app.sellAllShares(username).catch((e) => {
                    if (e instanceof UserNotRegisteredException) {
                        client.say(channel, MSG_SIGNUP(username));
                    } else {
                        client.say(channel, MSG_COMMAND_FAILED(username, e.message));
                        log.trace(e);
                    }
                });
            },
            allin: (username: string, tags: ChatUserstate, args: string[], client: Client, channel: string) => {
                if (args.length < 1) return;
                const arg = args[0].toLocaleLowerCase();
                let yes: boolean;
                if (arg == "yes") {
                    yes = true;
                } else if (arg == "no") {
                    yes = false;
                } else {
                    return;
                }
                app.allIn(username, yes).catch((e) => {
                    if (e instanceof UserNotRegisteredException) {
                        client.say(channel, MSG_SIGNUP(username));
                    } else {
                        client.say(channel, MSG_COMMAND_FAILED(username, e.message));
                        log.trace(e);
                    }
                });
            },
            balance: (username: string, tags: ChatUserstate, args: string[], client: Client, channel: string) => {
                app.getUserBalance(username)
                    .then((balance) => {
                        client.say(channel, MSG_BALANCE(username, balance));
                    })
                    .catch((e) => {
                        if (e instanceof UserNotRegisteredException) {
                            client.say(channel, MSG_SIGNUP(username));
                        } else {
                            client.say(channel, MSG_COMMAND_FAILED(username, e.message));
                            log.trace(e);
                        }
                    });
            },
            signup: (username: string, tags: ChatUserstate, args: string[], client: Client, channel: string) => {
                client.say(channel, MSG_SIGNUP(username));
            },
            // Moderator commands:
            create: (username: string, tags: ChatUserstate, args: string[], client: Client, channel: string) => {
                if (!this.isAllowedAdminCommand(tags)) {
                    log.warn(`User ${username} tried to use create without permission.`);
                    return;
                }
                if (args.length < 1) return;
                let question = "";
                for (const arg of args) {
                    question += arg + " ";
                }
                question = question.trim();

                app.createBinaryMarket(username, question, null, 50)
                    .then((market: LiteMarket) => {
                        console.log("Market ID: " + market.id);
                        client.say(channel, MSG_MARKET_CREATED(username, question));
                    })
                    .catch((e) => {
                        if (e instanceof InsufficientBalanceException) {
                            app.getUserBalance(username).then((balance) => {
                                client.say(channel, MSG_NOT_ENOUGH_MANA_CREATE_MARKET(username, balance));
                            });
                        } else {
                            client.say(channel, MSG_COMMAND_FAILED(username, e.message));
                            log.trace(e);
                        }
                    });
            },
            resolve: (username: string, tags: ChatUserstate, args: string[], client: Client, channel: string) => {
                if (!this.isAllowedAdminCommand(tags)) {
                    log.warn(`User ${username} tried to use resolve without permission.`);
                    return;
                }
                if (args.length < 1) return;
                const resolutionString = args[0].toLocaleUpperCase();
                let outcome: ResolutionOutcome = ResolutionOutcome[resolutionString];
                if (resolutionString == "NA") {
                    outcome = ResolutionOutcome.CANCEL;
                }
                if (!outcome || outcome == ResolutionOutcome.PROB) {
                    log.info("Resolve command failed due to outcome: " + outcome);
                    return;
                }
                app.resolveBinaryMarket(username, outcome)
                    .then(() => {
                        this.client.say(channel, MSG_RESOLVED(outcome));
                    })
                    .catch((e) => {
                        client.say(channel, MSG_COMMAND_FAILED(username, e.message));
                        log.trace(e);
                    }); //!!!
            },
        };

        this.client = new Client({
            options: { debug: true },
            connection: {
                secure: true,
                reconnect: true,
            },
            identity: {
                username: BOT_USERNAME,
                password: process.env.TWITCH_OAUTH_TOKEN,
            },
            channels: [...this.getRegisteredChannelListFromFile()],
        });

        this.client.on("message", (channel, tags, message, self) => {
            if (self) return; // Ignore echoed messages.

            const groups = message.match(regexpCommand);

            if (!groups) return;
            if (groups.length < 2) return;

            const command: string = groups[1].toLocaleLowerCase();
            const args: string[] = groups[2]?.split(" ") || [];

            const commandObject = commands[command as keyof typeof commands]; //!!! Use display name
            if (!commandObject) {
                return;
            }

            if (tags.username) {
                commandObject(tags.username, tags, args, this.client, channel);
            }
        });
    }

    private isAllowedAdminCommand(tags: ChatUserstate): boolean {
        if (!tags || !tags.badges) {
            return false;
        }
        if (tags.badges.moderator || tags.badges.admin || tags.badges.global_mod || tags.badges.broadcaster) {
            return true;
        }
    }

    public connect() {
        this.client.connect();
    }

    private getRegisteredChannelListFromFile(): string[] {
        try {
            const rawChannelListData = fs.readFileSync("data/channels.json");
            const rawDataString = rawChannelListData.toString();
            if (rawDataString.length > 0) {
                const data = JSON.parse(rawDataString);
                return data.channels;
            }
        } catch (e) {
            return [];
        }
    }

    private saveRegisteredChannelListToFile(): void {
        fs.writeFileSync("data/channels.json", JSON.stringify({ channels: this.client.getChannels() }));
    }

    public joinChannel(channelName: string) {
        if (this.client.getChannels().indexOf(`#${channelName}`) >= 0) {
            throw new Error(`Bot already added to channel '${channelName}'`);
        }
        this.client
            .join("#" + channelName)
            .then(() => {
                this.client.say(channelName, "/color BlueViolet");

                let message = "Hey there! I am the Manifold Markets chat bot.";
                if (!this.client.isMod(channelName, BOT_USERNAME)) {
                    message += " Please /mod me so I can do my job.";
                }
                this.client.say(channelName, message);

                this.saveRegisteredChannelListToFile();
            })
            .catch((e) => log.trace(e));
    }

    public leaveChannel(channelName: string) {
        if (this.client.getChannels().indexOf(`#${channelName}`) >= 0) {
            this.client.say(channelName, "Goodbye cruel world.");
            this.client.part(channelName).then(() => {
                this.saveRegisteredChannelListToFile();
            });
        } else {
            throw new Error(`Bot not in channel '${channelName}'`);
        }
    }
}
