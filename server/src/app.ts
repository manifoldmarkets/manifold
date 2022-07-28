import express, { Express } from "express";
import { AddressInfo } from "net";
import fetch from "node-fetch";
import moment from "moment";
import { Server } from "socket.io";
import http from "http";
import fs from "fs";

import * as ManifoldAPI from "common/manifold-defs";
import { FullBet } from "common/transaction";
import * as Packet from "common/packet-ids";
import TwitchBot from "./twitch-bot";
import { getParamsFromURL } from "common/utils-node";
import { TWITCH_APP_CLIENT_SECRET, TWTICH_APP_CLIENT_ID } from "common/secrets";
import { InsufficientBalanceException, UserNotRegisteredException } from "./exceptions";

const APIBase = "https://dev.manifold.markets/api/v0/";

const USER_FILE_GUID = "{5d7b6761-0719-4819-a9b9-4dd600f45369}"; // 22/07/2022

class User {
    manifoldUsername: string;
    APIKey: string;
}

export default class App {
    readonly app: Express;
    readonly latestBets: FullBet[] = [];
    readonly io: Server;

    bot: TwitchBot;

    readonly userList: {[k: string]: {manifoldUsername: string, APIKey: string}} = {};

    selectedMarketSlug = "";

    pendingBets: ManifoldAPI.Bet[] = [];
    pendingFetches = {};

    userIdToNameMap: Record<string, string> = {};

    constructor() {
        this.app = express();
        this.bot = new TwitchBot(this);

        const server = http.createServer(this.app);
        this.io = new Server(server);
        this.io.on("connection", (socket) => {
            socket.emit(Packet.CLEAR);
            socket.emit(Packet.SELECT_MARKET, this.selectedMarketSlug);
            socket.emit(Packet.ADD_BETS, this.latestBets);
        });
        server.listen(3000, () => {
            const address = <AddressInfo>server.address();
            console.log(`Websocket listening on ${address.address}:${address.port}`);
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

        const rawData = fs.readFileSync("data/users.json");
        const rawDataString = rawData.toString();
        if (rawDataString.length > 0) {
            const data = JSON.parse(rawDataString);
            if (data.version === USER_FILE_GUID) {
                this.userList = data.userData;
            } else {
                console.error("User data file version mismatch. Data not loaded.");
            }
        }
        // console.log(this.userList);

        this.selectMarket("this-is-a-local-market");
    }

    private selectMarket(slug: string) {
        this.selectedMarketSlug = slug;

        this.io.emit(Packet.SELECT_MARKET, this.selectedMarketSlug);
    }

    private saveUsersToFile() {
        const data = {
            version: USER_FILE_GUID,
            userData: this.userList,
        };
        fs.writeFile("data/users.json", JSON.stringify(data, null, 2), { flag: "w+" }, (err) => {
            if (err) {
                console.trace(err);
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
                console.log(`Loaded user ${user.name}.`);
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
                console.trace(e);
            });
    }

    addBet(bet: FullBet) {
        if (this.latestBets.length >= 3) {
            this.latestBets.shift();
        }
        this.latestBets.push(bet);
        this.io.emit(Packet.ADD_BETS, [bet]);

        console.log(`[${new Date().toLocaleTimeString()}] ${bet.username} ${bet.amount > 0 ? "bought" : "sold"} M$${Math.floor(Math.abs(bet.amount)).toFixed(0)} of ${bet.outcome} at ${(100 * bet.probAfter).toFixed(0)}% ${moment(bet.createdTime).fromNow()}`);
    }

    getUserForTwitchUsername(twitchUsername: string): {manifoldUsername: string, APIKey: string} {
        twitchUsername = twitchUsername.toLocaleLowerCase();
        const user = this.userList[twitchUsername];
        if (!user) {
            throw new UserNotRegisteredException(`No user record for Twitch username ${twitchUsername}`);
        }
        return user;
    }

    async getUserBalance(twitchUsername: string): Promise<number> {
        const user = this.getUserForTwitchUsername(twitchUsername);
        const response = await fetch(`${APIBase}user/${user.manifoldUsername}`);
        const data = <ManifoldAPI.LiteUser> await response.json();
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

    //TODO: Currently uses the Firebase API - should be updated to the Manifold REST API when possible
    async sellAllShares(twitchUsername: string) {
        const user = this.getUserForTwitchUsername(twitchUsername);
        const APIKey = user.APIKey;

        const stake = await this.getCurrentUserStake_shares(user.manifoldUsername);
        if (Math.abs(stake.shares) < 1) {
            return;
        }

        try {
            const requestData = {
                contractId: "litD59HFH1eUx5sAGCNL", //!!! Not using current market info
                outcome: stake.outcome,
                shares: stake.shares,
            };

            const response = await fetch(`https://sellshares-w3txbmd3ba-uc.a.run.app`, {
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
            console.log("Shares sold successfully.");
        } catch (e) {
            console.trace(e);
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
            const data = <{message: string}> await response.json();
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
                        console.log("Failed to find previously loaded bet. Expanding search...");
                        pollLatestMarketBets(10); //!!! Need to test
                    }
                    latestLoadedBetId = bets[0].id;
                })
                .catch((e) => console.trace(e));
        };
        setInterval(pollLatestMarketBets, 1000);

        // this.app.get("/registerchannel", (request, response) => {
        //     const params = getParamsFromURL(request.url);
        //     const channelName = params["c"];
        //     if (!channelName) {
        //         response.status(400).json({msg: "Bad request: missing channel name parameter c."});
        //         return;
        //     }
        //     try {
        //         this.bot.joinChannel(channelName);
        //         response.json({msg: `Bot successfully added to channel ${channelName}.`});
        //     }
        //     catch (e) {
        //         response.status(400).json({msg: `Failed to add bot: ${e.message}`});
        //     }
        // });

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

            console.log("Got a Twitch link request: " + code);

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
                    console.error(json);
                    throw new Error("Failed to fetch access token.");
                }

                raw = await fetch("https://api.twitch.tv/helix/users", {
                    headers: {
                        "client-id": TWTICH_APP_CLIENT_ID,
                        authorization: `Bearer ${accessToken}`,
                    },
                });
                json = await raw.json();

                console.log(json);

                const twitchLogin = json["data"][0]["login"];
                console.log(`Authorized Twitch user ${twitchLogin}`);

                this.bot.joinChannel(twitchLogin);
            };
            f()
                .then(() => {
                    // response.json({ message: "Successfully registered bot." });
                    response.send("<html><head><script>close();</script></head><html>")
                })
                .catch((e) => {
                    console.trace(e);
                    response.status(400).json({ error: e.message, message: "Failed to register bot." });
                });
        });

        this.app.get("/link", (request, response) => {
            const ps = getParamsFromURL(request.url);
            let tusername = ps["t"];
            const musername = ps["m"];
            const apikey = ps["a"];
            if (!tusername || !musername || !apikey) {
                response.status(400).json({ msg: "Bad request. Parameters t, m and a required." });
                return;
            }
            tusername = tusername.toLocaleLowerCase(); // Twitch usernames are all lowercase. This is a temporary solution until Twitch auth supported.
            console.log("Got link request: " + `${tusername}, ${musername}, ${apikey}`);

            fetch(`${APIBase}bet`, {
                method: "POST",
                headers: {
                    Authorization: `Key ${apikey}`,
                },
            })
                .then((r) => {
                    console.log("Status: " + r.status);
                    if (r.status != 403) {
                        const user = new User();
                        user.manifoldUsername = musername;
                        user.APIKey = apikey;
                        this.userList[tusername] = user;
                        this.saveUsersToFile();
                    }
                    return r.json();
                })
                .then((r) => {
                    console.log(r);
                });
        });

        const server = this.app.listen(9172, () => {
            const host = (<AddressInfo>server.address()).address;
            const port = (<AddressInfo>server.address()).port;
            console.log("Example app listening at http://%s:%s", host, port);
        });
    }
}
