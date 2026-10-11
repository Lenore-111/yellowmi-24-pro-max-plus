# 生图密钥粘贴按钮验收（2026-10-11）

基于 Yellow Mi `49867bfff067ffc97992b4cc1503a6a6ea5699c2`。密钥输入框旁增加「粘贴密钥」，用户点击后通过浏览器 Clipboard API 读取文字并填入密码框，保存设置后生效。空剪贴板保留原输入；浏览器拒绝读取或不提供该 API 时，聚焦密钥框并提示长按粘贴。不会在打开设置、聚焦输入框时自动读取，不会向页面提示或日志输出密钥。

依据 [Clipboard.readText 文档](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/readText)。权限提示由浏览器控制，网页不能强制打开华为系统剪贴板面板。

## 真实页面操作

将本次模块安装到官方 SillyTavern 1.18.0（`51ad27fb86d39a3daca3adaa970375c9670c12df`）和 1.12.0（`53496d70f1cfca7891d75058e8be39999ea67657`）。Chromium 153 / Playwright 在 390×844、820×1180、1440×1000 三个视口实际打开手机设置并点击按钮；保留浏览器跨域检查，使用测试用字符串，未读取或上传用户真实密钥。自动更新保持关闭。

两套宿主、三个视口各完成以下十项，共 60 项检查通过，页面脚本异常为零：

1. 使用原生 `clipboard.writeText/readText`，真实点击按钮粘贴成功；密码保持遮蔽，状态提示不含密钥，按钮 CSS 最小高度 44px 且未横向溢出。
2. 原生空剪贴板不清空已填密钥。
3. 受控 `NotAllowedError` 拒绝读取时，原输入保留，输入框获得焦点，按钮可重试并提示长按粘贴。
4. 受控缺少 Clipboard API 时，同样安全降级，没有未捕获异常。
5. 受控延迟读取期间手动输入，迟到结果不覆盖新输入。
6. 保存设置使未完成读取失效，迟到结果不重新填入密钥或覆盖保存提示。
7. 清除密钥使未完成读取失效，迟到结果不恢复已清除密钥。
8. 修改接口地址后丢弃原读取结果。
9. 离开再打开设置后，旧读取结果不写入新页面。
10. 原生粘贴后勾选记住密钥，保存并等待宿主 `/api/settings/save` 成功，再刷新：配置和设备密钥恢复，输入栏不渲染密钥正文。

异步竞态与拒绝场景使用浏览器内受控夹具；成功粘贴及空剪贴板使用原生 Clipboard API。检查的是手机、平板和桌面视口，不代表华为真机系统面板已验收。

## 其他检查与证据

- `node --import ./scripts/test-host-register.mjs --test tests/*.test.mjs`：59/59 通过。
- `node --check src/phone-image-view.js` 和 `git diff --check` 通过。
- [SillyTavern 1.18.0 三视口操作记录](image-key-paste-2026-10-11/st-118-report.json)
- [SillyTavern 1.12.0 三视口操作记录](image-key-paste-2026-10-11/st-112-report.json)
- [手机密钥栏截图](image-key-paste-2026-10-11/phone-paste.png)，另已查看平板和桌面截图确认布局。

本次仅修改密钥填写流程及说明，不发布 Release。
