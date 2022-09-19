import { Express } from "express";
import App from "./app";
import * as Manifold from "./manifold-api";
import log from "./logger";
import { PUBLIC_FACING_URL, TWITCH_BOT_CLIENT_ID } from "./envs";
import crypto from "crypto"
import { buildURL, getParamsFromURL } from "./utils";
import User from "./user";
import * as Twitch from "./twitch-api";

type APIResponse = {
    success: boolean;
    message: string;
    error: string;
};

const linksInProgress: { [sessionToken: string]: { manifoldID: string; apiKey: string; redirectURL: string } } = {};

export default function registerAPIEndpoints(app: App, express: Express) {
    express.post("/unregisterchanneltwitch", async (request, response) => {
        const apiKey = request.body["apiKey"];
        if (!apiKey) {
            response.status(400).json({ msg: "Bad request: missing channel name parameter c." });
            return;
        }
        try {
            const user = await app.firestore.getUserForManifoldAPIKey(apiKey);
            await app.bot.leaveChannel(user.data.twitchLogin);
            response.json(<APIResponse>{ success: true, message: `Bot successfully removed from channel ${user.data.twitchLogin}.` }); //!!! Proper response (API type class)
        } catch (e) {
            response.status(400).json(<APIResponse>{ success: false, error: e.message, message: `Failed to remove bot: ${e.message}` });
        }
    });

    express.post("/registerchanneltwitch", async (request, response) => {
        const apiKey = request.body["apiKey"];
        log.info(`Got a Twitch link request: ${apiKey}`);
        try {
            const user = await app.firestore.getUserForManifoldAPIKey(apiKey);
            await app.bot.joinChannel(user.data.twitchLogin);
            response.json(<APIResponse>{ success: true, message: "Registered bot." });
        } catch (e) {
            log.trace(e);
            response.status(400).json(<APIResponse>{ success: false, error: e.message, message: "Failed to register bot." });
        }
    });

    express.post("/api/linkInit", async (request, response) => {
        try {
            const body = request.body;
            const manifoldID = body.manifoldID;
            const apiKey = body.apiKey;
            const redirectURL = body.redirectURL;
            if (!manifoldID || !apiKey || !redirectURL) throw new Error("manifoldID, apiKey and redirectURL parameters are required.");
            if (!(await Manifold.verifyAPIKey(apiKey))) throw new Error("API key invalid.");

            const sessionToken = crypto.randomBytes(24).toString("hex");
            linksInProgress[sessionToken] = {
                manifoldID,
                apiKey,
                redirectURL,
            };

            const params = {
                client_id: TWITCH_BOT_CLIENT_ID,
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

    express.get("/linkAccount", async (request, response) => {
        const params = getParamsFromURL(request.url);
        const sessionToken = params["state"];
        const sessionData = linksInProgress[sessionToken];
        if (!sessionToken || !sessionData) {
            response.status(400).json({ error: "Bad request", message: "Invalid session token." });
            return;
        }

        delete linksInProgress[sessionToken];

        const code = params["code"];
        log.info("Got a Twitch link request: " + code);
        try {
            const twitchUser = await Twitch.getTwitchDetailsFromLinkCode(code);
            const twitchLogin = twitchUser.login;
            log.info(`Authorized Twitch user ${twitchLogin}`);

            let user: User;
            try {
                user = await app.firestore.getUserForManifoldID(sessionData.manifoldID);
                user.data.APIKey = sessionData.apiKey;
                log.info("Updated user API key: " + sessionData.apiKey);
            } catch (e) {
                user = new User({ twitchLogin: twitchLogin, manifoldID: sessionData.manifoldID, APIKey: sessionData.apiKey, controlToken: crypto.randomUUID() });
            }

            app.firestore.addNewUser(user);
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
}
