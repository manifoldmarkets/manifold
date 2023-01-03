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

const colors = {
  Reset: '\x1b[0m',
  Bright: '\x1b[1m',
  Dim: '\x1b[2m',
  Underscore: '\x1b[4m',
  Blink: '\x1b[5m',
  Reverse: '\x1b[7m',
  Hidden: '\x1b[8m',
  FgBlack: '\x1b[30m',
  FgRed: '\x1b[31m',
  FgGreen: '\x1b[32m',
  FgYellow: '\x1b[33m',
  FgBlue: '\x1b[34m',
  FgMagenta: '\x1b[35m',
  FgCyan: '\x1b[36m',
  FgWhite: '\x1b[37m',
  BgBlack: '\x1b[40m',
  BgRed: '\x1b[41m',
  BgGreen: '\x1b[42m',
  BgYellow: '\x1b[43m',
  BgBlue: '\x1b[44m',
  BgMagenta: '\x1b[45m',
  BgCyan: '\x1b[46m',
  BgWhite: '\x1b[47m',
};

function levelToColor(level: Level): string {
  switch (level) {
    case Level.DEBUG:
      return colors.FgMagenta;
    case Level.WARN:
      return colors.FgYellow;
    case Level.ERROR:
      return colors.FgRed;
    case Level.TRACE:
      return colors.FgRed;
    case Level.CRASH:
      return colors.FgRed;
    default:
      return colors.Reset;
  }
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

  const output = `${String(msg)} ${String(args)}`;
  const outputPrefix = `${colors.FgCyan}${timestamp}${colors.Reset} ${levelToColor(level) + Level[level]}: `;
  const localOutput = outputPrefix + output;

  switch (level) {
    case Level.DEBUG:
      console.debug(localOutput);
      l?.debug(output);
      break;
    case Level.ERROR:
      console.error(localOutput + colors.Reset);
      l?.error(output);
      break;
    case Level.INFO:
      console.log(localOutput);
      l?.info(output);
      break;
    case Level.WARN:
      console.warn(localOutput + colors.Reset);
      l?.warning(output);
      break;
    case Level.TRACE: {
      let message = '';
      if (msg?.stack) {
        message += msg.stack;
      } else {
        message += JSON.stringify(msg);
      }
      console.error(outputPrefix + message + colors.Reset);
      l?.error(message);
      break;
    }
    case Level.CRASH: {
      const getMessage = (prefix: string, useColors = false) => {
        let ls = '\n' + useColors ? colors.FgRed : '';
        for (let i = 0; i < prefix.length; i++) ls += ' ';
        let message = useColors ? colors.FgRed : '' + prefix + '================================= SERVER CRASH =================================';
        if (msg?.stack) {
          const stackLines = msg.stack.split('\n');
          for (const line of stackLines) {
            message += ls + line;
          }
        } else {
          message += ls + String(msg);
        }
        message += ls + '================================================================================' + useColors ? colors.Reset : '';
        return message;
      };
      console.error(getMessage(timestamp + ' ', true));
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
