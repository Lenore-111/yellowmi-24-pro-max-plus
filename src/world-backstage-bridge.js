const WORLD_STATE_KEY = 'world_backstage_v1';
const REQUIRED_PHONE_BRIDGE_VERSION = 2;

function text(value, fallback = '') {
  const result = String(value ?? '').trim();
  return result || fallback;
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function getContext() {
  try { return globalThis.SillyTavern?.getContext?.() || null; } catch { return null; }
}

function getHost() {
  const host = globalThis.worldBackstageHost;
  return host && typeof host === 'object' ? host : null;
}

function bridgeVersion(host = getHost()) {
  return Math.max(0, Number(host?.phoneBridgeVersion) || 0);
}

function safePhoneSurface(host = getHost()) {
  if (!host || bridgeVersion(host) < REQUIRED_PHONE_BRIDGE_VERSION) return null;
  if (typeof host.getPhoneSurface !== 'function') return null;
  try {
    const surface = host.getPhoneSurface();
    if (!surface || typeof surface !== 'object') return null;
    if (Math.max(0, Number(surface.bridgeVersion) || 0) < REQUIRED_PHONE_BRIDGE_VERSION) return null;
    return surface;
  } catch {
    return null;
  }
}

function findWorldClock(source) {
  const candidates = [
    source?.clock,
    source?.worldClock,
    source?.world_clock,
    source?.time,
    source?.worldTime,
    source,
  ].filter(Boolean);
  for (const raw of candidates) {
    if (typeof raw === 'string' && raw.trim()) return { time: raw.trim(), date: '', absoluteMinute: 0 };
    if (!raw || typeof raw !== 'object') continue;
    const time = text(raw.displayTime ?? raw.display_time ?? raw.timeLabel ?? raw.time_label ?? raw.time ?? raw.currentTime ?? raw.current_time);
    const date = text(raw.displayDate ?? raw.display_date ?? raw.dateLabel ?? raw.date_label ?? raw.date ?? raw.currentDate ?? raw.current_date);
    const absoluteMinute = Math.max(0, Number(raw.absoluteMinute ?? raw.absolute_minute) || 0);
    if (time || date || absoluteMinute) return { time, date, absoluteMinute };
  }
  return { time: '', date: '', absoluteMinute: 0 };
}

function personAvatar(person) {
  return text(
    person?.avatarDataUrl
    ?? person?.avatar_data_url
    ?? person?.avatar
    ?? person?.avatarUrl
    ?? person?.avatar_url,
  );
}

function personSubtitle(person) {
  return text(
    person?.subtitle
    ?? person?.status
    ?? person?.currentState
    ?? person?.current_state
    ?? person?.state
    ?? person?.role
    ?? person?.identity,
  );
}

function normalizePeople(source) {
  return list(source)
    .filter((person) => person && !(person?.isUser ?? person?.is_user))
    .map((person) => ({
      id: text(person?.id),
      name: text(person?.name, '未命名'),
      avatar: personAvatar(person),
      subtitle: personSubtitle(person),
      raw: person,
    }))
    .filter((person) => person.id);
}

function normalizeConnections(social) {
  return list(social?.connections).map((connection) => ({
    personId: text(connection?.personId ?? connection?.person_id),
    status: text(connection?.status, 'suggested'),
    requestMessage: text(connection?.requestMessage ?? connection?.request_message),
    decisionReply: text(connection?.decisionReply ?? connection?.decision_reply),
    requestedAt: text(connection?.requestedAt ?? connection?.requested_at),
    respondedAt: text(connection?.respondedAt ?? connection?.responded_at),
    updatedAt: text(connection?.updatedAt ?? connection?.updated_at),
    raw: connection,
  })).filter((connection) => connection.personId);
}

function normalizeMessages(conversation) {
  return list(conversation?.rawMessages ?? conversation?.raw_messages ?? conversation?.messages).map((message) => ({
    id: text(message?.id),
    senderId: text(message?.senderId ?? message?.sender_id),
    senderName: text(message?.senderName ?? message?.sender_name),
    text: text(message?.text),
    worldMinute: Number(message?.worldMinute ?? message?.world_minute) || 0,
    createdAt: text(message?.createdAt ?? message?.created_at),
    raw: message,
  })).filter((message) => message.id && message.text);
}

function normalizeConversations(social, peopleById) {
  return list(social?.conversations).map((conversation) => {
    const memberIds = list(conversation?.memberIds ?? conversation?.member_ids).map((id) => text(id)).filter(Boolean);
    const messages = normalizeMessages(conversation);
    const last = messages.at(-1) || null;
    const type = conversation?.type === 'group' ? 'group' : 'direct';
    const directPerson = type === 'direct' ? peopleById.get(memberIds[0]) : null;
    return {
      id: text(conversation?.id),
      type,
      title: text(conversation?.title, directPerson?.name || '未命名会话'),
      memberIds,
      messages,
      lastMessage: last,
      unread: Number(conversation?.unread ?? conversation?.unreadCount ?? conversation?.unread_count) || 0,
      updatedAt: text(conversation?.updatedAt ?? conversation?.updated_at ?? last?.createdAt),
      raw: conversation,
    };
  }).filter((conversation) => conversation.id);
}

function normalizeMoments(social, peopleById) {
  return list(social?.moments).filter((moment) => moment?.visibility !== 'private').map((moment) => {
    const personId = text(moment?.personId ?? moment?.person_id);
    const person = peopleById.get(personId);
    return {
      id: text(moment?.id),
      personId,
      authorName: person?.name || text(moment?.authorName ?? moment?.author_name, '未知人物'),
      avatar: person?.avatar || '',
      text: text(moment?.text),
      imageUrl: text(moment?.imageUrl ?? moment?.image_url),
      likes: Math.max(0, Number(moment?.likes) || 0),
      likedByUser: Boolean(moment?.likedByUser ?? moment?.liked_by_user),
      visibility: text(moment?.visibility, 'friends'),
      worldMinute: Number(moment?.worldMinute ?? moment?.world_minute) || 0,
      createdAt: text(moment?.createdAt ?? moment?.created_at),
      raw: moment,
    };
  }).filter((moment) => moment.id && moment.personId && (moment.text || moment.imageUrl));
}

function normalizeNotices(social, peopleById) {
  return list(social?.notices).map((notice) => {
    const personId = text(notice?.personId ?? notice?.person_id);
    const person = peopleById.get(personId);
    return {
      id: text(notice?.id),
      kind: text(notice?.kind, 'message'),
      personId,
      personName: person?.name || '未知人物',
      avatar: person?.avatar || '',
      conversationId: text(notice?.conversationId ?? notice?.conversation_id),
      text: text(notice?.text),
      createdAt: text(notice?.createdAt ?? notice?.created_at),
      readAt: text(notice?.readAt ?? notice?.read_at),
      raw: notice,
    };
  }).filter((notice) => notice.id && notice.personId);
}

function normalizeNews(publicOpinion) {
  return list(publicOpinion?.news).map((item) => ({
    id: text(item?.id),
    category: text(item?.category, '世界新闻'),
    headline: text(item?.headline, '未命名新闻'),
    summary: text(item?.summary),
    source: text(item?.source),
    sourceType: text(item?.sourceType ?? item?.source_type),
    area: text(item?.area),
    scope: text(item?.scope ?? item?.area),
    heat: Math.max(0, Number(item?.heat) || 0),
    relatedEventId: text(item?.relatedEventId ?? item?.related_event_id),
    publishedAt: text(item?.publishedAt ?? item?.published_at),
    updatedAt: text(item?.updatedAt ?? item?.updated_at),
    createdAt: text(item?.createdAt ?? item?.created_at),
    worldMinute: Number(item?.worldMinute ?? item?.world_minute) || 0,
    raw: item,
  })).filter((item) => item.id);
}

function normalizeForums(publicOpinion) {
  return list(publicOpinion?.forums).map((item) => ({
    id: text(item?.id),
    board: text(item?.board, '闲聊'),
    title: text(item?.title, '相关讨论'),
    summary: text(item?.summary),
    sourceType: text(item?.sourceType ?? item?.source_type, 'unofficial'),
    scope: text(item?.scope),
    claimStatus: text(item?.claimStatus ?? item?.claim_status, 'mixed'),
    heat: Math.max(0, Number(item?.heat) || 0),
    relatedEventId: text(item?.relatedEventId ?? item?.related_event_id),
    replies: list(item?.replies)
      .map((reply) => ({ author: text(reply?.author, '匿名'), text: text(reply?.text) }))
      .filter((reply) => reply.text)
      .slice(0, 8),
    publishedAt: text(item?.publishedAt ?? item?.published_at),
    updatedAt: text(item?.updatedAt ?? item?.updated_at),
    worldMinute: Number(item?.worldMinute ?? item?.world_minute) || 0,
    raw: item,
  })).filter((item) => item.id && item.title);
}

function emptySnapshot(context = getContext(), host = getHost()) {
  return {
    connected: false,
    bridgeConnected: false,
    capabilities: [],
    bridgeVersion: bridgeVersion(host),
    engineVersion: text(host?.version),
    schemaVersion: 0,
    branchKey: '',
    worldName: '主世界',
    key: WORLD_STATE_KEY,
    user: text(context?.name1 ?? context?.userName, '你'),
    chatMessages: list(context?.chat).length,
    clock: { time: '', date: '', absoluteMinute: 0 },
    contacts: [],
    people: [],
    connections: [],
    conversations: [],
    moments: [],
    notices: [],
    unreadNotices: [],
    unreadMessageCount: 0,
    news: [],
    forums: [],
    events: [],
    raw: { surface: null },
  };
}

export function readWorldBackstage() {
  const context = getContext();
  const host = getHost();
  const surface = safePhoneSurface(host);
  if (!context || !surface?.connected) return emptySnapshot(context, host);

  const social = surface.social && typeof surface.social === 'object' ? surface.social : {};
  const publicOpinion = surface.publicOpinion && typeof surface.publicOpinion === 'object'
    ? surface.publicOpinion
    : {};
  const people = normalizePeople(surface.people);
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const connections = normalizeConnections(social);
  const acceptedIds = new Set(connections.filter((item) => item.status === 'accepted').map((item) => item.personId));
  const conversations = normalizeConversations(social, peopleById);
  const conversationPersonIds = new Set(conversations.flatMap((conversation) => conversation.memberIds));
  const contacts = people.filter((person) => acceptedIds.has(person.id) || conversationPersonIds.has(person.id));
  const moments = normalizeMoments(social, peopleById);
  const notices = normalizeNotices(social, peopleById);
  const unreadNotices = notices.filter((notice) => !notice.readAt);

  return {
    connected: true,
    bridgeConnected: true,
    capabilities: list(surface.capabilities).filter(item => typeof item === 'string'),
    bridgeVersion: Math.max(bridgeVersion(host), Number(surface.bridgeVersion) || 0),
    engineVersion: text(host?.version),
    schemaVersion: Number(surface.schemaVersion) || 0,
    branchKey: text(surface.branchKey),
    worldName: text(surface.worldName, '主世界'),
    key: WORLD_STATE_KEY,
    user: text(context?.name1 ?? context?.userName, '你'),
    chatMessages: list(context?.chat).length,
    clock: findWorldClock(surface.clock),
    contacts,
    people,
    connections,
    conversations,
    moments,
    notices,
    unreadNotices,
    unreadMessageCount: unreadNotices.filter((notice) => notice.kind === 'message').length,
    news: normalizeNews(publicOpinion),
    forums: normalizeForums(publicOpinion),
    events: list(surface.events),
    raw: { surface },
  };
}

function authorizedHostAction() {
  const host = getHost();
  if (!host || bridgeVersion(host) < REQUIRED_PHONE_BRIDGE_VERSION) return null;
  if (typeof host.phoneAction !== 'function') return null;
  if (!getContext() || !safePhoneSurface(host)?.connected) return null;
  return host;
}

function requireHostAction() {
  const host = authorizedHostAction();
  if (!host) throw new Error('世界背面手机桥未连接或版本过旧；小手机不会直接修改世界后台');
  return host;
}

export function performWorldBackstageSocialAction(action, payload) {
  if (!readWorldBackstage().capabilities.includes(action)) throw new Error('请先更新世界背面测试版以使用此功能');
  const surface = requireHostAction().phoneAction(action, payload);
  return { snapshot: readWorldBackstage(), conversationId: text(surface?.social?.activeConversationId) };
}

export function sendWorldBackstageMessage(conversationId, body) {
  const id = text(conversationId);
  const content = text(body).slice(0, 1600);
  if (!id) throw new Error('没有找到要发送的会话');
  if (!content) throw new Error('先写点什么再发送');
  const host = requireHostAction();
  host.phoneAction('social-send-message', { conversationId: id, text: content });
  return readWorldBackstage();
}

export function markWorldBackstageConversationRead(conversationId) {
  const id = text(conversationId);
  if (!id) return readWorldBackstage();
  const host = authorizedHostAction();
  if (!host) return readWorldBackstage();
  host.phoneAction('social-read-conversation', { conversationId: id });
  return readWorldBackstage();
}

export function setWorldBackstageMomentLiked(momentId, liked) {
  const targetId = text(momentId);
  if (!targetId) return readWorldBackstage();
  const host = authorizedHostAction();
  if (!host) return readWorldBackstage();
  host.phoneAction('social-set-moment-like', { momentId: targetId, liked: Boolean(liked) });
  return readWorldBackstage();
}

function snapshotSignature(snapshot) {
  const people = snapshot.people.map((item) => [
    item.id,
    item.name,
    item.avatar,
    item.subtitle,
    item.status,
  ]);
  const conversations = snapshot.conversations.map((item) => [
    item.id,
    item.type,
    item.title,
    item.memberIds,
    item.updatedAt,
    item.unread,
    item.messages.map((message) => [
      message.id,
      message.senderId,
      message.senderName,
      message.text,
      message.createdAt,
    ]),
  ]);
  const notices = snapshot.notices.map((item) => [
    item.id,
    item.kind,
    item.conversationId,
    item.personId,
    item.personName,
    item.text,
    item.createdAt,
    item.readAt,
  ]);
  const moments = snapshot.moments.map((item) => [
    item.id,
    item.authorName,
    item.text,
    item.imageUrl,
    item.createdAt,
    item.likes,
    item.likedByUser,
    item.raw?.comments,
  ]);
  return JSON.stringify([
    snapshot.connected,
    snapshot.bridgeConnected,
    snapshot.capabilities,
    snapshot.connections,
    snapshot.engineVersion,
    snapshot.bridgeVersion,
    snapshot.schemaVersion,
    snapshot.branchKey,
    snapshot.clock,
    snapshot.worldName,
    snapshot.events,
    snapshot.chatMessages,
    snapshot.user,
    snapshot.people.length,
    people,
    conversations,
    notices,
    moments,
    snapshot.news.map(({ raw, ...item }) => item),
    snapshot.forums.map(({ raw, ...item }) => item),
  ]);
}

export function subscribeWorldBackstage(listener) {
  if (typeof listener !== 'function') return () => {};
  const context = getContext();
  const eventTypes = context?.eventTypes || context?.event_types;
  const stEvents = [
    eventTypes?.CHAT_CHANGED,
    eventTypes?.MESSAGE_RECEIVED,
    eventTypes?.MESSAGE_SENT,
    eventTypes?.MESSAGE_EDITED,
    eventTypes?.MESSAGE_DELETED,
    eventTypes?.SWIPE_CHANGED,
  ].filter(Boolean);
  const cleanups = [];
  let lastSignature = '';
  let lastContext;
  const emit = () => {
    const ctx = getContext();
    const currentContext = ctx?.chatMetadata ?? ctx?.chat_metadata;
    const snapshot = readWorldBackstage();
    const signature = snapshotSignature(snapshot);
    if (signature === lastSignature && currentContext === lastContext) return;
    lastContext = currentContext;
    lastSignature = signature;
    listener(snapshot);
  };

  for (const eventName of stEvents) {
    if (typeof context?.eventSource?.on === 'function') {
      context.eventSource.on(eventName, emit);
      cleanups.push(() => context.eventSource?.off?.(eventName, emit));
    }
  }
  for (const eventName of ['world-backstage:ready', 'world-backstage:phone-bridge-ready', 'world-backstage:phone-update']) {
    globalThis.addEventListener?.(eventName, emit);
    cleanups.push(() => globalThis.removeEventListener?.(eventName, emit));
  }
  const timer = globalThis.setInterval?.(emit, 2500);
  if (timer !== undefined) cleanups.push(() => globalThis.clearInterval?.(timer));
  emit();
  return () => cleanups.forEach((cleanup) => { try { cleanup(); } catch {} });
}

export { WORLD_STATE_KEY, REQUIRED_PHONE_BRIDGE_VERSION };
