import fetch from 'node-fetch';
import { GOOGLE_LOG_NAME, GOOGLE_PROJECT_ID } from './envs';
import log from './logger';

type GoogleAccessToken = {
  access_token: string;
  expires_in: number;
};

type Entry = {
  textPayload: string;
  resource: {
    type: string;
    labels: {
      project_id: string;
    };
  };
  timestamp: string;
  severity: string;
  logName: string;
};

export default class GoogleLogger {
  private static logger: GoogleLogger;
  private accessToken: GoogleAccessToken;
  private date: Date;
  private logQueue: Entry[] = [];
  private timeoutTask: NodeJS.Timeout = null;

  private constructor() {
    this.date = new Date();
  }

  public static async getLogger(): Promise<GoogleLogger> {
    if (this.logger) return this.logger;
    this.logger = new GoogleLogger();
    await this.logger.updateAccessToken();
    return this.logger;
  }

  private async updateAccessToken(): Promise<void> {
    try {
      const token = <GoogleAccessToken>await fetch('http://metadata/computeMetadata/v1/instance/service-accounts/default/token', { headers: { 'Metadata-Flavor': 'Google' } }).then((r) => r.json());
      setTimeout(() => this.updateAccessToken(), (token.expires_in - 60) * 1000); // Fetch a new token 1 minute early
      this.accessToken = token;
      log.info(`Renewed GCloud Logging access token. New expiry in ${token.expires_in}s.`);
    } catch (e) {
      log.error(`Failed to renew GCloud Logging access token. Trying again in 30s...`);
      log.trace(e);
      setTimeout(() => this.updateAccessToken(), 30 * 1000);
    }
  }

  private addEntryToQueue(entry: Entry) {
    this.logQueue.push(entry);

    if (!this.timeoutTask) {
      this.timeoutTask = setTimeout(() => {
        this.flushEntryQueue();
        this.timeoutTask = null;
      }, 10000);
    }
  }

  public async flushEntryQueue() {
    try {
      const body = { entries: this.logQueue };
      await fetch('https://logging.googleapis.com/v2/entries:write', { method: 'POST', headers: { Authorization: `Bearer ${this.accessToken.access_token}` }, body: JSON.stringify(body) });
      this.logQueue = [];
    } catch (e) {}
  }

  public log(msg: string, severity: 'DEFAULT' | 'DEBUG' | 'INFO' | 'NOTICE' | 'WARNING' | 'ERROR' | 'CRITICAL' | 'ALERT' | 'EMERGENCY') {
    if (!this.accessToken) return;
    this.date.setTime(Date.now());
    const entry: Entry = {
      textPayload: msg,
      resource: {
        type: 'global',
        labels: {
          project_id: GOOGLE_PROJECT_ID,
        },
      },
      timestamp: this.date.toISOString(),
      severity,
      logName: `projects/${GOOGLE_PROJECT_ID}/logs/${GOOGLE_LOG_NAME}`,
    };
    this.addEntryToQueue(entry);
  }

  public info(msg: string) {
    this.log(msg, 'INFO');
  }

  public debug(msg: string) {
    this.log(msg, 'DEBUG');
  }

  public warning(msg: string) {
    this.log(msg, 'WARNING');
  }

  public error(msg: string) {
    this.log(msg, 'ERROR');
  }

  public critical(msg: string) {
    this.log(msg, 'CRITICAL');
  }
}
