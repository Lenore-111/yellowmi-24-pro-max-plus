import { readSocialBucket } from './social-storage.js';
import { buildWeiboItems, buildRedNoteItems } from './social-realism.js';
import { readWorldBackstage, performWorldBackstageSocialAction } from './world-backstage-bridge.js';
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export function mountSocialTools({ phone } = {}) {
  const stage = document.querySelector('#world-phone-stage');
  if (!stage) return () => {};
  let destroyed = false;
  let queued = false;
  const makeSheet = (title, content) => {
    stage.querySelector('.wp-social-sheet')?.remove();
    const sheet = document.createElement('section'); sheet.className = 'wp-social-sheet';
    sheet.setAttribute('role','dialog'); sheet.setAttribute('aria-label',title);
    sheet.innerHTML = `<header><b>${esc(title)}</b><button type="button" data-social-close aria-label="关闭">×</button></header><div class="wp-social-sheet-body">${content}</div><p role="alert" data-social-error></p>`;
    stage.querySelector('[data-screen]').append(sheet);
    sheet.querySelector('[data-social-close]').onclick = () => sheet.remove();
    sheet.querySelector('input,textarea,button')?.focus();
    return sheet;
  };
  const runAction = async (sheet, action, payload, done) => {
    const error = sheet.querySelector('[data-social-error]');
    try { const result = await performWorldBackstageSocialAction(action, payload); done?.(result); }
    catch (cause) { if (error) error.textContent = cause?.message || '操作失败，请重试'; }
  };
  const collections = () => {
    const snapshot = readWorldBackstage();
    const state = readSocialBucket('world_phone_social_realism_v1') || {};
    const saved = new Map([...buildWeiboItems(snapshot).filter(item => state.weibo?.saved?.[item.id]), ...buildRedNoteItems(snapshot).filter(item => state.rednote?.saved?.[item.id])].map(item => [item.id,item]));
    const sheet = makeSheet('社交收藏', saved.size ? [...saved.values()].map(item => `<article class="wp-friend-request"><b>${esc(item.title || item.author)}</b><p>${esc(item.body)}</p><button type="button" data-share-collection="${esc(item.id)}">分享给朋友</button></article>`).join('') : '<div class="wp-social-sheet-empty">在微博或小红书收藏后，可以在这里找到。</div>');
    sheet.querySelectorAll('[data-share-collection]').forEach(button => button.onclick = () => {
      const item = saved.get(button.dataset.shareCollection); sheet.remove();
      phone.shareContent({headline:item.title, summary:item.body, source:item.author});
    });
  };
  const friends = () => {
    const snapshot = readWorldBackstage();
    const incoming = snapshot.connections.filter(item => item.status === 'incoming');
    const sheet = makeSheet('新的朋友', incoming.length ? incoming.map(item => `<article class="wp-friend-request"><b>${esc(snapshot.people.find(person => person.id === item.personId)?.name || '新朋友')}</b><p>${esc(item.requestMessage || '请求添加你为好友')}</p><div><button type="button" data-accept-friend="${esc(item.personId)}">接受</button><button type="button" data-decline-friend="${esc(item.personId)}">暂不添加</button></div></article>`).join('') : '<div class="wp-social-sheet-empty">暂时没有新的好友申请。</div>');
    sheet.querySelectorAll('[data-accept-friend],[data-decline-friend]').forEach(button => button.onclick = () => runAction(sheet,'social-respond-friend',{personId:button.dataset.acceptFriend || button.dataset.declineFriend,accept:Boolean(button.dataset.acceptFriend)},friends));
  };
  const group = () => {
    const snapshot = readWorldBackstage();
    const accepted = new Set(snapshot.connections.filter(item => item.status === 'accepted').map(item => item.personId));
    const people = snapshot.contacts.filter(person => accepted.has(person.id));
    const sheet = makeSheet('发起群聊', `<form data-social-group-form><label>群聊名称<input name="title" maxlength="120" placeholder="给大家的小群起个名字"></label><p>选择至少两位好友</p><div class="wp-group-people">${people.map(person => `<label><input type="checkbox" name="member" value="${esc(person.id)}"><span>${esc(person.name)}</span></label>`).join('') || '<p>先添加两位通讯好友吧。</p>'}</div><button type="submit" class="wp-social-submit" ${people.length < 2 ? 'disabled' : ''}>创建群聊</button></form>`);
    sheet.querySelector('form').onsubmit = event => {
      event.preventDefault(); const form = event.currentTarget;
      runAction(sheet,'social-create-group',{title:form.elements.title.value,memberIds:[...form.querySelectorAll('[name="member"]:checked')].map(input => input.value)},result => { sheet.remove(); phone.openWechatConversation(result.conversationId); });
    };
  };
  const comment = id => {
    const moment = readWorldBackstage().moments.find(item => item.id === id); if (!moment) return;
    const sheet = makeSheet(`评论 ${moment.authorName} 的动态`, `<blockquote>${esc(moment.text)}</blockquote><form data-moment-comment-form><textarea maxlength="500" rows="4" placeholder="写下你的评论" required></textarea><button type="submit" class="wp-social-submit">发表评论</button></form>`);
    sheet.querySelector('form').onsubmit = event => { event.preventDefault(); runAction(sheet,'social-comment-moment',{momentId:id,text:sheet.querySelector('textarea').value},() => sheet.remove()); };
  };
  const sync = () => {
    if (destroyed) return;
    const snapshot = readWorldBackstage();
    stage.querySelectorAll('[data-moment-id]').forEach(article => {
      if (article.querySelector('[data-social-comment]')) return;
      const moment = snapshot.moments.find(item => item.id === article.dataset.momentId); if (!moment) return;
      const button = document.createElement('button'); button.type = 'button'; button.dataset.socialComment = moment.id;
      button.textContent = '评论'; button.disabled = !snapshot.capabilities.includes('social-comment-moment');
      if (button.disabled) button.title = '请安装支持完整第二版手机桥的世界背面正式版';
      article.querySelector('.wp-wx-moment-meta')?.append(button);
      if (moment.raw?.comments?.length) {
        const list = document.createElement('div');list.className='wp-moment-replies';
        list.innerHTML = moment.raw.comments.slice(-6).map(item=>`<p><b>${esc(item.authorName || '你')}：</b>${esc(item.text)}</p>`).join('');
        article.querySelector('.wp-wx-moment-copy')?.append(list);
      }
    });
    const count=snapshot.connections.filter(item=>item.status==='incoming').length;
    stage.querySelectorAll('[data-social-friends]').forEach(button=>{
      const label=button.querySelector('b');const next=`新的朋友${count ? ` · ${count}` : ''}`;
      if(label&&label.textContent!==next)label.textContent=next;
    });
  };
  const queue = () => { if (queued || destroyed) return;queued=true;requestAnimationFrame(()=>{queued=false;sync();}); };
  const click = event => {
    const target=event.target.closest?.('[data-social-friends],[data-social-group],[data-social-direct],[data-social-comment],[data-social-collections]');if(!target)return;
    event.preventDefault();event.stopPropagation();
    if(target.hasAttribute('data-social-collections'))collections();
    else if(target.hasAttribute('data-social-friends'))friends();
    else if(target.hasAttribute('data-social-group'))group();
    else if(target.dataset.socialComment)comment(target.dataset.socialComment);
    else {
      const sheet=makeSheet('开始聊天','<p>正在打开会话…</p>');
      runAction(sheet,'social-open-direct',{personId:target.dataset.socialDirect},result=>{sheet.remove();phone.openWechatConversation(result.conversationId);});
    }
  };
  const keydown=event=>{if(event.key==='Escape'&&stage.querySelector('.wp-social-sheet')){event.stopImmediatePropagation();stage.querySelector('.wp-social-sheet').remove();}};
  stage.addEventListener('keydown',keydown,true);stage.addEventListener('click',click);
  const observer=new MutationObserver(queue);observer.observe(stage,{childList:true,subtree:true});queue();
  return()=>{destroyed=true;observer.disconnect();stage.removeEventListener('click',click);stage.removeEventListener('keydown',keydown,true);stage.querySelector('.wp-social-sheet')?.remove();};
}
