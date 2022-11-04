import GoogleLogger from './google-logger';
import { detectGCloudInstance } from './utils';

enum Level {
  INFO,
  DEBUG,
  WARN,
  ERROR,
  TRACE,
  CRASH,
}

let l: GoogleLogger = undefined;
async function init() {
  await detectGCloudInstance().then(async (r) => {
    let message = 'Initialized logging. Using ';
    if (r) {
      l = await GoogleLogger.getLogger();
      message += 'Google Cloud logger.';
    } else {
      message += 'default logger.';
    }
    log(Level.INFO, message);
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
function getTimestamp() {
  date.setTime(Date.now());
  return formatDate(date);
}

function log(level: Level, msg: any, ...args: any[]) {
  const timestamp = getTimestamp();

  const outputPrefix = `${timestamp} ${Level[level]}: `;
  const output = `${String(msg)} ${String(args)}`;
  const localOutput = outputPrefix + output;

  switch (level) {
    case Level.DEBUG:
      console.debug(localOutput);
      l?.debug(output);
      break;
    case Level.ERROR:
      console.error(localOutput);
      l?.error(output);
      break;
    case Level.INFO:
      console.log(localOutput);
      l?.info(output);
      break;
    case Level.WARN:
      console.warn(localOutput);
      l?.warning(output);
      break;
    case Level.TRACE: {
      let message = '';
      if (msg?.stack) {
        message += msg.stack;
      } else {
        message += JSON.stringify(msg);
      }
      console.error(outputPrefix + message);
      l?.error(message);
      break;
    }
    case Level.CRASH: {
      const getMessage = (prefix: string) => {
        let ls = '\n';
        for (let i = 0; i < prefix.length; i++) ls += ' ';
        let message = prefix + '================================= SERVER CRASH =================================';
        if (msg?.stack) {
          const stackLines = msg.stack.split('\n');
          for (const line of stackLines) {
            message += ls + line;
          }
        } else {
          message += ls + String(msg);
        }
        message += ls + '================================================================================';
        return message;
      };
      console.error(getMessage(timestamp + ' '));
      l?.critical(getMessage(''));
      break;
    }
    default:
      throw new Error('Illegal log level used: ' + level);
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

  static crash(error: Error, msg?: string, ...args: any[]) {
    log(Level.CRASH, error, msg, args);
  }

  static async flush() {
    await l?.flushEntryQueue();
  }

  static init = init;
}
