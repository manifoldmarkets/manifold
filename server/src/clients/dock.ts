import { Socket } from 'socket.io';

import { getOutcomeForString } from 'common/outcome';
import * as Packet from 'common/packet-ids';

import { PacketCreateMarket, PacketGroupControlFields, PacketHandshakeComplete, PacketMarketCreated } from 'common/packets';
import App from '../app';
import { MANIFOLD_API_BASE_URL } from '../envs';
import log from '../logger';
import * as ManifoldAPI from '../manifold-api';
import { TwitchStream } from '../stream';
import User from '../user';
import { getParamsFromURL } from '../utils';

export default class DockClient {
  readonly socket: Socket;
  readonly app: App;
  connectedUser: User;
  stream: TwitchStream;

  constructor(app: App, socket: Socket, stream: TwitchStream) {
    this.app = app;
    this.socket = socket;
    this.stream = stream;
    log.debug(`Dock socket for Twitch user ${stream.name} connected (SID: ${this.socket.id})`);
    this.init();
  }

  private async init() {
    this.connectedUser = <User>this.socket.data;

    this.registerPacketHandlers();

    this.socket.join(this.stream.name);

    this.socket.emit(Packet.HANDSHAKE_COMPLETE, <PacketHandshakeComplete>{ actingManifoldUserID: this.connectedUser.data.manifoldID, manifoldAPIBase: MANIFOLD_API_BASE_URL });
    if (this.stream.featuredMarket) {
      this.socket.emit(Packet.SELECT_MARKET_ID, this.stream.featuredMarket.data.id);
    } else {
      this.socket.emit(Packet.UNFEATURE_MARKET);
    }
  }

  private registerPacketHandlers() {
    const streamName = this.stream.name;

    this.socket.on(Packet.SELECT_MARKET_ID, async (marketID) => {
      log.debug(`Select market ID '${marketID}' requested for channel '${streamName}' by dock`);
      try {
        await this.stream.selectMarket(marketID, this);
      } catch (e) {
        this.socket.emit(Packet.UNFEATURE_MARKET);
        log.trace(e);
      }
    });

    this.socket.on(Packet.UNFEATURE_MARKET, async () => {
      log.debug(`Market unfeatured for channel '${streamName}'`);
      await this.stream.selectMarket(null, this);
    });

    this.socket.on(Packet.RESOLVE, async (outcomeString: string) => {
      const currentMarket = this.stream.featuredMarket;
      if (!currentMarket) {
        log.error(`Received resolve request when no market was active for stream '${streamName}'`);
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

    this.socket.on(Packet.GROUP_CONTROL_FIELDS, async (p: PacketGroupControlFields) => {
      // for (const dock of this.app.dockClients) {
      //   dock.groupClear();
      // }
      try {
        for (const f of p.fields) {
          const params = getParamsFromURL(f.url);
          const controlToken = params['t'];
          const user = await this.app.firestore.getUserForControlToken(<string>controlToken);
          if (user) {
            f.valid = true;
            // const additionalTwitchStream = user.data.twitchLogin; //!!! To finish
            // if (additionalTwitchStream !== this.stream) {
            //   const packet: PacketGroupControl = { beingControlled: additionalTwitchStream, by: this.stream };
            //   for (const dock of this.app.dockClients) {
            //     dock.groupControl(packet);
            //   }
            //   log.info(`User ${this.connectedUser.data.twitchLogin} now has control of ${additionalTwitchStream}'s stream.`);
            // }
          } else {
            f.valid = false;
          }
        }
        this.socket.emit(Packet.GROUP_CONTROL_FIELDS, p);
      } catch (e) {
        log.trace(e);
      }
    });

    this.socket.on('disconnect', () => {
      this.stream.dockDisconnected(this);
      log.debug(`Dock socket for Twitch user ${streamName} disconnected (SID: ${this.socket.id})`);
    });
  }
}
