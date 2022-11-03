import { exit } from 'process';
import sourceMapSupport from 'source-map-support';
import App from './app';
import log from './logger';

if (process.env.NODE_ENV === 'production') {
  sourceMapSupport.install();
}

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
log.init().then(() => {
  const app = new App();
  app.launch().catch((e) => {
    log.trace(e);
    exit(1);
  });
});
