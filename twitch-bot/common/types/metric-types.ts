export type MetricDay = {
  uniqueUserFeatures: number; // Users that have featured a market today
  featuredQuestions: number; // Total number of features questions today
  newBots: number; // Number of users that have added the bot to their channel for the first time
  twitchLinks: number; // Number of users that have linked their Manifold account to Twitch
  commandsUsed: number; // Times a Twitch bot command has been used
  activeUsers: number; // Users that have used a command today
};

export function getCurrentEpochDay() {
  return (Date.now() / 8.64e7) >> 0;
}
