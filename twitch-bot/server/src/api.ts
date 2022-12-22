import crypto from 'crypto';
import { Express } from 'express';
import App from './app';
import { PUBLIC_FACING_URL, TWITCH_BOT_CLIENT_ID } from './envs';
import log from './logger';
import * as Manifold from './manifold-api';
import { MetricEvent } from './metrics';
import * as Twitch from './twitch-api';
import User from './user';
import { buildURL, getParamsFromURL } from './utils';

type APIResponse = {
  success: boolean;
  message: string;
  error: string;
};

const linksInProgress: { [sessionToken: string]: { manifoldID: string; apiKey: string; redirectURL: string } } = {};

export default function registerAPIEndpoints(app: App, express: Express) {
  express.post('/unregisterchanneltwitch', async (request, response) => {
    const { apiKey } = <{ apiKey: string }>request.body;
    if (!apiKey) {
      response.status(400).json({ msg: 'Bad request: missing channel name parameter c.' });
      return;
    }
    try {
      const user = app.firestore.getUserForManifoldAPIKey(apiKey);
      await app.bot.leaveChannel(user.data.twitchLogin);
      response.json(<APIResponse>{ success: true, message: `Bot successfully removed from channel ${user.data.twitchLogin}.` }); // TODO: Proper response (API type class)
    } catch (e) {
      response.status(400).json(<APIResponse>{ success: false, error: e.message, message: `Failed to remove bot: ${e.message}` });
    }
  });

  express.post('/registerchanneltwitch', async (request, response) => {
    const { apiKey } = <{ apiKey: string }>request.body;
    try {
      const user = app.firestore.getUserForManifoldAPIKey(apiKey);
      await app.bot.joinChannel(user.data.twitchLogin);
      response.json(<APIResponse>{ success: true, message: 'Registered bot.' });

      // TODO: Verify this code:
      if (!user.data.metrics || (user.data.metrics && !user.data.metrics.hasUsedBot)) {
        app.metrics.logMetricsEvent(MetricEvent.FIRST_TIME_BOT);
        app.firestore.updateUser(user, { metrics: { hasUsedBot: true } });
      }
    } catch (e) {
      log.trace(e);
      response.status(400).json(<APIResponse>{ success: false, error: e.message, message: 'Failed to register bot.' });
    }
  });

  express.post('/api/linkInit', async (request, response) => {
    try {
      const { manifoldID, apiKey, redirectURL } = request.body;
      if (!manifoldID || !apiKey || !redirectURL) {
        log.warn('Invalid request made to /api/linkInit: ' + JSON.stringify(request.body));
        throw new Error('manifoldID, apiKey and redirectURL parameters are required.');
      }
      if (!(await Manifold.verifyAPIKey(apiKey))) throw new Error('API key invalid.');

      const sessionToken = crypto.randomBytes(24).toString('hex');
      linksInProgress[sessionToken] = {
        manifoldID,
        apiKey,
        redirectURL,
      };

      const params = {
        client_id: TWITCH_BOT_CLIENT_ID,
        response_type: 'code',
        redirect_uri: `${PUBLIC_FACING_URL}/linkAccount`,
        scope: 'user:read:email',
        state: sessionToken,
      };
      const twitchAuthURL = buildURL('https://id.twitch.tv/oauth2/authorize', params);
      log.info(`Sent Twitch auth URL: ${twitchAuthURL}`);

      response.json({ message: 'Success.', twitchAuthURL });
    } catch (e) {
      response.status(400).json({ error: 'Bad request', message: e.message });
    }
  });

  express.get('/linkAccount', async (request, response) => {
    const params = <{ state: string; code: string }>getParamsFromURL(request.url);
    const sessionToken = params.state;
    const sessionData = linksInProgress[sessionToken];
    if (!sessionToken || !sessionData) {
      response.status(400).json({ error: 'Bad request', message: 'Invalid session token.' });
      return;
    }

    delete linksInProgress[sessionToken];

    const { code } = params;
    log.info(`Got a Twitch link request: ${code}`);
    try {
      const twitchUser = await Twitch.getTwitchDetailsFromLinkCode(code);
      const twitchLogin = twitchUser.login;
      log.info(`Authorized Twitch user ${twitchLogin}`);

      let user: User;
      try {
        user = app.firestore.getUserForManifoldID(sessionData.manifoldID);
        user.data.APIKey = sessionData.apiKey;
        log.info(`Updated user API key: ${sessionData.apiKey}`);
      } catch (e) {
        user = new User({
          twitchLogin,
          manifoldID: sessionData.manifoldID,
          APIKey: sessionData.apiKey,
          controlToken: crypto.randomUUID(),
        });
        app.metrics.logMetricsEvent(MetricEvent.NEW_LINEKD_ACCOUNT);
      }

      app.firestore.addNewUser(user);
      try {
        await Manifold.saveTwitchDetails(sessionData.apiKey, twitchUser.display_name, user.data.controlToken);
      } catch (e) {
        log.trace(e);
        throw new Error('Failed to save Twitch details to Manifold');
      }

      response.send(`<html><head><script>window.location.href="${sessionData.redirectURL}"</script></head><html>`);
    } catch (e) {
      log.trace(e);
      response.status(400).json({ error: e.message, message: 'Failed to link accounts.' });
    }
  });

  express.get('/metric-data', async (request, response) => {
    const { epochDay } = <{ epochDay: string }>getParamsFromURL(request.url);
    if (!epochDay || isNaN(<any>epochDay)) {
      response.status(400).json({ error: 'Bad request', message: 'Invalid or missing epochDay parameter.' });
      return;
    } else {
    }
    const data = await app.firestore.getMetricData(Number.parseInt(epochDay));
    if (data) {
      response.json(data);
    } else {
      response.json({});
    }
  });
}
