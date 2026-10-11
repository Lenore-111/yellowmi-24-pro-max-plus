import { readPhoneImageSettings, savePhoneImageSettings, hasPhoneImageKey, forgetPhoneImageKey, listPhoneImageModels } from './phone-image-provider.js';
import { phonePostImagePrompt } from './phone-post-images.js';
import { importLocalImage } from './local-images.js';
import { phoneImagePath } from './phone-image-paths.js';

const NOVEL_MODELS = ['nai-diffusion-4-5-full', 'nai-diffusion-4-5-curated', 'nai-diffusion-4-full', 'nai-diffusion-4-curated-preview', 'nai-diffusion-3', 'nai-diffusion-2', 'nai-diffusion-furry-3'];

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function styles() {
  if (document.getElementById('world-phone-image-style')) return;
  const style = document.createElement('style'); style.id = 'world-phone-image-style';
  style.textContent = `
#world-phone-stage .wp-image-settings{display:flex;flex-direction:column;padding:34px 0 0;box-sizing:border-box;overflow:hidden;min-height:0;background:var(--phone-app-bg,#fafafa);color:var(--phone-text,#222)}
#world-phone-stage .wp-image-settings>header{display:flex;flex-shrink:0;gap:12px;align-items:center;min-height:56px;padding:0 14px;border-bottom:1px solid #ddd}
#world-phone-stage .wp-image-settings-body{min-height:0;overflow:auto;padding:14px}
#world-phone-stage .wp-image-settings form{display:grid;gap:14px}#world-phone-stage .wp-image-settings label{display:grid;gap:6px;font-size:13px}
#world-phone-stage .wp-image-settings input:not([type=checkbox]),#world-phone-stage .wp-image-settings select,#world-phone-stage .wp-image-settings textarea{width:100%;min-height:42px;padding:10px;box-sizing:border-box;border:1px solid #ccc;border-radius:8px;color:#222;background:#fff}
#world-phone-stage .wp-image-settings small{font-size:11px;line-height:1.5;color:#777}#world-phone-stage .wp-image-settings p{font-size:13px;line-height:1.6}
#world-phone-stage .wp-image-key-field{display:grid;gap:6px;font-size:13px}#world-phone-stage .wp-image-key-row{display:flex;gap:8px;align-items:stretch}
#world-phone-stage .wp-image-settings .wp-image-key-row button{flex:1;min-height:44px;touch-action:manipulation}
#world-phone-stage .wp-image-settings [data-image-key-status]{color:#584573;overflow-wrap:anywhere}
#world-phone-stage .wpg-image-status{flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:8px 12px;box-sizing:border-box;background:#f3edf9;color:#584573;font-size:12px;line-height:1.5;border-bottom:1px solid #e4dceb}
#world-phone-stage .wpg-image-status.is-error{background:#fceef3;color:#98465e}#world-phone-stage .wpg-image-status>span{flex:1;min-width:0;overflow-wrap:anywhere}
#world-phone-stage .wpg-image-status button{flex-shrink:0;min-height:44px;padding:8px 10px;border:1px solid #d4cce2;border-radius:8px;background:#fff;color:inherit;touch-action:manipulation}
#world-phone-stage .wp-image-settings .wp-image-remember{display:flex;align-items:center;gap:10px;min-height:44px;cursor:pointer;touch-action:manipulation}
#world-phone-stage .wp-image-settings .wp-image-remember input{appearance:auto!important;-webkit-appearance:auto!important;width:22px!important;height:22px!important;min-height:22px!important;padding:0!important;margin:0!important;flex:0 0 22px!important;box-sizing:border-box!important;border:0!important;box-shadow:none!important;outline:none!important;filter:none!important;transform:none!important;accent-color:#584573!important;color-scheme:light!important;display:inline-block!important}
#world-phone-stage .wp-image-settings .wp-image-remember input::before{content:none!important}
#world-phone-stage .wp-image-settings .wp-image-remember input:focus-visible{outline:2px solid #584573!important;outline-offset:3px}
#world-phone-stage .wp-image-settings button,#world-phone-stage .wpg-image-actions button{min-height:38px;padding:8px 12px;border:1px solid #d4cce2;border-radius:8px;background:#f3edf9;color:#584573}
#world-phone-stage .wpg-post-media{margin:10px 0}#world-phone-stage .wpg-post-media img{display:block;max-width:100%;max-height:360px;border-radius:9px;object-fit:contain}
#world-phone-stage .wpg-image-actions{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0;font-size:12px}
#world-phone-stage .echo-note-cover:has(img){padding:0;position:relative}#world-phone-stage .echo-note-cover img{width:100%;height:100%;object-fit:cover;min-height:160px}
#world-phone-stage .wp-image-sheet{position:absolute;inset:0;z-index:30;display:flex;align-items:center;padding:12px;background:#0008;box-sizing:border-box}
#world-phone-stage .wp-image-sheet>div{padding:16px;width:100%;max-height:90%;overflow:auto;border-radius:14px;background:#fff;color:#222;box-sizing:border-box}
#world-phone-stage .wp-image-sheet header{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
#world-phone-stage .wp-image-sheet textarea{box-sizing:border-box;width:100%;min-height:190px;border:1px solid #ccc;padding:10px;border-radius:9px;color:#222;background:#fff}
#world-phone-stage .wp-image-sheet button{min-height:40px;padding:8px 12px;margin:5px 4px 0 0;border-radius:9px;border:1px solid #ccc;background:#f3edf9;color:#584573}
#world-phone-stage .wp-image-sheet p{font-size:12px;line-height:1.6}#world-phone-stage .wp-image-settings [role=status]{min-height:20px;overflow-wrap:anywhere}
`; document.head.append(style);
}
export function installPhoneImageStyles() { styles(); }
export function renderPhoneImageSettings(screen, back) {
  styles(); const settings = readPhoneImageSettings();
  const marker = Math.random().toString(36).slice(2);
  const controller = new AbortController();
  screen.innerHTML = `<section class="wp-view wp-native-app wp-image-settings" data-image-settings="${marker}"><header><button type="button" data-image-back aria-label="返回设置">‹</button><b>动态配图</b></header>
    <div class="wp-image-settings-body"><p>连接你自己的生图站点。小手机不提供模型、密钥或额度，只在你点击生成时请求一张图片。</p>
    <form data-image-settings-form>
      <label>接口类型<select data-image-provider><option value="openai" ${settings.provider === 'openai' ? 'selected' : ''}>OpenAI 兼容</option><option value="novelai" ${settings.provider === 'novelai' ? 'selected' : ''}>NovelAI 生图</option></select><small>按站点的接入说明选择；两种类型的地址和请求格式不同。</small></label>
      <label>接口地址<input data-image-url type="url" required value="${esc(settings.baseUrl)}"><small data-image-url-help></small></label>
      <div class="wp-image-key-field"><label for="wp-image-key-${marker}">密钥</label><input id="wp-image-key-${marker}" data-image-key type="password" inputmode="text" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="${hasPhoneImageKey() ? '已设置；留空保留，更换站点需重新填写' : '填写站点密钥；无需密钥的本地服务可留空'}"><div class="wp-image-key-row"><button type="button" data-image-paste aria-label="从剪贴板粘贴密钥">粘贴密钥</button><button type="button" data-image-key-visibility aria-pressed="false">显示密钥</button></div><small>可用键盘的剪贴板或长按输入框粘贴；按钮需要浏览器允许读取。填好后记得保存设置。</small><small data-image-key-status role="status" aria-live="polite" hidden></small></div>
      <label class="wp-image-remember"><input type="checkbox" data-image-remember ${settings.rememberKey ? 'checked' : ''}>在此设备记住密钥</label><small>默认只在本次页面会话使用。勾选后保存在此浏览器，其他设备需重新填写。</small>
      <button type="button" data-image-forget>清除已保存密钥</button>
      <label>请求方式<select data-image-transport><option value="direct" ${settings.transport === 'direct' ? 'selected' : ''}>浏览器直连</option><option value="proxy" ${settings.transport === 'proxy' ? 'selected' : ''}>酒馆代理</option></select><small>直连需要站点允许跨域；酒馆代理需要在 config.yaml 开启 enableCorsProxy 后重启酒馆。</small></label>
      <label>模型名称<input data-image-model value="${esc(settings.model)}"><select data-image-model-choice aria-label="从站点模型列表选择" hidden></select><small data-image-model-help></small></label>
      <button type="button" data-image-models>读取站点模型</button><small data-image-model-status role="status" aria-live="polite"></small>
      <label>尺寸（可选）<input data-image-size value="${esc(settings.size)}"><small data-image-size-help></small></label>
      <label>默认画风（可选）<textarea data-image-style maxlength="300" rows="2" placeholder="例如：简洁插画、像素风">${esc(settings.style)}</textarea></label>
      <button type="submit">保存设置</button><p role="status" aria-live="polite"></p>
    </form></div></section>`;
  const current = () => screen.querySelector('[data-image-settings]')?.dataset.imageSettings === marker;
  const status = message => { if (current()) screen.querySelector('[data-image-settings-form] > p[role=status]').textContent = message; };
  const keyInput = screen.querySelector('[data-image-key]');
  const pasteButton = screen.querySelector('[data-image-paste]');
  const visibilityButton = screen.querySelector('[data-image-key-visibility]');
  const keyStatus = message => { if (current()) { const node = screen.querySelector('[data-image-key-status]'); node.textContent = message; node.hidden = !message; } };
  const canMaskText = globalThis.CSS?.supports?.('-webkit-text-security', 'disc');
  let keyVisible = false;
  const updateKeyVisibility = () => {
    keyInput.type = canMaskText || keyVisible ? 'text' : 'password';
    keyInput.style.webkitTextSecurity = canMaskText && !keyVisible ? 'disc' : 'none';
    visibilityButton.textContent = keyVisible ? '隐藏密钥' : '显示密钥';
    visibilityButton.setAttribute('aria-pressed', String(keyVisible));
  };
  visibilityButton.onclick = () => { keyVisible = !keyVisible; updateKeyVisibility(); keyInput.focus({ preventScroll: true }); };
  updateKeyVisibility();
  let pasteVersion = 0;
  const cancelPaste = () => { pasteVersion++; pasteButton.disabled = false; };
  let modelController, modelVersion = 0;
  const cancelModels = () => { modelVersion++; modelController?.abort(); };
  controller.signal.addEventListener('abort', () => { cancelModels(); cancelPaste(); }, { once: true });
  const modelStatus = message => { if (current()) screen.querySelector('[data-image-model-status]').textContent = message; };
  const showModels = (models, source) => {
    const select = screen.querySelector('[data-image-model-choice]');
    select.innerHTML = `<option value="">${source === 'site' ? '站点返回的模型' : '常用模型（未验证本站支持）'}</option>` + models.map(id => `<option value="${esc(id)}">${esc(id)}</option>`).join('');
    select.hidden = !models.length;
    select.dataset.source = source;
    select.setAttribute('aria-label', source === 'site' ? '从站点返回的模型中选择' : '从常用模型中选择（未验证本站支持）');
    const selected = screen.querySelector('[data-image-model]').value;
    select.value = models.includes(selected) ? selected : '';
  };
  const showDefaults = () => showModels(screen.querySelector('[data-image-provider]').value === 'novelai' ? NOVEL_MODELS : [], 'builtin');
  const updateProvider = () => {
    const novel = screen.querySelector('[data-image-provider]').value === 'novelai';
    screen.querySelector('[data-image-url]').placeholder = novel ? 'https://你的站点' : 'https://你的站点/v1';
    screen.querySelector('[data-image-url-help]').textContent = novel ? '填站点提供的 NovelAI 地址或完整 ai/generate-image 地址；不要填登录、注册页面，也不要自行加 /v1。' : '支持 OpenAI 兼容 images/generations 接口，可填 API 基础地址或完整生图地址。';
    screen.querySelector('[data-image-model]').placeholder = novel ? '例如 nai-diffusion-4-5-full，以站点说明为准' : '选择或填写站点的生图模型';
    screen.querySelector('[data-image-model-help]').textContent = novel ? '常用选项未验证本站支持；读取成功后会换成站点返回的列表。每次一张、28 步。' : '读取列表后可选择，也可直接填写。请选站点支持生图的模型。';
    screen.querySelector('[data-image-models]').hidden = false;
    showDefaults();
    screen.querySelector('[data-image-models]').disabled = false;
    screen.querySelector('[data-image-size]').placeholder = novel ? '留空默认 1024x1024；如 768x768' : '留空使用站点默认；如 1024x1024';
    screen.querySelector('[data-image-size-help]').textContent = novel ? '宽高须为 64 的倍数，总像素不超过 1024x1024。' : '';
  };
  const clearModels = () => {
    cancelModels(); cancelPaste(); keyStatus('');
    showDefaults(); modelStatus('');
    screen.querySelector('[data-image-models]').disabled = false; status('');
  };
  screen.querySelector('[data-image-provider]').onchange = () => { clearModels(); updateProvider(); };
  screen.querySelector('[data-image-url]').oninput = clearModels;
  screen.querySelector('[data-image-key]').oninput = clearModels;
  screen.querySelector('[data-image-transport]').onchange = clearModels;
  pasteButton.onclick = async () => {
    cancelPaste();
    const version = pasteVersion, previousValue = keyInput.value;
    const active = () => current() && !controller.signal.aborted && version === pasteVersion && keyInput.value === previousValue;
    pasteButton.disabled = true; keyStatus('正在读取剪贴板…');
    try {
      // Read directly from the user click so the browser can request clipboard permission.
      const text = (await navigator.clipboard.readText()).trim();
      if (!active()) return;
      if (!text) { keyStatus('剪贴板里没有文字，请先复制密钥。'); return; }
      keyInput.value = text; clearModels(); keyInput.focus();
      keyStatus('已粘贴密钥，保存设置后生效。');
    } catch {
      if (!active()) return;
      keyInput.focus();
      keyInput.scrollIntoView({ block: 'center' });
      keyStatus('浏览器未允许读取，请用键盘剪贴板，或长按上方输入框选择“粘贴”。');
    } finally { if (current() && version === pasteVersion) pasteButton.disabled = false; }
  };
  updateProvider();
  const values = () => ({ provider: screen.querySelector('[data-image-provider]').value, baseUrl: screen.querySelector('[data-image-url]').value, apiKey: screen.querySelector('[data-image-key]').value,
    model: screen.querySelector('[data-image-model]').value, size: screen.querySelector('[data-image-size]').value,
    style: screen.querySelector('[data-image-style]').value, rememberKey: screen.querySelector('[data-image-remember]').checked,
    transport: screen.querySelector('[data-image-transport]').value });
  const save = () => { cancelPaste(); savePhoneImageSettings(values()); keyInput.value = ''; keyInput.placeholder = hasPhoneImageKey() ? '已设置；留空保留' : '填写站点密钥'; keyStatus(''); keyVisible = false; updateKeyVisibility(); };
  screen.querySelector('[data-image-back]').onclick = () => { controller.abort(); back(); };
  screen.querySelector('[data-image-settings-form]').onsubmit = event => { event.preventDefault(); try { save(); status('已保存。打开独立模式的动态，点“配图”即可生成。'); } catch (error) { status(error.message); } };
  screen.querySelector('[data-image-forget]').onclick = () => { clearModels(); try { forgetPhoneImageKey(); keyInput.value = ''; keyInput.placeholder = '填写站点密钥'; keyVisible = false; updateKeyVisibility(); status('已清除密钥。'); } catch { status('浏览器未能清除密钥，请检查浏览器存储权限。'); } };
  screen.querySelector('[data-image-models]').onclick = async event => {
    cancelModels(); modelController = new AbortController();
    const version = modelVersion;
    const button = event.currentTarget; button.disabled = true; modelStatus('正在读取站点模型…');
    try {
      save(); const models = await listPhoneImageModels({ signal: modelController.signal });
      if (!current() || version !== modelVersion) return;
      showModels(models, 'site');
      modelStatus(`站点返回了 ${models.length} 个模型，请选择其中支持生图的模型，选好后保存设置。`);
    } catch (error) { if (current() && version === modelVersion) { showDefaults(); modelStatus(error.message); } }
    finally { if (current() && version === modelVersion) button.disabled = false; }
  };
  screen.querySelector('[data-image-model-choice]').onchange = event => { if (event.target.value) screen.querySelector('[data-image-model]').value = event.target.value; };
  return () => controller.abort();
}
export function openPhoneImageSheet(screen, state, post, { generate, settings }) {
  styles(); screen.querySelector('.wp-image-sheet')?.remove();
  const sheet = document.createElement('section'); sheet.className = 'wp-image-sheet'; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-label', '动态配图');
  const config = readPhoneImageSettings();
  sheet.innerHTML = `<div><header><b>${post.imageUrl ? '重新配图' : '给动态配图'}</b><button type="button" data-image-close aria-label="关闭配图">×</button></header><textarea data-image-prompt maxlength="6000" aria-label="生图提示词">${esc(phonePostImagePrompt(state, post))}</textarea><p>${config.model ? `当前模型：${esc(config.model)}。生成一张，费用按你的站点计算。` : '先填写自己的接口、密钥与模型，再回来配图。'}${config.provider === 'novelai' ? '此接口建议使用英文标签提示词，可在上方修改。' : ''}${post.imageUrl ? '生成失败时会保留原图。' : ''}</p><button type="button" data-image-generate ${config.baseUrl && config.model ? '' : 'disabled'}>生成一张</button><button type="button" data-image-config>生图设置</button><p role="status"></p></div>`;
  screen.append(sheet);
  sheet.querySelector('[data-image-close]').onclick = () => sheet.remove();
  sheet.querySelector('[data-image-config]').onclick = () => { sheet.remove(); settings(); };
  sheet.querySelector('[data-image-generate]').onclick = () => {
    const prompt = sheet.querySelector('textarea').value.trim();
    if (!prompt) { sheet.querySelector('[role=status]').textContent = '先写一点你想画的内容。'; return; }
    sheet.remove(); void generate(prompt);
  };
}
export async function savePostImageToAlbum(post) {
  const path = phoneImagePath(post.imageUrl);
  if (!path) throw new Error('这条动态还没有配图。');
  const response = await fetch(path, { credentials: 'same-origin' });
  if (!response.ok) throw new Error('配图暂时无法读取，请检查酒馆连接。');
  const blob = await response.blob();
  return importLocalImage(new File([blob], (post.title || '动态配图').slice(0, 60) + '.' + path.split('.').at(-1), { type: blob.type }));
}
