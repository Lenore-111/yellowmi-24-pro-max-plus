import {
  appendGameMessage,
  beginVote,
  createLocalWerewolfGame,
  legalTargets,
  livingPlayers,
  markAiSpoken,
  submitWerewolfAction,
  viewForPlayer,
  WEREWOLF_PHASES,
} from './werewolf-local-engine.js';
import { decideLocalWerewolfAi, sanitizeLocalWerewolfAiMemory } from './werewolf-local-ai.js';

export const LOCAL_WEREWOLF_STORAGE_KEY = 'world_phone_werewolf_local_v1';

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function storage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

function validSavedGame(value) {
  return Boolean(value && value.schema === 1 && value.game_id && value.human_player_id && Array.isArray(value.players) && value.roles && value.phase);
}

function ensureAiMemory(game) {
  if (!game.ai_memory || typeof game.ai_memory !== 'object' || Array.isArray(game.ai_memory)) game.ai_memory = {};
  return game.ai_memory;
}

function ensureAiPublicHistory(game) {
  if (!game.ai_public_history || typeof game.ai_public_history !== 'object' || Array.isArray(game.ai_public_history)) {
    game.ai_public_history = { votes: [] };
  }
  if (!Array.isArray(game.ai_public_history.votes)) game.ai_public_history.votes = [];
  return game.ai_public_history;
}

function resolvedVoteTarget(votes) {
  const counts = new Map();
  for (const target of Object.values(votes || {})) {
    if (!target) continue;
    counts.set(target, (counts.get(target) || 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (!ranked.length) return '';
  if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) return '';
  return ranked[0][0];
}

function pendingVoteHistory(game, playerId, action) {
  if (!game || action?.type !== 'vote' || game.phase !== WEREWOLF_PHASES.vote) return null;
  if (Object.hasOwn(game.day.votes, playerId)) return null;
  const alive = livingPlayers(game);
  if (Object.keys(game.day.votes).length !== alive.length - 1) return null;
  const votes = { ...game.day.votes, [playerId]: action.target_id };
  return {
    round_number: game.round_number,
    votes,
    lynched: resolvedVoteTarget(votes),
  };
}

function recordVoteHistory(game, snapshot) {
  if (!snapshot) return;
  const history = ensureAiPublicHistory(game).votes;
  if (history.some((item) => item.round_number === snapshot.round_number)) return;
  history.push(clone(snapshot));
  if (history.length > 12) history.splice(0, history.length - 12);
}

export function loadLocalWerewolfGame() {
  const store = storage();
  if (!store) return null;
  try {
    const parsed = JSON.parse(store.getItem(LOCAL_WEREWOLF_STORAGE_KEY) || 'null');
    if (!validSavedGame(parsed)) return null;
    ensureAiMemory(parsed);
    ensureAiPublicHistory(parsed);
    return parsed;
  } catch {
    return null;
  }
}

export function saveLocalWerewolfGame(game) {
  const store = storage();
  if (!store || !game) return;
  ensureAiMemory(game);
  ensureAiPublicHistory(game);
  store.setItem(LOCAL_WEREWOLF_STORAGE_KEY, JSON.stringify(game));
}

export function clearLocalWerewolfGame() {
  storage()?.removeItem(LOCAL_WEREWOLF_STORAGE_KEY);
}

function aiRequest(game, playerId, action) {
  const player = game.players.find((item) => item.player_id === playerId);
  const view = viewForPlayer(game, playerId);
  view.vote_history = clone(ensureAiPublicHistory(game).votes.slice(-8));
  const legalMap = {
    wolf_kill: view.legal_targets.wolf_kill,
    seer_check: view.legal_targets.seer_check,
    witch: view.legal_targets.witch_poison,
    vote: view.legal_targets.vote,
    hunter_shot: view.legal_targets.hunter_shot,
    day_speak: [],
  };
  const memory = ensureAiMemory(game)[playerId] || {};
  return {
    request_id: `${game.game_id}:${game.round_number}:${playerId}:${action}`,
    action,
    player_id: playerId,
    display_name: player?.display_name || 'AI',
    legal_targets: legalMap[action] || [],
    memory: clone(memory),
    view,
  };
}

function rememberAiDecision(game, request, decision) {
  const memory = sanitizeLocalWerewolfAiMemory(decision?.memory, request);
  ensureAiMemory(game)[request.player_id] = {
    ...memory,
    updated_round: game.round_number,
    last_action: memory.last_action || request.action,
    last_target_id: memory.last_target_id || String(decision?.target_id || ''),
    last_public_text: memory.last_public_text || (request.action === 'day_speak' ? String(decision?.text || '').slice(0, 220) : ''),
  };
}

export class LocalWerewolfGameController {
  constructor({ decideAi = decideLocalWerewolfAi } = {}) {
    this.decideAi = decideAi;
    this.game = loadLocalWerewolfGame();
    if (this.game) {
      ensureAiMemory(this.game);
      ensureAiPublicHistory(this.game);
    }
    this.listeners = new Set();
    this.busy = false;
    this.error = '';
    this.destroyed = false;
  }

  getState() {
    return {
      has_game: Boolean(this.game),
      busy: this.busy,
      error: this.error,
      deal_pending: Boolean(this.game?.dealer_pending),
      deal_revealed: Boolean(this.game?.dealer_revealed),
      game: clone(this.game),
      view: this.game ? viewForPlayer(this.game, this.game.human_player_id) : null,
    };
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit() {
    if (this.destroyed) return;
    const state = this.getState();
    for (const listener of [...this.listeners]) {
      try { listener(state); } catch {}
    }
  }

  persist() {
    if (this.game) saveLocalWerewolfGame(this.game);
    this.emit();
  }

  async newGame(options = {}) {
    this.error = '';
    this.game = createLocalWerewolfGame(options);
    this.game.ai_memory = {};
    this.game.ai_public_history = { votes: [] };
    this.game.dealer_pending = Boolean(options.awaitDeal);
    this.game.dealer_revealed = false;
    this.persist();
    if (!this.game.dealer_pending) await this.runAiLoop();
    return this.getState();
  }

  async resume() {
    if (!this.game) this.game = loadLocalWerewolfGame();
    if (!this.game) throw new Error('没有可恢复的本地对局');
    ensureAiMemory(this.game);
    ensureAiPublicHistory(this.game);
    await this.runAiLoop();
    return this.getState();
  }

  abandon() {
    this.game = null;
    this.error = '';
    clearLocalWerewolfGame();
    this.emit();
  }

  revealDeal() {
    if (!this.game?.dealer_pending) throw new Error('当前没有待查看的身份牌');
    this.game.dealer_revealed = true;
    this.persist();
    return this.getState();
  }

  async confirmDeal() {
    if (!this.game) throw new Error('游戏尚未开始');
    if (!this.game.dealer_pending) return this.getState();
    if (!this.game.dealer_revealed) throw new Error('先查看自己的身份牌');
    this.game.dealer_pending = false;
    this.persist();
    await this.runAiLoop();
    return this.getState();
  }

  async humanAction(action) {
    if (!this.game) throw new Error('游戏尚未开始');
    if (this.game.dealer_pending) throw new Error('先查看身份牌，再进入夜晚');
    this.error = '';
    const voteSnapshot = pendingVoteHistory(this.game, this.game.human_player_id, action);
    submitWerewolfAction(this.game, this.game.human_player_id, action);
    recordVoteHistory(this.game, voteSnapshot);
    this.persist();
    await this.runAiLoop();
    return this.getState();
  }

  async humanMessage(text) {
    if (!this.game) throw new Error('游戏尚未开始');
    if (this.game.dealer_pending) throw new Error('先查看身份牌，再进入夜晚');
    const view = viewForPlayer(this.game, this.game.human_player_id);
    const channel = view.phase === WEREWOLF_PHASES.wolves && view.your_role === 'wolf' ? 'wolves' : 'public';
    appendGameMessage(this.game, this.game.human_player_id, channel, text);
    this.persist();
    return this.getState();
  }

  async finishDiscussion() {
    if (!this.game) throw new Error('游戏尚未开始');
    if (this.game.dealer_pending) throw new Error('先查看身份牌，再进入夜晚');
    beginVote(this.game);
    this.persist();
    await this.runAiLoop();
    return this.getState();
  }

  async runAiLoop() {
    if (!this.game || this.game.dealer_pending || this.busy || this.destroyed) return this.getState();
    this.busy = true;
    this.error = '';
    this.emit();
    try {
      let guard = 0;
      while (this.game && this.game.status === 'playing' && guard < 80) {
        guard += 1;
        const game = this.game;
        ensureAiMemory(game);
        ensureAiPublicHistory(game);
        const humanId = game.human_player_id;
        const human = game.players.find((player) => player.player_id === humanId);
        const humanRole = game.roles[humanId];

        if (game.phase === WEREWOLF_PHASES.wolves) {
          const pendingAi = livingPlayers(game).filter((player) => player.kind === 'ai' && game.roles[player.player_id] === 'wolf' && !Object.hasOwn(game.night.wolf_votes, player.player_id));
          if (pendingAi.length) {
            const player = pendingAi[0];
            const request = aiRequest(game, player.player_id, 'wolf_kill');
            const decision = await this.decideAi(request);
            rememberAiDecision(game, request, decision);
            if (decision.text) appendGameMessage(game, player.player_id, 'wolves', decision.text);
            submitWerewolfAction(game, player.player_id, { type: 'wolf_kill', target_id: decision.target_id });
            this.persist();
            continue;
          }
          if (human?.alive && humanRole === 'wolf' && !Object.hasOwn(game.night.wolf_votes, humanId)) break;
          continue;
        }

        if (game.phase === WEREWOLF_PHASES.seer) {
          const seer = livingPlayers(game).find((player) => game.roles[player.player_id] === 'seer');
          if (!seer) continue;
          if (seer.kind === 'human') break;
          const request = aiRequest(game, seer.player_id, 'seer_check');
          const decision = await this.decideAi(request);
          rememberAiDecision(game, request, decision);
          submitWerewolfAction(game, seer.player_id, { type: 'seer_check', target_id: decision.target_id });
          this.persist();
          continue;
        }

        if (game.phase === WEREWOLF_PHASES.witch) {
          const witch = livingPlayers(game).find((player) => game.roles[player.player_id] === 'witch');
          if (!witch) continue;
          if (witch.kind === 'human') break;
          const request = aiRequest(game, witch.player_id, 'witch');
          const decision = await this.decideAi(request);
          rememberAiDecision(game, request, decision);
          submitWerewolfAction(game, witch.player_id, { type: 'witch', choice: decision.choice, target_id: decision.target_id || '' });
          this.persist();
          continue;
        }

        if (game.phase === WEREWOLF_PHASES.hunter) {
          const hunterId = game.hunter.pending_player_id;
          const hunter = game.players.find((player) => player.player_id === hunterId);
          if (!hunter) throw new Error('猎人状态损坏');
          if (hunter.kind === 'human') break;
          const request = aiRequest(game, hunterId, 'hunter_shot');
          const decision = await this.decideAi(request);
          rememberAiDecision(game, request, decision);
          const target = decision.target_id;
          submitWerewolfAction(game, hunterId, target && legalTargets(game, hunterId, 'hunter_shot').includes(target)
            ? { type: 'hunter_shot', target_id: target }
            : { type: 'hunter_pass' });
          this.persist();
          continue;
        }

        if (game.phase === WEREWOLF_PHASES.discussion) {
          const nextSpeaker = livingPlayers(game).find((player) => player.kind === 'ai' && !game.day.ai_spoken[player.player_id]);
          if (!nextSpeaker) {
            game.day.ready_for_vote = true;
            this.persist();
            break;
          }
          const request = aiRequest(game, nextSpeaker.player_id, 'day_speak');
          const decision = await this.decideAi(request);
          rememberAiDecision(game, request, decision);
          appendGameMessage(game, nextSpeaker.player_id, 'public', decision.text || '我这一轮先听听其他人的看法。');
          markAiSpoken(game, nextSpeaker.player_id);
          this.persist();
          continue;
        }

        if (game.phase === WEREWOLF_PHASES.vote) {
          const nextVoter = livingPlayers(game).find((player) => player.kind === 'ai' && !Object.hasOwn(game.day.votes, player.player_id));
          if (nextVoter) {
            const request = aiRequest(game, nextVoter.player_id, 'vote');
            const decision = await this.decideAi(request);
            rememberAiDecision(game, request, decision);
            const action = { type: 'vote', target_id: decision.target_id };
            const voteSnapshot = pendingVoteHistory(game, nextVoter.player_id, action);
            submitWerewolfAction(game, nextVoter.player_id, action);
            recordVoteHistory(game, voteSnapshot);
            this.persist();
            continue;
          }
          if (human?.alive && !Object.hasOwn(game.day.votes, humanId)) break;
          continue;
        }

        break;
      }
      if (guard >= 80) throw new Error('AI 自动流程超过安全步数，已停止以避免死循环');
    } catch (error) {
      this.error = String(error?.message || error);
    } finally {
      this.busy = false;
      if (this.game) saveLocalWerewolfGame(this.game);
      this.emit();
    }
    return this.getState();
  }

  destroy() {
    this.destroyed = true;
    this.listeners.clear();
  }
}
