import express, { Express } from "express";
import { AddressInfo } from "net";
import moment from "moment";
import { Server } from "socket.io";
import fs from "fs";
import crypto from "crypto";
import cors from "cors";
import path from "path";

import * as Packet from "common/packet-ids";
import { buildURL, getParamsFromURL } from "./utils";

import * as Manifold from "./manifold-api";
import * as Twitch from "./twitch-api";
import TwitchBot from "./twitch-bot";
import log from "./logger";
import User from "./user";
import { Market } from "./market";
import { PacketCreateMarket, PacketMarketCreated } from "common/packets";
import { ResolutionOutcome } from "common/manifold-defs";
import { PUBLIC_FACING_URL, TWTICH_APP_CLIENT_ID } from "./envs";
import AppFirestore from "./firestore";

export default class App {
    private readonly app: Express;
    private io: Server;
    readonly bot: TwitchBot;
    readonly firestore: AppFirestore;

    private linksInProgress: { [sessionToken: string]: { manifoldUsername: string; apiKey: string } } = {};

    // selectedMarketMap: { [twitchChannel: string]: Market } = {};

    selectedMarket: Market = undefined;

    constructor() {
        this.app = express();
        this.app.use(cors());
        this.app.use(express.json());

        this.bot = new TwitchBot(this);

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

        if (!fs.existsSync("data")){
            fs.mkdirSync("data");
        }

        this.firestore = new AppFirestore();
    }

    public getMarketForTwitchChannel(channel: string) {
        return this.selectedMarket;
        // return this.selectedMarketMap[channel]; //!!!
    }

    public getChannelForMarketID(marketID: string) {
        return "#philbladen"; //!!!
        // for (const channel of Object.keys(this.selectedMarketMap)) {
        //     const market = this.selectedMarketMap[channel];
        //     if (market.data.id == marketID) return channel;
        // }
        // return null;
    }

    public async selectMarket(channel: string, id: string): Promise<Market> {
        if (this.selectedMarket) {
            this.selectedMarket.continuePolling = false;
            this.selectedMarket = null;
        }

        this.io.emit(Packet.CLEAR); //!!!

        if (id) {
            const marketData = await Manifold.getFullMarketByID(id);
            const market = new Market(this, marketData);
            // this.selectedMarketMap[channel] = market;
            this.selectedMarket = market;
            this.io.emit(Packet.SELECT_MARKET_ID, market.data.id); //!!!
            this.io.emit(Packet.ADD_BETS, market.bets);

            if (market) {
                setTimeout(() => {
                    for (const socket of this.io.sockets.sockets) {
                        if (market.overlaySockets.indexOf(socket[1]) < 0) {
                            market.overlaySockets.push(socket[1]);
                        }
                    }
                    this.io.emit(Packet.ADD_BETS, market.bets);
                    log.info("Pushed market socket");
                }, 2000); //!!! This is horrible
            }

            return market;
        }
    }

    async getUserForTwitchUsername(twitchUsername: string): Promise<User> {
        return this.firestore.getUserForTwitchUsername(twitchUsername);
    }

    async launch() {
        await this.bot.connect();

        const server = this.app.listen(9172, () => {
            const addressInfo = <AddressInfo>server.address();
            const host = addressInfo.address;
            const port = addressInfo.port;
            log.info("Webserver and websocket listening at http://%s:%s", host, port);
        });

        // const server = http.createServer(this.app);
        this.io = new Server(server);
        this.io.on("connection", (socket) => {
            socket.emit(Packet.CLEAR);

            // const mkt = this.selectedMarketMap[Object.keys(this.selectedMarketMap)[0]];

            if (this.selectedMarket) {
                socket.emit(Packet.SELECT_MARKET_ID, this.selectedMarket.data.id);
                socket.emit(Packet.ADD_BETS, this.selectedMarket.bets);

                this.selectedMarket.overlaySockets.push(socket);

                if (this.selectedMarket.resolveData) {
                    socket.emit(Packet.RESOLVE, this.selectedMarket.resolveData); //!!!
                }
            }
            //!!! Need some linking method

            socket.on(Packet.SELECT_MARKET_ID, async (marketID) => {
                console.log("Select market: " + marketID);
                const market = await this.selectMarket("#philbladen", marketID); //!!! Channel name

                // const market = this.selectedMarketMap[Object.keys(this.selectedMarketMap)[0]];
            });

            socket.on(Packet.RESOLVE, async (o: string) => {
                log.info("Dock requested market resolve: " + o);

                const outcome = o === "YES" ? ResolutionOutcome.YES : o === "NO" ? ResolutionOutcome.NO : ResolutionOutcome.CANCEL; //!!!

                if (this.selectedMarket) {
                    const pseudoUser = await this.getUserForTwitchUsername("philbladen"); //!!!
                    if (!pseudoUser) throw new Error("Pseudo user not found"); //!!!
                    await Manifold.resolveBinaryMarket(this.selectedMarket.data.id, pseudoUser.APIKey, outcome);
                }
            });

            socket.on(Packet.CREATE_MARKET, async (packet: PacketCreateMarket) => {
                const pseudoUser = await this.getUserForTwitchUsername("philbladen"); //!!!
                if (!pseudoUser) throw new Error("Pesudo user not found"); //!!!
                const newMarket = await Manifold.createBinaryMarket(pseudoUser.APIKey, packet.question, undefined, 50, packet.groupId);
                socket.emit(Packet.MARKET_CREATED, <PacketMarketCreated>{ id: newMarket.id });
                log.info("Created new market via dock: " + packet.question);
            });
        });
        // this.io.on("disconnect", (socket) => {
        //     console.log(socket.id);
        // })
        // server.listen(31452, () => {
        //     const address = <AddressInfo>server.address();
        //     log.info(`Websocket listening on ${address.address}:${address.port}`);
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

        this.app.post("/api/linkInit", async (request, response) => {
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

                const params = {
                    client_id: TWTICH_APP_CLIENT_ID,
                    response_type: "code",
                    redirect_uri: `${PUBLIC_FACING_URL}/linkAccount`,
                    scope: "user:read:email",
                    state: sessionToken,
                };
                const twitchAuthURL = buildURL("https://id.twitch.tv/oauth2/authorize", params);
                log.info(`Sent Twitch auth URL: ${twitchAuthURL}`);

                response.json({ message: "Success.", twitchAuthURL: twitchAuthURL });
            } catch (e) {
                response.status(400).json({ error: "Bad request", message: e.message });
            }
        });

        this.app.get("/api/botJoinURL", async (request, response) => {
            const params = {
                client_id: TWTICH_APP_CLIENT_ID,
                response_type: "code",
                redirect_uri: `${PUBLIC_FACING_URL}/registerchanneltwitch`,
                scope: "user:read:email",
            };
            const botURL = buildURL("https://id.twitch.tv/oauth2/authorize", params);
            response.json({url: botURL});
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
                // for (;;) { !!! Remove duplicate user entries
                //     try {
                //         const existingUser = this.getUserForTwitchUsername(twitchLogin);
                //         this.userList.splice(this.userList.indexOf(existingUser), 1);
                //         log.info("Replaced existing user " + existingUser.twitchLogin);
                //     } catch (e) {
                //         break;
                //     }
                // }
                this.firestore.addNewUser(user);
                response.send("<html><head><script>close();</script></head><html>");
            } catch (e) {
                log.trace(e);
                response.status(400).json({ error: e.message, message: "Failed to link accounts." });
            }
        });

        this.app.use(express.static(path.resolve("static"), { index: false, extensions: ["html"] }));
        this.app.get("*", (req, res) => res.sendFile(path.resolve("static/404.html")));
    }
}
