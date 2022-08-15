import fetch from "node-fetch";
import log from "./logger";

export class TwitchUser {
    broadcaster_type: "partner" | "affiliate" | "";
    description: string;
    display_name: string;
    id: string;
    login: string;
    offline_image_url: string;
    profile_image_url: string;
    type: string;
    view_count: number;
    email: string;
    created_at: string;
}

export async function getTwitchDetailsFromLinkCode(code: string): Promise<TwitchUser> {
    const grantType = "authorization_code";
    const redirectURI = "http://localhost:9172/registerchanneltwitch";
    const queryString = `client_id=${process.env.TWTICH_APP_CLIENT_ID}&client_secret=${process.env.TWITCH_APP_CLIENT_SECRET}&code=${code}&grant_type=${grantType}&redirect_uri=${redirectURI}`;

    let raw = await fetch(`https://id.twitch.tv/oauth2/token?${queryString}`, { method: "POST" });
    let json = await raw.json();

    const accessToken = json["access_token"];
    if (!accessToken) {
        log.error(json);
        throw new Error("Failed to fetch access token.");
    }

    raw = await fetch("https://api.twitch.tv/helix/users", {
        headers: {
            "Client-Id": process.env.TWTICH_APP_CLIENT_ID,
            Authorization: `Bearer ${accessToken}`,
        },
    });
    json = await raw.json();
    return <TwitchUser> json["data"][0];
}
