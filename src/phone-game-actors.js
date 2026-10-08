const clean = value => String(value ?? '').trim();
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const profileFields = ['identityAnchor', 'identity_anchor', 'description', 'personality', 'backgroundProfile', 'background_profile', 'profile'];

function pronoun(value) {
  const key = clean(value).toLowerCase();
  if (/^(他|男|男性|男人|男生|男孩|雄性|male|man|boy|he(?:\/him(?:\/his)?)?)$/.test(key)) return '他';
  if (/^(她|女|女性|女人|女生|女孩|雌性|female|woman|girl|she(?:\/her(?:\/hers)?)?)$/.test(key)) return '她';
  if (/^(它|it)$/.test(key)) return '它';
  return '';
}

function unambiguous(values) {
  const choices = [...new Set(values.filter(Boolean))];
  return choices.length === 1 ? choices[0] : '';
}

export function phoneGameActorPronoun(actor) {
  return pronoun(actor?.pronoun) || clean(actor?.name) || '对方';
}

export function inferPhoneGamePronoun(source = {}, profile = '') {
  for (const value of [source.pronoun, source.pronouns, source.代词, source.称谓]) {
    const result = pronoun(value);
    if (result) return result;
  }
  const text = [source.identityAnchor, source.identity_anchor, profile].filter(value => typeof value === 'string').join('\n');
  const explicit = [...text.matchAll(/(?:代词|称谓|pronouns?)["']?\s*[：:=]\s*["“']?([^\s，。,;；\n"”']+)/gi)].map(match => pronoun(match[1]));
  explicit.push(...[...text.matchAll(/(?:使用|用)\s*["“'「『](他|她|它)["”'」』]/g)].map(match => match[1]));
  if (explicit.some(Boolean)) return unambiguous(explicit);
  for (const value of [source.gender, source.sex, source.性别]) {
    const result = pronoun(value);
    if (result) return result;
    if (clean(value)) return '';
  }
  const gender = [...text.matchAll(/(?:性别|gender|sex)["']?\s*[：:=]\s*["“']?([^\s，。,;；\n"”']+)/gi)].map(match => pronoun(match[1]));
  if (/(?:性别|gender|sex)["']?\s*[：:=]/i.test(text)) return unambiguous(gender);
  // 只使用人物自己的身份、外貌字段，或以该人物为主语的句子。
  const identity = [source.identityAnchor, source.identity_anchor, ...text.split(/\n/).filter(line => /^(?:身份|性别身份|外貌(?:硬锚|设定)?|人物简介)\s*[：:]/.test(line.trim()))].filter(Boolean).join('\n');
  const anchored = source.name ? [...text.matchAll(new RegExp(`${escape(clean(source.name))}(?:是|为|，|,|：|:)\\s*[^。；;\\n]{0,24}?(男性|女性|男人|女人|男生|女生)`, 'g'))].map(match => pronoun(match[1])) : [];
  const genders = [...identity.matchAll(/男性|女性|男人|女人|男生|女生/g)].map(match => pronoun(match[0]));
  const result = unambiguous([...anchored, ...genders]);
  if (result) return result;
  return unambiguous([...text.matchAll(/(?<!其)(他|她)(?=[的会是有喜想不也可危应在向将只])/g)].map(match => match[1]));
}

export function phoneGameCardProfile(card) {
  return ['description', 'personality', 'scenario'].map(field => card?.[field] || card?.data?.[field]).filter(value => typeof value === 'string').join('\n');
}

export function isPhoneGameScenarioCard(card) {
  const type = clean(card?.cardType || card?.data?.extensions?.world_phone?.cardType).toLowerCase();
  if (['world', 'scenario', 'game', 'narrator', '世界', '剧情', '游戏', '叙事'].includes(type)) return true;
  const name = clean(card?.name || card?.data?.name);
  if (/文本互动|模拟器|世界观卡|世界卡|剧情卡|群像卡|多人卡|多人\s*GM\s*卡|叙事引擎|轮回.*(?:互动|修订)/i.test(name)) return true;
  const description = clean(card?.description || card?.data?.description);
  return /(?:这是一张|本卡(?:是|为)|类型\s*[：:])[^。\n]{0,60}(?:多人\s*GM|世界观|群像|叙事引擎|模拟器)/i.test(description)
    || /\{\{char\}\}[^。\n]{0,30}(?:不是(?:单一|单个|一个)(?:恋爱)?角色|是(?:叙事引擎|旁白|主持人))/.test(description);
}

export function phoneGameCardName(card) {
  if (isPhoneGameScenarioCard(card)) return '';
  const profile = phoneGameCardProfile(card);
  const names = [...profile.matchAll(/(?:^|\n)\s*(?:姓名|角色姓名|角色名|name)\s*[：:=]\s*["“']?([^\n，。,;；"”']{1,80})/gi)].map(match => clean(match[1]));
  return unambiguous(names) || clean(card?.name || card?.data?.name);
}

function subjectEntries(card, name) {
  const entries = card?.data?.character_book?.entries || card?.character_book?.entries || [];
  return entries.filter(entry => {
    const title = clean(entry?.comment || entry?.name).replace(/^\d+\s*[｜|.、:：-]\s*/, '');
    return title === name || (entry?.keys?.[0] === name && (!title || /(?:人设|人物|角色|档案|设定)/.test(title) && title.includes(name)));
  }).map(entry => clean(entry.content)).filter(Boolean);
}

export function collectPhoneGameActors(ctx, contacts = []) {
  const cards = ctx?.groupId ? (ctx.groups?.find(group => String(group.id) === String(ctx.groupId))?.members || [])
    .map(avatar => ctx.characters?.find(card => card.avatar === avatar)).filter(Boolean) : [ctx?.characters?.[ctx?.characterId]].filter(Boolean);
  const actors = [];
  for (const [index, card] of cards.entries()) {
    const name = phoneGameCardName(card);
    if (!name || actors.some(actor => actor.name === name)) continue;
    const profile = phoneGameCardProfile(card).slice(0, 7000);
    const identity = { ...card?.data, ...card, ...card?.data?.extensions?.world_phone, name };
    actors.push({ id: `card:${card.avatar || card.name || card.data?.name || index}`, name: name.slice(0, 80), profile, pronoun: inferPhoneGamePronoun(identity, profile) });
  }
  for (const person of contacts) {
    const name = clean(person.name).slice(0, 80);
    if (!name || name === ctx?.name1 || cards.some(card => isPhoneGameScenarioCard(card) && clean(card.name || card.data?.name) === name)) continue;
    const raw = person.raw || {};
    const ownProfile = profileFields.map(field => typeof raw[field] === 'string' ? raw[field] : '').filter(Boolean).join('\n');
    const cardProfile = cards.flatMap(card => subjectEntries(card, name)).join('\n');
    const profile = [ownProfile, cardProfile].filter(Boolean).join('\n').slice(0, 7000);
    const resolved = inferPhoneGamePronoun({ ...raw, name }, ownProfile) || inferPhoneGamePronoun({ name }, cardProfile);
    const existing = actors.find(actor => actor.name === name);
    if (existing) { existing.pronoun = resolved || existing.pronoun; continue; }
    if (!clean(person.id)) continue;
    actors.push({ id: `world:${person.id}`, name, profile, pronoun: resolved });
  }
  return actors.slice(0, 12);
}

export function isPhoneGameScenarioActor(actor, ctx) {
  if (!actor?.id?.startsWith('card:') && !actor?.id?.startsWith('world:')) return false;
  const cards = ctx?.characters || [];
  const card = cards.find(card => `card:${card.avatar || card.name || card.data?.name}` === actor.id
    || clean(card.name || card.data?.name) === actor.name);
  return card ? isPhoneGameScenarioCard(card) : isPhoneGameScenarioCard({ name: actor.name, description: actor.profile });
}
