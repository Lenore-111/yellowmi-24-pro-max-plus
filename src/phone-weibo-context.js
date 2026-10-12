const text = (value,max) => String(value ?? '').trim().slice(0,max);

// Capture the currently displayed replies, including edits and selected swipes.
// This input is for Weibo only; it does not replace the private phone-life save.
export function readWeiboTavernContext(ctx) {
  const card=ctx?.characters?.[ctx.characterId];
  const profile=card ? ['description','personality','scenario'].map(key=>card[key] || card.data?.[key] || '').filter(Boolean).join('\n') : '';
  const messages=(Array.isArray(ctx?.chat)?ctx.chat:[]).filter(message=>message&&!message.is_system&&!message.extra?.isHidden&&!message.extra?.hidden).slice(-12);
  let remaining=12000;
  const selected=[];
  const power=ctx?.powerUserSettings || {};
  const persona=ctx?.chatMetadata?.persona || Object.keys(power.personas || {}).find(key=>power.personas[key]===ctx?.name1) || power.default_persona;
  for(const message of messages.slice().reverse()){
    const content=text(message.mes,Math.min(2000,remaining));if(!content)continue;
    selected.unshift({speaker:text(message.name || (message.is_user?ctx?.name1:ctx?.name2),80),isUser:Boolean(message.is_user),text:content});remaining-=content.length;if(remaining<=0)break;
  }
  return {user:text(ctx?.name1,80),userProfile:text(power.persona_descriptions?.[persona]?.description || power.persona_description,4000),character:text(ctx?.name2 || card?.name,80),characterProfile:text(profile,6000),recentMessages:selected};
}
export const weiboTavernContextSignature = ctx => JSON.stringify(readWeiboTavernContext(ctx));
