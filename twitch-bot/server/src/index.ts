import { exit } from 'process';
import App from './app';
import log from './logger';

process.on('uncaughtException', async (e) => {
  log.crash(e);
  try {
    await log.flush();
  } finally {
    exit(1);
  }
});

process.on('unhandledRejection', async (e) => {
  if (e instanceof Error) {
    log.crash(e);
  } else {
    log.crash(new Error(String(e)));
  }
  try {
    await log.flush();
  } finally {
    exit(1);
  }
});

log.info('Starting application...');
log.init().then(() => new App().launch());
