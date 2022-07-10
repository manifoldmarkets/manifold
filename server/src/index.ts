const TMI = require("tmi.js");

const regexpCommand = new RegExp(/!([a-zA-Z0-9]+)\s?(\S*)?/);
const balances = {};

const commands = {
    help: {
        response: (username: string, argument: string) => "- !bet yes# - bets on yes (where # is the number of mana bet)\n" +
                    "- !bet no# - bets on no (where # is the number of mana bet)\n" +
                    "- !allin\n" +
                    "- !sell - sells all shares\n" +
                    "- !balance - Manifold Bot replies your balance to you in main chat\n" +
                    "- !help - Manifold Bot sends a DM showing list of commands\n" +
                    "- !signup - Manifold Bot sends a DM explaining how to link accounts and free Mana on sign up."
    },
    upvote: {
        response: (username: string, argument: string) => `Successfully upvoted ${argument}`,
    },
    bet: {
        response: (username: string, argument: string) => {
            if (argument.startsWith("yes")) {
                try {
                    let value = Number.parseInt(argument.substring(3));
                    if (value == NaN) {
                        return null; //!!!
                    }
                    return `@${username} has bet ${value} on YES!`;
                }
                catch (e) {
                    return null; //!!!
                }
            }
            else if (argument.startsWith("no")) {
                try {
                    let value = Number.parseInt(argument.substring(2));
                    if (value == NaN) {
                        return null; //!!!
                    }
                    return `@${username} has bet ${value} on NO!`;
                }
                catch (e) {
                    return null; //!!!
                }
            }
            else {
                return null; //!!!
            }
        }
    },
    sell: {
        response: (username: string, argument: string) => `Sold all shares.`,
    },
    balance: {
        response: (username: string, argument: string) => `Your balance is ${0}.`, //!!!
    }
};

const client = new TMI.Client({
    options: { debug: true },
    connection: {
        secure: true,
        reconnect: true,
    },
    identity: {
        username: "manifoldbot",
        password: process.env.TWITCH_OAUTH_TOKEN,
    },
    channels: ["philbladen"],
});

client.connect();

client.on("message", (channel, tags, message, self) => {
    if (self) return; // Ignore echoed messages.

    const found = message.match(regexpCommand);
    // console.log(found);
    if (!found) return;
    if (found.length < 2) return;

    let command: string = found[1];
    let argument: string = found[2];


    console.log(`Command: ${command}`);
    const response: any = commands[command as keyof typeof commands].response || {};
    console.log(response);

    let responseMessage = response;

    if (typeof responseMessage === "function") {
        responseMessage = response(tags.username, argument);
    }

    if (responseMessage) {
        let lines = responseMessage.split("\n");
        console.log(`Responding to command !${command}`);
        for (let line of lines) {
            client.say(channel, line);
            // client.whisper(tags.username, line).catch(() => {});
        }
    }
});

client.on("whisper", (from, userstate, message, self) => {
    if (self) return;

    console.log("Whisper");
});

client.on("connected", () => {
    let options: any = client.getOptions();
    let channel = options.channels[0];
    client.say(channel, "/clear");
    client.say(channel, "/color BlueViolet");
});

// client.on("message", (channel, tags, rawMessage, self) => {
//     if (self) return; // Ignore echoed messages.

//     let msg = rawMessage.toLocaleLowerCase();

//     if (msg === "!hello") {
//         client.say(channel, `@${tags.username}, Yo what's upppp`);
//     }
//     else if (msg == "!balance") {
//         let balance = 0;
//         if (balances[tags.username]) {
//             balance = balances[tags.username];
//         }
//         else {
//             balances[tags.username] = balance;
//         }
//         client.say(channel, `@${tags.username}, your balance is ${balance} mana.`);
//     }
//     else if (msg == "!money") {
//         if (balances[tags.username]) {
//             balances[tags.username] += 100;
//         }
//         else {
//             balances[tags.username] = 100;
//         }
//         let balance = balances[tags.username];
//         client.say(channel, `@${tags.username}, added 100! Your balance is ${balance} mana.`);
//     }
//     else if (msg == "bet") {

//     }
// });
