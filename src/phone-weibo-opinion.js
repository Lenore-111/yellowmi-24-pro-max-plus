const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const text = (value,max=1000) => String(value ?? '').trim().slice(0,max);
export const weiboAuthorName = (state,post) => state.actors.find(actor=>actor.id===post.actorId)?.name || post.authorName || '街坊';
export const weiboClaimLabel = status => status === 'rumor' ? '传闻' : status === 'mixed' ? '讨论' : '消息';

export function normalizeWeiboAuthor(post, actors) {
  if (actors.some(actor=>actor.id===post.actorId) && post.authorKind !== 'passerby') return {actorId:post.actorId,authorKind:'character',authorName:''};
  if (post.authorKind !== 'passerby' || !text(post.authorName,60)) return null;
  return {actorId:'',authorKind:'passerby',authorName:text(post.authorName,60)};
}
export function normalizeWeiboDiscussion(post) {
  return {
    category:text(post.category,24) || '日常',
    claimStatus:['fact','mixed','rumor'].includes(post.claimStatus) ? post.claimStatus : post.authorKind === 'passerby' ? 'mixed' : 'fact',
    heat:Math.min(5,Math.max(1,Math.floor(Number(post.heat) || 1))),
    replies:(Array.isArray(post.replies) ? post.replies : []).filter(reply=>reply&&text(reply.text))
      .slice(0,4).map(reply=>({author:text(reply.author,60)||'路过的街坊',text:text(reply.text,360)})),
  };
}
export function weiboRepliesMarkup(post) {
  return (post.replies || []).length ? `<section class="echo-weibo-replies"><h3>大家在说</h3>${post.replies.map(reply=>`<article><b>${esc(reply.author)}</b><p>${esc(reply.text)}</p></article>`).join('')}</section>` : '';
}
