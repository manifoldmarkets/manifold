import cors from 'cors';
import express, { Express } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { AddressInfo } from 'net';
import path from 'path';
import { Server } from 'socket.io';
import registerAPIEndpoints from './api';
import DockClient from './clients/dock';
import OverlayClient from './clients/overlay';
import { IS_DEV, PORT } from './envs';
import AppFirestore from './firestore';
import log from './logger';
import ManifoldFirestore from './manifold-firestore';
import { TwitchStream } from './stream';
import TwitchBot from './twitch-bot';
import User from './user';

export default class App {
  private readonly app: Express;
  io: Server;
  readonly bot: TwitchBot;
  readonly firestore: AppFirestore;
  readonly manifoldFirestore: ManifoldFirestore;
  readonly streams: { [twitchChannel: string]: TwitchStream } = {};
  readonly userIdToNameMap: { [k: string]: string } = {};

  public constructor() {
    this.app = express();
    this.app.use(cors());
    this.app.use(express.json());

    this.bot = new TwitchBot(this);
    this.firestore = new AppFirestore();
    this.manifoldFirestore = new ManifoldFirestore();
  }

  public async getDisplayNameForUserID(userID: string) {
    if (this.userIdToNameMap[userID]) {
      return this.userIdToNameMap[userID];
    }
    let displayName: string;
    try {
      const user = await this.firestore.getUserForManifoldID(userID);
      displayName = user.data.twitchLogin;
    } catch {
      try {
        const user = this.manifoldFirestore.getManifoldUserByManifoldID(userID);
        displayName = user.name;
      } catch (e) {
        log.warn(e);
        displayName = 'A trader';
      }
    }
    log.info(`Cached display name for user '${displayName}'.`);
    return (this.userIdToNameMap[userID] = displayName);
  }

  public getStreamByName(channel: string): TwitchStream | null {
    let stream = this.streams[channel];
    if (!stream) {
      stream = this.streams[channel] = new TwitchStream(this, channel);
    }
    return stream;
  }

  public async getUserForTwitchUsername(twitchUsername: string): Promise<User> {
    return this.firestore.getUserForTwitchUsername(twitchUsername);
  }

  public async launch() {
    await this.bot.connect();
    await this.manifoldFirestore.validateConnection();
    await this.manifoldFirestore.loadAllUsers();
    // await this.manifoldFirestore.test(); //!!! REMOVE

    const server = this.app.listen(PORT, () => {
      const addressInfo = <AddressInfo>server.address();
      const host = addressInfo.address;
      const port = addressInfo.port;
      log.info('Webserver and websocket listening at http://%s:%s', host, port);
    });

    this.io = new Server(server);
    this.io.use(async (socket, next) => {
      const type = socket.handshake.query.type;
      const controlToken = socket.handshake.query.controlToken;
      if (!(type === 'dock' || type === 'overlay')) {
        log.warn('Socket connection failed: Invalid connection type');
        next(new Error('Invalid connection type'));
        return;
      }
      const connectedUser = await this.firestore.getUserForControlToken(<string>controlToken);
      if (!connectedUser) {
        log.warn('Socket connection failed: No account associated with this control token');
        next(new Error('No account associated with this control token'));
        return;
      }
      socket.data = connectedUser;
      next();
    });
    this.io.on('connection', (socket) => {
      const twitchLogin = socket.data.data.twitchLogin;
      const stream = this.getStreamByName(twitchLogin);
      if (socket.handshake.query.type === 'dock') {
        stream.docks.push(new DockClient(this, socket, stream));
      } else if (socket.handshake.query.type === 'overlay') {
        stream.overlays.push(new OverlayClient(this, socket, stream));
      } else {
        log.error('Invalid connection type connected. This indicates a software bug on the server.');
      }
    });

    registerAPIEndpoints(this, this.app);

    if (IS_DEV) {
      this.app.use('*', createProxyMiddleware({ target: 'http://localhost:1000', ws: true }));
    } else {
      this.app.use(express.static(path.resolve('static'), { index: false, extensions: ['html'] }));
      this.app.get('*', (req, res) => res.sendFile(path.resolve('static/404.html')));
    }
  }
}
