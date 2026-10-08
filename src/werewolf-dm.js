import { roleLabel } from './werewolf-local-engine.js';

export const CROW_DM_IMAGE = new URL('../assets/werewolf/crow-dm.png', import.meta.url).href;
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export function crowHostMarkup(view, { dealing = false, revealed = false } = {}) {
  const lines = {
    night_wolves: '天黑，请闭眼。狼人请睁眼，商量今晚的目标。',
    night_seer: '预言家请睁眼。今晚，你想查验谁？',
    night_witch: '女巫请睁眼。救人、用毒，还是留药到下一夜？',
    day_discussion: '天亮了。请依次发言，我只主持，不替任何人站队。',
    day_vote: '讨论结束，请投出你的一票。确认前还可以换人。',
    hunter_shot: '猎人，请决定是否开枪。最后一枪，也可以选择放下。',
    ended: view?.winner === 'wolves' ? '狼人阵营获胜。这一桌的身份，现在可以公开了。' : '好人阵营获胜。这一桌的身份，现在可以公开了。',
  };
  const message = dealing
    ? revealed ? '身份记住了吗？收好牌，我们准备进入第一个夜晚。' : '牌已发到各位面前。只翻开你自己的那张，别偷看邻座。'
    : view ? lines[view.phase] || '这一桌由我主持。收好身份，按阶段行动。' : '我是鸦，今晚由我发牌。入夜，请闭眼。';
  return `<section class="wp-wwl-dm" aria-label="乌鸦主持人"><img src="${esc(CROW_DM_IMAGE)}" alt="拿着身份牌的乌鸦主持人鸦"><div><small>鸦 · 本桌主持</small><p>${esc(message)}</p></div></section>`;
}

export function crowDealMarkup(state) {
  const view = state.view;
  const revealed = state.deal_revealed;
  return `<div class="wp-wwl-deal ${revealed ? 'is-revealed' : 'is-dealing'}">
    ${crowHostMarkup(view, { dealing: true, revealed })}
    <div class="wp-wwl-deal-identity" aria-live="polite">
      ${revealed ? `<div class="wp-wwl-own-card"><small>你的身份</small><b>${esc(roleLabel(view.your_role))}</b><span>其他玩家的身份仍然保密。</span></div><button type="button" class="wp-wwl-primary" data-wwl-deal-confirm>身份记住了，进入夜晚</button>` : '<button type="button" class="wp-wwl-own-card" data-wwl-deal-reveal aria-label="查看我的身份"><span class="wp-wwl-card-back" aria-hidden="true">☾</span><b>你的身份牌</b><span>点击这张牌，查看我的身份。</span></button>'}
    </div>
    ${state.error ? `<p class="wp-wwl-error" role="alert">${esc(state.error)}</p>` : ''}
    <div class="wp-wwl-dealt-seats" aria-label="各座位的背面身份牌">${view.players.map((player, index) => `<div class="wp-wwl-dealt-seat" style="--deal-delay:${index * 70}ms"><span class="wp-wwl-card-back" aria-hidden="true">☾</span><small>${index + 1} 号 · ${esc(player.display_name)}</small></div>`).join('')}</div>
    <button type="button" class="wp-wwl-ghost wp-wwl-abandon" data-wwl-abandon>放弃这局</button>
  </div>`;
}
