import { mountSocialTools } from './src/social-tools.js';
import { mountWorldPhone } from './src/world-phone.js?v=0.3.0-alpha.28';
import { mountPhoneInteractions } from './src/phone-interactions.js?v=0.3.0-alpha.28';
import { mountNativeCommunicationApps } from './src/native-communication-apps.js?v=0.3.0-alpha.28';
import { mountWorldPhoneUpdateManager } from './src/update-manager.js';
import { mountAppStoreIntegration } from './src/app-store-integration.js?v=0.3.0-alpha.28';
import { mountLocalWerewolfIntegration } from './src/werewolf-local-integration.js?v=0.3.0-alpha.28';
import { mountSocialRealism } from './src/social-realism.js?v=0.3.0-alpha.28';
import { mountUtilityRealism } from './src/utility-realism.js?v=0.3.0-alpha.28';
import { mountDeviceRealism } from './src/device-realism.js?v=0.3.0-alpha.28';
import { mountSystemRealism } from './src/system-realism.js';
import { mountBatteryRealism } from './src/battery-realism.js';
import { mountAppSwitcherRealism } from './src/app-switcher-realism.js';
import { mountInteractionRealism } from './src/interaction-realism.js?v=0.3.0-alpha.28';
import { mountAppExperienceRealism } from './src/app-experience-realism.js';
import { mountFlightModeRealism } from './src/flight-mode-realism.js';
import { loadCustomThemes } from './src/custom-phone-themes.js';
import { mountShellLayout } from './src/shell-layout.js?v=0.3.0-alpha.28';
import { mountPhoneAcceptanceGuards } from './src/phone-acceptance-guards.js';

let phone = null;
let unmountSocialTools = null;
let unmountInteractions = null;
let unmountCommunicationApps = null;
let unmountUpdateManager = null;
let unmountAppStore = null;
let unmountLocalWerewolf = null;
let unmountSocialRealism = null;
let unmountUtilityRealism = null;
let unmountDeviceRealism = null;
let unmountSystemRealism = null;
let unmountBatteryRealism = null;
let unmountAppSwitcherRealism = null;
let unmountInteractionRealism = null;
let unmountAppExperienceRealism = null;
let unmountFlightModeRealism = null;
let unmountShellLayout = null;
let unmountAcceptanceGuards = null;
let unbindAppReady = null;
let initialized = false;

function ensureExternalStyle(id, path) {
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = new URL(path, import.meta.url).href;
  document.head.append(link);
}

function initWorldPhone() {
  if (initialized || document.getElementById('world-phone-launcher')) return;
  if (!document.body) return;
  initialized = true;
  ensureExternalStyle('world-phone-wechat-style', './wechat.css?build=alpha1');
  ensureExternalStyle('world-phone-live-style', './phone-live.css?build=alpha3');
  ensureExternalStyle('world-phone-communication-style', './communication.css?build=alpha4');
  ensureExternalStyle('world-phone-casino-style', './casino.css?build=casino-v2');
  ensureExternalStyle('world-phone-casino-motion-style', './casino-motion.css?build=casino-motion-v3');
  ensureExternalStyle('world-phone-wallet-style', './wallet.css?build=wallet-v1');
  ensureExternalStyle('world-phone-game-style', './phone-game.css?build=phone-game-v5');
  ensureExternalStyle('world-phone-music-style', './music.css?build=music-v1');
  ensureExternalStyle('world-phone-app-store-style', './app-store.css?build=store-v1');
  ensureExternalStyle('world-phone-app-experience-realism-style', './app-experience-realism.css?build=app-experience-v1');
  ensureExternalStyle('world-phone-app-internal-motion-style', './app-internal-motion.css?build=app-experience-v1');
  ensureExternalStyle('world-phone-update-style', './update.css?build=update-v1');
  ensureExternalStyle('world-phone-werewolf-local-style', './werewolf-local.css?build=werewolf-experience-v8');
  ensureExternalStyle('world-phone-social-realism-style', './social-realism.css?build=social-realism-v1');
  ensureExternalStyle('world-phone-themes-style', './phone-themes.css?build=multi-app-icons-v4');
  ensureExternalStyle('world-phone-utility-realism-style', './utility-realism.css?build=utility-realism-v2');
  ensureExternalStyle('world-phone-device-realism-style', './device-realism.css?build=device-realism-v1');
  ensureExternalStyle('world-phone-system-realism-style', './system-realism.css?build=system-realism-v1');
  ensureExternalStyle('world-phone-flight-mode-realism-style', './flight-mode-realism.css?build=flight-mode-v1');
  ensureExternalStyle('world-phone-battery-realism-style', './battery-realism.css?build=battery-realism-v1');
  ensureExternalStyle('world-phone-app-switcher-realism-style', './app-switcher-realism.css?build=interaction-realism-v1');
  ensureExternalStyle('world-phone-interaction-realism-style', './interaction-realism.css?build=interaction-realism-v2');
  ensureExternalStyle('world-phone-shell-layout-style', './shell-layout.css?build=shell-layout-v2');
  ensureExternalStyle('world-phone-pocket-experience-style', './pocket-experience.css?build=alpha8');
  ensureExternalStyle('world-phone-game-tables-style', './game-tables.css?build=alpha8');
  ensureExternalStyle('world-phone-social-polish-style', './social-polish.css?build=alpha9');
  ensureExternalStyle('world-phone-delivery-style', './delivery.css?build=delivery-v1');
  ensureExternalStyle('world-phone-launcher-polish-style', './launcher-polish.css?build=edge-tuck-v3');
  ensureExternalStyle('world-phone-experience-baseline-style', './experience-baseline.css?build=alpha9');
  ensureExternalStyle('echo-app-ui-restoration-style', './app-ui-restoration.css?build=echo-ui-1');
  phone = mountWorldPhone();
  unmountAcceptanceGuards = mountPhoneAcceptanceGuards({ phone });
  unmountShellLayout = mountShellLayout({ phone });
  unmountAppStore = mountAppStoreIntegration({ phone });
  unmountLocalWerewolf = mountLocalWerewolfIntegration({ phone });
  unmountSocialRealism = mountSocialRealism({ phone });
  unmountUtilityRealism = mountUtilityRealism({ phone });
  unmountDeviceRealism = mountDeviceRealism({ phone });
  unmountSystemRealism = mountSystemRealism({ phone });
  unmountAppSwitcherRealism = mountAppSwitcherRealism({ phone });
  unmountAppExperienceRealism = mountAppExperienceRealism({ phone });
  unmountInteractionRealism = mountInteractionRealism({ phone });
  unmountBatteryRealism = mountBatteryRealism({ phone });
  unmountFlightModeRealism = mountFlightModeRealism({ phone });
  unmountInteractions = mountPhoneInteractions({ phone });
  unmountSocialTools = mountSocialTools({ phone });
  unmountCommunicationApps = mountNativeCommunicationApps({ phone });
  unmountUpdateManager = mountWorldPhoneUpdateManager();
  console.info('[Echo 手机] 0.3.0-alpha.28 active · Phone Bridge v2 · SIM + local apps');
}

function bindAppReadyRefresh() {
  if (unbindAppReady) return;
  const context = globalThis.SillyTavern?.getContext?.();
  const eventTypes = context?.eventTypes || context?.event_types;
  if (!context?.eventSource || !eventTypes?.APP_READY) return;

  const onAppReady = () => {
    initWorldPhone();
    loadCustomThemes().catch(error=>console.warn('[Echo 手机] 皮肤恢复失败：',error));
    phone?.refresh?.();
  };
  context.eventSource.on(eventTypes.APP_READY, onAppReady);
  unbindAppReady = () => {
    context.eventSource?.off?.(eventTypes.APP_READY, onAppReady);
    unbindAppReady = null;
  };
}

function scheduleInit() {
  try {
    if (document.body) {
      initWorldPhone();
    } else {
      document.addEventListener('DOMContentLoaded', initWorldPhone, { once: true });
    }

    bindAppReadyRefresh();
  } catch (error) {
    console.error('[Echo 手机] activation failed:', error);
  }
}

scheduleInit();

export function onActivate() {
  scheduleInit();
}

export function onDeactivate() {
  unbindAppReady?.();
  unbindAppReady = null;
  unmountUpdateManager?.();
  unmountUpdateManager = null;
  unmountCommunicationApps?.();
  unmountCommunicationApps = null;
  unmountSocialTools?.();
  unmountSocialTools = null;
  unmountInteractions?.();
  unmountInteractions = null;
  unmountFlightModeRealism?.();
  unmountFlightModeRealism = null;
  unmountBatteryRealism?.();
  unmountBatteryRealism = null;
  unmountInteractionRealism?.();
  unmountInteractionRealism = null;
  unmountAppExperienceRealism?.();
  unmountAppExperienceRealism = null;
  unmountAppSwitcherRealism?.();
  unmountAppSwitcherRealism = null;
  unmountSystemRealism?.();
  unmountSystemRealism = null;
  unmountDeviceRealism?.();
  unmountDeviceRealism = null;
  unmountUtilityRealism?.();
  unmountUtilityRealism = null;
  unmountSocialRealism?.();
  unmountSocialRealism = null;
  unmountLocalWerewolf?.();
  unmountLocalWerewolf = null;
  unmountAppStore?.();
  unmountAppStore = null;
  unmountShellLayout?.();
  unmountShellLayout = null;
  unmountAcceptanceGuards?.();
  unmountAcceptanceGuards = null;
  phone?.destroy?.();
  phone = null;
  initialized = false;
}
