import cors from "cors";
import crypto from "crypto";
import express, { Express, Response } from "express";
import moment from "moment";
import { AddressInfo } from "net";
import path from "path";
import { Server } from "socket.io";

import { buildURL, getParamsFromURL } from "./utils";

import { LiteUser } from "common/manifold-defs";
import { ResolutionOutcome } from "common/outcome";
import { UNFEATURE_MARKET } from "common/packet-ids";
import { PacketTwitchLinkComplete } from "common/packets";
import DockClient from "./clients/dock";
import OverlayClient from "./clients/overlay";
import { PUBLIC_FACING_URL, TWTICH_APP_CLIENT_ID } from "./envs";
import AppFirestore from "./firestore";
import log from "./logger";
import * as Manifold from "./manifold-api";
import { Market } from "./market";
import * as Twitch from "./twitch-api";
import TwitchBot from "./twitch-bot";
import User from "./user";

export default class App {
    private readonly app: Express;
    io: Server;
    readonly bot: TwitchBot;
    readonly firestore: AppFirestore;

    private linksInProgress: { [sessionToken: string]: { manifoldID: string; apiKey: string; redirectURL: string } } = {};

    selectedMarketMap: { [twitchChannel: string]: Market } = {};

    autoUnfeatureTimer: NodeJS.Timeout = null;

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
        const market = this.selectedMarketMap[channel];
        if (market) {
            log.debug(`Found market '${market.data.question}' for channel '${channel}'`);
        } else {
            log.debug(`Found no market for channel '${channel}'`);
        }
        return market;
    }

    public getChannelForMarketID(marketID: string) {
        for (const channel of Object.keys(this.selectedMarketMap)) {
            const market = this.selectedMarketMap[channel];
            if (market.data.id == marketID) return channel;
        }
        return null;
    }

    public async selectMarket(channel: string, id: string): Promise<Market> {
        if (this.autoUnfeatureTimer) {
            clearTimeout(this.autoUnfeatureTimer);
            this.autoUnfeatureTimer = null;
        }

        const existingMarket = this.getMarketForTwitchChannel(channel);
        if (existingMarket) {
            existingMarket.continuePolling = false;
            delete this.selectedMarketMap[channel];
        }

        if (id) {
            const marketData = await Manifold.getFullMarketByID(id);
            if (!marketData || marketData.isResolved) throw new Error("Attempted to feature invalid market");
            const market = new Market(this, marketData, channel);
            this.selectedMarketMap[channel] = market;
            log.debug(`Selected market '${market.data.question}' for channel '${channel}'`);
            return market;
        }
    }

    async getUserForTwitchUsername(twitchUsername: string): Promise<User> {
        return this.firestore.getUserForTwitchUsername(twitchUsername);
    }

    public marketResolved(channel: string, outcome: ResolutionOutcome, winners: { user: LiteUser; profit: number }[]) {
        this.autoUnfeatureTimer = setTimeout(() => {
            this.selectMarket(channel, null);
            this.io.to(channel).emit(UNFEATURE_MARKET);
        }, 24000);
        this.bot.resolveMarket(channel, outcome, winners);
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
                const apiKey = body.apiKey;
                const redirectURL = body.redirectURL;
                if (!manifoldID || !apiKey || !redirectURL) throw new Error("manifoldID, apiKey and redirectURL parameters are required.");
                if (!(await Manifold.verifyAPIKey(apiKey))) throw new Error("API key invalid.");

                const sessionToken = crypto.randomBytes(24).toString("hex");
                this.linksInProgress[sessionToken] = {
                    manifoldID,
                    apiKey,
                    redirectURL,
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

                let user: User;
                try {
                    user = await this.firestore.getUserForManifoldID(sessionData.manifoldID);
                } catch (e) {
                    user = new User({ twitchLogin: twitchLogin, manifoldID: sessionData.manifoldID, APIKey: sessionData.apiKey, controlToken: crypto.randomUUID() });
                }

                const waitingResponse = registerTwitchReturnPromises[sessionData.manifoldID];
                if (waitingResponse) {
                    log.info("Waiting response serviced");
                    const waitingResponseData: PacketTwitchLinkComplete = { twitchName: twitchLogin, controlToken: user.data.controlToken };
                    waitingResponse.json(waitingResponseData);
                } else {
                    log.info("No waiting response");
                }


                this.firestore.addNewUser(user);
                try {
                    await Manifold.saveTwitchDetails(sessionData.apiKey, twitchUser.display_name, user.data.controlToken);
                } catch (e) {
                    log.trace(e);
                    throw new Error("Failed to save Twitch details to Manifold");
                }

                response.send(`<html><head><script>window.location.href="${sessionData.redirectURL}"</script></head><html>`);
            } catch (e) {
                log.trace(e);
                response.status(400).json({ error: e.message, message: "Failed to link accounts." });
            }
        });

        this.app.use(express.static(path.resolve("static"), { index: false, extensions: ["html"] }));
        this.app.get("*", (req, res) => res.sendFile(path.resolve("static/404.html")));
    }
}
