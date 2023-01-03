import App from './app';
import User from './user';
import { getCurrentEpochDay, MetricDay } from '@common/types/metric-types';

export enum MetricEvent {
  MARKET_FEATURED,
  FIRST_TIME_BOT,
  NEW_LINEKD_ACCOUNT,
  COMMAND_USED,
}

export enum UniqueMetricEvent {
  UNIQUE_OVERLAY,
  UNIQUE_COMMAND_USER,
}

class UnknownMetricsEventException extends Error {
  constructor(e: MetricEvent | UniqueMetricEvent) {
    super(`Unknown metrics event ID: ${e}`);
  }
}

export class Metrics {
  private readonly app: App;
  private readonly data: { [k: number]: MetricDay } = {};
  private readonly pushTimers: { [k: number]: NodeJS.Timeout } = {};

  constructor(app: App) {
    this.app = app;
  }

  public async load() {
    this.data[getCurrentEpochDay()] = await this.app.firestore.getMetricData(getCurrentEpochDay());
  }

  private suggestPushDataToDB() {
    const currentDay = getCurrentEpochDay();
    if (this.pushTimers[currentDay]) return;
    const timer = setTimeout(() => {
      delete this.pushTimers[currentDay];
      this.app.firestore.updateMetricsData(currentDay, this.data[currentDay]);
    }, 10 * 1000); // TODO adjust time
    this.pushTimers[currentDay] = timer;
  }

  logMetricsEvent(e: MetricEvent) {
    const currentDay = getCurrentEpochDay();
    let dayData = this.data[currentDay];
    if (!dayData) {
      dayData = {
        activeUsers: 0,
        commandsUsed: 0,
        featuredQuestions: 0,
        newBots: 0,
        twitchLinks: 0,
        uniqueUserFeatures: 0,
      };
    }
    switch (e) {
      case MetricEvent.COMMAND_USED:
        dayData.commandsUsed++;
        break;
      case MetricEvent.FIRST_TIME_BOT:
        dayData.newBots++;
        break;
      case MetricEvent.MARKET_FEATURED:
        dayData.featuredQuestions++;
        break;
      case MetricEvent.NEW_LINEKD_ACCOUNT:
        dayData.twitchLinks++;
        break;
      default:
        throw new UnknownMetricsEventException(e);
    }
    this.data[currentDay] = dayData;

    this.suggestPushDataToDB();
  }

  setUserUniqueEventFlag(u: User, e: UniqueMetricEvent): void {
    if (!u.data.metrics) {
      u.data.metrics = {};
    }
    const currentDay = getCurrentEpochDay();
    switch (e) {
      case UniqueMetricEvent.UNIQUE_COMMAND_USER:
        u.data.metrics.lastCommand_day = currentDay;
        break;
      case UniqueMetricEvent.UNIQUE_OVERLAY:
        u.data.metrics.lastOverlayFeatured_day = currentDay;
        break;
      default:
        throw new UnknownMetricsEventException(e);
    }
    this.app.firestore.updateUserMetricsInfo(u, u.data.metrics);
  }

  hasUserHadUniqueEventToday(u: User, e: UniqueMetricEvent): boolean {
    const m = u.data.metrics;
    if (!m) return false;
    const currentDay = getCurrentEpochDay();
    switch (e) {
      case UniqueMetricEvent.UNIQUE_COMMAND_USER:
        return m.lastCommand_day === currentDay;
      case UniqueMetricEvent.UNIQUE_OVERLAY:
        return m.lastOverlayFeatured_day === currentDay;
      default:
        return false;
    }
  }

  logUnqiueMetricsEvent(e: UniqueMetricEvent, u: User) {
    const currentDay = getCurrentEpochDay();
    switch (e) {
      case UniqueMetricEvent.UNIQUE_COMMAND_USER:
      case UniqueMetricEvent.UNIQUE_OVERLAY:
        if (!this.hasUserHadUniqueEventToday(u, e)) {
          // TODO code duplication:
          let dayData = this.data[currentDay];
          if (!dayData) {
            dayData = {
              activeUsers: 0,
              commandsUsed: 0,
              featuredQuestions: 0,
              newBots: 0,
              twitchLinks: 0,
              uniqueUserFeatures: 0,
            };
          }
          switch (e) {
            case UniqueMetricEvent.UNIQUE_COMMAND_USER:
              dayData.activeUsers++;
              break;
            case UniqueMetricEvent.UNIQUE_OVERLAY:
              dayData.uniqueUserFeatures++;
              break;
            default:
              throw new UnknownMetricsEventException(e);
          }
          this.data[currentDay] = dayData;

          this.suggestPushDataToDB();

          this.setUserUniqueEventFlag(u, e);
        }
        break;
      default: {
        throw new UnknownMetricsEventException(e);
      }
    }
  }
}
