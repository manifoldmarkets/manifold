import { Socket } from 'socket.io';

import { getOutcomeForString } from '@common/outcome';
import {
  PacketCreateQuestion,
  PacketGroupControlFields,
  PacketHandshakeComplete,
  PacketQuestionCreated,
  PacketPing,
  PacketPong,
  PacketRequestResolve,
  PacketSelectQuestionID,
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
    if (this.stream.featuredQuestion) {
      sw.emit(PacketSelectQuestionID, { id: this.stream.featuredQuestion.data.id });
    } else {
      sw.emit(PacketUnfeature);
    }
    this.stream.updateGroupsInDocks(this);
  }

  private registerPacketHandlers() {
    const streamName = this.stream.name;
    const sw = this.sw;

    this.sw.on(PacketSelectQuestionID, async (p) => {
      log.debug(`Select question ID '${p.id}' requested for channel '${streamName}' by dock`);
      try {
        await this.stream.selectQuestion(p.id, this);
      } catch (e) {
        this.sw.emit(PacketUnfeature);
        log.trace(e);
      }
    });

    sw.on(PacketUnfeature, async () => {
      log.debug(`Question unfeatured for channel '${streamName}'`);
      await this.stream.selectQuestion(null, this);
    });

    sw.on(PacketRequestResolve, async (p) => {
      const currentQuestion = this.stream.featuredQuestion;
      if (!currentQuestion) {
        log.error(`Received resolve request when no question was active for stream '${streamName}'`);
        return;
      }

      log.debug(`Dock requested question '${currentQuestion.data.id}' resolve ${p.outcomeString}`);

      const outcome = getOutcomeForString(p.outcomeString);
      if (!outcome) {
        log.error('Received invalid resolve outcome: ' + p.outcomeString);
        return;
      }

      try {
        await ManifoldAPI.resolveBinaryQuestion(currentQuestion.data.id, this.connectedUser.data.APIKey, outcome);
      } catch (e) {
        log.trace(e);
      }
    });

    sw.on(PacketCreateQuestion, async (packet: PacketCreateQuestion) => {
      try {
        const newQuestion = await ManifoldAPI.createBinaryQuestion(this.connectedUser.data.APIKey, packet.question, undefined, 50, { groupID: packet.groupId, visibility: 'unlisted' });
        sw.emit(PacketQuestionCreated, { id: newQuestion.id });
        log.debug('Created new question via dock: ' + packet.question);
      } catch (e) {
        sw.emit(PacketQuestionCreated, { failReason: e.message });
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
