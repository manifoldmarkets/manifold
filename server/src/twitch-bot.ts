import { Client } from "tmi.js";
import App from "./app";
import fs from "fs";
import { InsufficientBalanceException, UserNotRegisteredException } from "./exceptions";

const regexpCommand = new RegExp(/!([a-zA-Z0-9]+)\s?(\S*)?/);

const BOT_USERNAME = "manifoldbot";

const signupLink = "manifold.markets/signup"; ///!!!

const MSG_NOT_ENOUGH_MANA_CREATE_MARKET = (username: string, balance: number) => `Sorry ${username}, you don't have enough Mana (M$${balance}/M$100) to create a market LUL`;
const MSG_NOT_ENOUGH_MANA_PLACE_BET = (username: string) => `Sorry ${username}, you don't have enough Mana to place that bet`;
const MSG_SIGNUP = (username: string) => `Hello ${username}! Click here to play: ${signupLink}!`;
const MSG_HELP = () => `Check out the full list of commands and how to play here: ${signupLink}`;
const MSG_RESOLVED = (yes: boolean) => `The market has resolved to ${yes ? "YES" : "NO"}! The top 10 bettors are name (+#), name2…`; //!!! Needs some work
const MSG_BALANCE = (username: string, balance: number) => `${username} currently has ${Math.floor(balance).toFixed(0)} mana`;

export default class TwitchBot {
    private readonly app: App;

    private readonly client: Client;

    constructor(app: App) {
        this.app = app;

        const commands: { [k: string]: (username: string, argument: string, client: Client, channel: string) => void } = {
            commands: (username: string, argument: string, client: Client, channel: string) => {
                client.say(channel, MSG_HELP());
            },
            help: (username: string, argument: string, client: Client, channel: string) => {
                client.say(channel, MSG_HELP());
            },
            bet: (username: string, argument: string, client: Client, channel: string) => {
                let yes: boolean;
                if (argument.startsWith("yes")) {
                    yes = true;
                    argument = argument.substring(3);
                } else if (argument.startsWith("no")) {
                    yes = false;
                    argument = argument.substring(2);
                } else {
                    return;
                }

                const value = Number.parseInt(argument);
                if (isNaN(value)) {
                    return;
                }

                app.placeBet(username, value, yes).catch(e => {
                    if (e instanceof UserNotRegisteredException) {
                        client.say(channel, MSG_SIGNUP(username));
                    } else if (e instanceof InsufficientBalanceException) {
                        client.say(channel, MSG_NOT_ENOUGH_MANA_PLACE_BET(username));
                    } else {
                        console.trace(e);
                    }
                });
            },
            sell: (username: string, argument: string, client: Client, channel: string) => {
                app.sellAllShares(username).catch(e => {
                    if (e instanceof UserNotRegisteredException) {
                        client.say(channel, MSG_SIGNUP(username));
                    } else {
                        console.trace(e);
                    }
                });
            },
            allin: (username: string, argument: string, client: Client, channel: string) => {
                if (!argument) {
                    return;
                }
                argument = argument.toLocaleLowerCase();
                let yes;
                if (argument == "yes") {
                    yes = true;
                } else if (argument == "no") {
                    yes = false;
                } else {
                    return;
                }
                app.allIn(username, yes)
                    .catch(e => {
                        if (e instanceof UserNotRegisteredException) {
                            client.say(channel, MSG_SIGNUP(username));
                        } else {
                            console.trace(e);
                        }
                    });
            },
            balance: (username: string, argument: string, client: Client, channel: string) => {
                app.getUserBalance(username).then((balance) => {
                    client.say(channel, MSG_BALANCE(username, balance));
                });
            },
            signup: (username: string, argument: string, client: Client, channel: string) => {
                client.say(channel, MSG_SIGNUP(username));
            },
            resolve: (username: string, argument: string, client: Client, channel: string) => {
                this.resolveMarket(true); //!!!
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

            message = message.toLocaleLowerCase();

            const found = message.match(regexpCommand);

            if (!found) return;
            if (found.length < 2) return;

            const command: string = found[1];
            const argument: string = found[2];

            const commandObject = commands[command as keyof typeof commands];
            if (!commandObject) {
                return;
            }

            if (tags.username) {
                commandObject(tags.username, argument, this.client, channel);
            }
        });
    }

    public resolveMarket(yes: boolean) {
        //!!! Which channel?
        this.client.say(this.client.getChannels()[0], MSG_RESOLVED(yes));
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
            .catch((e) => console.trace(e));
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
