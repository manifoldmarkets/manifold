import { Socket } from 'socket.io';

import * as Packet from 'common/packet-ids';

import { PacketSelectMarket } from 'common/packets';
import App from '../app';
import log from '../logger';
import User from '../user';

export default class OverlayClient {
  readonly socket: Socket;
  readonly app: App;
  connectedUserAccount: User;

  constructor(app: App, socket: Socket) {
    this.app = app;
    this.socket = socket;

    this.init();
  }

  async init() {
    this.connectedUserAccount = <User>this.socket.data;

    const connectedTwitchStream = this.connectedUserAccount.data.twitchLogin;

    log.debug(`Overlay socket for Twitch user ${connectedTwitchStream} connected (SID: ${this.socket.id})`);

    this.socket.join(connectedTwitchStream);

    const market = this.app.getMarketForTwitchChannel(connectedTwitchStream);
    this.socket.emit(Packet.CLEAR);
    if (market) {
      const selectMarketPacket: PacketSelectMarket = { ...market.data, initialBets: market.allBets.slice(market.allBets.length - 3) };
      this.socket.emit(Packet.SELECT_MARKET, selectMarketPacket);
      if (market.resolveData) {
        this.socket.emit(Packet.RESOLVE, market.resolveData);
      }
    }

    this.socket.on('disconnect', () => {
      log.debug(`Overlay socket for Twitch user ${connectedTwitchStream} disconnected (SID: ${this.socket.id})`);
    });
  }
}
