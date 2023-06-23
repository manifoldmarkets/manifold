import { Socket } from 'socket.io';

import { PacketClear, PacketHandshakeComplete, PacketResolved, PacketSelectQuestion } from '@common/packets';
import SocketWrapper from '@common/socket-wrapper';
import App from '../app';
import log from '../logger';
import { TwitchStream } from '../stream';
import User from '../user';

export default class OverlayClient {
  readonly socket: Socket;
  readonly sw: SocketWrapper<Socket>;
  readonly app: App;
  connectedUser: User;
  stream: TwitchStream;

  public constructor(app: App, socket: Socket, stream: TwitchStream) {
    this.app = app;
    this.socket = socket;
    this.sw = new SocketWrapper(socket);
    this.stream = stream;
    log.debug(`Overlay socket for Twitch user ${stream.name} connected (SID: ${this.socket.id})`);
    this.init();
  }

  private async init() {
    this.connectedUser = <User>this.socket.data;
    const streamName = this.stream.name;

    this.sw.emit(PacketHandshakeComplete, { serverID: process.env.__BUILD_ID__ } as PacketHandshakeComplete); //!!! This is slightly naughty as it is not setting the other parameters in the packet. Should make generic handshake packet that just has build ID.
    this.sw.emit(PacketClear);

    const question = this.stream.featuredQuestion;
    if (question) {
      const initialBetIndex = Math.max(0, question.data.bets.length - 3);
      const selectQuestionPacket: PacketSelectQuestion = { question: { ...question.data, bets: question.data.bets }, initialBets: question.data.bets.slice(initialBetIndex) };
      this.sw.emit(PacketSelectQuestion, selectQuestionPacket);
      if (question.resolveData) {
        this.sw.emit(PacketResolved, question.resolveData); //!!! What is this heinous mess??!
      }
    }

    this.socket.on('disconnect', () => {
      this.stream.overlayDisconnected(this);
      log.debug(`Overlay socket for Twitch user ${streamName} disconnected (SID: ${this.socket.id})`);
    });
  }
}
