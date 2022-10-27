import { exit } from 'process';
import App from './app';
import log from './logger';

process.on('uncaughtException', function (e) {
  log.trace(e);
  exit(1);
});

const app = new App();
app.launch().catch((e) => {
  log.trace(e);
  exit(1);
});
