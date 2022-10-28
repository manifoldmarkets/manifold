import GoogleLogger from './google-logger';
import { detectGCloudInstance } from './utils';

enum Level {
  INFO,
  DEBUG,
  WARN,
  ERROR,
  TRACE,
}

let l: GoogleLogger = undefined;
async function init() {
  await detectGCloudInstance().then(async (r) => {
    if (r) {
      log(Level.INFO, 'Using Google Cloud Logging.');
      l = await GoogleLogger.getLogger();
    }
  });
}

function formatDate(date: Date) {
  let day = date.getDate().toString();
  let month = (date.getMonth() + 1).toString();
  let hours = date.getHours().toString();
  let minutes = date.getMinutes().toString();
  let seconds = date.getSeconds().toString();
  let millis = date.getMilliseconds().toString();
  if (month.length < 2) month = '0' + month;
  if (day.length < 2) day = '0' + day;
  if (hours.length < 2) hours = '0' + hours;
  if (minutes.length < 2) minutes = '0' + minutes;
  if (seconds.length < 2) seconds = '0' + seconds;
  if (millis.length < 3) millis = (millis.length == 2 ? '0' : '00') + millis;
  return `[${date.getFullYear()}-${month}-${day} ${hours}:${minutes}:${seconds}.${millis}]`;
}

const date = new Date();
function log(level: Level, msg: any, ...args: any[]) {
  date.setTime(Date.now());
  const timestamp = formatDate(date);

  const output = `${timestamp} ${Level[level]}: ${String(msg)} ${String(args)}`;

  switch (level) {
    case Level.DEBUG:
      console.debug(output);
      l?.debug(output);
      break;
    case Level.ERROR:
      console.error(output);
      l?.error(output);
      break;
    case Level.INFO:
      console.log(output);
      l?.info(output);
      break;
    case Level.WARN:
      console.warn(output);
      l?.warning(output);
      break;
    case Level.TRACE:
      console.error(timestamp + ' ' + Level[level] + ': ' + msg.stack);
      l?.error(timestamp + ' ' + Level[level] + ': ' + msg.stack);
      break;
    default:
      l?.info(output);
      console.log(output);
  }
}

export default class {
  static info(msg: any, ...args: any[]) {
    log(Level.INFO, msg, args);
  }

  static debug(msg: any, ...args: any[]) {
    log(Level.DEBUG, msg, args);
  }

  static warn(msg: any, ...args: any[]) {
    log(Level.WARN, msg, args);
  }

  static error(msg: any, ...args: any[]) {
    log(Level.ERROR, msg, args);
  }

  static trace(error: Error, msg?: string, ...args: any[]) {
    log(Level.TRACE, error, msg, args);
  }

  static async flush() {
    await l?.flushEntryQueue();
  }

  static init = init;
}
