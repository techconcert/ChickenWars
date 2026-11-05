// All player-facing English strings. Components import from here; no inline literals in components.
import type { GameEvent } from '@sim/events';
import { BUILDINGS, HEROES, ITEMS, LORDS, QUESTS, RESEARCH, TROOPS, WORLD } from '@sim/data/registry';

export const S = {
  gameName: 'ChickenWars',
  loading: 'Fluffing the nests...',
  staleSave: 'Your last save was made with an older version of the world generator and cannot be loaded. A new game was started.',
  loadingTerrain: 'Shaping the land',
  loadingSim: 'Hatching your farm',
  loadingCatchUp: 'Counting what happened while you were away',
  topbar: { day: 'Day', year: 'Year', nextSeason: 'days to', pause: 'Pause', menu: 'Menu', toWorld: 'WORLD MAP', toBase: 'BACK TO FARM', pop: 'Population', speed: 'Speed' },
  speedLabels: { 0: 'II', 1: '1x', 2: '2x', 4: '4x' } as Record<number, string>,
  rates: { perMin: '/min', base: 'Buildings', adjacency: 'Adjacency', proximity: 'Nearby resources', research: 'Research', clan: 'Flock', buffs: 'Buffs', season: 'Season', damaged: 'Damaged', floor: 'Minimum floor', upkeep: 'Troop upkeep', net: 'Net', gross: 'Gross', cap: 'Storage' },
  popTip: { troops: 'Troops', workers: 'Workers', cap: 'Housing' },
  queues: { queued: 'queue', limit: 'Jobs waiting and running (up to 10)', dragHint: 'Drag waiting jobs to reorder.', builders: 'Builders', building: 'Construction', training: 'Training', research: 'Research', idle: 'Idle', waiting: 'Waiting for a builder', cancel: 'Cancel', empty: 'Nothing queued', upgradeTo: 'to level', eta: 'left' },
  panel: { collapse: 'Collapse', expand: 'Expand' },
  marches: { title: 'Marches', none: 'No marches out', slots: 'Slots', recall: 'Recall', carried: 'Carrying', hero: 'Hero', troops: 'troops', phase: { moving: 'Marching', gathering: 'Gathering', fighting: 'Fighting', returning: 'Returning', done: 'Holding' } as Record<string, string>, kind: { gather: 'Gather', attack: 'Attack', scout: 'Scout', garrison: 'Garrison', rally: 'Rally', return: 'Return' } as Record<string, string>, eta: 'ETA' },
  build: { title: 'Build', tabs: { core: 'Core', economy: 'Economy', military: 'Military', support: 'Support', defence: 'Defence' } as Record<string, string>, cost: 'Cost', time: 'Time', count: 'Built', close: 'Close', placing: 'Placing', placeHint: 'Click a free tile in your territory. Esc to cancel.', moving: 'Moving (free)', needsTH: 'Needs Grand Coop level', maxCount: 'Limit reached. A higher Grand Coop allows more.', needsBuilding: 'Needs a prerequisite building', valid: 'Can build here', nearHint: (what: string, max: number): string => `Build near ${what}: up to +${max}%`, adjacency: 'Nearby resources bonus' },
  building: {
    level: 'Level', maxLevel: 'Max level', underConstruction: 'Under construction', damaged: 'Damaged', now: 'Now', next: 'Next level', upgrade: 'Upgrade', upgradeCost: 'Upgrade cost', time: 'Time', cancel: 'Cancel construction', demolish: 'Demolish', demolishConfirm: 'Click again to confirm', repair: 'Repair', close: 'Close', refund: 'Refunds 30%',
    upgrading: 'Upgrading',
    bonus: { title: 'Production bonus', adjacent: 'Next to the building', nearby: 'Nearby', within: 'within', tiles: 'tiles', cells: 'cells', max: 'max', effective: 'Producing now', none: 'No bonus here. Build closer to the resource.', forest: 'forest', rock: 'rock', water: 'water' } as Record<string, string>,
    move: 'Move', moveTip: 'Move this building to another free tile for free', have: 'owned', train: 'Train troops', trainBtn: 'Train', count: 'Count', max: 'Max', queue: 'Queue', stats: { atk: 'ATK', def: 'DEF', hp: 'HP', speed: 'SPD', load: 'LOAD' }, upkeep: 'Upkeep', pop: 'Pop', locked: 'Locked', needsLevel: 'Needs building level', needsTech: 'Needs research', ok: 'Done',
  },
  brief: { title: 'Battle brief', twoPhases: '2 phases', hero: 'Champion', counters: 'Bring', palisade: 'palisade: siege helps', triangle: 'Peckers beat Pig Riders, Pig Riders beat Slingers, Slingers beat Peckers.', phase2Hint: 'At half strength the boss enrages and hits much harder. Finish it fast.', winChance: 'Win chance', expectedLoss: 'Expected losses', enrages: 'Enrages in', counterShare: 'Counters in army', pickArmy: 'Choose an army in the march dialog to see the win chance.' },
  trade: {
    title: 'Auto-trade', on: 'Traders trade for you', off: 'Paused', hint: 'Traders swap your surplus for what you are short of, using the best friendly or neutral lord. Set the stock mix you want.',
    mix: 'Target mix', even: 'Even split', traders: 'Traders', noTraders: 'Train traders here to start trading.', noPartners: 'No lord will trade right now (all hostile or none met).',
    last: 'Last trade', gave: 'Gave', got: 'Got', with: 'with', next: 'Next trip', idle: 'Your stock already matches the mix.', share: 'share',
  },
  market: { title: 'Market', give: 'Give', get: 'Get', amount: 'Amount', ratio: 'Rate', limit: 'Limit per trade', ready: 'Ready', cooldown: 'Ready in', trade: 'Trade', youGet: 'You get', cooldowns: 'Trade cooldowns', hint: 'Exchange resources once per day per resource. Allied lords offer better rates.', needsBuilt: 'Finish building the market first.' },
  effects: { tradeLimit: 'trade limit', produce: 'produces', cap: 'storage', builders: 'builders', marchSlots: 'march slots', trainSpeed: 'training speed', heal: 'heals', woundedCap: 'wounded capacity', researchSlots: 'research slots', heroCandidates: 'hero candidates', vision: 'vision radius', territory: 'territory radius', defenceHp: 'defence HP', defenceAtk: 'defence attack', popCap: 'housing', traderCap: 'traders', perMinute: '/min', buffStats: { gatherMult: 'gather speed', healMult: 'healing' } as Record<string, string> },
  army: { title: 'Army', healthy: 'Healthy', wounded: 'Wounded', away: 'On march', upkeep: 'Food upkeep', pop: 'Population', none: 'No troops yet. Train some at a Rooster Barracks, Egg Toss Range or Pigsty.', total: 'Total', infirmary: 'Infirmary', healRate: 'Healing', capacity: 'Wounded capacity', close: 'Close' },
  classes: { infantry: 'Peckers', archer: 'Slingers', cavalry: 'Pig Riders', siege: 'Contraptions' } as Record<string, string>,
  world: {
    node: 'Resource node', poi: 'Point of interest', march: 'March', cell: 'Terrain', tier: 'Tier', level: 'Level', strength: 'Strength', troops: 'Troops (estimate)', amount: 'Remaining', gatherer: 'Gatherer', collectDone: 'Collection finishes in', collectArrives: 'Gatherers arrive in', free: 'Free', taken: 'A march is gathering here', respawn: 'Regrowing', blocked: 'Blocked',
    closed: (th: number): string => `Closed: Grand Coop ${th} or defeat the boss next door`,
    gather: 'Gather', attack: 'Attack', scout: 'Scout', scoutDone: 'Nothing left to uncover around here.', scoutHint: 'Send riders here to lift the fog around this spot.', scoutHere: 'Scout here', gift: 'Gift', rally: 'Call a rally', rallyTitle: 'Call a rally', reward: 'Reward', yourPower: 'Your best army', theirPower: 'Their strength', region: 'Region', biome: 'Biome', fog: { 0: 'Unexplored', 1: 'Explored', 2: 'In sight' } as Record<number, string>,
    harder: 'Harder than you', easier: 'Easier than you', even: 'An even match', poor: 'meagre rewards', fair: 'fair rewards', rich: 'rich rewards', lord: 'Lord', rep: 'Reputation', unexplored: 'Not yet explored', explored: 'Already explored', close: 'Close',
    campNames: ['Small human farm', 'Human farm', 'Human feedlot', 'Human suburb', 'Human city'],
    poiNames: { bandit_camp: 'Human farm', lair: 'Human compound', boss: 'Region boss', ruin: 'Old barn', village: 'Animal village', shrine: 'Golden egg shrine', cache: 'Feed cache' } as Record<string, string>,
    nodeNames: { forest: 'Twig thicket', farmland: 'Corn patch', quarry: 'Pebble beach', goldvein: 'Golden nest', emberseam: 'Chili patch' } as Record<string, string>,
    biomes: ['Beach', 'Meadow', 'Forest', 'Highland', 'Snow'],
  },
  march: {
    collect: 'Collecting takes',
    title: { gather: 'Send gatherers', attack: 'Send an attack', scout: 'Send a scout', rally: 'Start a rally' } as Record<string, string>,
    randomScout: 'Random scout', randomHint: 'Moves 75% slower than a normal scout, but keeps picking unexplored places by itself until you recall it or nothing is left to uncover.',
    hero: 'Hero', noHero: 'No free hero', lead: 'Lead', troops: 'Troops', send: 'Send', cancel: 'Cancel', eta: 'Travel time', slots: 'March slots', carry: 'Carry capacity', all: 'All', none: 'None', total: 'Selected', scoutHint: 'Cavalry reveals more and can explore ruins.', roundTrip: 'one way',
  },
  report: { enrage: 'Boss enraged (phase 2)', title: 'Battle report', victory: 'Victory', defeat: 'Defeat', attacker: 'Attacker', defender: 'Defender', losses: 'Lost', wounded: 'Wounded', rounds: 'Rounds', round: 'Round', dealt: 'Dealt', taken: 'Taken', rage: 'Hero skills', loot: 'Loot', items: 'Items', xp: 'Hero XP', none: 'Nothing', close: 'Close', older: 'Older', newer: 'Newer', noReports: 'No battles yet.', survivors: 'Troops' },
  rarity: { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', epic: 'Epic' } as Record<string, string>,
  minimap: 'Minimap',
  menu: { title: 'Menu', resume: 'Close', save: 'Save / Load', settings: 'Settings', newGame: 'New game', army: 'Army', heroes: 'Heroes', research: 'Research', diplomacy: 'Diplomacy', quests: 'Quests and Chronicle' },
  save: { title: 'Save and load', auto: 'Autosave', slot: 'Slot', empty: 'Empty', save: 'Save', load: 'Load', export: 'Export file', import: 'Import file', savedAt: 'Saved', playTime: 'Day', saved: 'Saved.', loadFail: 'Could not load that save.', hashWarn: 'This save was edited or damaged (hash mismatch). Loading anyway.', importFail: 'Import failed', close: 'Close', loading: 'Loading...', confirmLoad: 'Load replaces your current game. Click again to confirm.' },
  settings: { title: 'Settings', uiScale: 'UI scale', reducedMotion: 'Reduced motion', colourBlind: 'Colour-blind markers', music: 'Music volume', sfx: 'Effects volume', mute: 'Mute audio', quality: 'Graphics quality', qualities: { low: 'Low', medium: 'Medium', high: 'High' } as Record<string, string>, textSize: 'Text size', textSizes: { small: 'Small', normal: 'Normal', large: 'Large' } as Record<string, string>, colourBlindTip: 'Adds shapes and symbols next to colours', gameplay: 'Game', display: 'Display', audio: 'Audio', autoReport: 'Open battle reports automatically', edgeScroll: 'Edge scrolling', keys: 'Keybinds', remap: 'Click, then press a key', reset: 'Reset keybinds', close: 'Close', press: 'Press a key...' },
  actions: { quests: 'Quests / Chronicle', pause: 'Pause / resume', speed1: 'Speed 1x', speed2: 'Speed 2x', speed3: 'Speed 4x', escape: 'Close / cancel', build: 'Build menu', upgrade: 'Upgrade selected building', heroes: 'Heroes', research: 'Research', toggleScene: 'Town / world map', diplomacy: 'Diplomacy', tabScene: 'Town / world map (alt)', debug: 'Debug overlay' } as Record<string, string>,
  newGame: {
    title: 'New game', seed: 'Seed (words or a number)', seedHint: 'The same seed always makes the same map.', size: 'Map size', small: 'Small', standard: 'Standard', smallTip: 'Radius 40: a quick run.', standardTip: 'Radius 60: 9 to 12 regions.',
    difficulty: 'Difficulty', difficulties: { easy: 'Easy', normal: 'Normal', hard: 'Hard' } as Record<string, string>,
    difficultyTip: { easy: 'Weaker humans, longer raid warnings.', normal: 'The intended balance.', hard: 'Stronger humans, shorter warnings, earlier raids.' } as Record<string, string>,
    start: 'Start type', clan: 'Flock', go: 'Found a new farm', random: 'Random', daily: 'Daily seed', dailyTip: 'Today\'s seed, the same for everyone', cancel: 'Back', seedNow: 'Seed',
    warn: 'This leaves your current game. Save first if you want to keep it.',
    startTypes: {
      river_valley: 'Balanced feed and twigs, a creek with fords. A friendly start.',
      frozen_north: 'Snow pasture: summer is short, winter is long. More pebbles and chili peppers, scarce feed, hardier humans.',
      islands: 'Several pond islands joined by bridges that bosses and research unlock. Fewer early resources, richer later.',
    } as Record<string, string>,
    clans: {
      oakwarden: 'Twigs +15%, thickets help twig yards, sturdier Peckers.',
      stonekin: 'Pebbles and golden eggs +15%, tougher fences and perches, cheaper contraptions.',
      riverfolk: 'Feed +15%, faster marches, better trade rates.',
      ironvale: 'Faster training, heroes start a level higher, slightly higher feed upkeep.',
    } as Record<string, string>,
  },
  end: {
    title: 'You rule the roost', sub: 'The final human city has fallen and your Grand Coop stands at its height.', score: 'Score', time: 'Time played', days: 'days', battles: 'Battles won', lost: 'Battles lost', camps: 'Camps cleared', bosses: 'Bosses defeated', gathered: 'Resources gathered',
    heroes: 'Heroes', quests: 'Quests done', research: 'Techs researched', chronicle: 'From the Chronicle', sandbox: 'Continue in sandbox', newGame: 'New game', unlocked: 'New cosmetic unlocked', banner: 'Banner colour', portrait: 'Portrait variant', best: 'Best score', runs: 'Runs won', share: 'Difficulty',
  },
  heroes: {
    title: 'Heroes', tabs: { roster: 'Roster', talents: 'Talents', gear: 'Equipment', tavern: 'Worm Tavern' } as Record<string, string>, level: 'Level', xp: 'XP', maxLevel: 'Max level', skill: 'Skill', rank: 'Rank', home: 'At home', onMarch: 'On a march', points: 'Talent points', spent: 'spent', none: 'No heroes.',
    classes: { warrior: 'Warrior', ranger: 'Ranger', strategist: 'Strategist' } as Record<string, string>,
    stats: { atk: 'Attack', def: 'Defence', hp: 'Health', lead: 'Leadership', gather: 'Gather bonus', speed: 'March speed', vision: 'Vision' } as Record<string, string>,
    tier: 'Tier', needPoints: 'Needs points in this tree', needNode: 'Needs', rankOf: 'rank', max: 'Maxed', spend: 'Spend a point', respec: 'Reset talents', respecCost: 'Costs', respecTip: 'Refunds every point. Costs gold, no cooldown.', respecDone: 'Talents reset.', maxed: 'Fully trained', tierLocked: 'Locked: spend more points in earlier tiers',
    slots: { weapon: 'Weapon', armour: 'Armour', banner: 'Banner', trinket: 'Trinket' } as Record<string, string>, empty: 'Empty', equip: 'Equip', unequip: 'Remove', upgrade: 'Upgrade', upgraded: 'Upgraded', inventory: 'Inventory', noItems: 'No items of this kind. Loot comes from camps, lairs, bosses and quests.', inUse: 'Worn by', free: 'Free', needAcademy: 'Upgrades need an Academy', maxUp: 'Fully upgraded', plus: '+',
    tavern: 'Worm Tavern', candidates: 'Candidates', recruit: 'Recruit', noTavern: 'Build a Worm Tavern to hire heroes.', noCandidates: 'No one is looking for work right now.', refresh: 'New faces in', roster: 'Roster', full: 'Your roster is full', cost: 'Cost', owned: 'Already yours', story: 'Hires out for gold.',
    lead: 'leads up to', troops: 'troops', skillTip: 'Fires when rage is full', gatherTip: 'Gather speed bonus', rageTip: 'Skill ranks grow with talents',
    skills: { cleave: 'A flurry of pecks hits the biggest enemy stack hard.', rally_cry: 'A mighty cluck raises attack for a few rounds.', volley: 'An egg barrage hits the enemy shooters.', shield_wall: 'A wall of fluff cuts damage taken for a few rounds.', charge: 'Pig Riders strike harder.', mend: 'Mother hen turns many casualties into wounded.' } as Record<string, string>,
  },
  research: {
    title: 'Research', branches: { economy: 'Economy', military: 'Military', defence: 'Defence', exploration: 'Exploration' } as Record<string, string>,
    tierLabel: 'Tier', states: { done: 'Researched', active: 'Researching', available: 'Available', locked: 'Locked' } as Record<string, string>,
    slots: 'Research slots', noSlot: 'All research slots are busy.', noAcademy: 'Build an Academy to research.', academy: 'Academy', needAcademy: 'Needs Academy level', needTech: 'Needs', cost: 'Cost', time: 'Time', effects: 'Effect', start: 'Research', left: 'left', idle: 'Nothing is being researched.', hintClick: 'Click an available tech to start it.',
    capped: 'Capped', legend: 'Legend',
    effect: {
      prodMult: 'production', capMult: 'storage', adjacency: 'adjacency bonus', classAtk: 'attack', classDef: 'defence', buildingHp: 'building HP', costMult: 'troop cost', marchSpeed: 'march speed', tradeStep: 'trade step', trainTime: 'training time', heroStartLevel: 'hero start level',
      upkeepMult: 'upkeep', unlockTroop: 'unlocks', visionRadius: 'vision radius', raidWarning: 'raid warning (ticks)', woundedRatio: 'wounded share', heroStat: 'hero', skillRank: 'skill rank', rageGain: 'rage gain', gatherMult: 'gather speed', marchSlots: 'march slots', researchSlots: 'research slots',
      trainSpeed: 'training speed', classHp: 'health', healMult: 'healing', buildSpeed: 'build speed', wallHp: 'wall HP', towerAtk: 'tower attack', supplyMult: 'supply', fogReveal: 'fog reveal radius', unlockBridges: 'opens the sea bridges',
    } as Record<string, string>,
  },
  diplomacy: {
    title: 'Diplomacy', none: 'No animal lords have been met yet. Explore the world map to find animal villages.', unmet: 'Not yet discovered', personality: { builder: 'Builder', trader: 'Trader', warlike: 'Warlike', scholar: 'Scholar' } as Record<string, string>,
    stages: { hostile: 'Hostile', wary: 'Wary', friendly: 'Friendly', allied: 'Allied' } as Record<string, string>,
    stageGives: { hostile: 'Refuses trade.', wary: 'Trades once a day.', friendly: 'Better trade, a seasonal gift, reveals their land.', allied: 'Joins rallies, lends troops, shares vision.' } as Record<string, string>,
    showCamp: 'Show camp on map', showVillage: 'Show village on map',
    rep: 'Reputation', likes: 'Likes', dislikes: 'Dislikes', gift: 'Gift', giveGift: 'Give gift', predicted: 'Rep gain', trade: 'Trade', give: 'Give', get: 'Get', doTrade: 'Trade', ratio: 'You get', per: 'for', tradesLeft: 'Trades left today', hostileTrade: 'This lord refuses to trade.',
    requests: 'Requests', noRequests: 'No requests right now.', acceptHero: 'Accept hero', heroOffer: 'offers a hero to join you', accept: 'Accept', refuse: 'Refuse', fulfil: 'Hand over', accepted: 'Accepted', urgent: 'Urgent', expires: 'Expires in', reward: 'Reward',
    kinds: { deliver: 'Deliver', clearCamp: 'Clear a camp', escort: 'Escort', defend: 'Defend the village' } as Record<string, string>,
    deliver: (n: number, r: string): string => `Deliver ${n} ${r}`, clearCamp: 'Clear the human farm near the animal village', escort: 'Escort an egg cart: send a scout or garrison march to the village', defend: 'Garrison troops at the village',
    rally: 'Rally', startRally: 'Start a rally', rallyHint: 'Select a human farm, lair or boss on the world map, then start a rally. Allied lords send armies.', rallyTarget: 'Target', rallyNeed: 'Needs an allied lord (65+ reputation).', rallyNoTarget: 'No target selected', rallies: 'Active rallies', waiting: 'Waiting for allies', waitLeft: 'Leaves in', arrived: 'Arrived', coming: 'On the way', noRally: 'No rally right now.',
    pick: 'Choose a lord', amount: 'Amount', max: 'Max', share: 'Loot: you 60%, lords 40%',
  },
  quests: {
    title: 'Quests and Chronicle', tabs: { quests: 'Quests', reign: 'Reign', chronicle: 'Chronicle' } as Record<string, string>, tracker: 'Quest', side: 'Side quest', bounty: 'Bounty', daysLeft: 'days left', bountiesDone: 'Bounties completed', none: 'No active quest.', done: 'Completed quests', empty: 'The Chronicle is empty.', day: 'Day',
    reign: 'The Reign', reignText: 'Defeat the final boss and raise your Grand Coop to its highest level.', boss: 'Final boss defeated', th: 'Grand Coop level', yes: 'Done', no: 'Not yet', won: 'You have won. Your realm plays on.',
  },
  event: { expand: 'Show decision', collapse: 'Collapse', choose: 'Choose', expires: 'Decide within', cost: 'Costs', give: 'You give', get: 'You get', spawnCamp: (t: number): string => `A tier ${t} human farm appears nearby`, blockNode: (n: string, m: string): string => `${n} is blocked for ${m}`, buff: (s: string, p: number, m: string): string => `${p >= 0 ? '+' : ''}${p}% ${s} for ${m}`, gamble: (c: number): string => `${c}% chance to win, otherwise you lose`, winLabel: 'On success', loseLabel: 'On failure', nothing: 'Nothing happens.', title: 'Event' },
  pause: { hint: 'The game keeps running while this menu is open. Use the pause button or Space to pause.' },
  away: { title: 'While you were away', away: 'You were gone for', built: 'Buildings finished', trained: 'Troops trained', marches: 'Marches returned', gathered: 'Resources brought home', battles: 'Battles fought', overflow: 'Resources lost to full storage', nothing: 'Quiet times. Nothing much happened.', ok: 'Welcome back' },
  raid: { banner: 'Raid incoming', eta: 'Arrives in', raiders: 'Raiders', defence: 'Your defence', focus: 'Show raiders', ahead: 'You are stronger', behind: 'You are weaker', even: 'Close fight', title: 'Raid', ambushTitle: 'Ambush', raidWon: 'Raid repelled', raidLost: 'The raiders broke through', ambushWon: 'Ambush beaten off', ambushLost: 'Ambush lost', damaged: 'Damaged buildings', stolen: 'Stolen' },
  debug: { tick: 'tick', day: 'day', hash: 'hash', fps: 'fps', calls: 'draw calls', tris: 'tris', grant: 'Debug: +1000 each', grantTip: 'Adds 1000 of every resource (food, wood, stone, gold, ember), ignoring storage caps' },
  common: { close: 'Close', yes: 'Yes', no: 'No', ok: 'OK', sec: 's', min: 'm', hour: 'h', unknown: 'Unknown' },
  hover: { cell: 'Tile' },
  resources: { food: 'Feed', wood: 'Twigs', stone: 'Pebbles', gold: 'Golden Eggs', ember: 'Chili Peppers' } as Record<string, string>,
  seasons: { spring: 'Spring', summer: 'Summer', autumn: 'Autumn', winter: 'Winter' } as Record<string, string>,
  fogTip: 'Click to jump there',
};

/** Validation error codes from src/sim (systems, city, nav) -> friendly sentences. */
export const ERRORS: Record<string, string> = {
  already_returning: 'That march is already on its way home.',
  bad_amount: 'That amount is not allowed.',
  bad_cell: 'That tile is outside the map.',
  bad_count: 'Pick a valid number of troops (1 to 200).',
  bad_kind: 'That kind of march is not possible here.',
  bad_option: 'That option is not available.',
  bad_target: 'That is not a valid target.',
  bad_trade: 'That trade is not possible.',
  bad_troops: 'Those troops cannot be sent.',
  busy: 'It is busy with another job.',
  cap_full: 'Your storage for that resource is full.',
  cooldown: 'Wait a little before doing that again.',
  cost: 'Not enough resources.',
  hero_busy: 'That hero is already on a march.',
  in_battle: 'The march is in the middle of a battle.',
  locked: 'That region is still closed. Raise your Grand Coop to the level shown in its panel, or defeat the boss of the region next to it.',
  max_count: 'You already have the most of these your Grand Coop allows.',
  max_level: 'Already at the highest level.',
  over_limit: 'That is more than your market allows per trade. Upgrade the market.',
  no_building: 'You need a suitable military building of the right level first.',
  nothing_to_scout: 'There is nothing left to scout that your riders can reach.',
  no_cavalry: 'Ruins can only be explored with cavalry in the party.',
  no_event: 'There is no such event.',
  no_gatherers: 'Send troops that can carry resources.',
  no_hero: 'That hero is not available.',
  no_job: 'There is no such job.',
  no_march: 'That march no longer exists.',
  bridge_locked: 'The sea bridge there is still closed. Defeat a nearby boss or research Shipwright.',
  no_path: 'There is no road there from your town.',
  no_slot: 'All march slots are in use. A higher Grand Coop gives more.',
  no_troops: 'Not enough healthy troops at home.',
  node_blocked: 'Something is blocking that resource right now.',
  node_depleted: 'That resource is used up and is growing back.',
  node_taken: 'Another march is already gathering there.',
  not_damaged: 'It is not damaged.',
  not_implemented: 'That arrives in a later update.',
  occupied: 'Something is already built there.',
  over_lead: 'Too many troops for this hero to lead.',
  pop_cap: 'Not enough housing. Build more chicken coops.',
  protected: 'The Grand Coop cannot be demolished.',
  queue_full: 'The queue is full. Wait for a job to finish (more builders or training buildings add room).',
  requires: 'A prerequisite building is missing.',
  tech: 'Needs a research you have not finished.',
  terrain: 'You cannot build on that terrain.',
  territory: 'Outside your territory. Upgrade the Grand Coop to grow it.',
  th_level: 'Upgrade the Grand Coop first.',
  training: 'Troops are still training there.',
  under_construction: 'Still under construction.',
  unknown_building: 'No such building.',
  unknown_command: 'Unknown command.',
  unknown_troop: 'No such troop.',
  no_builder: 'No builder is free.',
  academy_level: 'Your Academy is not high enough level for that.',
  active: 'That is already being researched.',
  done: 'That is already done.',
  no_academy: 'Build an Academy first.',
  unknown_tech: 'No such research.',
  bad_gift: 'Choose something to give (whole numbers, no more than you have).',
  bad_choice: 'That choice is not possible.',
  bad_slot: 'That is not an equipment slot.',
  empty_slot: 'Nothing is equipped there.',
  hostile: 'This lord is hostile and refuses to deal with you.',
  item_in_use: 'Another hero is wearing that.',
  max_rank: 'That talent is already at full rank.',
  max_rep: 'This lord already thinks the world of you.',
  max_upgrade: 'That item is fully upgraded.',
  no_ally: 'You need an allied lord (reputation 65 or more) for a rally.',
  no_item: 'No such item.',
  no_points: 'No talent points left. Heroes earn one per level.',
  no_tavern: 'Build a Tavern first.',
  not_for_hire: 'That hero cannot be hired here.',
  not_offered: 'That candidate has left the tavern.',
  nothing_to_respec: 'No talents to reset.',
  on_march: 'That hero is away on a march.',
  owned: 'You already have that hero.',
  roster_full: 'Your hero roster is full.',
  tier_locked: 'Spend more points in earlier tiers first.',
  unknown_hero: 'No such hero.',
  unknown_lord: 'No such lord.',
  unknown_talent: 'No such talent.',
  wrong_slot: 'That item does not fit that slot.',
  wrong_tree: 'That talent belongs to a different kind of hero.',
  not_ready: 'The request is not ready to be handed in yet.',
  no_request: 'That request is gone.',
  not_won: 'You have not won yet.',
  already: 'Already done.',
  gathered: 'That has already been collected.',
  flag: 'Requires an alliance with the lord who teaches it.',
  no_offer: 'That lord has no hero to offer.',
};

export function errText(code: string | null | undefined): string {
  if (!code) return '';
  return ERRORS[code] ?? `Not possible (${code}).`;
}

export type Severity = 'info' | 'success' | 'warning' | 'danger';
export interface ToastSpec { text: string; sev: Severity; sticky?: boolean }

const bName = (t: string): string => BUILDINGS[t]?.name ?? t;
const tName = (t: string): string => TROOPS[t]?.name ?? t;

/** Whitelist of events that produce toasts. Returns null for silent events. */
export function toastFor(e: GameEvent): ToastSpec | null {
  switch (e.t) {
    case 'BuildingCompleted': return { text: `${bName(e.type)} finished`, sev: 'success' };
    case 'BuildingUpgraded': return { text: `${bName(e.type)} is now level ${e.level}`, sev: 'success' };
    case 'TroopsTrained': return { text: `${e.count} ${tName(e.troop)} trained`, sev: 'success' };
    case 'TroopsHealed': return null;
    case 'WoundedDied': return { text: `${e.count} wounded died: not enough infirmary space`, sev: 'warning' };
    case 'MarchReturned': return { text: 'A march returned home', sev: 'info' };
    case 'MarchArrived': return { text: e.kind === 'gather' ? 'Gatherers arrived' : e.kind === 'attack' ? 'The army reached the enemy' : 'A march arrived', sev: 'info' };
    case 'NodeDepleted': return { text: 'A resource node ran dry', sev: 'info' };
    case 'BattleResolved': return { text: e.winner === 'attacker' ? 'Victory in battle' : 'Defeat in battle', sev: e.winner === 'attacker' ? 'success' : 'danger' };
    case 'CampCleared': return { text: `Tier ${e.tier} human farm cleared`, sev: 'success' };
    case 'BossDefeated': return { text: 'A region boss has fallen. New lands open.', sev: 'success' };
    case 'BridgeUnlocked': return { text: e.by === 'research' ? 'The shipwrights have opened the sea bridges' : 'A sea bridge is now open', sev: 'success' };
    case 'RegionUnlocked': return { text: 'A new region is open to your marches', sev: 'success' };
    case 'ResourceOverflow': return e.lost > 0 ? { text: `${S.resources[e.res] ?? e.res} storage is full: ${e.lost} lost`, sev: 'warning' } : null;
    case 'Starvation': return e.level === 'warning' ? { text: 'Food is running low', sev: 'warning' } : e.level === 'empty' ? { text: 'Out of food! Troops will desert.', sev: 'danger' } : { text: 'Hungry troops are deserting', sev: 'danger' };
    case 'RaidWarning': return { text: 'Human raid incoming!', sev: 'danger' };
    case 'RaidResolved': return { text: e.won ? S.raid.raidWon : S.raid.raidLost, sev: e.won ? 'success' : 'danger' };
    case 'HeroLevelUp': return { text: `Your hero reached level ${e.level}`, sev: 'success' };
    case 'ItemDropped': return { text: `Found ${ITEMS[e.def]?.name ?? 'an item'}`, sev: 'info' };
    case 'SeasonChanged': return { text: `${S.seasons[['spring', 'summer', 'autumn', 'winter'][e.season] ?? 'spring']} has begun`, sev: 'info' };
    case 'QuestStarted': return e.quest.startsWith('bounty_') ? null : { text: `New quest: ${QUESTS[e.quest]?.title ?? 'a new task'}`, sev: 'info' };
    case 'QuestCompleted': return { text: `Quest completed: ${QUESTS[e.quest]?.title ?? ''}`.trim(), sev: 'success' };
    case 'TradersTraded': return null;
    case 'LordGift': {
      if (e.kind === 'player') return null; // our own gift: the panel already says so
      const parts = Object.entries(e.gift).filter(([, n]) => (n ?? 0) > 0).map(([k, n]) => `${n} ${S.resources[k] ?? k}`);
      if (!parts.length) return null;
      if (e.item) parts.push(ITEMS[e.item]?.name ?? 'a rare item');
      return { text: `${LORDS[e.lord]?.name ?? 'A lord'} sends you a gift: ${parts.join(', ')}`, sev: 'success' };
    }
    case 'ShrineBlessing': return { text: e.boon === 'prod' ? `The shrine blesses your town: +${e.amount}% production for 2 days` : e.boon === 'gather' ? `The shrine blesses your marches: +${e.amount}% gathering for 2 days` : e.boon === 'heal' ? `The shrine blesses your healers: +${e.amount}% healing for 2 days` : `The shrine grants your hero ${e.amount} experience`, sev: 'success' };
    case 'Won': return { text: 'You rule the roost: you have won the game!', sev: 'success' };
    case 'WorldEventPosted': return { text: 'Something has happened. A decision awaits.', sev: 'info' };
    case 'ResearchCompleted': return { text: `Research finished: ${RESEARCH[e.tech]?.name ?? e.tech}`, sev: 'success' };
    case 'HeroRecruited': return { text: `${HEROES[e.hero]?.name ?? 'A hero'} joined your cause`, sev: 'success' };
    case 'ItemUpgraded': return { text: 'Item upgraded', sev: 'success' };
    case 'LordStageChanged': return { text: `${LORDS[e.lord]?.name ?? 'A lord'} is now ${S.diplomacy.stages[e.stage] ?? e.stage}`, sev: 'info' };
    case 'RequestPosted': return { text: `${LORDS[e.lord]?.name ?? 'A lord'} has a request`, sev: 'info' };
    case 'RequestFulfilled': return { text: 'Request fulfilled', sev: 'success' };
    case 'AmbushResolved': return { text: e.won ? S.raid.ambushWon : S.raid.ambushLost, sev: e.won ? 'success' : 'warning' };
    case 'RallyDeparted': return { text: 'The rally has set out', sev: 'info' };
    case 'CommandRejected': return { text: errText(e.code), sev: 'warning' };
    default: return null;
  }
}

export function bossName(id: string | undefined): string | null {
  return WORLD.bosses.find((b) => b.id === id)?.name ?? null;
}
