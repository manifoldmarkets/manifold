import { Socket } from 'socket.io';

import { getOutcomeForString } from 'common/outcome';
import * as Packet from 'common/packet-ids';

import { PacketCreateMarket, PacketHandshakeComplete, PacketMarketCreated } from 'common/packets';
import App from '../app';
import { MANIFOLD_API_BASE_URL } from '../envs';
import log from '../logger';
import * as ManifoldAPI from '../manifold-api';
import User from '../user';

export default class DockClient {
  readonly socket: Socket;
  readonly app: App;
  connectedUser: User;
  connectedTwitchStream: string;

  constructor(app: App, socket: Socket) {
    this.app = app;
    this.socket = socket;

    this.init();
  }

  async init() {
    this.connectedUser = <User>this.socket.data;

    const connectedTwitchStream = (this.connectedTwitchStream = this.connectedUser.data.twitchLogin);

    log.debug(`Dock socket for Twitch user ${connectedTwitchStream} connected (SID: ${this.socket.id})`);

    this.socket.join(connectedTwitchStream);

    const market = this.app.getMarketForTwitchChannel(connectedTwitchStream);
    this.socket.emit(Packet.HANDSHAKE_COMPLETE, <PacketHandshakeComplete>{ actingManifoldUserID: this.connectedUser.data.manifoldID, manifoldAPIBase: MANIFOLD_API_BASE_URL });
    if (market) {
      this.socket.emit(Packet.SELECT_MARKET_ID, market.data.id);
    } else {
      this.socket.emit(Packet.UNFEATURE_MARKET);
    }

    this.socket.on(Packet.SELECT_MARKET_ID, async (marketID) => {
      log.debug(`Select market ID '${marketID}' requested for channel '${connectedTwitchStream}' by dock`);
      try {
        await this.app.selectMarket(connectedTwitchStream, marketID, this);
      } catch (e) {
        this.socket.emit(Packet.UNFEATURE_MARKET);
        log.trace(e);
      }
    });

    this.socket.on(Packet.UNFEATURE_MARKET, async () => {
      log.debug(`Market unfeatured for channel '${connectedTwitchStream}'`);
      await this.app.selectMarket(connectedTwitchStream, null, this);
    });

    this.socket.on(Packet.RESOLVE, async (outcomeString: string) => {
      const currentMarket = this.app.getMarketForTwitchChannel(connectedTwitchStream);
      if (!currentMarket) {
        log.error(`Received resolve request when no market was active for stream '${connectedTwitchStream}'`);
        return;
      }

      log.debug(`Dock requested market '${currentMarket.data.id}' resolve ${outcomeString}`);

      const outcome = getOutcomeForString(outcomeString);
      if (!outcome) {
        log.error('Received invalid resolve outcome: ' + outcomeString);
        return;
      }

      try {
        await ManifoldAPI.resolveBinaryMarket(currentMarket.data.id, this.connectedUser.data.APIKey, outcome);
      } catch (e) {
        log.trace(e);
      }
    });

    this.socket.on(Packet.CREATE_MARKET, async (packet: PacketCreateMarket) => {
      try {
        const newMarket = await ManifoldAPI.createBinaryMarket(this.connectedUser.data.APIKey, packet.question, undefined, 50, { groupID: packet.groupId, visibility: 'unlisted' });
        this.socket.emit(Packet.MARKET_CREATED, <PacketMarketCreated>{ id: newMarket.id });
        log.debug('Created new market via dock: ' + packet.question);
      } catch (e) {
        this.socket.emit(Packet.MARKET_CREATED, <PacketMarketCreated>{ failReason: e.message });
      }
    });

    this.socket.on(Packet.PING, () => {
      this.socket.emit(Packet.PONG);
    });

    this.socket.on('disconnect', () => {
      log.debug(`Dock socket for Twitch user ${connectedTwitchStream} disconnected (SID: ${this.socket.id})`);
    });
  }
}
