export function mountPhoneAcceptanceGuards() {
  const stage = document.querySelector('#world-phone-stage');
  const launcher = document.querySelector('#world-phone-launcher');
  if (!stage || !launcher) return () => {};

  // 浮动控件可能晚于手机挂载，打开手机时保持发送区域可点击。
  const bringStageForward = () => {
    if (stage.parentElement === document.body) document.body.append(stage);
  };
  launcher.addEventListener('click', bringStageForward, true);

  // 模式刷新和弹窗保留由手机渲染器按当前作用域处理。
  return () => launcher.removeEventListener('click', bringStageForward, true);
}
