alter table users add column if not exists is_bot boolean not null default false;

-- Seed from the existing BOT_USERNAMES list (116 entries, case-sensitive match)
update users set is_bot = true
where username in (
  'TenShinoBot', 'JDVance1', 'Merchant', 'benedict', 'subooferbot',
  'pos', 'v', 'acc', 'jerk', 'snap',
  'ArbitrageBot', 'MarketManagerBot', 'Botlab', 'JuniorBot', 'ManifoldDream',
  'ManifoldBugs', 'ACXBot', 'JamesBot', 'jimbot', 'RyanBot',
  'trainbot', 'runebot', 'LiquidityBonusBot', '538', 'FairlyRandom',
  'Anatolii', 'JeremyK', 'Botmageddon', 'GenAIBot', 'SmartBot',
  'ShifraGazsi', 'NiciusBot', 'Bot', 'Mason', 'VersusBot',
  'GPT4', 'EntropyBot', 'veat', 'ms_test', 'arb',
  'Turbot', 'MetaculusBot', 'burkebot', 'Botflux', '7',
  'hyperkaehler', 'NcyBot', 'ithaca', 'GigaGaussian', 'BottieMcBotface',
  'Seldon', 'OnePercentBot', 'arrbit', 'ManaMaximizer', 'rita',
  'uhh', 'ArkPoint', 'EliBot', 'manifestussy', 'mirrorbot',
  'JakeBot', 'loopsbot', 'breezybot', 'echo', 'Sayaka',
  'cc7', 'Yuna', 'ManifoldLove', 'a', 'bonkbot',
  'NermitBundaloy', 'FirstBot', 'bawt', 'FireTheCEO', 'JointBot',
  'WrenTec', 'TigerMcBot', 'Euclidean', 'manakin', 'LUCAtheory',
  'TunglBot', 'timetraveler', 'bayesianbot', 'CharlesLienBot', 'JaguarMcBot',
  'AImogus', 'HakariBot', 'brake', 'brontobot', 'OracleBot',
  'spacedroplet', 'AriZernerBot', 'PV_bot', 'draaglom_bot', 'SiriusBOT',
  'bradbot', 'ShrimpLute', 'kbot', 'ataribot', 'RISKBOT',
  'harmonia', 'Dagonet', 'Galahad', 'zn_bot', 'abot',
  'GoodheartLabsBot', 'Evansbot', 'PugBot', 'cot',
  'Cvillsbot', 'Gluten', 'Rice', 'Terminator2', 'XBot',
  'pythia', 'timestwo'
);
