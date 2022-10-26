import * as Packet from 'common/packet-ids';
import { UNFEATURE_MARKET } from 'common/packet-ids';
import { PacketSelectMarket } from 'common/packets';
import cors from 'cors';
import express, { Express } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { AddressInfo } from 'net';
import fetch from 'node-fetch';
import path from 'path';
import { Server } from 'socket.io';
import registerAPIEndpoints from './api';
import DockClient from './clients/dock';
import OverlayClient from './clients/overlay';
import { IS_DEV, PORT } from './envs';
import AppFirestore from './firestore';
import log from './logger';
import ManifoldFirestore from './manifold-firestore';
import { Market } from './market';
import TwitchBot from './twitch-bot';
import User from './user';

export default class App {
  private readonly app: Express;
  io: Server;
  readonly bot: TwitchBot;
  readonly firestore: AppFirestore;
  readonly manifoldFirestore: ManifoldFirestore;

  readonly userIdToNameMap: { [k: string]: string } = {};

  selectedMarketMap: { [twitchChannel: string]: Market } = {};

  autoUnfeatureTimers: { [twitchChannel: string]: NodeJS.Timeout } = {};

  dockClients: DockClient[] = [];

  constructor() {
    this.app = express();
    this.app.use(cors());
    this.app.use(express.json());

    this.bot = new TwitchBot(this);
    this.firestore = new AppFirestore();
    this.manifoldFirestore = new ManifoldFirestore();

    fetch('http://metadata.google.internal/computeMetadata/v1/instance/id', { headers: { 'Metadata-Flavor': 'Google' } })
      .then(async (r) => {
        const id = await r.text();
        log.info('Running with Google Cloud Run instance id: ' + id);
      })
      .catch(() => {});
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

  public getMarketForTwitchChannel(channel: string): Market | null {
    return this.selectedMarketMap[channel];
  }

  public getChannelForMarketID(marketID: string) {
    for (const channel of Object.keys(this.selectedMarketMap)) {
      const market = this.selectedMarketMap[channel];
      if (market.data.id == marketID) return channel;
    }
    return null;
  }

  public async selectMarket(channel: string, id: string, sourceDock?: DockClient): Promise<Market> {
    this.unfeatureCurrentMarket(channel, sourceDock);

    if (id) {
      try {
        const market = await Market.loadFromManifoldID(this, id, channel);
        this.selectedMarketMap[channel] = market;
        log.debug(`Selected market '${market.data.question}' for channel '${channel}'`);
        const initialBetIndex = Math.max(0, market.allBets.length - 3);
        const selectMarketPacket: PacketSelectMarket = { ...market.data, bets: market.allBets, initialBets: market.allBets.slice(initialBetIndex) };
        if (sourceDock) {
          sourceDock.socket.broadcast.to(channel).emit(Packet.SELECT_MARKET_ID, id);
          sourceDock.socket.broadcast.to(channel).emit(Packet.SELECT_MARKET, selectMarketPacket);
        } else {
          this.io.to(channel).emit(Packet.SELECT_MARKET_ID, id);
          this.io.to(channel).emit(Packet.SELECT_MARKET, selectMarketPacket);
        }
        log.debug('Sent market data to overlay');
        return market;
      } catch (e) {
        throw new Error('Failed to feature market: ' + e.message);
      }
    }
  }

  public unfeatureCurrentMarket(channel: string, sourceDock?: DockClient) {
    if (this.autoUnfeatureTimers[channel]) {
      clearTimeout(this.autoUnfeatureTimers[channel]);
      delete this.autoUnfeatureTimers[channel];
    }

    const existingMarket = this.getMarketForTwitchChannel(channel);
    if (existingMarket) {
      existingMarket.unfeature();
      delete this.selectedMarketMap[channel];
    }

    log.debug(`Emitting UFM to ${sourceDock.connectedTwitchStream}`);
    if (sourceDock) {
      sourceDock.socket.broadcast.to(channel).emit(Packet.UNFEATURE_MARKET);
    } else {
      this.io.to(channel).emit(UNFEATURE_MARKET);
    }
  }

  async getUserForTwitchUsername(twitchUsername: string): Promise<User> {
    return this.firestore.getUserForTwitchUsername(twitchUsername);
  }

  public marketResolved(market: Market) {
    const channel = this.getChannelForMarketID(market.data.id);
    this.autoUnfeatureTimers[channel] = setTimeout(() => {
      this.selectMarket(channel, null);
      this.io.to(channel).emit(UNFEATURE_MARKET);
    }, 24000);
    this.bot.onMarketResolved(channel, market);
  }

  async launch() {
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
      if (socket.handshake.query.type === 'dock') {
        this.dockClients.push(new DockClient(this, socket));
      } else if (socket.handshake.query.type === 'overlay') {
        new OverlayClient(this, socket);
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
