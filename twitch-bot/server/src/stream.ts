import { GroupControlField, Packet, PacketAddBets, PacketGroupControlFields, PacketResolved, PacketSelectMarket, PacketSelectMarketID, PacketUnfeature } from '@common/packets';
import { NamedBet } from '@common/types/manifold-abstract-types';
import App from './app';
import DockClient from './clients/dock';
import OverlayClient from './clients/overlay';
import log from './logger';
import { Market } from './market';
import { MetricEvent, UniqueMetricEvent } from './metrics';
import { getParamsFromURL } from './utils';

type AdditionalControl = GroupControlField & {
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

  private broadcastToDocks<T extends Packet>(type: { new (): T }, packet: T, sender?: DockClient) {
    for (const dock of this.docks) {
      if (dock === sender) continue;
      dock.sw.emit(type, packet);
    }
  }

  private broadcastToOverlays<T extends Packet>(type: { new (): T }, packet: T) {
    for (const overlay of this.overlays) {
      overlay.sw.emit(type, packet);
    }
  }

  private broadcastToDocksAndOverlays<T extends Packet>(type: { new (): T }, packet?: T, sender?: DockClient) {
    this.broadcastToDocks(type, packet, sender);
    this.broadcastToOverlays(type, packet);
  }

  public async selectMarket(id: string, sourceDock?: DockClient): Promise<Market> {
    await Promise.all(this.additionalControls.filter((a) => a.stream).map((a) => a.stream.selectMarket(id, sourceDock))); // TODO this is vulnerable to circular dependencies/groups

    this.unfeatureCurrentMarket(sourceDock);

    if (id) {
      try {
        const market = await Market.loadFromManifoldID(this.app, id, this);
        this.featuredMarket = market;
        log.debug(`Selected market '${market.data.question}' for channel '${this.name}'`);
        const initialBetIndex = Math.max(0, market.data.bets.length - 3);
        this.broadcastToDocks(PacketSelectMarketID, { id }, sourceDock);
        this.broadcastToOverlays(PacketSelectMarket, { market: { ...market.data, bets: market.data.bets }, initialBets: market.data.bets.slice(initialBetIndex) });
        this.app.firestore.updateSelectedMarketForUser(this.name, id);
        this.app.bot.onMarketFeatured(this.name, market);
        this.app.metrics.logMetricsEvent(MetricEvent.MARKET_FEATURED);
        this.app.metrics.logUnqiueMetricsEvent(UniqueMetricEvent.UNIQUE_OVERLAY, this.app.getUserForTwitchUsername(this.name));
        return market;
      } catch (e) {
        throw new Error('Failed to feature market: ' + e.message);
      }
    }
  }

  private unfeatureCurrentMarket(sourceDock?: DockClient) {
    this.app.firestore.updateSelectedMarketForUser(this.name, undefined);
    if (this.unfeatureTimer) {
      clearTimeout(this.unfeatureTimer);
    }
    if (this.featuredMarket) {
      this.featuredMarket.unfeature();
      this.featuredMarket = null;
    }
    this.broadcastToDocksAndOverlays(PacketUnfeature, undefined, sourceDock);
  }

  public marketResolved(market: Market) {
    this.unfeatureTimer = setTimeout(() => {
      this.selectMarket(null);
      this.broadcastToDocksAndOverlays(PacketUnfeature);
    }, 24000);
    this.app.bot.onMarketResolved(this.name, market);
    this.broadcastToDocksAndOverlays(PacketResolved, market.resolveData);
  }

  public onNewBet(bet: NamedBet) {
    this.broadcastToOverlays(PacketAddBets, { bets: [bet] });
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
        const user = this.app.firestore.getUserForControlToken(<string>controlToken);
        let stream: TwitchStream = undefined;
        if (user) {
          f.valid = true;
          stream = this.app.getStreamByName(user.data.twitchLogin);
          if (stream === this) continue;
        } else {
          f.valid = false;
        }
        this.additionalControls.push({ url: f.url, valid: f.valid, stream, affectedUserName: stream?.name });
      }
      this.updateGroupsInDocks();
    } catch (e) {
      log.trace(e);
    }
  }

  public updateGroupsInDocks(dock?: DockClient) {
    const p: PacketGroupControlFields = { fields: [] };
    for (const a of this.additionalControls) {
      p.fields.push({ url: a.url, valid: a.valid, affectedUserName: a.affectedUserName });
    }
    if (dock) {
      dock.sw.emit(PacketGroupControlFields, p);
    } else {
      this.broadcastToDocks(PacketGroupControlFields, p);
    }
  }

  public dockDisconnected(dock: DockClient) {
    this.docks.splice(this.docks.indexOf(dock), 1);
  }

  public overlayDisconnected(overlay: OverlayClient) {
    this.overlays.splice(this.overlays.indexOf(overlay), 1);
  }
}
