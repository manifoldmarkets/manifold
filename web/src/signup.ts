import { TWTICH_APP_CLIENT_ID } from "common/secrets";
import "./style/signup.scss";

function signup() {
    let error =false;
    const username = <HTMLInputElement> document.getElementById("tusername");
    username.classList.remove("error");
    if (username.value.length <= 0) {
        if (!username.classList.contains("error")) {
            username.classList.add("error");
            error = true;
        }
    }
    
    const musername = <HTMLInputElement> document.getElementById("musername");
    musername.classList.remove("error");
    if (musername.value.length <= 0) {
        if (!musername.classList.contains("error")) {
            musername.classList.add("error");
            error = true;
        }
    }

    const apikey = <HTMLInputElement> document.getElementById("apikey");
    apikey.classList.remove("error");
    if (apikey.value.length <= 0) {
        if (!apikey.classList.contains("error")) {
            apikey.classList.add("error");
            error = true;
        }
    }

    if (!error) {
        fetch(`api/link?t=${username.value}&m=${musername.value}&a=${apikey.value}`);
    }
}

document.getElementById("signup").addEventListener("click", () => {
    signup();
});

(<HTMLLinkElement> document.getElementById("addbot")).href = `https://id.twitch.tv/oauth2/authorize?client_id=${TWTICH_APP_CLIENT_ID}&response_type=code&redirect_uri=http://localhost:9172/registerchanneltwitch&scope=user:read:email`;