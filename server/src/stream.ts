import * as Packet from 'common/packet-ids';
import { PacketSelectMarket } from 'common/packets';
import App from './app';
import DockClient from './clients/dock';
import OverlayClient from './clients/overlay';
import log from './logger';
import { Market } from './market';

export class TwitchStream {
  readonly app: App;
  readonly name: string;
  readonly docks: DockClient[] = [];
  readonly overlays: OverlayClient[] = [];
  featuredMarket: Market = null;
  unfeatureTimer: NodeJS.Timeout = null;

  constructor(app: App, twitchName: string) {
    this.app = app;
    this.name = twitchName;
  }

  public async selectMarket(id: string, sourceDock?: DockClient): Promise<Market> {
    const channel = this.name; //!!!
    this.unfeatureCurrentMarket(sourceDock);

    if (id) {
      try {
        const market = await Market.loadFromManifoldID(this.app, id, this);
        this.featuredMarket = market;
        log.debug(`Selected market '${market.data.question}' for channel '${channel}'`);
        const initialBetIndex = Math.max(0, market.allBets.length - 3);
        const selectMarketPacket: PacketSelectMarket = { ...market.data, bets: market.allBets, initialBets: market.allBets.slice(initialBetIndex) };
        if (sourceDock) {
          sourceDock.socket.broadcast.to(channel).emit(Packet.SELECT_MARKET_ID, id);
          sourceDock.socket.broadcast.to(channel).emit(Packet.SELECT_MARKET, selectMarketPacket);
        } else {
          this.app.io.to(channel).emit(Packet.SELECT_MARKET_ID, id);
          this.app.io.to(channel).emit(Packet.SELECT_MARKET, selectMarketPacket);
        }
        log.debug('Sent market data to overlay');
        return market;
      } catch (e) {
        throw new Error('Failed to feature market: ' + e.message);
      }
    }
  }

  public unfeatureCurrentMarket(sourceDock?: DockClient) {
    if (this.unfeatureTimer) {
      clearTimeout(this.unfeatureTimer);
    }

    const existingMarket = this.featuredMarket;
    if (existingMarket) {
      existingMarket.unfeature();
    }

    if (sourceDock) {
      log.debug(`Emitting UFM to ${sourceDock.stream.name}`);
      sourceDock.socket.broadcast.to(this.name).emit(Packet.UNFEATURE_MARKET);
    } else {
      this.app.io.to(this.name).emit(Packet.UNFEATURE_MARKET);
    }
  }

  public marketResolved(market: Market) {
    this.unfeatureTimer = setTimeout(() => {
      this.selectMarket(this.name, null);
      this.app.io.to(this.name).emit(Packet.UNFEATURE_MARKET);
    }, 24000);
    this.app.bot.onMarketResolved(this.name, market);
  }

  public dockDisconnected(dock: DockClient) {
    this.docks.splice(this.docks.indexOf(dock), 1);
  }

  public overlayDisconnected(overlay: OverlayClient) {
    this.overlays.splice(this.overlays.indexOf(overlay), 1);
  }
}
