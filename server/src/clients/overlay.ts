import { Socket } from 'socket.io';

import * as Packet from 'common/packet-ids';

import { PacketSelectMarket } from 'common/packets';
import App from '../app';
import log from '../logger';
import { TwitchStream } from '../stream';
import User from '../user';

export default class OverlayClient {
  readonly socket: Socket;
  readonly app: App;
  connectedUser: User;
  stream: TwitchStream;

  public constructor(app: App, socket: Socket, stream: TwitchStream) {
    this.app = app;
    this.socket = socket;
    this.stream = stream;
    log.debug(`Overlay socket for Twitch user ${stream.name} connected (SID: ${this.socket.id})`);
    this.init();
  }

  private async init() {
    this.connectedUser = <User>this.socket.data;
    const streamName = this.stream.name;

    this.socket.join(streamName);

    this.socket.emit(Packet.CLEAR);

    const market = this.stream.featuredMarket;
    if (market) {
      const initialBetIndex = Math.max(0, market.allBets.length - 3);
      const selectMarketPacket: PacketSelectMarket = { ...market.data, bets: market.allBets, initialBets: market.allBets.slice(initialBetIndex) };
      this.socket.emit(Packet.SELECT_MARKET, selectMarketPacket);
      if (market.resolveData) {
        this.socket.emit(Packet.RESOLVE, market.resolveData);
      }
    }

    this.socket.on('disconnect', () => {
      this.stream.overlayDisconnected(this);
      log.debug(`Overlay socket for Twitch user ${streamName} disconnected (SID: ${this.socket.id})`);
    });
  }
}
