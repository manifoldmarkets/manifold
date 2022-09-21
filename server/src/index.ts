import { exit } from 'process';
import App from './app';
import log from './logger';

const app = new App();
app.launch().catch((e) => {
  log.trace(e);
  exit(1);
});
