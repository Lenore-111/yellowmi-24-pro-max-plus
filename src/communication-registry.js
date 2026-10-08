import { readWorldBackstage } from './world-backstage-bridge.js';

function text(value) {
  return String(value ?? '').trim();
}

function phoneNumberFromPerson(person) {
  const raw = person?.raw || person || {};
  const candidates = [
    raw.phoneNumber,
    raw.phone_number,
    raw.mobile,
    raw.mobileNumber,
    raw.mobile_number,
    raw.phone,
    raw.contactChannels?.phone,
    raw.contact_channels?.phone,
    raw.communication?.phone,
  ];
  return candidates.map(text).find(Boolean) || '';
}

function wechatIdFromPerson(person) {
  const raw = person?.raw || person || {};
  const candidates = [
    raw.wechatId,
    raw.wechat_id,
    raw.contactChannels?.wechat,
    raw.contact_channels?.wechat,
    raw.communication?.wechat,
  ];
  return candidates.map(text).find(Boolean) || '';
}

export function buildCommunicationRegistry(snapshot = readWorldBackstage()) {
  const acceptedWechat = new Set(
    (snapshot.connections || [])
      .filter((connection) => connection.status === 'accepted')
      .map((connection) => String(connection.personId || '')),
  );

  const conversationWechat = new Set(
    (snapshot.conversations || [])
      .filter((conversation) => conversation.type === 'direct')
      .flatMap((conversation) => conversation.memberIds || [])
      .map(String),
  );

  const people = (snapshot.people || []).map((person) => {
    const phoneNumber = phoneNumberFromPerson(person);
    const wechatId = wechatIdFromPerson(person);
    const hasWechat = acceptedWechat.has(person.id) || conversationWechat.has(person.id) || Boolean(wechatId);
    const hasPhone = Boolean(phoneNumber);

    return {
      personId: person.id,
      name: person.name,
      avatar: person.avatar || '',
      subtitle: person.subtitle || '',
      channels: {
        wechat: {
          available: hasWechat,
          id: wechatId,
          canMessage: hasWechat,
          canCall: hasWechat,
        },
        cellular: {
          available: hasPhone,
          number: phoneNumber,
          canMessage: hasPhone,
          canCall: hasPhone,
        },
      },
      raw: person.raw,
    };
  });

  return {
    connected: Boolean(snapshot.connected),
    people,
    byPersonId: new Map(people.map((person) => [person.personId, person])),
  };
}

export function communicationSummary(person) {
  const wechat = person?.channels?.wechat?.available;
  const phone = person?.channels?.cellular?.available;
  if (wechat && phone) return '微信 · 手机号';
  if (wechat) return '仅微信';
  if (phone) return '仅手机号';
  return '暂无可用联系方式';
}
