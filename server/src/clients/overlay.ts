import { Socket } from "socket.io";

import * as Packet from "common/packet-ids";

import App from "../app";
import log from "../logger";
import User from "../user";

export default class OverlayClient {
    readonly socket: Socket;
    readonly app: App;
    connectedUserAccount: User;

    constructor(app: App, socket: Socket) {
        this.app = app;
        this.socket = socket;

        log.debug("Overlay socket connected.");

        this.init();
    }

    async init() {
        this.connectedUserAccount = <User>this.socket.data;

        const connectedTwitchStream = this.connectedUserAccount.data.twitchLogin;

        this.socket.join(connectedTwitchStream);

        const market = this.app.getMarketForTwitchChannel(connectedTwitchStream);
        this.socket.emit(Packet.CLEAR);
        if (market) {
            this.socket.emit(Packet.SELECT_MARKET_ID, market.data.id);
            this.socket.emit(Packet.ADD_BETS, market.bets.slice(0, 3)); //!!! Need to send relevant bets
        }

        this.socket.on("disconnect", () => {
            this.socket.leave(connectedTwitchStream);
            this.socket.removeAllListeners();
        });
    }
}