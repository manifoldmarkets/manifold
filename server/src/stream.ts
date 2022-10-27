import * as Packet from 'common/packet-ids';
import { PacketGroupControlFields, PacketSelectMarket } from 'common/packets';
import { NamedBet } from 'common/types/manifold-abstract-types';
import App from './app';
import DockClient from './clients/dock';
import OverlayClient from './clients/overlay';
import log from './logger';
import { Market } from './market';
import { getParamsFromURL } from './utils';

type AdditionalControl = {
  url: string;
  valid: boolean;
  stream?: TwitchStream;
};

export class TwitchStream {
  readonly app: App;
  readonly name: string;
  readonly docks: DockClient[] = [];
  readonly overlays: OverlayClient[] = [];
  featuredMarket: Market = null;
  unfeatureTimer: NodeJS.Timeout = null;

  additionalControls: AdditionalControl[] = [];

  constructor(app: App, twitchName: string) {
    this.app = app;
    this.name = twitchName;
  }

  private broadcastToDocks(packetId: string, packet: any, sender?: DockClient) {
    for (const dock of this.docks) {
      if (dock === sender) continue;
      dock.socket.emit(packetId, packet);
    }
  }

  private broadcastToOverlays(packetId: string, packet: any) {
    for (const overlay of this.overlays) {
      overlay.socket.emit(packetId, packet);
    }
  }

  private broadcastToDocksAndOverlays(packetId: string, packet?: any, sender?: DockClient) {
    this.broadcastToDocks(packetId, packet, sender);
    this.broadcastToOverlays(packetId, packet);
  }

  public async selectMarket(id: string, sourceDock?: DockClient): Promise<Market> {
    for (const a of this.additionalControls) {
      if (a.stream) {
        await a.stream.selectMarket(id, sourceDock); //!!! await fixes thrown errors, but increases delay in selecting
      }
    }

    const channel = this.name; //!!!
    this.unfeatureCurrentMarket(sourceDock);

    if (id) {
      try {
        const market = await Market.loadFromManifoldID(this.app, id, this);
        this.featuredMarket = market;
        log.debug(`Selected market '${market.data.question}' for channel '${channel}'`);
        const initialBetIndex = Math.max(0, market.data.bets.length - 3);
        const selectMarketPacket: PacketSelectMarket = { ...market.data, bets: market.data.bets, initialBets: market.data.bets.slice(initialBetIndex) };
        this.broadcastToDocks(Packet.SELECT_MARKET_ID, id, sourceDock);
        this.broadcastToOverlays(Packet.SELECT_MARKET, selectMarketPacket);
        log.debug('Sent market data to overlay');
        return market;
      } catch (e) {
        throw new Error('Failed to feature market: ' + e.message);
      }
    }
  }

  private unfeatureCurrentMarket(sourceDock?: DockClient) {
    if (this.unfeatureTimer) {
      clearTimeout(this.unfeatureTimer);
    }
    if (this.featuredMarket) {
      this.featuredMarket.unfeature();
      this.featuredMarket = null;
    }
    this.broadcastToDocksAndOverlays(Packet.UNFEATURE_MARKET, undefined, sourceDock);
  }

  public marketResolved(market: Market) {
    this.unfeatureTimer = setTimeout(() => {
      this.selectMarket(null);
      this.broadcastToDocksAndOverlays(Packet.UNFEATURE_MARKET);
    }, 24000);
    this.app.bot.onMarketResolved(this.name, market);

    this.broadcastToDocksAndOverlays(Packet.RESOLVE, market.resolveData);
    this.broadcastToDocksAndOverlays(Packet.RESOLVED);
  }

  public onNewBet(bet: NamedBet) {
    this.broadcastToOverlays(Packet.ADD_BETS, [bet]);
  }

  public async updateGroupControlFields(p: PacketGroupControlFields) {
    this.additionalControls = [];
    try {
      for (const f of p.fields) {
        let alreadyExistingURL = false;
        for (const a of this.additionalControls) {
          if (a.url === f.url) {
            alreadyExistingURL = true;
            break;
          }
        }
        if (alreadyExistingURL) continue;

        const params = getParamsFromURL(f.url);
        const controlToken = params['t'];
        const user = await this.app.firestore.getUserForControlToken(<string>controlToken);
        let stream: TwitchStream = undefined;
        if (user) {
          f.valid = true;
          stream = this.app.getStreamByName(user.data.twitchLogin);
        } else {
          f.valid = false;
        }
        this.additionalControls.push({ url: f.url, valid: f.valid, stream });
      }
      this.updateGroupsInDocks();
    } catch (e) {
      log.trace(e);
    }
  }

  public updateGroupsInDocks(dock?: DockClient) {
    const p: PacketGroupControlFields = { fields: [] };
    for (const a of this.additionalControls) {
      p.fields.push({ url: a.url, valid: a.valid });
    }
    if (dock) {
      dock.socket.emit(Packet.GROUP_CONTROL_FIELDS, p);
    } else {
      this.broadcastToDocks(Packet.GROUP_CONTROL_FIELDS, p);
    }
  }

  public dockDisconnected(dock: DockClient) {
    this.docks.splice(this.docks.indexOf(dock), 1);
  }

  public overlayDisconnected(overlay: OverlayClient) {
    this.overlays.splice(this.overlays.indexOf(overlay), 1);
  }
}
