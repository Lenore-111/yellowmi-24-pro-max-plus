function stableIndex(seed, length) {
  if (!length) return -1;
  let hash = 2166136261;
  for (const char of String(seed || '')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % length;
}

function extractJson(value) {
  const raw = String(value || '').trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(raw.slice(start, end + 1)); } catch { return null; }
}

function cleanText(value, max = 160) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function compactMessages(messages, players) {
  const names = new Map((players || []).map((player) => [player.player_id, player.display_name]));
  return (messages || []).slice(-48).map((message) => ({
    speaker_id: message.player_id,
    speaker: names.get(message.player_id) || '未知玩家',
    round_number: message.round_number,
    text: message.text,
  }));
}

function compactVoteHistory(history, players) {
  const allowed = new Set((players || []).map((player) => player.player_id));
  return (Array.isArray(history) ? history : []).slice(-8).map((item) => ({
    round_number: Number(item?.round_number || 0),
    votes: Object.fromEntries(Object.entries(item?.votes || {}).filter(([voter, target]) => allowed.has(voter) && allowed.has(String(target)))),
    lynched: allowed.has(String(item?.lynched || '')) ? String(item.lynched) : '',
  }));
}

function roleStrategy(role) {
  if (role === 'wolf') {
    return [
      '你知道自己是狼人，并只把当前仍存活且在 GAME_VIEW 中明确显示为狼的玩家视为狼队友。',
      '私下目标和公开叙事要分开：可以嫁祸、倒钩、保队友或卖队友，但公开发言必须像一个试图找狼的普通好人。',
      '不要在公开发言里泄露狼队夜聊、刀口、队友身份或“我们狼人”之类后台信息。',
      '狼队夜聊中的约定、未来计划和预演不是已经发生的公开事实；不能在白天把“准备轻踩/准备保/准备投”说成“刚才已经踩过/保过/投过”。',
      '狼队不应机械集火同一套话术；优先维持前后立场一致，必要时允许轻微分歧。',
    ].join('\n');
  }
  if (role === 'seer') {
    return [
      '只有 seer_checks 中属于你的查验才是额外确定信息。',
      '决定是否公开跳预言家时，要权衡生存、查验价值和当前局势；未公开的信息可以暂时隐藏。',
      '不能把未来查验、未查验身份或后台角色当成已知事实。',
    ].join('\n');
  }
  if (role === 'witch') {
    return [
      '你额外知道的只有 GAME_VIEW.witch 中本夜狼刀目标以及自己药剂是否可用。',
      '救、毒、留药都应结合轮次、公开发言和药剂价值，不要因为未展示身份而开天眼。',
      '白天除非你主动选择公开，否则不要无缘无故暴露女巫身份或药况。',
    ].join('\n');
  }
  if (role === 'hunter') {
    return [
      '你没有额外验人能力。平时按公开信息盘逻辑，并记录真正值得带走的高嫌疑目标。',
      '死亡开枪时优先依据已有嫌疑和前后矛盾，不要凭后台身份。',
    ].join('\n');
  }
  return [
    '你没有任何夜间额外信息。只能依据公开发言、死亡结果和自己此前的判断盘逻辑。',
    '不要伪造查验、药口或后台身份；可以怀疑、站边和改口，但改口要能与新信息对应。',
  ].join('\n');
}

function allowedPlayerIds(request) {
  return new Set((request.view?.players || []).map((player) => player.player_id));
}

export function sanitizeLocalWerewolfAiMemory(value, request = {}) {
  const allowed = allowedPlayerIds(request);
  const source = value && typeof value === 'object' ? value : {};
  const suspects = Array.isArray(source.suspects) ? source.suspects : [];
  const trusted = Array.isArray(source.trusted) ? source.trusted : [];
  const claims = Array.isArray(source.claims) ? source.claims : [];
  return {
    updated_round: Number.isInteger(source.updated_round) ? Math.max(0, source.updated_round) : Number(request.view?.round_number || 0),
    stance: cleanText(source.stance, 120),
    next_plan: cleanText(source.next_plan, 120),
    public_story: cleanText(source.public_story, 120),
    suspects: suspects
      .filter((item) => item && allowed.has(String(item.player_id || '')))
      .slice(0, 6)
      .map((item) => ({
        player_id: String(item.player_id),
        score: Math.max(0, Math.min(100, Number.isFinite(Number(item.score)) ? Math.round(Number(item.score)) : 50)),
        note: cleanText(item.note, 56),
      })),
    trusted: trusted.filter((id) => allowed.has(String(id))).map(String).slice(0, 5),
    claims: claims
      .filter((item) => item && allowed.has(String(item.player_id || '')))
      .slice(-8)
      .map((item) => ({ player_id: String(item.player_id), claim: cleanText(item.claim, 72) })),
    last_action: cleanText(source.last_action, 32),
    last_target_id: allowed.has(String(source.last_target_id || '')) ? String(source.last_target_id) : '',
    last_public_text: cleanText(source.last_public_text, 220),
  };
}

function responseInstruction(action) {
  const memory = '"memory":{"stance":"当前结论摘要","next_plan":"下一步策略摘要","public_story":"公开立场/伪装口径；非狼人也可留空","suspects":[{"player_id":"player_id","score":0到100,"note":"极短结论"}],"trusted":["player_id"],"claims":[{"player_id":"player_id","claim":"其公开声称的关键信息"}]}' ;
  if (action === 'day_speak') return `请只输出 JSON：{${memory},"text":"一段像真人桌游发言的中文，简洁具体，必须与自己的既有立场和当前新信息相容"}`;
  if (action === 'witch') return `请只输出 JSON：{${memory},"choice":"save|poison|pass","target_id":"poison 时必须是合法 player_id，否则空字符串"}`;
  if (action === 'wolf_kill') return `请只输出 JSON：{${memory},"target_id":"合法 player_id","text":"可选，一句只给狼队友看的夜聊"}`;
  return `请只输出 JSON：{${memory},"target_id":"合法 player_id"}`;
}

export function buildLocalWerewolfAiPrompt(request) {
  const view = request.view || {};
  const previousMemory = sanitizeLocalWerewolfAiMemory(request.memory, request);
  const players = (view.players || []).map((player, index) => ({
    player_id: player.player_id,
    seat_number: index + 1,
    display_name: player.display_name,
    alive: player.alive,
    visible_role: player.role || '',
    death_cause: player.death_cause || '',
    died_round: player.died_round || 0,
  }));
  const yourSeatNumber = Math.max(0, players.findIndex((player) => player.player_id === request.player_id) + 1);
  const safe = {
    action: request.action,
    round_number: view.round_number,
    phase: view.phase,
    your_player_id: request.player_id,
    your_seat_number: yourSeatNumber,
    your_display_name: request.display_name,
    your_role: view.your_role,
    players,
    seer_checks: view.seer_checks || [],
    witch: view.witch || null,
    legal_targets: request.legal_targets || [],
    public_messages: compactMessages(view.public_messages, view.players),
    wolf_messages: request.action === 'wolf_kill' ? compactMessages(view.wolf_messages, view.players) : [],
    vote_history: compactVoteHistory(view.vote_history, view.players),
    previous_memory: previousMemory,
  };
  return [
    `你是单机狼人杀中的 AI 玩家“${request.display_name}”，固定 player_id 是 ${request.player_id}${yourSeatNumber ? `，固定座位是 ${yourSeatNumber} 号` : ''}。`,
    'GAME_VIEW.your_player_id、your_seat_number 与 your_display_name 永远指向你自己；整局座位不会变化。别人点名这个座位时就是在点名你，不能用“我不是 X 号”来否认自己的座位。',
    '目标：像一个有连续记忆、会根据新信息调整判断的真人玩家，而不是每轮重新开始。',
    '你和真人遵守完全相同的规则。只能依据下面 GAME_VIEW 中对你可见的信息推理；没有出现的身份和信息一律未知。',
    '先在内部完成：整理新增信息→检查自己上一轮立场→对照历史票型和前后发言→更新嫌疑/可信度→结合自己的阵营目标选择策略→再生成最终动作或公开发言。',
    '不要输出逐步思维过程、长篇分析或隐藏推理。memory 只保存短小的结论摘要和连续性记录，供你下一次行动继续使用。',
    '你可以撒谎、伪装、怀疑别人，但不能声称读取后台、角色卡、世界书、酒馆聊天或未展示的隐藏身份。',
    'previous_memory 是你的私有判断与计划，不是真相，更不是已经公开发生的事件；新证据足够时应修改，不要为了“保持一致”硬圆错误。',
    '白天公开发言中，凡是“某人刚才/昨天说过、投过、做过什么”这类具体公开历史，只能以 public_messages 与 vote_history 为事实来源。那里没有出现的公开行为，就不能为了配合私有计划而编造成已经发生。',
    '你自己的真实身份信息（例如个人查验、药况）可以按策略选择是否主动公开；但私有信息只能作为你的决策依据，不能伪装成别人已经公开做过的行为。',
    'wolf_messages 只会在狼人夜间选刀时提供；白天不会提供原始狼聊。即使 previous_memory 记着狼队内部计划，也必须把“计划”与“已经发生的公开行为”严格区分。',
    'vote_history 只包含已经结算并公开的历史票型，可以用于检查跟票、改票与立场变化；不要假装看到尚未结算的当前票。',
    '你的输出只是候选行为，最终合法性由本地规则代码裁决。',
    `身份策略：\n${roleStrategy(view.your_role)}`,
    `GAME_VIEW=${JSON.stringify(safe)}`,
    responseInstruction(request.action),
  ].join('\n');
}

function fallbackMemory(request, action, targetId = '', publicText = '') {
  const previous = sanitizeLocalWerewolfAiMemory(request.memory, request);
  return {
    ...previous,
    updated_round: Number(request.view?.round_number || previous.updated_round || 0),
    next_plan: action === 'day_speak' ? '继续观察后续发言与票型，必要时根据新信息调整站边。' : previous.next_plan,
    last_action: action,
    last_target_id: targetId || previous.last_target_id,
    last_public_text: publicText || previous.last_public_text,
  };
}

export function fallbackLocalWerewolfAiDecision(request) {
  const targets = Array.isArray(request.legal_targets) ? request.legal_targets : [];
  const target = targets[stableIndex(`${request.request_id}:${request.action}`, targets.length)] || '';
  if (request.action === 'day_speak') {
    const lines = [
      '我先不急着站死边，想看一下前后发言有没有互相对不上。',
      '现在信息还少，我更在意谁在很早的时候就把结论说得太满。',
      '我先记一下前面的立场，后面如果有人突然改口我会重点看理由。',
      '我暂时没有铁踩，先把发言和票型对起来再收范围。',
    ];
    const text = lines[stableIndex(request.request_id, lines.length)];
    return { text, memory: fallbackMemory(request, 'day_speak', '', text) };
  }
  if (request.action === 'witch') {
    if (request.view?.witch?.wolf_target && request.view?.witch?.antidote_available) return { choice: 'save', target_id: '', memory: fallbackMemory(request, 'witch') };
    if (request.view?.witch?.poison_available && target) return { choice: 'poison', target_id: target, memory: fallbackMemory(request, 'witch', target) };
    return { choice: 'pass', target_id: '', memory: fallbackMemory(request, 'witch') };
  }
  if (request.action === 'wolf_kill') {
    const text = '我倾向这一刀，白天再看局势调整公开站边。';
    return { target_id: target, text, memory: fallbackMemory(request, 'wolf_kill', target) };
  }
  return { target_id: target, memory: fallbackMemory(request, request.action, target) };
}

export async function decideLocalWerewolfAi(request) {
  const fallback = fallbackLocalWerewolfAiDecision(request);
  const ctx = globalThis.SillyTavern?.getContext?.();
  const generator = ctx?.generateRaw;
  if (typeof generator !== 'function') return fallback;
  try {
    const raw = await generator({ prompt: buildLocalWerewolfAiPrompt(request), systemPrompt: '' });
    const parsed = extractJson(raw);
    if (!parsed) return fallback;
    const memory = sanitizeLocalWerewolfAiMemory(parsed.memory, request);
    if (request.action === 'day_speak') {
      const text = cleanText(parsed.text, 320);
      return text ? { text, memory: { ...memory, last_action: 'day_speak', last_public_text: text } } : fallback;
    }
    if (request.action === 'witch') {
      const choice = ['save', 'poison', 'pass'].includes(parsed.choice) ? parsed.choice : fallback.choice;
      const target = String(parsed.target_id || '');
      if (choice === 'poison' && !request.legal_targets?.includes(target)) return fallback;
      if (choice === 'save' && (!request.view?.witch?.antidote_available || !request.view?.witch?.wolf_target)) return fallback;
      return { choice, target_id: choice === 'poison' ? target : '', memory: { ...memory, last_action: 'witch', last_target_id: choice === 'poison' ? target : '' } };
    }
    const target = String(parsed.target_id || '');
    if (!request.legal_targets?.includes(target)) return fallback;
    const result = { target_id: target, memory: { ...memory, last_action: request.action, last_target_id: target } };
    if (request.action === 'wolf_kill') {
      const text = cleanText(parsed.text, 180);
      if (text) result.text = text;
    }
    return result;
  } catch {
    return fallback;
  }
}
