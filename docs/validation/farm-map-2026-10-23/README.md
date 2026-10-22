# 农场地图与牧场候选验收

日期：2026-10-23。基于黄米主干 `c0eecbfee454baa18eb1696c89c1870be7e0211b`。

本次候选加入斜视角可拖动地图、16块田地、10种作物及鸡羊牛养殖，并保留原农场存档字段与存储键。地图和动物图形由本地SVG绘制，不需要外部图片服务。

## 结果

- `node --import ./scripts/test-host-register.mjs --test tests/*.test.mjs`：131项通过，0失败。
- Chromium 153.0.8010.0，390×844与320×700手机视口：25项浏览器检查通过，页面脚本异常、丢失资源和API请求均为零。完整结果见 `report.json`。
- 浏览器通过真实鼠标与CDP触屏输入检查地图拖动不误播种；通过页面按钮完成播种、施肥、收获、购买动物与饲料、喂养及分批收取产物。
- 检查缩放保持中心、小屏底栏命中、商店关闭、离开后旧控件失效、离线成熟、模式切换、整页重载和保存失败后重试。成熟等待使用浏览器可控时钟，操作与存储逻辑仍执行真实源码。
- 此次复验修复两处交互问题：底部手机手势区域遮挡商店按钮；商店Esc事件冒泡导致手机同时关闭。对应检查已加入浏览器脚本。

## 范围与待办

本次加载完整黄米扩展入口、实际页面样式和农场代码，酒馆的 `/script.js`、群聊与世界书接口使用隔离测试宿主。没有连接真实SillyTavern服务、线上模型、生产角色或实体安卓设备，不能将这轮结果称为真实酒馆Lab联调通过。

候选仍待CI结果及真实酒馆联调，之后才决定合并；本次不更改发行版本，也不发布Release。截图来自人工测试进度，不含用户聊天或密钥。

## 复跑

安装Playwright并准备兼容的Chromium后，在仓库根目录运行 `node tests/runtime-echo-farm.mjs`。可用环境变量：

- `WP_PLAYWRIGHT_CORE_ENTRY`：Playwright或Playwright Core的可导入入口；默认使用 `playwright`。
- `WP_CHROMIUM_EXECUTABLE`：Chromium可执行文件；默认使用Playwright的浏览器。
- `WP_CHROMIUM_ARGS`：额外启动参数的JSON数组。
- `WP_FONT_DIR`：可选的Noto Sans SC字体目录，需包含 `400.css`；仅改善截图字体。
- `FARM_EVIDENCE_DIR`：报告和截图目录；默认 `farm-evidence`。

本轮浏览器在普通多进程模式启动，参数为 `--no-sandbox --disable-dev-shm-usage --no-zygote`。

## 截图

![390像素农场](390-farm-overview.png)

![390像素牧场](390-pasture.png)

![320像素种植界面](320-growing-map.png)
