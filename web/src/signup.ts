import { TWTICH_APP_CLIENT_ID } from "common/secrets";
import "./style/signup.scss";

const sessionId = crypto.randomUUID();

async function signup() {
    let error = false;
    const musernameElement = <HTMLInputElement>document.getElementById("musername");
    musernameElement.classList.remove("error");
    if (musernameElement.value.length <= 0) {
        if (!musernameElement.classList.contains("error")) {
            musernameElement.classList.add("error");
            error = true;
        }
    }

    const apikeyElement = <HTMLInputElement>document.getElementById("apikey");
    apikeyElement.classList.remove("error");
    if (apikeyElement.value.length <= 0) {
        if (!apikeyElement.classList.contains("error")) {
            apikeyElement.classList.add("error");
            error = true;
        }
    }

    if (!error) {
        try {
            musernameElement.disabled = true;
            apikeyElement.disabled = true;
            (<HTMLButtonElement>document.getElementById("signup")).disabled = true;
            document.getElementById("errorMessage").innerHTML = "";

            const response = await fetch(`api/linkInit`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    manifoldUsername: musernameElement.value,
                    apiKey: apikeyElement.value,
                }),
            });
            const responseData = await response.json();
            if (response.status != 200) {
                console.error(responseData);
                document.getElementById("errorMessage").innerHTML = responseData.message;
                return;
            }
            const sessionToken = responseData.token;

            const params = {
                client_id: TWTICH_APP_CLIENT_ID,
                response_type: "code",
                redirect_uri: `http://localhost:9172/linkAccount`,
                scope: "user:read:email",
                state: sessionToken,
            };
            const paramString = Object.keys(params)
                .map((key) => key + "=" + params[key])
                .join("&");
            window.open(`https://id.twitch.tv/oauth2/authorize?${paramString}`);
        }
        finally {
            musernameElement.disabled = false;
            apikeyElement.disabled = false;
            (<HTMLButtonElement>document.getElementById("signup")).disabled = false;
        }
    }
}

document.getElementById("signup").addEventListener("click", () => {
    signup();
});

document.getElementById("copyOverlayLink").addEventListener("click", () => {
    navigator.clipboard.writeText(`http://localhost:19823/?session=${sessionId}`).then(() => console.log("Copied link to clipboard."));
});
document.getElementById("copyDockLink").addEventListener("click", () => {
    navigator.clipboard.writeText(`http://localhost:19823/dock.html?session=${sessionId}`).then(() => console.log("Copied link to clipboard."));
});

(<HTMLLinkElement>document.getElementById("addbot")).href = `https://id.twitch.tv/oauth2/authorize?client_id=${TWTICH_APP_CLIENT_ID}&response_type=code&redirect_uri=http://localhost:9172/registerchanneltwitch&scope=user:read:email`;
