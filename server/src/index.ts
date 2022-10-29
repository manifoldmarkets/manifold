import { exit } from 'process';
import App from './app';
import log from './logger';

process.on('uncaughtException', async (e) => {
  log.error('================================= SERVER CRASH =================================');
  log.trace(e);
  try {
    await log.flush();
  } finally {
    exit(1);
  }
});

process.on('unhandledRejection', async (e) => {
  log.error('================================= SERVER CRASH =================================');
  log.trace(new Error(String(e)));
  try {
    await log.flush();
  } finally {
    exit(1);
  }
});

log.info('================================ BOOTING SERVER ================================');
log.init().then(() => {
  const app = new App();
  app.launch().catch((e) => {
    log.trace(e);
    exit(1);
  });
});
