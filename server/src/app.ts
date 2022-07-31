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
import { FullBet } from "common/transaction";
import * as Packet from "common/packet-ids";
import TwitchBot from "./twitch-bot";
import { getParamsFromURL } from "common/utils-node";
import { TWITCH_APP_CLIENT_SECRET, TWTICH_APP_CLIENT_ID } from "common/secrets";
import { InsufficientBalanceException, UserNotRegisteredException } from "./exceptions";
import log from "./logger";

const APIBase = "https://dev.manifold.markets/api/v0/";

const USER_FILE_GUID = "5481a349-20d3-4a85-a6e1-b7831c2f21e4"; // 30/07/2022

class User {
    twitchLogin: string;
    manifoldUsername: string;
    APIKey: string;
}

export default class App {
    private readonly app: Express;
    private readonly latestBets: FullBet[] = [];
    private readonly io: Server;

    private bot: TwitchBot;

    private userList: User[] = [];

    private linksInProgress: { [sessionToken: string]: { manifoldUsername: string; apiKey: string } } = {};

    selectedMarketSlug = "";

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
                this.userList = data.userData;
            } else if (data.version === "5d7b6761-0719-4819-a9b9-4dd600f45369") {
                log.warn("Loading out of date user data file.");
                const users = data.userData;
                for (const twitchName in users) {
                    const userData = users[twitchName];
                    const user: User = {
                        twitchLogin: twitchName,
                        manifoldUsername: userData.manifoldUsername,
                        APIKey: userData.APIKey,
                    };
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

    loadUser(userId: string) {
        if (this.pendingFetches[userId]) {
            return;
        }
        this.pendingFetches[userId] = userId;
        fetch(`${APIBase}user/by-id/${userId}`)
            .then((r) => <Promise<ManifoldAPI.LiteUser>>r.json())
            .then((user) => {
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
            })
            .catch((e) => {
                log.trace(e);
            });
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

    async getUserBalance(twitchUsername: string): Promise<number> {
        const user = this.getUserForTwitchUsername(twitchUsername);
        const response = await fetch(`${APIBase}user/${user.manifoldUsername}`);
        const data = <ManifoldAPI.LiteUser>await response.json();
        return data.balance;
    }

    async getCurrentUserStake_shares(manifoldUsername: string): Promise<{ shares: number; outcome: "YES" | "NO" }> {
        const market = "this-is-a-local-market"; //!!!
        return fetch(`${APIBase}bets?market=${market}&username=${manifoldUsername}`)
            .then((r) => <Promise<ManifoldAPI.Bet[]>>r.json())
            .then((bets) => {
                let total = 0;
                for (const bet of bets) {
                    if (bet.outcome == "YES") {
                        total += bet.shares;
                    } else {
                        total -= bet.shares;
                    }
                }
                return { shares: Math.abs(total), outcome: total > 0 ? "YES" : "NO" };
            });
    }

    async allIn(twitchUsername: string, yes: boolean) {
        const balance = await this.getUserBalance(twitchUsername);
        this.placeBet(twitchUsername, Math.floor(balance), yes);
    }

    async sellAllShares(twitchUsername: string) {
        const user = this.getUserForTwitchUsername(twitchUsername);
        const APIKey = user.APIKey;

        const stake = await this.getCurrentUserStake_shares(user.manifoldUsername);
        if (Math.abs(stake.shares) < 1) {
            return;
        }

        const requestData = {
            outcome: stake.outcome,
        };

        const response = await fetch(`${APIBase}market/${"litD59HFH1eUx5sAGCNL"}/sell`, {
            //!!! Not using current market info
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Key ${APIKey}`,
            },
            body: JSON.stringify(requestData),
        });
        if (response.status !== 200) {
            const error = <{ message: string }>await response.json();
            throw new Error(error.message);
        }
    }

    public async createBinaryMarket(twitchUsername: string, question: string, description: string, initialProb_percent: number) {
        const user = this.getUserForTwitchUsername(twitchUsername);

        const outcomeType: "BINARY" | "FREE_RESPONSE" | "NUMERIC" = "BINARY";
        const descriptionObject = {
            type: "doc",
            content: [
                ...(description
                    ? [
                          {
                              type: "paragraph",
                              content: [
                                  {
                                      type: "text",
                                      text: question,
                                  },
                              ],
                          },
                      ]
                    : []),
            ],
        };
        const closeTime = Date.now() + 1e12; // Arbitrarily long time in the future

        const requestData = {
            outcomeType: outcomeType,
            question: question,
            description: descriptionObject, // WARNING: Contrary to the API docs, this is NOT an optional parameter
            closeTime: closeTime,
            initialProb: initialProb_percent,
        };

        // The following API call is undocumented so will probably break when they change the backend sigh
        const response = await fetch(`${APIBase}market`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Key ${user.APIKey}`,
            },
            body: JSON.stringify(requestData),
        });
        const data = <{ message: string }>await response.json();
        if (response.status != 200) {
            if (data.message == "Balance must be at least 100.") {
                throw new InsufficientBalanceException();
            }
            throw new Error(JSON.stringify(data));
        }
        log.info(data); //!!!
    }

    public async resolveBinaryMarket(twitchUsername: string, outcome: ManifoldAPI.ResolutionOutcome) {
        const user = this.getUserForTwitchUsername(twitchUsername);

        const marketId = "CRPnvTZa4WydcicY7gLr"; //!!! Not using current market info
        const requestData = {
            outcome: outcome,
            // probabilityInt: ,
        };

        const response = await fetch(`${APIBase}market/${marketId}/resolve`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Key ${user.APIKey}`,
            },
            body: JSON.stringify(requestData),
        });
        if (response.status != 200) {
            const data = <{ message: string }>await response.json();
            throw new Error(JSON.stringify(data));
        }
    }

    async placeBet(twitchUsername: string, amount: number, yes: boolean) {
        const user = this.getUserForTwitchUsername(twitchUsername);
        const APIKey = user.APIKey;

        const requestData = {
            amount: amount,
            contractId: "litD59HFH1eUx5sAGCNL", //!!! Not using current market info
            outcome: yes ? "YES" : "NO",
        };

        const response = await fetch(`${APIBase}bet`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Key ${APIKey}`,
            },
            body: JSON.stringify(requestData),
        });
        if (response.status != 200) {
            const data = <{ message: string }>await response.json();
            if (data.message == "Insufficient balance.") {
                throw new InsufficientBalanceException();
            }
            throw new Error(JSON.stringify(data));
        }
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

        this.app.get("/registerchanneltwitch", (request, response) => {
            const params = getParamsFromURL(request.url);
            const code = params["code"];

            log.info("Got a Twitch link request: " + code);

            const grant_type = "authorization_code";
            const redirect_uri = "http://localhost:9172/registerchanneltwitch";

            const queryString = `client_id=${TWTICH_APP_CLIENT_ID}&client_secret=${TWITCH_APP_CLIENT_SECRET}&code=${code}&grant_type=${grant_type}&redirect_uri=${redirect_uri}`;

            const f = async () => {
                let raw = await fetch(`https://id.twitch.tv/oauth2/token?${queryString}`, {
                    method: "POST",
                });
                let json = await raw.json();

                const accessToken = json["access_token"];
                if (!accessToken) {
                    log.error(json);
                    throw new Error("Failed to fetch access token.");
                }

                raw = await fetch("https://api.twitch.tv/helix/users", {
                    headers: {
                        "client-id": TWTICH_APP_CLIENT_ID,
                        authorization: `Bearer ${accessToken}`,
                    },
                });
                json = await raw.json();

                const twitchLogin = json["data"][0]["login"];
                log.info(`Authorized Twitch user ${twitchLogin}`);

                this.bot.joinChannel(twitchLogin);
            };
            f()
                .then(() => {
                    // response.json({ message: "Successfully registered bot." });
                    response.send("<html><head><script>close();</script></head><html>");
                })
                .catch((e) => {
                    log.trace(e);
                    response.status(400).json({ error: e.message, message: "Failed to register bot." });
                });
        });

        this.app.post("/linkInit", async (request, response) => {
            try {
                const body = request.body;
                const manifoldUsername = body.manifoldUsername;
                const apiKey = body.apiKey;
                if (!manifoldUsername || !apiKey) {
                    throw new Error("manifoldUsername and apiKey parameters are required.");
                }

                const authResponse = await fetch(`${APIBase}bet`, {
                    method: "POST",
                    headers: {
                        Authorization: `Key ${apiKey}`,
                    },
                });
                if (authResponse.status == 403) {
                    throw new Error("Failed to validate Manifold details.");
                }
                const sessionToken = crypto.randomBytes(24).toString("hex");
                this.linksInProgress[sessionToken] = {
                    manifoldUsername: manifoldUsername,
                    apiKey: apiKey,
                };

                response.json({ message: "Success.", token: sessionToken });
            } catch (e) {
                response.status(400).json({ error: "Bad request", message: e.message });
            }
        });

        this.app.get("/linkAccount", (request, response) => {
            const params = getParamsFromURL(request.url);
            const sessionToken = params["state"];
            console.log(sessionToken);
            if (!sessionToken || !this.linksInProgress[sessionToken]) {
                response.status(400).json({ error: "Bad request", message: "Invalid session token." });
                return;
            }

            const sessionData = this.linksInProgress[sessionToken];
            delete this.linksInProgress[sessionToken];
            // response.json(sessionData);

            const code = params["code"];

            log.info("Got a Twitch link request: " + code);

            const grant_type = "authorization_code";
            const redirect_uri = "http://localhost:9172/registerchanneltwitch";

            const queryString = `client_id=${TWTICH_APP_CLIENT_ID}&client_secret=${TWITCH_APP_CLIENT_SECRET}&code=${code}&grant_type=${grant_type}&redirect_uri=${redirect_uri}`;

            const f = async () => {
                let raw = await fetch(`https://id.twitch.tv/oauth2/token?${queryString}`, {
                    method: "POST",
                });
                let json = await raw.json();

                const accessToken = json["access_token"];
                if (!accessToken) {
                    log.error(json);
                    throw new Error("Failed to fetch access token.");
                }

                raw = await fetch("https://api.twitch.tv/helix/users", {
                    headers: {
                        "client-id": TWTICH_APP_CLIENT_ID,
                        authorization: `Bearer ${accessToken}`,
                    },
                });
                json = await raw.json();

                const twitchLogin = json["data"][0]["login"];
                log.info(`Authorized Twitch user ${twitchLogin}`);

                const user: User = {
                    twitchLogin: twitchLogin,
                    manifoldUsername: sessionData.manifoldUsername,
                    APIKey: sessionData.apiKey,
                };
                for (;;) {
                    try {
                        const existingUser = this.getUserForTwitchUsername(twitchLogin);
                        this.userList.splice(this.userList.indexOf(existingUser), 1);
                        log.info("Removed existing user " + existingUser.manifoldUsername);
                    } catch (e) {
                        break;
                    }
                }
                this.userList.push(user);
                this.saveUsersToFile();
            };
            f()
                .then(() => {
                    // response.json({ message: "Successfully registered bot." });
                    response.send("<html><head><script>close();</script></head><html>");
                })
                .catch((e) => {
                    log.trace(e);
                    response.status(400).json({ error: e.message, message: "Failed to link accounts." });
                });
        });

        const server = this.app.listen(9172, () => {
            const host = (<AddressInfo>server.address()).address;
            const port = (<AddressInfo>server.address()).port;
            log.info("Twitch bot webserver listening at http://%s:%s", host, port);
        });
    }
}
