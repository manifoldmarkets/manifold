import express, { Express } from "express";
import { AddressInfo } from "net";
import fetch from "node-fetch";
import moment from "moment";
import { Server } from "socket.io";
import http from "http";
import fs from "fs";
import crypto from "crypto";
import cors from "cors";

import * as ManifoldAPI from "common/manifold-defs";
import * as Manifold from "./manifold-api";
import * as Twitch from "./twitch-api";
import { FullBet } from "common/transaction";
import * as Packet from "common/packet-ids";
import TwitchBot from "./twitch-bot";
import { getParamsFromURL } from "common/utils-node";
import { UserNotRegisteredException } from "./exceptions";
import log from "./logger";
import User from "./user";

const APIBase = "https://dev.manifold.markets/api/v0/";

const USER_FILE_GUID = "5481a349-20d3-4a85-a6e1-b7831c2f21e4"; // 30/07/2022

export default class App {
    private readonly app: Express;
    private readonly latestBets: FullBet[] = [];
    private readonly io: Server;

    private bot: TwitchBot;

    private userList: User[] = [];

    private linksInProgress: { [sessionToken: string]: { manifoldUsername: string; apiKey: string } } = {};

    selectedMarketSlug = "";

    selectedMarketMap: { [twitchChannel: string]: { marketID: string } } = {};

    pendingBets: ManifoldAPI.Bet[] = [];
    pendingFetches = {};

    userIdToNameMap: Record<string, string> = {};

    constructor() {
        this.app = express();
        this.app.use(cors());
        this.app.use(express.json());

        this.bot = new TwitchBot(this);

        const server = http.createServer(this.app);
        this.io = new Server(server);
        this.io.on("connection", (socket) => {
            socket.emit(Packet.CLEAR);
            socket.emit(Packet.SELECT_MARKET, this.selectedMarketSlug);
            socket.emit(Packet.ADD_BETS, this.latestBets);
        });
        server.listen(31452, () => {
            const address = <AddressInfo>server.address();
            log.info(`Websocket listening on ${address.address}:${address.port}`);
        });

        moment.updateLocale("en", {
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

        this.loadUsersFromFile();

        this.selectMarket("this-is-a-local-market");
    }

    private selectMarket(slug: string) {
        this.selectedMarketSlug = slug;

        this.io.emit(Packet.SELECT_MARKET, this.selectedMarketSlug);
    }

    private loadUsersFromFile() {
        const rawData = fs.readFileSync("data/users.json");
        const rawDataString = rawData.toString();
        if (rawDataString.length > 0) {
            const data = JSON.parse(rawDataString);
            if (data.version === USER_FILE_GUID) {
                const users = data.userData;
                for (const u of users) {
                    const user = new User(u.twitchLogin, u.manifoldUsername, u.APIKey);
                    this.userList.push(user);
                }
            } else if (data.version === "5d7b6761-0719-4819-a9b9-4dd600f45369") {
                log.warn("Loading out of date user data file.");
                const users = data.userData;
                for (const twitchName in users) {
                    const userData = users[twitchName];
                    const user = new User(twitchName, userData.manifoldUsername, userData.APIKey);
                    this.userList.push(user);
                }
            } else {
                log.error("User data file version mismatch. Data not loaded.");
            }
        }
    }

    private saveUsersToFile() {
        const data = {
            version: USER_FILE_GUID,
            userData: this.userList,
        };
        fs.writeFile("data/users.json", JSON.stringify(data, null, 2), { flag: "w+" }, (err) => {
            if (err) {
                log.trace(err);
            }
        });
    }

    async loadUser(userId: string) {
        if (this.pendingFetches[userId]) return;

        this.pendingFetches[userId] = userId;
        try {
            const user = await Manifold.getUserByID(userId);
            log.info(`Loaded user ${user.name}.`);
            delete this.pendingFetches[userId];
            this.userIdToNameMap[user.id] = user.name;

            const betsToRemove = [];
            for (const bet of this.pendingBets) {
                if (user.id == bet.userId) {
                    const fullBet: FullBet = {
                        ...bet,
                        username: user.name,
                    };
                    this.addBet(fullBet);
                    betsToRemove.push(bet);
                }
            }
            this.pendingBets = this.pendingBets.filter((e) => {
                return betsToRemove.indexOf(e) < 0;
            });
        } catch (e) {
            log.trace(e);
        }
    }

    addBet(bet: FullBet) {
        if (this.latestBets.length >= 3) {
            this.latestBets.shift();
        }
        this.latestBets.push(bet);
        this.io.emit(Packet.ADD_BETS, [bet]);

        log.info(`${bet.username} ${bet.amount > 0 ? "bought" : "sold"} M$${Math.floor(Math.abs(bet.amount)).toFixed(0)} of ${bet.outcome} at ${(100 * bet.probAfter).toFixed(0)}% ${moment(bet.createdTime).fromNow()}`);
    }

    getUserForTwitchUsername(twitchUsername: string): User {
        twitchUsername = twitchUsername.toLocaleLowerCase();
        for (const user of this.userList) {
            if (user.twitchLogin == twitchUsername) {
                return user;
            }
        }
        throw new UserNotRegisteredException(`No user record for Twitch username ${twitchUsername}`);
    }

    launch() {
        this.bot.connect();

        let latestLoadedBetId: string = null;
        const pollLatestMarketBets = (numBetsToLoad = 10) => {
            const marketSlug = "this-is-a-local-market"; //will-elon-musk-buy-twitter-this-yea

            fetch(`${APIBase}bets?market=${marketSlug}&limit=${numBetsToLoad}`)
                .then((r) => <Promise<ManifoldAPI.Bet[]>>r.json())
                .then((bets) => {
                    if (bets.length == 0) {
                        return;
                    }

                    const newBets: ManifoldAPI.Bet[] = [];

                    let foundPreviouslyLoadedBet = latestLoadedBetId == null;
                    for (const bet of bets) {
                        try {
                            if (bet.id == latestLoadedBetId) {
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
                        pollLatestMarketBets(10); //!!! Need to test
                    }
                    latestLoadedBetId = bets[0].id;
                })
                .catch((e) => log.trace(e));
        };
        setInterval(pollLatestMarketBets, 1000);

        this.app.get("/unregisterchannel", (request, response) => {
            const params = getParamsFromURL(request.url);
            const channelName = params["c"];
            if (!channelName) {
                response.status(400).json({ msg: "Bad request: missing channel name parameter c." });
                return;
            }
            try {
                this.bot.leaveChannel(channelName);
                response.json({ msg: `Bot successfully removed from channel ${channelName}.` });
            } catch (e) {
                response.status(400).json({ msg: `Failed to remove bot: ${e.message}` });
            }
        });

        this.app.get("/registerchanneltwitch", async (request, response) => {
            const params = getParamsFromURL(request.url);
            const code = params["code"];
            log.info(`Got a Twitch link request: ${code}`);
            try {
                const twitchUser: Twitch.TwitchUser = await Twitch.getTwitchDetailsFromLinkCode(code);
                log.info(`Authorized Twitch user ${twitchUser.display_name}`);
                this.bot.joinChannel(twitchUser.login);
                response.send("<html><head><script>close();</script></head><html>");
            } catch (e) {
                log.trace(e);
                response.status(400).json({ error: e.message, message: "Failed to register bot." });
            }
        });

        this.app.post("/linkInit", async (request, response) => {
            try {
                const body = request.body;
                const manifoldUsername = body.manifoldUsername;
                const APIKey = body.apiKey;
                if (!manifoldUsername || !APIKey) throw new Error("manifoldUsername and apiKey parameters are required.");
                if (!(await Manifold.verifyAPIKey(APIKey))) throw new Error("API key invalid.");

                const sessionToken = crypto.randomBytes(24).toString("hex");
                this.linksInProgress[sessionToken] = {
                    manifoldUsername: manifoldUsername,
                    apiKey: APIKey,
                };

                response.json({ message: "Success.", token: sessionToken });
            } catch (e) {
                response.status(400).json({ error: "Bad request", message: e.message });
            }
        });

        this.app.get("/linkAccount", async (request, response) => {
            const params = getParamsFromURL(request.url);
            const sessionToken = params["state"];
            const sessionData = this.linksInProgress[sessionToken];
            if (!sessionToken || !sessionData) {
                response.status(400).json({ error: "Bad request", message: "Invalid session token." });
                return;
            }

            delete this.linksInProgress[sessionToken];

            const code = params["code"];
            log.info("Got a Twitch link request: " + code);
            try {
                const twitchUser = await Twitch.getTwitchDetailsFromLinkCode(code);
                const twitchLogin = twitchUser.login;
                log.info(`Authorized Twitch user ${twitchLogin}`);

                const user = new User(twitchLogin, sessionData.manifoldUsername, sessionData.apiKey);
                for (;;) {
                    try {
                        const existingUser = this.getUserForTwitchUsername(twitchLogin);
                        this.userList.splice(this.userList.indexOf(existingUser), 1);
                        log.info("Replaced existing user " + existingUser.twitchLogin);
                    } catch (e) {
                        break;
                    }
                }
                this.userList.push(user);
                this.saveUsersToFile();
                response.send("<html><head><script>close();</script></head><html>");
            } catch (e) {
                log.trace(e);
                response.status(400).json({ error: e.message, message: "Failed to link accounts." });
            }
        });

        const server = this.app.listen(9172, () => {
            const addressInfo = <AddressInfo>server.address();
            const host = addressInfo.address;
            const port = addressInfo.port;
            log.info("Twitch bot webserver listening at http://%s:%s", host, port);
        });
    }
}
