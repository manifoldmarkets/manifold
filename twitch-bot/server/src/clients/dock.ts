import { Socket } from 'socket.io';

import { getOutcomeForString } from '@common/outcome';
import {
  PacketCreateMarket,
  PacketGroupControlFields,
  PacketHandshakeComplete,
  PacketMarketCreated,
  PacketPing,
  PacketPong,
  PacketRequestResolve,
  PacketSelectMarketID,
  PacketUnfeature,
} from '@common/packets';
import SocketWrapper from '@common/socket-wrapper';
import App from '../app';
import { MANIFOLD_API_BASE_URL } from '../envs';
import log from '../logger';
import * as ManifoldAPI from '../manifold-api';
import { TwitchStream } from '../stream';
import User from '../user';

export default class DockClient {
  readonly socket: Socket;
  readonly sw: SocketWrapper<Socket>;
  readonly app: App;
  connectedUser: User;
  stream: TwitchStream;

  constructor(app: App, socket: Socket, stream: TwitchStream) {
    this.app = app;
    this.socket = socket;
    this.sw = new SocketWrapper(socket);
    this.stream = stream;
    log.debug(`Dock socket for Twitch user ${stream.name} connected (SID: ${this.socket.id})`);
    this.init();
  }

  private async init() {
    const sw = this.sw;

    this.connectedUser = <User>this.socket.data;

    this.registerPacketHandlers();

    const handshakePacket: PacketHandshakeComplete = {
      actingManifoldUserID: this.connectedUser.data.manifoldID,
      manifoldAPIBase: MANIFOLD_API_BASE_URL,
      serverID: process.env.__BUILD_ID__,
      isAdmin: this.connectedUser.data.admin || false,
    };
    sw.emit(PacketHandshakeComplete, handshakePacket);
    if (this.stream.featuredMarket) {
      sw.emit(PacketSelectMarketID, { id: this.stream.featuredMarket.data.id });
    } else {
      sw.emit(PacketUnfeature);
    }
    this.stream.updateGroupsInDocks(this);
  }

  private registerPacketHandlers() {
    const streamName = this.stream.name;
    const sw = this.sw;

    this.sw.on(PacketSelectMarketID, async (p) => {
      log.debug(`Select market ID '${p.id}' requested for channel '${streamName}' by dock`);
      try {
        await this.stream.selectMarket(p.id, this);
      } catch (e) {
        this.sw.emit(PacketUnfeature);
        log.trace(e);
      }
    });

    sw.on(PacketUnfeature, async () => {
      log.debug(`Market unfeatured for channel '${streamName}'`);
      await this.stream.selectMarket(null, this);
    });

    sw.on(PacketRequestResolve, async (p) => {
      const currentMarket = this.stream.featuredMarket;
      if (!currentMarket) {
        log.error(`Received resolve request when no market was active for stream '${streamName}'`);
        return;
      }

      log.debug(`Dock requested market '${currentMarket.data.id}' resolve ${p.outcomeString}`);

      const outcome = getOutcomeForString(p.outcomeString);
      if (!outcome) {
        log.error('Received invalid resolve outcome: ' + p.outcomeString);
        return;
      }

      try {
        await ManifoldAPI.resolveBinaryMarket(currentMarket.data.id, this.connectedUser.data.APIKey, outcome);
      } catch (e) {
        log.trace(e);
      }
    });

    sw.on(PacketCreateMarket, async (packet: PacketCreateMarket) => {
      try {
        const newMarket = await ManifoldAPI.createBinaryMarket(this.connectedUser.data.APIKey, packet.question, undefined, 50, { groupID: packet.groupId, visibility: 'unlisted' });
        sw.emit(PacketMarketCreated, { id: newMarket.id });
        log.debug('Created new market via dock: ' + packet.question);
      } catch (e) {
        sw.emit(PacketMarketCreated, { failReason: e.message });
      }
    });

    sw.on(PacketPing, () => sw.emit(PacketPong));

    sw.on(PacketGroupControlFields, async (p) => {
      this.stream.updateGroupControlFields(p);
    });

    this.socket.on('disconnect', () => {
      this.stream.dockDisconnected(this);
      log.debug(`Dock socket for Twitch user ${streamName} disconnected (SID: ${this.socket.id})`);
    });
  }
}
