import cors from "cors";
import crypto from "crypto";
import express, { Express, Response } from "express";
import moment from "moment";
import { AddressInfo } from "net";
import path from "path";
import { Server } from "socket.io";

import * as Packet from "common/packet-ids";
import { buildURL, getParamsFromURL } from "./utils";

import { PacketTwitchLinkComplete } from "common/packets";
import OverlayClient from "./clients/overlay";
import { PUBLIC_FACING_URL, TWTICH_APP_CLIENT_ID } from "./envs";
import AppFirestore from "./firestore";
import log from "./logger";
import * as Manifold from "./manifold-api";
import { Market } from "./market";
import * as Twitch from "./twitch-api";
import TwitchBot from "./twitch-bot";
import User from "./user";
import DockClient from "./clients/dock";

export default class App {
    private readonly app: Express;
    private io: Server;
    readonly bot: TwitchBot;
    readonly firestore: AppFirestore;

    private linksInProgress: { [sessionToken: string]: { manifoldID: string; apiKey: string } } = {};

    selectedMarketMap: { [twitchChannel: string]: Market } = {};

    constructor() {
        this.app = express();
        this.app.use(cors());
        this.app.use(express.json());

        this.bot = new TwitchBot(this);
        this.firestore = new AppFirestore();

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
    }

    public getMarketForTwitchChannel(channel: string) {
        return this.selectedMarketMap[channel];
    }

    public getChannelForMarketID(marketID: string) {
        for (const channel of Object.keys(this.selectedMarketMap)) {
            const market = this.selectedMarketMap[channel];
            if (market.data.id == marketID) return channel;
        }
        return null;
    }

    public async selectMarket(channel: string, id: string): Promise<Market> {
        const existingMarket = this.getMarketForTwitchChannel(channel);
        if (existingMarket) {
            existingMarket.continuePolling = false;
            delete this.selectedMarketMap[channel];
        }

        // this.io.emit(Packet.CLEAR); //!!!

        if (id) {
            const marketData = await Manifold.getFullMarketByID(id);
            const market = new Market(this, marketData);
            this.selectedMarketMap[channel] = market;
            // this.io.to(channel).emit(Packet.ADD_BETS, market.bets);

            if (market) {
                setTimeout(() => {
                    for (const socket of this.io.sockets.sockets) {
                        if (market.overlaySockets.indexOf(socket[1]) < 0) {
                            market.overlaySockets.push(socket[1]);
                        }
                    }
                    this.io.to(channel).emit(Packet.ADD_BETS, market.bets);
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

        this.io = new Server(server);
        this.io.use(async (socket, next) => {
            const type = socket.handshake.query.type;
            const controlToken = socket.handshake.query.controlToken;
            if (!(type === "dock" || type === "overlay")) {
                next(new Error("Invalid connection type"));
                return;
            }
            const connectedUser = await this.firestore.getUserForControlToken(<string>controlToken);
            if (!connectedUser) {
                next(new Error("No account associated with this control token"));
                return;
            }
            socket.data = connectedUser;
            next();
        });
        this.io.on("connection", (socket) => {
            if (socket.handshake.query.type === "dock") {
                new DockClient(this, socket);
            } else if (socket.handshake.query.type === "overlay") {
                new OverlayClient(this, socket);
            }
        });

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

        const registerTwitchReturnPromises: { [k: string]: Response } = {};

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
                const manifoldID = body.manifoldID;
                const APIKey = body.apiKey;
                if (!manifoldID || !APIKey) throw new Error("manifoldID and apiKey parameters are required.");
                if (!(await Manifold.verifyAPIKey(APIKey))) throw new Error("API key invalid.");

                const sessionToken = crypto.randomBytes(24).toString("hex");
                this.linksInProgress[sessionToken] = {
                    manifoldID: manifoldID,
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

        this.app.get("/api/linkResult", async (request, response) => {
            registerTwitchReturnPromises[<string>request.query.userID] = response;
        });

        this.app.get("/api/botJoinURL", async (request, response) => {
            const params = {
                client_id: TWTICH_APP_CLIENT_ID,
                response_type: "code",
                redirect_uri: `${PUBLIC_FACING_URL}/registerchanneltwitch`,
                scope: "user:read:email",
            };
            const botURL = buildURL("https://id.twitch.tv/oauth2/authorize", params);
            response.json({ url: botURL });
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

                const user = new User({ twitchLogin: twitchLogin, manifoldID: sessionData.manifoldID, APIKey: sessionData.apiKey, controlToken: crypto.randomUUID() });

                const waitingResponse = registerTwitchReturnPromises[sessionData.manifoldID];
                if (waitingResponse) {
                    log.info("Waiting response serviced");
                    const waitingResponseData: PacketTwitchLinkComplete = { twitchName: twitchLogin, controlToken: user.data.controlToken };
                    waitingResponse.json(waitingResponseData);
                } else {
                    log.info("No waiting response");
                }

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
