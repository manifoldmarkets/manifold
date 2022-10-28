import { Log, Logging } from '@google-cloud/logging';
import { GOOGLE_LOG_NAME, GOOGLE_PROJECT_ID } from './envs';
import { detectGCloudInstance } from './utils';

enum Level {
  INFO,
  DEBUG,
  WARN,
  ERROR,
  TRACE,
}

let l: Log;
detectGCloudInstance().then((r) => {
  if (r) {
    const logging = new Logging({ projectId: GOOGLE_PROJECT_ID });
    l = logging.log(GOOGLE_LOG_NAME);
    log(Level.INFO, 'Using Google Cloud Logging');
  }
});

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
      l?.debug(l.entry(output));
      break;
    case Level.ERROR:
      console.error(output);
      l?.error(l.entry(output));
      break;
    case Level.INFO:
      console.log(output);
      l?.info(l.entry(output));
      break;
    case Level.WARN:
      console.warn(output);
      l?.warning(l.entry(output));
      break;
    case Level.TRACE:
      console.error(timestamp + ' ' + Level[level] + ': ' + msg.stack);
      l?.error(l.entry(output));
      break;
    default:
      l?.info(l.entry(output));
      console.log(output);
  }
}

export default class {
  static info(msg: any, ...args: any[]) {
    // l.info(msg, args);
    // console.log(msg, args);
    log(Level.INFO, msg, args);
  }

  static debug(msg: any, ...args: any[]) {
    // l.debug(msg, args);
    // console.debug(msg, args);
    log(Level.DEBUG, msg, args);
  }

  static warn(msg: any, ...args: any[]) {
    // l.warn(msg, args);
    // console.warn(msg, args);
    log(Level.WARN, msg, args);
  }

  static error(msg: any, ...args: any[]) {
    // l.error(msg, args);
    // console.error(msg, args);
    log(Level.ERROR, msg, args);
  }

  static trace(error: Error, msg?: string, ...args: any[]) {
    // l.trace(error, msg, args);
    // console.trace(obj, msg, args);
    log(Level.TRACE, error, msg, args);
  }
}
