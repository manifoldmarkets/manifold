import { ChatUserstate, Client } from 'tmi.js';
import { InsufficientBalanceException, TradingClosedException } from '@common/exceptions';
import { ResolutionOutcome } from '@common/outcome';
import App from './app';
import { DEBUG_TWITCH_ACCOUNT, IS_DEV, MANIFOLD_SIGNUP_URL, TWITCH_BOT_OAUTH_TOKEN, TWITCH_BOT_USERNAME } from './envs';
import log from './logger';
import * as Manifold from './manifold-api';
import { Market } from './market';
import { TwitchStream } from './stream';
import { sanitizeTwitchChannelName } from './twitch-api';
import User from './user';
import { MetricEvent, UniqueMetricEvent } from './metrics';

const COMMAND_REGEXP = new RegExp(/!([a-zA-Z0-9]+)\s?([\s\S]*)?/);

/* cSpell:enable */
const MSG_NOT_ENOUGH_MANA_CREATE_MARKET = (username: string, balance: number) =>
  `Sorry ${username}, the owner of this channel doesn't have enough Mana (M$${Math.floor(balance).toFixed(0)}/M$100) to create a market LUL`;
const MSG_NOT_ENOUGH_MANA_PLACE_BET = (username: string) => `Sorry ${username}, you don't have enough Mana to place that bet`;
const MSG_SIGNUP = (username: string) => `Hello ${username}! Click here to play: ${MANIFOLD_SIGNUP_URL}!`;
const MSG_HELP = () => `Check out the full list of commands and how to play here: ${MANIFOLD_SIGNUP_URL}`;
const MSG_RESOLVED = (market: Market) => {
  const maxWinners = 10;
  const outcome = market.resolveData.outcome;
  const topWinners = market.resolveData.topWinners;
  let message = `The market has resolved to ${outcome === ResolutionOutcome.CANCEL ? 'N/A' : outcome}!`;
  if (topWinners.length > 0) {
    message += ` The top ${maxWinners} bettors are ` + topWinners.map((w) => `${w.displayName} (${w.profit > 0 ? '+' : ''}${w.profit.toFixed(0)})`).join(', ');
  }
  message += ` See the market here: ${market.data.url}`;
  return message;
};
const MSG_BALANCE = (username: string, balance: number) => `${username} currently has M$${Math.floor(balance).toFixed(0)}`;
const MSG_POSITION = (username: string, shares_int: number) => {
  return `${username} has ${Math.abs(shares_int).toFixed(0)}${shares_int === 0 ? '' : shares_int > 0 ? ' YES' : ' NO'} share${shares_int === 1 ? '' : 's'}.`;
};
const MSG_MARKET_CREATED = (question: string) => `The market '${question}' has been created!`;
const MSG_MARKET_UNFEATURED = () => `Market unfeatured.`;
const MSG_COMMAND_FAILED = (username: string) => `Sorry ${username} but an internal error occurred handling your command BibleThump`;
const MSG_NO_MARKET_SELECTED = (username: string) => `Sorry ${username} but no market is currently active on this stream.`;
const MSG_TRADING_CLOSED = (username: string) => `Too slow ${username}, your bet was too late!`;
const MSG_FEATURED = (market: Market) => `The market ${market.data.question} is now being featured! ${market.data.url}`;
const MSG_BEHIND_PROCESSING = () => `The bot is processing a lot of orders right now, please be patient!`;
const MSG_PREDICT = () => `Predict here for free to win a share of 250USD: https://manifold.markets/post/storybook-brawl-streamer-showdown`;
/* cSpell:disable */

const QUEUE_WARNING_THRESHOLD = 5;

type CommandParams = {
  args: string[];
  username: string;
  tags: ChatUserstate;
  stream: TwitchStream;
  broadcaster: User;
  user: User;
  market: Market;
};

type CommandDef = {
  handler: (params: CommandParams) => Promise<any>;
  requirements?: {
    marketFeatured?: boolean;
    isAdmin?: boolean;
    hasUser?: boolean;
    minArgs?: number;
  };
};

type RateLimits = {
  lastProcessingWarning_ms: number;
};

export default class TwitchBot {
  private readonly app: App;
  private readonly client: Client;
  private readonly messageQueue: { [channel: string]: { command: CommandDef; params: CommandParams }[] } = {};
  private readonly rateLimits: { [channel: string]: RateLimits } = {};

  constructor(app: App) {
    this.app = app;

    const betCommand = (sourceYes?: boolean) =>
      <CommandDef>{
        requirements: { hasUser: true, marketFeatured: true, minArgs: 1 },
        handler: async (params: CommandParams) => {
          const { args, user, market, stream } = params;
          let arg = args[0].toLocaleLowerCase();
          if (sourceYes === undefined) {
            if (args.length >= 2) {
              arg += args[1].toLocaleLowerCase();
            }
          } else {
            arg += sourceYes ? 'y' : 'n';
          }
          const commands = { yes: ['yes', 'y'], no: ['no', 'n'] };
          const validateCommand = (arg: string): { valid: boolean; yes?: boolean; amount?: string } => {
            for (const v in commands) {
              const yes = v === 'yes';
              for (const c of commands[v]) {
                if (arg.startsWith(c)) return { valid: true, yes, amount: arg.substring(c.length) };
                else if (arg.endsWith(c)) return { valid: true, yes, amount: arg.substring(0, arg.length - c.length) };
              }
            }
            return { valid: false };
          };
          const { valid, yes, amount } = validateCommand(arg);
          if (!valid || isNaN(<any>amount)) return;

          const value = Number.parseInt(amount);
          try {
            await user.placeBet(market.data.id, value, yes);
          } catch (e) {
            if (e instanceof InsufficientBalanceException) {
              this.client.say(stream.name, MSG_NOT_ENOUGH_MANA_PLACE_BET(user.twitchDisplayName));
            } else {
              throw e;
            }
          }
        },
      };

    const featureCommand: CommandDef = {
      requirements: { isAdmin: true, minArgs: 1 },
      handler: async (params: CommandParams) => {
        const { args, stream } = params;
        await stream.selectMarket((await Manifold.getMarketBySlug(args[0])).id);
      },
    };

    const resolveCommand: CommandDef = {
      requirements: { isAdmin: true, marketFeatured: true, minArgs: 1 },
      handler: async (params: CommandParams) => {
        const { args, market, broadcaster } = params;
        const resolutionString = args[0].toLocaleUpperCase();
        let outcome: ResolutionOutcome = ResolutionOutcome[resolutionString];
        if (resolutionString === 'NA' || resolutionString === 'N/A') {
          outcome = ResolutionOutcome.CANCEL;
        }
        if (!outcome || outcome == ResolutionOutcome.PROB) {
          log.info('Resolve command failed due to outcome: ' + outcome);
          return;
        }
        await broadcaster.resolveBinaryMarket(market.data.id, outcome);
      },
    };

    const positionCommand: CommandDef = {
      requirements: { marketFeatured: true, hasUser: true },
      handler: async (params: CommandParams) => {
        const { stream, market, user } = params;
        let shares = market.getUsersExpectedPayout(user);
        if (shares >= 0) {
          shares = Math.floor(shares);
        } else {
          shares = -Math.floor(-shares);
        }
        this.client.say(stream.name, MSG_POSITION(user.twitchDisplayName, shares));
      },
    };

    const commands: { [k: string]: CommandDef } = {
      commands: {
        handler: (params) => this.client.say(params.stream.name, MSG_HELP()),
      },
      help: {
        handler: (params) => this.client.say(params.stream.name, MSG_HELP()),
      },
      signup: {
        handler: (params) => this.client.say(params.stream.name, MSG_SIGNUP(params.username)),
      },
      buy: betCommand(),
      bet: betCommand(),
      y: betCommand(true),
      n: betCommand(false),
      sell: {
        requirements: { hasUser: true, marketFeatured: true },
        handler: async (params: CommandParams) => {
          const { user, market } = params;
          await user.sellAllShares(market.data.id);
        },
      },
      allin: {
        requirements: { hasUser: true, marketFeatured: true, minArgs: 1 },
        handler: async (params: CommandParams) => {
          const { args, user, market } = params;
          const arg = args[0].toLocaleLowerCase();
          let yes: boolean;
          if (arg == 'yes') {
            yes = true;
          } else if (arg == 'no') {
            yes = false;
          } else {
            return;
          }
          await user.allIn(market.data.id, yes);
        },
      },
      balance: {
        requirements: { hasUser: true },
        handler: async (params: CommandParams) => {
          const { user, stream } = params;
          const balance = await user.getBalance();
          this.client.say(stream.name, MSG_BALANCE(user.twitchDisplayName, balance));
        },
      },
      select: featureCommand,
      feature: featureCommand,
      unfeature: {
        requirements: { isAdmin: true, marketFeatured: true },
        handler: async (params: CommandParams) => {
          const { stream } = params;
          await stream.selectMarket(null);
          this.client.say(stream.name, MSG_MARKET_UNFEATURED());
        },
      },
      create: {
        requirements: { isAdmin: true, minArgs: 1 },
        handler: async (params: CommandParams) => {
          const { args, stream, broadcaster, username } = params;
          let question = '';
          for (const arg of args) {
            question += arg + ' ';
          }
          question = question.trim();

          log.info(`Create command issued with question '${question}'`);

          try {
            const market = await broadcaster.createBinaryMarket(question, null, 50, { visibility: 'unlisted' });
            log.info('Created market ID: ' + market.id);
            stream.selectMarket(market.id);
            this.client.say(stream.name, MSG_MARKET_CREATED(question));
          } catch (e) {
            if (e instanceof InsufficientBalanceException) {
              broadcaster.getBalance().then((balance) => {
                this.client.say(stream.name, MSG_NOT_ENOUGH_MANA_CREATE_MARKET(username, balance));
              });
            } else throw e;
          }
        },
      },
      resolve: resolveCommand,
      position: positionCommand,
      pos: positionCommand,
      predict: {
        handler: (params) => this.client.say(params.stream.name, MSG_PREDICT()),
      },
    };

    this.client = new Client({
      // options: { debug: true },
      connection: {
        secure: true,
        reconnect: true,
      },
      identity: {
        username: TWITCH_BOT_USERNAME,
        password: TWITCH_BOT_OAUTH_TOKEN,
      },
    });

    this.client.on('message', async (channelName, tags, message, self) => {
      if (self) return; // Ignore echoed messages.

      const groups = message.match(COMMAND_REGEXP);
      if (!groups || groups.length < 2) return;
      const commandString: string = groups[1].toLocaleLowerCase();
      let args: string[] = groups[2]?.split(' ') || [];
      args = args.filter((value: string) => value.length > 0);

      let command = commands[commandString];
      if (!command) {
        const match = commandString.match('^(?:yes|no|y|n)[0-9]+$'); // Catch shortened betting commands !y12, !no15 etc
        if (match) {
          command = betCommand();
          args.unshift(commandString); // Push the command (e.g. y12) as the first arg
        } else return; // If it's not a valid command, ignore it
      }

      channelName = sanitizeTwitchChannelName(channelName);
      const stream = app.getStreamByName(channelName);

      const userDisplayName = tags['display-name'];

      try {
        const broadcaster = this.app.getUserForTwitchUsername(channelName);

        const market = stream.featuredMarket;
        let user = undefined;
        try {
          user = this.app.getUserForTwitchUsername(tags.username);
          user.twitchDisplayName = userDisplayName;
        } catch (e) {}
        const commandParams: CommandParams = { args, stream, tags, username: tags.username, broadcaster, market, user };

        if (command.requirements) {
          const requirements = command.requirements;
          if (requirements.isAdmin && !this.isAllowedAdminCommand(tags)) {
            log.warn(`User ${userDisplayName} tried to use the command '${commandString}' without permission.`);

            // Easter Egg:
            if (command === resolveCommand && args.length > 0) {
              this.client.say(channelName, userDisplayName + ` resolved ${args[0].toLocaleUpperCase()} Kappa`);
            }

            return;
          }
          if (requirements.minArgs && args.length < requirements.minArgs) {
            return;
          }
          if (requirements.hasUser && !user) {
            this.client.say(channelName, MSG_SIGNUP(userDisplayName));
            return;
          }
          if (requirements.marketFeatured && !market) {
            this.client.say(channelName, MSG_NO_MARKET_SELECTED(userDisplayName));
            return;
          }
        }
        // await command.handler(commandParams);
        this.addMessageToQueue(channelName, command, commandParams);
      } catch (e) {
        this.client.say(channelName, MSG_COMMAND_FAILED(userDisplayName));
        log.trace(e);
      }
    });
  }

  private addMessageToQueue(channelName: string, command: CommandDef, params: CommandParams) {
    this.app.metrics.logMetricsEvent(MetricEvent.COMMAND_USED);
    // TODO: Inconsistent: this measures how many registered users have used a command today, but the regular command metrics measures how many of any user used a command.
    if (params.user) {
      this.app.metrics.logUnqiueMetricsEvent(UniqueMetricEvent.UNIQUE_COMMAND_USER, params.user);
    }
    if (!this.messageQueue[channelName]) {
      this.messageQueue[channelName] = [];
    }
    this.messageQueue[channelName].push({ command, params });
    if (this.messageQueue[channelName].length > QUEUE_WARNING_THRESHOLD) {
      if (!this.rateLimits[channelName]) {
        this.rateLimits[channelName] = { lastProcessingWarning_ms: 0 };
      }
      if (Date.now() - this.rateLimits[channelName].lastProcessingWarning_ms > 5000) {
        this.rateLimits[channelName].lastProcessingWarning_ms = Date.now();
        log.warn('Bot getting behind. Message queue length: ' + this.messageQueue[channelName].length);
        this.client.say(channelName, MSG_BEHIND_PROCESSING());
      }
    }
    if (this.messageQueue[channelName].length === 1) {
      this.handleMessages(channelName);
    }
  }

  private async handleMessages(channelName: string) {
    while (this.messageQueue[channelName].length) {
      const message = this.messageQueue[channelName][0];
      try {
        await message.command.handler(message.params);
      } catch (e) {
        if (e instanceof TradingClosedException) {
          this.client.say(channelName, MSG_TRADING_CLOSED(message.params.user.twitchDisplayName));
        } else {
          this.client.say(channelName, MSG_COMMAND_FAILED(message.params.user.twitchDisplayName));
          log.trace(e);
        }
      } finally {
        this.messageQueue[channelName].shift();
      }
    }
  }

  private isAllowedAdminCommand(tags: ChatUserstate): boolean {
    if (!tags || !tags.badges) return false;
    if (tags.badges.moderator || tags.badges.admin || tags.badges.global_mod || tags.badges.broadcaster) return true;
    return false;
  }

  public onMarketResolved(channel: string, market: Market) {
    this.client.say(channel, MSG_RESOLVED(market));
  }

  public onMarketFeatured(channel: string, market: Market) {
    this.client.say(channel, MSG_FEATURED(market));
  }

  public async connect() {
    const channelsToJoin: string[] = [];
    if (IS_DEV) {
      if (DEBUG_TWITCH_ACCOUNT) {
        log.info(`Using debug Twitch account '${DEBUG_TWITCH_ACCOUNT}'`);
        // this.client.getOptions().channels = [DEBUG_TWITCH_ACCOUNT];
        channelsToJoin.push(DEBUG_TWITCH_ACCOUNT);
      }
    } else {
      // this.client.getOptions().channels = await this.app.firestore.getRegisteredTwitchChannels();
      channelsToJoin.push(...this.app.firestore.getRegisteredTwitchChannels());
    }

    try {
      await this.client.connect();
      const p = await this.client.ping();
      log.info(`Connected to Twitch with ${p[0] * 1000}ms ping.`);
    } catch (e) {
      throw new TwitchBotInitializationException(e);
    }

    await Promise.all(channelsToJoin.map((c) => this.client.join(c).catch((e) => log.error(new Error(`Failed to add bot to channel '${c}': ${String(e)}`)))));
  }

  public isInChannel(channelName: string) {
    return this.client.getChannels().indexOf(`#${channelName}`) >= 0;
  }

  public async joinChannel(channelName: string) {
    log.debug('Bot attempting to join channel ' + channelName);
    if (this.isInChannel(channelName)) {
      log.debug('Already in channel.');
      return;
    }

    return this.client
      .join('#' + channelName)
      .then(async () => {
        await this.client.say(channelName, '/color BlueViolet'); // TODO this will become invalid as of February 18, 2023 (https://discuss.dev.twitch.tv/t/deprecation-of-chat-commands-through-irc/40486)
        log.debug('Sent join message.');

        let message = 'Hey there! I am the Manifold chat bot.';
        if (!this.client.isMod(channelName, TWITCH_BOT_USERNAME)) {
          message += ' Please /mod me so I can do my job.';
        }
        await this.client.say(channelName, message);
      })
      .then(() => this.app.firestore.registerTwitchChannel(channelName))
      .catch(log.trace);
  }

  public async leaveChannel(channelName: string) {
    if (!this.isInChannel(channelName)) return;
    await this.client.say(channelName, 'Goodbye cruel world.');
    return this.client.part(channelName).then(() => this.app.firestore.unregisterTwitchChannel(channelName));
  }
}

class TwitchBotInitializationException extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'TwitchBotInitializationException';
  }
}
