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

export function worldWeiboItems(snapshot) {
  if (!snapshot?.connected) return [];
  const news = (snapshot.news || []).map(item=>({id:'news:'+item.id,kind:'news',title:item.headline,text:item.summary,author:item.source || '本地资讯',category:item.category || '新闻',heat:item.heat,claimStatus:'fact',replies:[],worldMinute:item.worldMinute,relatedEventId:item.relatedEventId}));
  const forums = (snapshot.forums || []).map(item=>({id:'forum:'+item.id,kind:'forum',title:item.title,text:item.summary,author:item.board || '街坊闲聊',category:'讨论',heat:item.heat,claimStatus:item.claimStatus,replies:item.replies || [],worldMinute:item.worldMinute,relatedEventId:item.relatedEventId}));
  return [...news,...forums].sort((a,b)=>b.worldMinute-a.worldMinute||b.heat-a.heat);
}

export function renderWorldWeibo(screen, {snapshot,route,goHome,refreshOpinion,current}) {
  let active = true, busy = false, error = '', signature = '';
  function paint(next = snapshot) {
    if (!active || !current()) return;
    snapshot = next;
    const main = screen.querySelector('.echo-world-weibo-feed'),scrollTop=main?.scrollTop || 0;
    let items = worldWeiboItems(snapshot).filter(item=>!route.query||[item.author,item.title,item.text,...item.replies.map(reply=>reply.text)].join(' ').includes(route.query));
    if (route.tab === 'hot') items.sort((a,b)=>b.heat-a.heat||b.worldMinute-a.worldMinute);
    if (route.tab === 'news') items = items.filter(item=>item.kind==='news');
    const selected = worldWeiboItems(snapshot).find(item=>item.id===route.selected);
    if (route.selected && !selected) route.selected = '';
    const card = (item,detail=false) => `<article class="wpg-post echo-post is-weibo" data-world-opinion-id="${esc(item.id)}"><header><span class="wpg-avatar">${esc(item.author.slice(0,1))}</span><div><b>${esc(item.author)}</b><small>${esc(item.category)} · ${item.kind==='news'?'新闻':weiboClaimLabel(item.claimStatus)}</small></div></header><h3>${esc(item.title)}</h3><p>${esc(item.text)}</p>${detail?weiboRepliesMarkup(item):`<button type="button" class="echo-opinion-detail" data-world-weibo-open="${esc(item.id)}">${item.replies.length?'看看大家怎么说':'查看消息'} ›</button>`}</article>`;
    screen.innerHTML = `<section class="wp-view wp-native-app wp-game-app is-game-weibo" data-world-weibo><header class="wp-app-header"><button type="button" data-app-back aria-label="${route.selected?'返回微博':'返回桌面'}">‹</button><b>微博</b><button type="button" data-world-weibo-refresh ${busy||!snapshot.connected?'disabled':''}>${busy?'正在刷新…':'刷新舆情'}</button></header>${route.selected?'':`<div class="echo-wb-tabs">${[['home','推荐'],['hot','热议'],['news','新闻']].map(([tab,label])=>`<button type="button" data-world-weibo-tab="${tab}" class="${route.tab===tab?'is-active':''}" aria-current="${route.tab===tab?'page':'false'}">${label}</button>`).join('')}</div><form class="echo-social-search" data-world-weibo-search><input data-world-weibo-query aria-label="搜索微博" value="${esc(route.query)}" placeholder="搜索话题、消息或讨论"><button type="submit">搜索</button></form>`}${error?`<p class="wpg-error" role="alert">${esc(error)}</p>`:''}<main class="wpg-main echo-world-weibo-feed">${selected?card(selected,true):items.map(item=>card(item)).join('')||`<div class="echo-feed-empty"><b>${snapshot.connected?'还没有相关消息':'未连接世界背面'}</b><p>${snapshot.connected?'公开新闻和街坊讨论会出现在这里。':esc(snapshot.connectionMessage)}</p></div>`}</main></section>`;
    screen.querySelector('[data-app-back]').onclick=()=>{if(!active||!current())return;if(route.selected){route.selected='';paint();}else goHome();};
    screen.querySelectorAll('[data-world-weibo-tab]').forEach(button=>button.onclick=()=>{if(!active||!current())return;route.tab=button.dataset.worldWeiboTab;paint();});
    screen.querySelectorAll('[data-world-weibo-open]').forEach(button=>button.onclick=()=>{if(!active||!current())return;route.selected=button.dataset.worldWeiboOpen;paint();});
    screen.querySelector('[data-world-weibo-query]')?.addEventListener('input',event=>{if(active&&current())route.query=event.target.value;});
    screen.querySelector('[data-world-weibo-search]')?.addEventListener('submit',event=>{event.preventDefault();if(active&&current())paint();});
    screen.querySelector('[data-world-weibo-refresh]').onclick=async()=>{
      if(busy||!active||!current())return;busy=true;error='';paint();
      try{const next=await refreshOpinion();if(active&&current())snapshot=next;}
      catch(e){if(active&&current())error=e.message;}
      finally{busy=false;if(active&&current())paint();}
    };
    const newMain=screen.querySelector('.echo-world-weibo-feed');if(newMain)newMain.scrollTop=scrollTop;
    signature=JSON.stringify([snapshot.connected,snapshot.connectionMessage,snapshot.news,snapshot.forums]);
  }
  paint();
  return {refresh(next){if(JSON.stringify([next.connected,next.connectionMessage,next.news,next.forums])!==signature)paint(next);},dispose(){active=false;}};
}
