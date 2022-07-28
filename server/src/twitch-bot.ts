import { Client } from "tmi.js";
import fetch from "node-fetch";
import * as ManifoldAPI from "common/manifold-defs";
import App from "./app";
import fs from "fs";

const APIBase = "https://dev.manifold.markets/api/v0/";
const regexpCommand = new RegExp(/!([a-zA-Z0-9]+)\s?(\S*)?/);
const signupLink = "manifold.markets/signup";///!!!

const MSG_NOT_ENOUGH_MANA_CREATE_MARKET = (balance: number) => `Sorry name, you don’t have enough Mana (M$${balance}/M$100) to create a market LUL`;
const MSG_SIGNUP = (username: string) => `Hello ${username}! Click here to play: ${signupLink}!`;
const MSG_HELP = () => `Check out the full list of commands and how to play here: ${signupLink}`;
const MSG_RESOLVED = (yes: boolean) => `The market has resolved to ${yes ? "YES" : "NO"}! The top 10 bettors are name (+#), name2…`; //!!! Needs some work

export default class TwitchBot {
    readonly app: App;

    readonly client: Client;

    constructor(app: App) {
        this.app = app;

        const commands = {
            commands: {
                response: (username: string, argument: string, client: Client, channel: string) => {
                    client.say(channel, MSG_HELP());
                }
            },
            help: {
                response: (username: string, argument: string, client: Client, channel: string) => {
                    client.say(channel, MSG_HELP());
                }
            },
            bet: {
                response: (username: string, argument: string, client: Client, channel: string) => {
                    if (argument.startsWith("yes")) {
                        try {
                            const value = Number.parseInt(argument.substring(3));
                            if (isNaN(value)) {
                                return;
                            }

                            app.placeBet(username, value, true).catch(e => {
                                client.say(channel, MSG_SIGNUP(username));
                            });
                        } catch (e) {
                            console.trace(e);
                        }
                    } else if (argument.startsWith("no")) {
                        try {
                            const value = Number.parseInt(argument.substring(2));
                            if (isNaN(value)) {
                                return;
                            }

                            app.placeBet(username, value, false).catch(e => {
                                client.say(channel, MSG_SIGNUP(username));
                            });
                        } catch (e) {
                            console.trace(e);
                        }
                    }
                },
            },
            sell: {
                response: (username: string, argument: string, client: Client, channel: string) => {
                    try {
                        app.sellAllShares(username);
                    }
                    catch (e) {
                        client.say(channel, MSG_SIGNUP(username));
                    }
                },
            },
            balance: {
                response: (username: string, argument: string, client: Client, channel: string) => {
                    fetch(`${APIBase}user/${app.userList[username].manifoldUsername}`) //!!! Catch missing username
                    .then(r => <Promise<ManifoldAPI.LiteUser>> r.json())
                    .then(r => {
                        console.log(r);
                        client.say(channel, `@${username} currently has ${Math.floor(r.balance).toFixed(0)} mana.`);
                    })
                }
            },
            signup: {
                response: (username: string, argument: string, client: Client, channel: string) => {
                    client.say(channel, MSG_SIGNUP(username));
                }
            }
        };

        this.client = new Client({
            options: { debug: true },
            connection: {
                secure: true,
                reconnect: true,
            },
            identity: {
                username: "manifoldbot",
                password: process.env.TWITCH_OAUTH_TOKEN,
            },
            channels: [
                ...this.getRegisteredChannelListFromFile()
            ]
        });
        
        this.client.connect();

        this.client.on("message", (channel, tags, message, self) => {
            if (self) return; // Ignore echoed messages.

            const found = message.match(regexpCommand);

            if (!found) return;
            if (found.length < 2) return;

            const command: string = found[1];
            const argument: string = found[2];

            const commandObject = commands[command as keyof typeof commands];
            if (!commandObject) {
                return;
            }
            const response: (a: string, b: string, c: Client, d: string) => void = commandObject.response;

            if (tags.username) {
                response(tags.username, argument, this.client, channel);
            }
        });
    }

    private getRegisteredChannelListFromFile(): string[] {
        try {
            const rawChannelListData = fs.readFileSync("data/channels.json");
            const rawDataString = rawChannelListData.toString();
            if (rawDataString.length > 0) {
                const data = JSON.parse(rawDataString);
                return data.channels;
                // if (data.version === USER_FILE_GUID) { //!!!
                //     this.userList = data.userData;
                // }
                // else {
                //     console.error("User data file version mismatch. Data not loaded.");
                // }
            }
        }
        catch (e) {
            return [];
        }
    }

    private saveRegisteredChannelListToFile(): void {
        fs.writeFileSync("data/channels.json", JSON.stringify({channels: this.client.getChannels()}));
    }

    public joinChannel(channelName: string) {
        if (this.client.getChannels().indexOf(`#${channelName}`) >= 0) {
            throw new Error(`Bot already added to channel '${channelName}'`);
        }
        this.client.join(channelName).then(() => {
            this.client.say(channelName, "/color BlueViolet");
            this.client.say(channelName, "Hey there! I am the Manifold Markets chat bot.");

            this.saveRegisteredChannelListToFile();
        });
    }

    public leaveChannel(channelName: string) {
        if (this.client.getChannels().indexOf(`#${channelName}`) >= 0) {
            this.client.say(channelName, "Goodbye cruel world.");
            this.client.part(channelName).then(() => {
                this.saveRegisteredChannelListToFile();
            });
        }
        else {
            throw new Error(`Bot not in channel '${channelName}'`);
        }
    }
}