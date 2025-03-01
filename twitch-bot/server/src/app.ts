import cors from 'cors';
import express, { Express } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { AddressInfo } from 'net';
import fetch from 'node-fetch';
import path from 'path';
import { exit } from 'process';
import { Server } from 'socket.io';
import registerAPIEndpoints from './api';
import DockClient from './clients/dock';
import OverlayClient from './clients/overlay';
import { IS_DEV, PORT } from './envs';
import AppFirestore from './firestore';
import log from './logger';
import ManifoldFirestore from './manifold-firestore';
import { Metrics } from './metrics';
import { TwitchStream } from './stream';
import TwitchBot from './twitch-bot';
import User from './user';

export default class App {
  private readonly app: Express;
  io: Server;
  readonly bot: TwitchBot;
  readonly firestore: AppFirestore;
  readonly manifoldFirestore: ManifoldFirestore;
  readonly metrics: Metrics;
  readonly streams: { [twitchChannel: string]: TwitchStream } = {};
  readonly userIdToNameMap: { [k: string]: string } = {};

  public constructor() {
    this.app = express();
    this.app.use(cors());
    this.app.use(express.json());

    this.bot = new TwitchBot(this);
    this.firestore = new AppFirestore();
    this.manifoldFirestore = new ManifoldFirestore();
    this.metrics = new Metrics(this);
  }

  public async getDisplayNameForUserID(userID: string) {
    if (this.userIdToNameMap[userID]) {
      return this.userIdToNameMap[userID];
    }
    let displayName: string;
    try {
      const user = this.firestore.getUserForManifoldID(userID);
      displayName = user.data.twitchLogin;
    } catch {
      try {
        const user = await this.manifoldFirestore.getManifoldUserByManifoldID(userID);
        displayName = user.name;
      } catch (e) {
        log.warn(e);
        displayName = 'A trader';
      }
    }
    return (this.userIdToNameMap[userID] = displayName);
  }

  public getStreamByName(channel: string): TwitchStream | null {
    let stream = this.streams[channel];
    if (!stream) {
      stream = this.streams[channel] = new TwitchStream(this, channel);
    }
    return stream;
  }

  public getUserForTwitchUsername(twitchUsername: string): User {
    return this.firestore.getUserForTwitchUsername(twitchUsername);
  }

  private s2() {
    const e = express();
    const server = e.listen(5000, () => {
      const addressInfo = <AddressInfo>server.address();
      const port = addressInfo.port;
      log.info(`Internal webserver listening on port ${port}`);
    });
    e.get('/online', (req, res) => res.json({ online: true }));
    e.post('/shutdown', (req, res) => {
      res.json({ success: true });
      exit(0);
    });
  }

  public async launch() {
    await this.metrics.load();
    await this.firestore.loadUsers();
    await this.bot.connect();
    await this.manifoldFirestore.load();

    try {
      await fetch('http://localhost:5000/online');
      log.info('Found already running service instance. Requesting shutdown...');
      await fetch('http://localhost:5000/shutdown', { method: 'POST' });
      log.info('Shutdown successful.');
      await new Promise<void>((r) => setTimeout(r, 100)); //!!! Defeats the point somewhat...
    } catch (e) {}
    this.s2();

    const server = this.app.listen(PORT, () => {
      const addressInfo = <AddressInfo>server.address();
      const host = addressInfo.address;
      const port = addressInfo.port;
      log.info(`Webserver and websocket listening at http://${host}:${port}`);
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
      const connectedUser = this.firestore.getUserForControlToken(<string>controlToken);
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
