import { gameIcon } from './phone-game-app-ui.js';
import { phoneGameClock, phoneGameRelationLabel, phoneGameActorPronoun, phoneGameEventDisplayText } from './phone-game.js?v=0.3.0-alpha.28';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const avatar = name => `<span class="wpg-avatar">${esc(String(name || '?').slice(0, 1))}</span>`;

let stylesInstalled = false;
export function installPhoneGameUiClosureStyles() {
  if (stylesInstalled || document.getElementById('echo-phone-ui-closure-style')) return;
  stylesInstalled = true;
  const style = document.createElement('style');
  style.id = 'echo-phone-ui-closure-style';
  style.textContent = `
#world-phone-stage .is-game-rednote:has(.echo-rn-detail) > .wp-app-header{display:none}
#world-phone-stage .echo-rn-detail{min-height:100%;background:#fff;display:flex;flex-direction:column}
#world-phone-stage .echo-rn-detail-top{position:sticky;top:0;z-index:5;display:grid;grid-template-columns:34px 34px minmax(0,1fr) 34px;align-items:center;gap:8px;min-height:54px;padding:7px 10px;background:#fff;border-bottom:1px solid #eee}
#world-phone-stage .echo-rn-detail-top>button{min-height:34px;border:0;background:transparent;font-size:22px}
#world-phone-stage .echo-rn-detail-top .wpg-avatar{width:32px;height:32px;flex-basis:32px;border-radius:50%}
#world-phone-stage .echo-rn-detail-top>div{display:grid;gap:2px;min-width:0}.echo-rn-detail-top b{font-size:13px}.echo-rn-detail-top small{font-size:10px;color:#999}
#world-phone-stage .echo-rn-detail-scroll{display:grid;min-height:0;padding-bottom:72px}
#world-phone-stage .echo-rn-detail-cover{min-height:280px;aspect-ratio:4/5;display:flex;flex-direction:column;justify-content:flex-end;gap:10px;padding:24px;background:linear-gradient(150deg,#f6dfd5,#d9e4dc 55%,#d9deef);color:#624e4b}
#world-phone-stage .echo-rn-detail-cover span{font-size:11px;opacity:.7}.echo-rn-detail-cover b{font-size:25px;line-height:1.45;overflow-wrap:anywhere}.echo-rn-detail-cover small{font-size:11px;opacity:.75}
#world-phone-stage .echo-rn-gallery{overflow-x:auto;display:flex;scroll-snap-type:x mandatory;background:#111}.echo-rn-gallery figure{flex:0 0 100%;margin:0;scroll-snap-align:start}.echo-rn-gallery img{display:block;width:100%;max-height:520px;object-fit:cover}
#world-phone-stage .echo-rn-detail-copy{padding:18px 16px 14px;border-bottom:1px solid #f0f0f0}.echo-rn-detail-copy h2{margin:0 0 10px;font-size:19px;line-height:1.45}.echo-rn-detail-copy p{margin:0;font-size:14px;line-height:1.75;white-space:pre-wrap}.echo-rn-tags{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}.echo-rn-tags span{font-size:12px;color:#45699c}
#world-phone-stage .echo-rn-comments{padding:14px 16px 18px}.echo-rn-comments>header{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}.echo-rn-comments>header b{font-size:14px}.echo-rn-comment{padding:12px 0;border-bottom:1px solid #f3f3f3}.echo-rn-comment>p{font-size:13px;line-height:1.6;margin:5px 0}.echo-rn-comment .wpg-reply{margin-top:6px}
#world-phone-stage .echo-rn-comment-compose{position:relative;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;padding:12px 0 0}.echo-rn-comment-compose textarea{min-height:42px;max-height:100px;resize:vertical;border-radius:18px;padding:10px 12px}.echo-rn-comment-compose button{border-radius:18px!important;background:#ff2442!important;color:white!important;padding:8px 14px!important}
#world-phone-stage .echo-rn-detail-actions{position:sticky;bottom:0;z-index:6;display:grid;grid-template-columns:minmax(0,1fr) 44px 44px;align-items:center;gap:7px;min-height:58px;padding:8px 10px calc(8px + env(safe-area-inset-bottom,0px));background:#fff;border-top:1px solid #eee}.echo-rn-detail-actions button{min-height:40px}.echo-rn-detail-actions .echo-rn-comment-jump{border:1px solid #e6e6e6!important;border-radius:20px!important;text-align:left;padding:0 14px!important;color:#999!important}.echo-rn-detail-actions svg{width:21px;height:21px}.echo-rn-detail-actions button[aria-pressed="true"]{color:#ff2442!important}
#world-phone-stage .echo-wx-contact-list{background:#fff}.echo-wx-contact-row{display:flex!important;width:100%;align-items:center;gap:12px;min-height:66px;padding:10px 15px!important;border-bottom:1px solid #eee!important;text-align:left}.echo-wx-contact-row .wpg-avatar{width:44px;height:44px;flex-basis:44px;border-radius:7px}.echo-wx-contact-row>span:nth-child(2){display:grid;gap:5px;min-width:0;flex:1}.echo-wx-contact-row b{font-size:15px}.echo-wx-contact-row small{font-size:11px;color:#999;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.echo-wx-contact-row i{font-style:normal;color:#aaa}
#world-phone-stage .echo-wx-contact-detail{min-height:100%;background:#f4f4f4}.echo-wx-contact-detail-head{display:flex;align-items:center;gap:12px;padding:12px 15px;background:#fff}.echo-wx-contact-detail-head button{font-size:20px}.echo-wx-contact-detail-head .wpg-avatar{width:58px;height:58px;flex-basis:58px;border-radius:9px}.echo-wx-contact-detail-head>div{display:grid;gap:5px;flex:1}.echo-wx-contact-detail-head small{color:#999;font-size:11px}.echo-wx-contact-detail-card{margin-top:9px;padding:14px 15px;background:#fff}.echo-wx-contact-detail-card progress{width:100%;margin:8px 0}.echo-wx-contact-detail-card p{font-size:13px;line-height:1.7}.echo-wx-contact-detail-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:9px;padding:12px 15px;background:#fff}.echo-wx-contact-detail-actions button{min-height:44px;border-radius:6px!important;background:#fff!important;border:1px solid #e4e4e4!important}.echo-wx-contact-detail-actions button:first-child{background:#07c160!important;color:#fff!important;border-color:#07c160!important}
#world-phone-stage .echo-wx-discovery{padding-top:8px;background:#f4f4f4;min-height:100%}.echo-wx-discovery button{display:flex;width:100%;align-items:center;gap:14px;min-height:58px;padding:11px 16px!important;background:#fff!important;border-bottom:1px solid #eee!important}.echo-wx-discovery button svg{width:23px;height:23px;color:#07b75b}.echo-wx-discovery button span{flex:1;text-align:left;font-size:16px}.echo-wx-discovery button i{font-style:normal;color:#aaa}
#world-phone-stage .echo-moments-page-back{position:sticky;top:0;z-index:4;display:flex;align-items:center;gap:8px;padding:8px 12px;background:#fff;border-bottom:1px solid #eee}.echo-moments-page-back button{font-size:19px}.echo-moments-page-back b{font-size:14px}
#world-phone-stage .echo-delivery-page{min-height:100%;background:#fffaf4;padding:12px 12px 90px}.echo-delivery-page-head{display:flex;align-items:center;gap:8px;margin-bottom:12px}.echo-delivery-page-head button{font-size:20px}.echo-delivery-page-head b{font-size:18px}.echo-delivery-page-head span{margin-left:auto;font-size:11px;color:#999}.echo-delivery-merchants{display:grid;gap:10px}.echo-delivery-merchant-card{display:grid!important;grid-template-columns:54px minmax(0,1fr) auto;align-items:center;gap:10px;width:100%;padding:12px!important;background:#fff!important;border:1px solid #f1e4d8!important;border-radius:15px!important;text-align:left}.echo-delivery-merchant-card>span:first-child{display:grid;place-items:center;width:54px;height:54px;border-radius:13px;background:#fff2e6;font-size:28px}.echo-delivery-merchant-card>div{display:grid;gap:5px}.echo-delivery-merchant-card small{font-size:10px;color:#999}.echo-delivery-merchant-card i{font-style:normal;color:#aaa}
#world-phone-stage .echo-delivery-menu{display:grid;gap:9px}.echo-delivery-menu article{display:grid;grid-template-columns:60px minmax(0,1fr) auto;align-items:center;gap:10px;padding:12px;background:#fff;border:1px solid #f2e5d9;border-radius:14px}.echo-delivery-menu article>span{display:grid;place-items:center;width:60px;height:60px;border-radius:13px;background:#fff3e7;font-size:30px}.echo-delivery-menu article div{display:grid;gap:5px}.echo-delivery-menu article small{font-size:10px;color:#999}.echo-delivery-menu article strong{color:#e85f25}.echo-delivery-menu article button{width:34px;height:34px;border-radius:50%!important;background:#ff6c24!important;color:#fff!important;font-size:20px}
#world-phone-stage .echo-delivery-cart-card,.echo-delivery-checkout-card,.echo-delivery-order-card{padding:15px;background:#fff;border:1px solid #f0e1d5;border-radius:16px}.echo-delivery-cart-line{display:flex;align-items:center;gap:12px}.echo-delivery-cart-line>span{font-size:34px}.echo-delivery-cart-line>div{display:grid;gap:4px;flex:1}.echo-delivery-cart-line strong{color:#e85f25}.echo-delivery-summary{display:grid;gap:8px;margin-top:14px;padding-top:12px;border-top:1px solid #eee}.echo-delivery-summary div{display:flex;justify-content:space-between;font-size:12px}.echo-delivery-primary{width:100%;min-height:46px;margin-top:12px;border-radius:12px!important;background:#ff6c24!important;color:#fff!important}.echo-delivery-secondary{width:100%;min-height:42px;margin-top:8px;border-radius:12px!important;background:#fff!important;border:1px solid #e7d8cb!important}
#world-phone-stage .echo-delivery-checkout-fields{display:grid;gap:12px;margin-top:12px}.echo-delivery-checkout-fields label{display:grid;gap:6px;font-size:12px;color:#777}.echo-delivery-checkout-fields input,.echo-delivery-checkout-fields select{min-height:42px;border-radius:10px;padding:8px 10px;background:#fff}.echo-delivery-order-list{display:grid;gap:9px}.echo-delivery-order-list button{display:flex;width:100%;align-items:center;gap:10px;padding:12px!important;background:#fff!important;border:1px solid #f0e1d5!important;border-radius:13px!important;text-align:left}.echo-delivery-order-list button>span{font-size:28px}.echo-delivery-order-list button>div{display:grid;gap:4px;flex:1}.echo-delivery-order-list small{font-size:10px;color:#999}.echo-delivery-order-status{font-size:11px;color:#e85f25}.echo-delivery-order-reply{margin-top:12px;padding-top:12px;border-top:1px solid #eee}
@container phone-screen (max-width:330px){#world-phone-stage .echo-rn-detail-copy{padding-inline:12px}#world-phone-stage .echo-rn-comments{padding-inline:12px}#world-phone-stage .echo-delivery-page{padding-inline:8px}.echo-delivery-merchant-card{grid-template-columns:46px minmax(0,1fr) auto}.echo-delivery-merchant-card>span:first-child{width:46px;height:46px}.echo-delivery-menu article{grid-template-columns:50px minmax(0,1fr) auto}.echo-delivery-menu article>span{width:50px;height:50px}.echo-wx-contact-detail-actions{grid-template-columns:1fr}}
@container phone-screen (max-height:430px){#world-phone-stage .echo-rn-detail-top{position:relative}.echo-rn-detail-cover{min-height:210px}.echo-rn-detail-actions{position:relative}.echo-delivery-page{padding-bottom:18px}}
`;
  document.head.append(style);
}

function postTags(post) {
  const explicit = Array.isArray(post.tags) ? post.tags.map(item => String(item || '').trim()).filter(Boolean) : [];
  if (explicit.length) return [...new Set(explicit)].slice(0, 6);
  const text = `${post.title || ''} ${post.text || ''}`;
  const found = [...text.matchAll(/#([^#\s，。！？、]{1,24})/gu)].map(match => match[1]);
  if (found.length) return [...new Set(found)].slice(0, 6);
  return post.mood ? [String(post.mood).trim()].filter(Boolean) : [];
}

export function renderRedNoteGameDetail(state, post, { saved = false, busy = false, draft = '', replyMarkup = () => '' } = {}) {
  const actor = state.actors.find(item => item.id === post.actorId);
  const name = actor?.name || '角色';
  const comments = state.events.filter(event => event.postId === post.id);
  const images = Array.isArray(post.imageUrls) ? post.imageUrls.filter(Boolean) : post.imageUrl ? [post.imageUrl] : [];
  const media = images.length
    ? `<div class="echo-rn-gallery" aria-label="笔记媒体，共${images.length}张">${images.map((src, index) => `<figure><img src="${esc(src)}" alt="${esc(post.title || '笔记配图')} ${index + 1}/${images.length}" loading="${index ? 'lazy' : 'eager'}" decoding="async"></figure>`).join('')}</div>`
    : `<div class="echo-rn-detail-cover"><span>生活记录</span><b>${esc(post.title || post.text.slice(0, 64) || '一条生活笔记')}</b><small>${esc(post.mood || '')}</small></div>`;
  const tags = postTags(post);
  return `<section class="echo-rn-detail">
    <header class="echo-rn-detail-top"><button type="button" data-pg-post-back aria-label="返回发现">‹</button>${avatar(name)}<div><b>${esc(name)}</b><small>${esc(phoneGameClock({ tick: post.tick }))}</small></div><button type="button" data-pg-chat="${esc(post.actorId)}" aria-label="私信${esc(name)}">···</button></header>
    <div class="echo-rn-detail-scroll">${media}<article class="echo-rn-detail-copy"><h2>${esc(post.title || '生活记录')}</h2><p>${esc(post.text)}</p>${tags.length ? `<div class="echo-rn-tags">${tags.map(tag => `<span># ${esc(tag)}</span>`).join('')}</div>` : '<div class="echo-rn-tags" aria-label="暂无标签"></div>'}</article>
    <section class="echo-rn-comments" id="echo-rn-comments"><header><b>评论</b><span>${comments.length}</span></header>${comments.length ? comments.map(event => `<article class="echo-rn-comment"><b>${esc(state.user)}</b><p>${esc(event.text)}</p>${replyMarkup(event)}<button type="button" class="wpg-text-button" data-pg-export="${esc(event.id)}">带入正文…</button></article>`).join('') : '<div class="echo-feed-empty"><b>还没有评论</b><p>留一句话，开始这段互动。</p></div>'}<form data-pg-comment class="echo-rn-comment-compose"><textarea rows="1" maxlength="1200" aria-label="评论内容" data-pg-draft ${busy ? 'readonly' : ''} placeholder="给${esc(phoneGameActorPronoun(actor))}留一句话">${esc(draft)}</textarea><button type="submit" ${busy ? 'disabled' : ''}>评论</button></form></section></div>
    <footer class="echo-rn-detail-actions"><button type="button" class="echo-rn-comment-jump" data-pg-comment-focus>写评论…</button><button type="button" data-pg-like="${esc(post.id)}" aria-pressed="${post.liked}" aria-label="${post.liked ? '取消点赞' : '点赞'}">${gameIcon('heart')}</button><button type="button" data-pg-save="${esc(post.id)}" aria-pressed="${saved}" aria-label="${saved ? '取消收藏' : '收藏'}">${gameIcon('save')}</button></footer>
  </section>`;
}

export function renderWechatContacts(state, ui) {
  if (ui.contactId) {
    const actor = state.actors.find(item => item.id === ui.contactId);
    if (!actor) return '<div class="echo-feed-empty"><b>联系人已不存在</b><p>返回通讯录重新选择。</p></div>';
    const rel = state.relations[actor.id];
    return `<section class="echo-wx-contact-detail"><header class="echo-wx-contact-detail-head"><button type="button" data-pg-contact-back aria-label="返回通讯录">‹</button>${avatar(actor.name)}<div><b>${esc(actor.name)}</b><small>${esc(phoneGameRelationLabel(rel.affinity))} · 熟悉度 ${rel.affinity}/100</small></div></header><section class="echo-wx-contact-detail-card"><b>关系</b><progress max="100" value="${rel.affinity}" aria-label="${esc(actor.name)}的熟悉度"></progress><p>${rel.preferences.length ? `偏好：${esc(rel.preferences.join('、'))}` : `还没有发现${esc(phoneGameActorPronoun(actor))}明确的偏好。`}</p>${rel.memory ? `<details><summary>共同经历</summary><p>${esc(rel.memory)}</p></details>` : '<p>还没有共同经历记录。</p>'}</section><div class="echo-wx-contact-detail-actions"><button type="button" data-pg-chat="${esc(actor.id)}">发消息</button><button type="button" data-pg-gift-to="${esc(actor.id)}">送礼</button></div></section>`;
  }
  return `<div class="echo-contact-heading">通讯录</div><div class="echo-wx-contact-list">${state.actors.map(actor => {
    const last = state.events.filter(event => event.actorId === actor.id && !['sms','call'].includes(event.kind)).at(-1);
    return `<button type="button" class="echo-wx-contact-row" data-pg-contact="${esc(actor.id)}">${avatar(actor.name)}<span><b>${esc(actor.name)}</b><small>${esc(last?.reply || last?.text || '联系人')}</small></span><i>›</i></button>`;
  }).join('') || '<div class="echo-feed-empty"><b>还没有联系人</b><p>打开人物聊天后，联系人会出现在这里。</p></div>'}</div>`;
}

export function renderWechatDiscovery() {
  return `<section class="echo-wx-discovery"><button type="button" data-pg-open-moments>${gameIcon('discover')}<span>朋友圈</span><i>›</i></button></section>`;
}

export function wrapWechatMoments(markup) {
  return `<div class="echo-moments-page-back"><button type="button" data-pg-discovery-back aria-label="返回发现">‹</button><b>朋友圈</b></div>${markup}`;
}

const merchantDefs = [
  { id:'drinks', icon:'🥤', name:'Echo 饮品站', subtitle:'饮品 · 咖啡 · 茶', tags:['饮品','咖啡','茶'] },
  { id:'dessert', icon:'🍰', name:'Echo 甜点屋', subtitle:'甜点与小食', tags:['甜点'] },
  { id:'meal', icon:'🍱', name:'Echo 暖食堂', subtitle:'一份认真吃完的饭', tags:['美食'] },
];

function deliveryOrders(state, gifts) {
  const ids = new Set(gifts.map(gift => gift.id));
  return state.events.filter(event => event.kind === 'gift' && ids.has(event.giftId)).slice().reverse();
}

export function renderDeliveryGame(state, ui, gifts, replyMarkup = () => '') {
  const merchants = merchantDefs.map(def => ({ ...def, items:gifts.filter(gift => def.tags.includes(gift.tag)) })).filter(item => item.items.length);
  const orders = deliveryOrders(state, gifts);
  const actor = state.actors.find(item => item.id === ui.actorId) || state.actors[0];
  const selectedGift = gifts.find(item => item.id === ui.deliveryGiftId);
  const selectedMerchant = merchants.find(item => item.id === ui.deliveryMerchantId) || merchants[0];
  const selectedOrder = orders.find(item => item.id === ui.deliveryOrderId);
  const head = (title, back = 'home') => `<div class="echo-delivery-page-head"><button type="button" data-pg-delivery-go="${back}" aria-label="返回">‹</button><b>${esc(title)}</b><span>余额 ¥${state.balance}</span></div>`;
  if (ui.deliveryView === 'merchant') return `<section class="echo-delivery-page">${head(selectedMerchant?.name || '店铺')}<div class="echo-delivery-menu">${selectedMerchant?.items.map(gift => `<article><span>${gift.icon}</span><div><b>${esc(gift.name)}</b><small>${esc(gift.tag)} · Echo 快送</small><strong>¥${gift.price}</strong></div><button type="button" data-pg-delivery-add="${esc(gift.id)}" aria-label="加入购物车">＋</button></article>`).join('') || '<div class="echo-feed-empty"><b>暂无商品</b></div>'}</div></section>`;
  if (ui.deliveryView === 'cart') return `<section class="echo-delivery-page">${head('购物车', ui.deliveryMerchantId ? 'merchant' : 'home')}<div class="echo-delivery-cart-card">${selectedGift ? `<div class="echo-delivery-cart-line"><span>${selectedGift.icon}</span><div><b>${esc(selectedGift.name)}</b><small>${esc(selectedGift.tag)} · 每单一件</small></div><strong>¥${selectedGift.price}</strong></div><div class="echo-delivery-summary"><div><span>商品</span><b>¥${selectedGift.price}</b></div><div><span>余额</span><b>¥${state.balance}</b></div></div><button type="button" class="echo-delivery-primary" data-pg-delivery-go="checkout" ${state.balance < selectedGift.price || !actor ? 'disabled' : ''}>去结算</button><button type="button" class="echo-delivery-secondary" data-pg-delivery-go="merchant">继续逛店铺</button>` : '<div class="echo-feed-empty"><b>购物车还是空的</b><p>先去店铺选一件想送的东西。</p></div>'}</div></section>`;
  if (ui.deliveryView === 'checkout') return `<section class="echo-delivery-page">${head('确认订单','cart')}<div class="echo-delivery-checkout-card">${selectedGift ? `<div class="echo-delivery-cart-line"><span>${selectedGift.icon}</span><div><b>${esc(selectedGift.name)}</b><small>将从游戏钱包扣款</small></div><strong>¥${selectedGift.price}</strong></div><div class="echo-delivery-checkout-fields"><label>送给<select data-pg-recipient aria-label="收礼角色">${state.actors.map(item => `<option value="${esc(item.id)}" ${item.id === actor?.id ? 'selected' : ''}>${esc(item.name)}</option>`).join('') || '<option value="">暂无角色</option>'}</select></label><label>配送地址<input data-pg-delivery-address maxlength="100" value="${esc(ui.deliveryAddress || '')}" placeholder="例如：宿舍门口 / 工作室前台"></label><label>附言<input data-pg-note maxlength="200" value="${esc(ui.note || '')}" placeholder="给对方留句话"></label></div><div class="echo-delivery-summary"><div><span>订单金额</span><b>¥${selectedGift.price}</b></div><div><span>钱包余额</span><b>¥${state.balance}</b></div></div><button type="button" class="echo-delivery-primary" data-pg-delivery-confirm ${ui.busy || !actor || state.balance < selectedGift.price ? 'disabled' : ''}>确认支付并送出</button>` : '<div class="echo-feed-empty"><b>商品已不存在</b><p>返回店铺重新选择。</p></div>'}</div></section>`;
  if (ui.deliveryView === 'order') {
    if (!selectedOrder) return `<section class="echo-delivery-page">${head('订单详情','orders')}<div class="echo-feed-empty"><b>订单已不存在</b><p>返回订单列表查看。</p></div></section>`;
    const gift = gifts.find(item => item.id === selectedOrder.giftId);
    const target = state.actors.find(item => item.id === selectedOrder.actorId);
    return `<section class="echo-delivery-page">${head('订单详情','orders')}<article class="echo-delivery-order-card"><div class="echo-delivery-cart-line"><span>${gift?.icon || '🥡'}</span><div><b>${esc(gift?.name || 'Echo 快送订单')}</b><small>${esc(phoneGameClock({ tick:selectedOrder.tick }))} · 送给 ${esc(target?.name || '角色')}</small></div><strong>¥${gift?.price || 0}</strong></div><div class="echo-delivery-summary"><div><span>订单状态</span><b class="echo-delivery-order-status">${selectedOrder.status === 'replied' ? '已送达 · 已回应' : '已下单 · 等待回应'}</b></div>${selectedOrder.note ? `<div><span>附言 / 地址</span><b>${esc(selectedOrder.note)}</b></div>` : ''}</div><div class="echo-delivery-order-reply">${replyMarkup(selectedOrder)}<button type="button" class="wpg-text-button" data-pg-export="${esc(selectedOrder.id)}">带入正文…</button></div></article></section>`;
  }
  if (ui.tab === 'orders' || ui.deliveryView === 'orders') return `<section class="echo-delivery-page"><div class="echo-delivery-page-head"><b>我的订单</b><span>共 ${orders.length} 单</span></div><div class="echo-delivery-order-list">${orders.map(event => {
    const gift = gifts.find(item => item.id === event.giftId); const target = state.actors.find(item => item.id === event.actorId);
    return `<button type="button" data-pg-delivery-order="${esc(event.id)}"><span>${gift?.icon || '🥡'}</span><div><b>${esc(gift?.name || 'Echo 快送')}</b><small>送给 ${esc(target?.name || '角色')} · ${esc(phoneGameClock({tick:event.tick}))}</small></div><i class="echo-delivery-order-status">${event.status === 'replied' ? '已送达' : '等待回应'}</i></button>`;
  }).join('') || '<div class="echo-feed-empty"><b>还没有订单</b><p>从首页进入店铺，下第一单吧。</p></div>'}</div></section>`;
  return `<section class="echo-delivery-page"><div class="echo-delivery-hero"><small>ECHO DELIVERY</small><h1>好好吃饭，<br>今天也有好味道。</h1><span aria-hidden="true">🥡</span></div><div class="echo-delivery-address">${gameIcon('bag')}<span>${actor ? `送给 ${esc(actor.name)}` : '打开人物聊天后选择收礼人'}</span><b>›</b></div><div class="echo-delivery-categories"><span>🍱<b>美食</b></span><span>☕<b>饮品</b></span><span>🎁<b>心意</b></span><span>🧾<b>订单</b></span></div><div class="echo-delivery-section"><h2>附近好味道</h2><small>余额 ¥${state.balance}</small></div><div class="echo-delivery-merchants">${merchants.map(merchant => `<button type="button" class="echo-delivery-merchant-card" data-pg-delivery-merchant="${merchant.id}"><span>${merchant.icon}</span><div><b>${esc(merchant.name)}</b><small>${esc(merchant.subtitle)} · ${merchant.items.length} 件商品</small></div><i>›</i></button>`).join('')}</div>${selectedGift ? '<button type="button" class="echo-delivery-secondary" data-pg-delivery-go="cart">查看购物车</button>' : ''}</section>`;
}
