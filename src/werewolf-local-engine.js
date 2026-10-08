export const LOCAL_WEREWOLF_SCHEMA = 1;
export const WEREWOLF_ROLES = Object.freeze({ wolf: 'wolf', villager: 'villager', seer: 'seer', witch: 'witch', hunter: 'hunter' });
export const WEREWOLF_PHASES = Object.freeze({ wolves: 'night_wolves', seer: 'night_seer', witch: 'night_witch', discussion: 'day_discussion', vote: 'day_vote', hunter: 'hunter_shot', ended: 'ended' });

const ROLE_LABELS = Object.freeze({ wolf: '狼人', villager: '村民', seer: '预言家', witch: '女巫', hunter: '猎人' });

function randomId(prefix) {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `${prefix}:${uuid.replace(/-/g, '')}`;
  return `${prefix}:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`;
}

function cleanName(value, fallback) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 24) || fallback;
}

function shuffle(list, rng = Math.random) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const raw = Number(rng());
    const roll = Number.isFinite(raw) ? Math.max(0, Math.min(0.999999999, raw)) : 0;
    const j = Math.floor(roll * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function majorityChoice(votes) {
  const counts = new Map();
  for (const target of Object.values(votes || {})) {
    if (!target) continue;
    counts.set(target, (counts.get(target) || 0) + 1);
  }
  if (!counts.size) return '';
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (sorted.length > 1 && sorted[0][1] === sorted[1][1]) return '';
  return sorted[0][0];
}

export function roleLabel(role) {
  return ROLE_LABELS[role] || role || '未知';
}

export function teamForRole(role) {
  return role === WEREWOLF_ROLES.wolf ? 'wolves' : 'village';
}

export function rolePlan(count) {
  if (!Number.isInteger(count) || count < 6 || count > 12) throw new Error('狼人杀仅支持 6～12 人');
  const wolves = count >= 12 ? 4 : count >= 9 ? 3 : 2;
  return [...Array(wolves).fill('wolf'), 'seer', 'witch', 'hunter', ...Array(count - wolves - 3).fill('villager')];
}

function newNight() {
  return { wolf_votes: {}, wolf_target: '', seer_done: false, witch_done: false, witch_choice: '', witch_poison_target: '', resolved: false };
}

function newDay() {
  return { votes: {}, lynched: '', resolved: false, ai_spoken: {}, human_spoken: false, ready_for_vote: false };
}

function recordPersonalAction(game, playerId, action) {
  if (!Array.isArray(game.personal_actions)) game.personal_actions = [];
  game.personal_actions.push({ player_id: playerId, round_number: game.round_number, period: 'night', ...action });
}

function personalActions(game, viewerId) {
  const actions = (game.personal_actions || []).filter(item => item.player_id === viewerId).map(item => ({
    round_number: item.round_number, type: item.type, target_id: item.target_id || '',
    choice: item.choice || '', alignment: item.alignment || '', period: item.period || 'night',
  }));
  // 旧存档可恢复当前夜晚及查验记录，已经丢失的往夜目标不作推断。
  const addMissing = action => { if (!actions.some(item => item.round_number === action.round_number && item.type === action.type)) actions.push(action); };
  if (game.roles[viewerId] === 'wolf' && Object.hasOwn(game.night.wolf_votes, viewerId)) addMissing({ type: 'wolf_kill', round_number: game.round_number, target_id: game.night.wolf_votes[viewerId] });
  if (game.roles[viewerId] === 'seer') for (const check of game.seer_checks.filter(item => item.player_id === viewerId)) addMissing({ type: 'seer_check', round_number: check.round_number, target_id: check.target_id, alignment: check.alignment });
  if (game.roles[viewerId] === 'witch' && game.night.witch_done && game.night.witch_choice) addMissing({ type: 'witch', round_number: game.round_number, choice: game.night.witch_choice, target_id: game.night.witch_choice === 'save' ? game.night.wolf_target : game.night.witch_poison_target });
  return actions.sort((a, b) => a.round_number - b.round_number);
}

function publicNightResults(game) {
  const results = game.events.filter(item => item.type === 'night_result').map(item => ({ round_number: item.round_number, deaths: [...item.deaths] }));
  if (game.night.resolved && !results.some(item => item.round_number === game.round_number)) {
    results.push({ round_number: game.round_number, deaths: game.events.filter(item => item.type === 'death' && item.round_number === game.round_number && ['wolves', 'witch_poison'].includes(item.cause)).map(item => item.player_id) });
  }
  return results;
}

function playerById(game, playerId) {
  return game.players.find((player) => player.player_id === playerId) || null;
}

function assertPlayer(game, playerId) {
  const player = playerById(game, playerId);
  if (!player) throw new Error('玩家不在当前游戏中');
  return player;
}

function assertAlive(game, playerId) {
  const player = assertPlayer(game, playerId);
  if (!player.alive) throw new Error('死亡玩家不能执行这个操作');
  return player;
}

export function livingPlayers(game) {
  return game.players.filter((player) => player.alive);
}

export function livingRolePlayers(game, role) {
  return game.players.filter((player) => player.alive && game.roles[player.player_id] === role);
}

export function checkWinner(game) {
  const wolves = livingRolePlayers(game, 'wolf').length;
  const others = livingPlayers(game).length - wolves;
  if (wolves === 0) return { winner: 'village', reason: '所有狼人已经出局' };
  if (wolves >= others) return { winner: 'wolves', reason: '狼人数量已经不小于其他存活玩家' };
  return null;
}

function applyWinner(game) {
  const result = checkWinner(game);
  if (!result) return false;
  game.winner = result.winner;
  game.win_reason = result.reason;
  game.phase = WEREWOLF_PHASES.ended;
  game.status = 'ended';
  return true;
}

function kill(game, playerId, cause) {
  const player = playerById(game, playerId);
  if (!player?.alive) return false;
  player.alive = false;
  player.death_cause = cause;
  player.died_round = game.round_number;
  game.events.push({ event_id: randomId('event'), type: 'death', player_id: playerId, cause, round_number: game.round_number });
  return true;
}

function queueHunterIfNeeded(game, deaths) {
  const hunterId = deaths.find((playerId) => game.roles[playerId] === 'hunter');
  if (!hunterId) return false;
  game.hunter = { pending_player_id: hunterId, acted: false, source_phase: game.day.resolved ? 'day' : 'night' };
  game.phase = WEREWOLF_PHASES.hunter;
  return true;
}

function enterDiscussion(game) {
  game.phase = WEREWOLF_PHASES.discussion;
  game.day = newDay();
}

function startNextNight(game) {
  game.round_number += 1;
  game.round_id = randomId('round');
  game.phase = WEREWOLF_PHASES.wolves;
  game.night = newNight();
  game.day = newDay();
  game.hunter = { pending_player_id: '', acted: false, source_phase: '' };
}

function advanceNightPastMissingRoles(game) {
  while (true) {
    if (game.phase === WEREWOLF_PHASES.seer && livingRolePlayers(game, 'seer').length === 0) {
      game.night.seer_done = true;
      game.phase = WEREWOLF_PHASES.witch;
      continue;
    }
    if (game.phase === WEREWOLF_PHASES.witch && livingRolePlayers(game, 'witch').length === 0) {
      game.night.witch_done = true;
      resolveNight(game);
      continue;
    }
    break;
  }
}

function resolveNight(game) {
  if (game.night.resolved) return;
  const deaths = [];
  const wolfTarget = game.night.witch_choice === 'save' ? '' : game.night.wolf_target;
  if (wolfTarget && kill(game, wolfTarget, 'wolves')) deaths.push(wolfTarget);
  if (game.night.witch_poison_target && kill(game, game.night.witch_poison_target, 'witch_poison')) deaths.push(game.night.witch_poison_target);
  game.night.resolved = true;
  game.events.push({ event_id: randomId('event'), type: 'night_result', round_number: game.round_number, deaths: [...deaths] });
  if (queueHunterIfNeeded(game, deaths)) return;
  if (applyWinner(game)) return;
  enterDiscussion(game);
}

export function createLocalWerewolfGame({ humanName = '你', totalPlayers = 6, aiNames = [], rng = Math.random } = {}) {
  if (!Number.isInteger(totalPlayers) || totalPlayers < 6 || totalPlayers > 12) throw new Error('总人数必须是 6～12 人');
  const players = [{ player_id: randomId('player'), display_name: cleanName(humanName, '你'), kind: 'human', alive: true, death_cause: '', died_round: 0 }];
  for (let i = 1; i < totalPlayers; i += 1) {
    players.push({ player_id: randomId('player'), display_name: cleanName(aiNames[i - 1], `AI ${i}`), kind: 'ai', alive: true, death_cause: '', died_round: 0 });
  }
  const plan = shuffle(rolePlan(totalPlayers), rng);
  const roles = Object.fromEntries(players.map((player, index) => [player.player_id, plan[index]]));
  return {
    schema: LOCAL_WEREWOLF_SCHEMA,
    game_id: randomId('game'),
    round_id: randomId('round'),
    round_number: 1,
    status: 'playing',
    phase: WEREWOLF_PHASES.wolves,
    human_player_id: players[0].player_id,
    players,
    roles,
    winner: '',
    win_reason: '',
    witch: { antidote_available: true, poison_available: true },
    seer_checks: [],
    personal_actions: [],
    night: newNight(),
    day: newDay(),
    hunter: { pending_player_id: '', acted: false, source_phase: '' },
    public_messages: [],
    wolf_messages: [],
    events: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export function legalTargets(game, playerId, action) {
  if (!game || game.phase === WEREWOLF_PHASES.ended) return [];
  const player = playerById(game, playerId);
  if (!player?.alive && action !== 'hunter_shot') return [];
  if (action === 'wolf_kill') {
    if (game.phase !== WEREWOLF_PHASES.wolves || game.roles[playerId] !== 'wolf') return [];
    return livingPlayers(game).filter((target) => game.roles[target.player_id] !== 'wolf').map((target) => target.player_id);
  }
  if (action === 'seer_check') {
    if (game.phase !== WEREWOLF_PHASES.seer || game.roles[playerId] !== 'seer') return [];
    return livingPlayers(game).filter((target) => target.player_id !== playerId).map((target) => target.player_id);
  }
  if (action === 'witch_poison') {
    if (game.phase !== WEREWOLF_PHASES.witch || game.roles[playerId] !== 'witch' || !game.witch.poison_available) return [];
    return livingPlayers(game).filter((target) => target.player_id !== playerId).map((target) => target.player_id);
  }
  if (action === 'vote') {
    if (game.phase !== WEREWOLF_PHASES.vote) return [];
    return livingPlayers(game).map((target) => target.player_id);
  }
  if (action === 'hunter_shot') {
    if (game.phase !== WEREWOLF_PHASES.hunter || game.hunter.pending_player_id !== playerId || game.hunter.acted) return [];
    return livingPlayers(game).filter((target) => target.player_id !== playerId).map((target) => target.player_id);
  }
  return [];
}

export function submitWerewolfAction(game, playerId, { type, target_id = '', choice = '' } = {}) {
  if (!game || game.status !== 'playing') throw new Error('游戏不在进行中');
  if (type === 'wolf_kill') {
    assertAlive(game, playerId);
    if (game.phase !== WEREWOLF_PHASES.wolves || game.roles[playerId] !== 'wolf') throw new Error('当前不能提交狼人目标');
    if (Object.hasOwn(game.night.wolf_votes, playerId)) throw new Error('本夜已经提交过狼人目标');
    if (!legalTargets(game, playerId, 'wolf_kill').includes(target_id)) throw new Error('狼人目标不合法');
    game.night.wolf_votes[playerId] = target_id;
    recordPersonalAction(game, playerId, { type, target_id });
    const wolves = livingRolePlayers(game, 'wolf');
    if (wolves.every((wolf) => Object.hasOwn(game.night.wolf_votes, wolf.player_id))) {
      game.night.wolf_target = majorityChoice(game.night.wolf_votes);
      game.phase = WEREWOLF_PHASES.seer;
      advanceNightPastMissingRoles(game);
    }
  } else if (type === 'seer_check') {
    assertAlive(game, playerId);
    if (game.phase !== WEREWOLF_PHASES.seer || game.roles[playerId] !== 'seer') throw new Error('当前不能查验');
    if (game.night.seer_done) throw new Error('本夜已经查验过');
    if (!legalTargets(game, playerId, 'seer_check').includes(target_id)) throw new Error('查验目标不合法');
    game.seer_checks.push({ player_id: playerId, target_id, alignment: teamForRole(game.roles[target_id]), round_number: game.round_number });
    recordPersonalAction(game, playerId, { type, target_id, alignment: teamForRole(game.roles[target_id]) });
    game.night.seer_done = true;
    game.phase = WEREWOLF_PHASES.witch;
    advanceNightPastMissingRoles(game);
  } else if (type === 'witch') {
    assertAlive(game, playerId);
    if (game.phase !== WEREWOLF_PHASES.witch || game.roles[playerId] !== 'witch') throw new Error('当前不能使用女巫技能');
    if (game.night.witch_done) throw new Error('本夜已经提交过女巫操作');
    if (!['save', 'poison', 'pass'].includes(choice)) throw new Error('女巫操作不合法');
    if (choice === 'save') {
      if (!game.witch.antidote_available || !game.night.wolf_target) throw new Error('本夜不能使用解药');
      game.witch.antidote_available = false;
    }
    if (choice === 'poison') {
      if (!game.witch.poison_available) throw new Error('毒药已经用过');
      if (!legalTargets(game, playerId, 'witch_poison').includes(target_id)) throw new Error('毒杀目标不合法');
      game.witch.poison_available = false;
      game.night.witch_poison_target = target_id;
    }
    game.night.witch_choice = choice;
    game.night.witch_done = true;
    recordPersonalAction(game, playerId, { type, choice, target_id: choice === 'save' ? game.night.wolf_target : choice === 'poison' ? target_id : '' });
    resolveNight(game);
  } else if (type === 'vote') {
    assertAlive(game, playerId);
    if (game.phase !== WEREWOLF_PHASES.vote) throw new Error('当前不是投票阶段');
    if (Object.hasOwn(game.day.votes, playerId)) throw new Error('本日已经投过票');
    if (!legalTargets(game, playerId, 'vote').includes(target_id)) throw new Error('投票目标不合法');
    game.day.votes[playerId] = target_id;
    const alive = livingPlayers(game);
    if (alive.every((player) => Object.hasOwn(game.day.votes, player.player_id))) {
      const target = majorityChoice(game.day.votes);
      game.day.lynched = target;
      game.day.resolved = true;
      const deaths = [];
      if (target && kill(game, target, 'vote')) deaths.push(target);
      if (queueHunterIfNeeded(game, deaths)) return touch(game);
      if (applyWinner(game)) return touch(game);
      startNextNight(game);
    }
  } else if (type === 'hunter_shot' || type === 'hunter_pass') {
    if (game.phase !== WEREWOLF_PHASES.hunter || game.hunter.pending_player_id !== playerId || game.hunter.acted) throw new Error('当前不能发动猎人技能');
    if (type === 'hunter_shot') {
      if (!legalTargets(game, playerId, 'hunter_shot').includes(target_id)) throw new Error('猎人目标不合法');
      recordPersonalAction(game, playerId, { type, target_id, period: game.hunter.source_phase });
      kill(game, target_id, 'hunter');
    } else recordPersonalAction(game, playerId, { type, period: game.hunter.source_phase });
    game.hunter.acted = true;
    if (applyWinner(game)) return touch(game);
    if (game.hunter.source_phase === 'day') startNextNight(game);
    else enterDiscussion(game);
  } else {
    throw new Error('未知狼人杀操作');
  }
  return touch(game);
}

export function beginVote(game) {
  if (!game || game.status !== 'playing' || game.phase !== WEREWOLF_PHASES.discussion) throw new Error('当前不能进入投票');
  game.phase = WEREWOLF_PHASES.vote;
  game.day.votes = {};
  return touch(game);
}

export function appendGameMessage(game, playerId, channel, value) {
  const player = assertPlayer(game, playerId);
  const text = String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 500);
  if (!text) throw new Error('消息不能为空');
  if (channel === 'public') {
    if (game.phase !== WEREWOLF_PHASES.discussion || !player.alive) throw new Error('当前不能在公聊发言');
    game.public_messages.push({ message_id: randomId('message'), player_id: playerId, text, round_number: game.round_number, created_at: new Date().toISOString() });
    if (player.kind === 'human') game.day.human_spoken = true;
    if (game.public_messages.length > 300) game.public_messages.splice(0, game.public_messages.length - 300);
  } else if (channel === 'wolves') {
    if (game.phase !== WEREWOLF_PHASES.wolves || !player.alive || game.roles[playerId] !== 'wolf') throw new Error('当前不能在狼人夜聊发言');
    game.wolf_messages.push({ message_id: randomId('message'), player_id: playerId, text, round_number: game.round_number, created_at: new Date().toISOString() });
    if (game.wolf_messages.length > 120) game.wolf_messages.splice(0, game.wolf_messages.length - 120);
  } else {
    throw new Error('未知聊天频道');
  }
  return touch(game);
}

export function markAiSpoken(game, playerId) {
  if (game.phase !== WEREWOLF_PHASES.discussion) return game;
  game.day.ai_spoken[playerId] = true;
  const livingAi = livingPlayers(game).filter((player) => player.kind === 'ai');
  game.day.ready_for_vote = livingAi.every((player) => game.day.ai_spoken[player.player_id]);
  return touch(game);
}

export function viewForPlayer(game, viewerId) {
  if (!game) return null;
  const viewer = assertPlayer(game, viewerId);
  const role = game.roles[viewerId] || '';
  const revealAll = game.phase === WEREWOLF_PHASES.ended;
  const visibleRoles = {};
  if (revealAll) Object.assign(visibleRoles, game.roles);
  else {
    visibleRoles[viewerId] = role;
    if (role === 'wolf' && viewer.alive) {
      for (const player of game.players) if (player.alive && game.roles[player.player_id] === 'wolf') visibleRoles[player.player_id] = 'wolf';
    }
  }
  const seerChecks = role === 'seer' ? game.seer_checks.filter((item) => item.player_id === viewerId).map((item) => ({ ...item })) : [];
  const canSeeWolfChat = revealAll || (role === 'wolf' && viewer.alive);
  return {
    game_id: game.game_id,
    round_id: game.round_id,
    round_number: game.round_number,
    phase: game.phase,
    status: game.status,
    winner: game.winner,
    win_reason: game.win_reason,
    self_player_id: viewerId,
    your_role: role,
    players: game.players.map((player) => ({ ...player, role: visibleRoles[player.player_id] || '', death_cause: revealAll || player.player_id === viewerId ? player.death_cause : '' })),
    visible_roles: visibleRoles,
    seer_checks: seerChecks,
    personal_actions: personalActions(game, viewerId),
    public_nights: publicNightResults(game),
    witch: role === 'witch' ? { ...game.witch, wolf_target: game.night.wolf_target } : null,
    hunter_pending: game.hunter.pending_player_id === viewerId && !game.hunter.acted,
    submitted: {
      wolf: Object.hasOwn(game.night.wolf_votes, viewerId),
      seer: role === 'seer' && game.night.seer_done,
      witch: role === 'witch' && game.night.witch_done,
      vote: Object.hasOwn(game.day.votes, viewerId),
    },
    day_ready_for_vote: Boolean(game.day.ready_for_vote),
    human_spoken: Boolean(game.day.human_spoken || game.day.ready_for_vote || game.public_messages.some(item => item.player_id === game.human_player_id && item.round_number === game.round_number)),
    speech_progress: Object.keys(game.day.ai_spoken).length,
    speech_total: livingPlayers(game).filter(player => player.kind === 'ai').length,
    vote_progress: game.phase === WEREWOLF_PHASES.vote ? Object.keys(game.day.votes).length : 0,
    vote_total: game.phase === WEREWOLF_PHASES.vote ? livingPlayers(game).length : 0,
    public_messages: game.public_messages.map((message) => ({ ...message })),
    wolf_messages: canSeeWolfChat ? game.wolf_messages.map((message) => ({ ...message })) : [],
    legal_targets: {
      wolf_kill: legalTargets(game, viewerId, 'wolf_kill'),
      seer_check: legalTargets(game, viewerId, 'seer_check'),
      witch_poison: legalTargets(game, viewerId, 'witch_poison'),
      vote: legalTargets(game, viewerId, 'vote'),
      hunter_shot: legalTargets(game, viewerId, 'hunter_shot'),
    },
  };
}

export function touch(game) {
  game.updated_at = new Date().toISOString();
  return game;
}
