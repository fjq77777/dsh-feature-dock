/**
 * Feature Dock — the Client half of `dsh-feature-dock`.
 *
 * A macOS-style navigation bar pinned to the bottom of the DSH web GUI:
 *
 *  - it reserves layout space through `shell.bottom` (the full-width bottom row)
 *    and paints itself in `shell.overlay`, so the magnified icons may rise above
 *    the reserved strip without colliding with the composer;
 *  - icon scale follows the pointer with a critically damped spring (no CSS
 *    transition on the transform: the frame loop owns it), and the icons spread
 *    apart by exactly the width they gained, so neighbours never overlap;
 *  - the pill's width is the sum of the icon widths, so the glass background
 *    grows with the magnified icons like the real Dock;
 *  - a text label floats above the hovered icon, and a status dot under each
 *    toggle shows whether the feature is on;
 *  - the settings popover (last icon) tunes icon size, magnification strength
 *    and magnification range; preferences live in localStorage.
 *
 * Feature registry (`FEATURES` + `SETTINGS_ITEM`) is the extension point: a new
 * feature is one object with an icon, a label key, a state reader and an action.
 *
 * The toggles:
 *  - wallpaper: hides the wallpaper-engine layers (`.we-layer`, `.we-scrim`) and
 *    its pull-cord mascot (`.we-rope`) with a scoped stylesheet, so the plugin's
 *    own settings are never mutated and turning it back on is lossless;
 *  - floating orb: talks to the orb host's public routes, `GET
 *    /.dsh-orb/settings` and `POST /.dsh-orb/ball`, and polls for the helper's
 *    state;
 *  - theme: flips the DSH theme preference between light and dark through the
 *    theme service.
 */

window.__ModuleLoader__.load({
  id: 'dsh-feature-dock',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    // ── identity ────────────────────────────────────────────────────────────
    const NS = 'feature-dock';
    const SOURCE = 'dsh-feature-dock';
    const STYLE_ID = SOURCE + '/dock.css';

    /** Reserved bottom strip height (CSS px); the spacer and the overlay agree. */
    const STRIP_HEIGHT = 64;
    /** Pill horizontal padding — mirrored by the width calculation. */
    const PILL_PAD_X = 13;
    /** Pill vertical padding (the height grows upward with the magnified icon). */
    const PILL_PAD_TOP = 8;
    const PILL_PAD_BOTTOM = 6;
    /** Pill bottom margin above the window edge. */
    const PILL_MARGIN_BOTTOM = 6;
    /** The dot area under each tile (dot 4px + margin-top 4px). */
    const DOT_AREA = 8;
    /** Gap between icons. */
    const ITEM_GAP = 8;
    /** Distance between the bottom of a tile and the label above it. */
    const LABEL_GAP = 10;

    const PREFS_KEY = 'dsh-feature-dock:prefs:v1';
    const WALLPAPER_KEY = 'dsh-feature-dock:wallpaper:v1';
    const DEMO_KEY = 'dsh-feature-dock:demo:v1';
    const ORB_POLL_MS = 4000;

    const PREF_SPEC = {
      size: { min: 26, max: 44, step: 1, fallback: 34 },
      zoom: { min: 0.2, max: 1.2, step: 0.05, fallback: 0.8 },
      range: { min: 36, max: 120, step: 1, fallback: 66 },
    };
    const PREF_DEFAULTS = {
      size: PREF_SPEC.size.fallback,
      zoom: PREF_SPEC.zoom.fallback,
      range: PREF_SPEC.range.fallback,
    };

    /** Initial on/off states of the demo items (a few lit looks alive). */
    const DEMO_DEFAULTS = {
      music: true,
      photos: false,
      calendar: true,
      weather: true,
      calculator: false,
      translate: false,
      capture: false,
      notes: true,
      terminal: true,
      download: false,
      mail: false,
      clock: true,
    };

    // ── locale dictionaries (registered through the locale service) ─────────
    const zh = {
      'name.wallpaper': '壁纸',
      'name.orb': '悬浮球',
      'name.theme': '主题',
      'name.settings': '设置',
      'name.music': '音乐',
      'name.photos': '相册',
      'name.calendar': '日历',
      'name.weather': '天气',
      'name.calculator': '计算器',
      'name.translate': '翻译',
      'name.capture': '截图',
      'name.notes': '笔记',
      'name.terminal': '终端',
      'name.download': '下载',
      'name.mail': '邮箱',
      'name.clock': '时钟',
      'hint.demo': '演示图标：点击只切换状态点',
      'hint.wallpaper': '显示 / 隐藏壁纸与拉绳吉祥物；不动壁纸自己的设置',
      'hint.orb': '开启 / 关闭悬浮球（原生小球）',
      'hint.theme': '在深色与浅色主题之间切换',
      'hint.settings': '调整图标大小、放大强度与放大范围',
      'state.on': '开',
      'state.off': '关',
      'state.busy': '处理中',
      'state.na': '未运行',
      'state.light': '浅色',
      'state.dark': '深色',
      'settings.title': '功能坞设置',
      'settings.size': '图标大小',
      'settings.zoom': '放大强度',
      'settings.range': '放大范围',
      'settings.reset': '恢复默认',
      'settings.close': '关闭',
      'settings.note': '悬停放大 · 点击开关',
    };
    const en = {
      'name.wallpaper': 'Wallpaper',
      'name.orb': 'Floating orb',
      'name.theme': 'Theme',
      'name.settings': 'Settings',
      'name.music': 'Music',
      'name.photos': 'Photos',
      'name.calendar': 'Calendar',
      'name.weather': 'Weather',
      'name.calculator': 'Calculator',
      'name.translate': 'Translate',
      'name.capture': 'Capture',
      'name.notes': 'Notes',
      'name.terminal': 'Terminal',
      'name.download': 'Downloads',
      'name.mail': 'Mail',
      'name.clock': 'Clock',
      'hint.demo': 'Demo icon: clicking only toggles the status dot',
      'hint.wallpaper': 'Show or hide the wallpaper and its pull-cord mascot; the wallpaper settings stay untouched',
      'hint.orb': 'Turn the native floating orb on or off',
      'hint.theme': 'Switch between the dark and light theme',
      'hint.settings': 'Tune icon size, magnification strength and range',
      'state.on': 'on',
      'state.off': 'off',
      'state.busy': 'working',
      'state.na': 'not running',
      'state.light': 'light',
      'state.dark': 'dark',
      'settings.title': 'Feature Dock settings',
      'settings.size': 'Icon size',
      'settings.zoom': 'Magnification',
      'settings.range': 'Range',
      'settings.reset': 'Reset',
      'settings.close': 'Close',
      'settings.note': 'Hover to magnify · click to toggle',
    };

    // ── styles ──────────────────────────────────────────────────────────────
    const STYLES = `
/* The dock lives in the frame overlay (fixed to the window bottom); the
   bottom-row spacer reserves exactly this strip. */
div.dfd-root {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  height: ${STRIP_HEIGHT}px;
  z-index: 1;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  pointer-events: none;
  font-family: var(--dsw-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif);
  -webkit-font-smoothing: antialiased;
}

.dfd-spacer {
  position: relative;
  width: 100%;
  pointer-events: none;
}
.dfd-spacer::before {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 1px;
  background: color-mix(in srgb, var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.12)) 55%, transparent);
}

.dfd-pill {
  position: relative;
  box-sizing: border-box;
  /* The track is absolute, so the pill must size itself: icon + dot area +
     vertical padding. The frame loop grows this height with the magnified
     icon; the CSS value is the resting fallback before the first measure. */
  height: calc(var(--dfd-size, 34px) + ${DOT_AREA}px + ${PILL_PAD_TOP + PILL_PAD_BOTTOM}px);
  margin-bottom: ${PILL_MARGIN_BOTTOM}px;
  padding: ${PILL_PAD_TOP}px ${PILL_PAD_X}px ${PILL_PAD_BOTTOM}px;
  border-radius: 18px;
  pointer-events: auto;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.10) 0%, rgba(255, 255, 255, 0.025) 100%),
    color-mix(in srgb, var(--dsw-specific-menu, #161e2f) 72%, transparent);
  -webkit-backdrop-filter: blur(22px) saturate(1.6);
  backdrop-filter: blur(22px) saturate(1.6);
  border: 0.5px solid color-mix(in srgb, var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.20)) 100%, transparent);
  box-shadow:
    0 12px 34px rgba(0, 0, 0, 0.34),
    0 2px 8px rgba(0, 0, 0, 0.22),
    inset 0 1px 0 rgba(255, 255, 255, 0.16);
  will-change: width;
  animation: dfd-enter 0.55s cubic-bezier(0.22, 0.9, 0.24, 1) both;
}
/* Ambient accent glow that follows the pointer, opacity = hover intensity. */
.dfd-pill::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  opacity: var(--dfd-mi, 0);
  background: radial-gradient(
    92px 46px at var(--dfd-mx, 50%) 100%,
    color-mix(in srgb, var(--dsw-alias-brand-primary, #4f8cff) 34%, transparent),
    transparent 72%
  );
  transition: opacity 0.18s linear;
}

.dfd-track {
  position: absolute;
  left: 50%;
  bottom: ${PILL_PAD_BOTTOM}px;
  transform: translateX(-50%);
  display: flex;
  align-items: flex-end;
  gap: ${ITEM_GAP}px;
}

.dfd-item {
  appearance: none;
  -webkit-appearance: none;
  box-sizing: border-box;
  position: relative;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  width: var(--dfd-size, 34px);
  height: calc(var(--dfd-size, 34px) + ${DOT_AREA}px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  cursor: pointer;
  touch-action: manipulation;
  transform: translate3d(0, 0, 0);
  will-change: transform;
}
.dfd-item:focus-visible {
  outline: none;
}
.dfd-item:focus-visible .dfd-tile {
  box-shadow:
    0 0 0 2px var(--dsw-alias-bg-base, #0b1220),
    0 0 0 4px var(--dsw-alias-brand-primary, #4f8cff),
    0 6px 14px rgba(0, 0, 0, 0.32);
}
.dfd-item[data-disabled="true"] {
  cursor: default;
}
.dfd-item[data-disabled="true"] .dfd-tile {
  filter: saturate(0.35) brightness(0.92);
}
/* Separator between the demo set and the gear. */
.dfd-item[data-item="dock-settings"]::before {
  content: "";
  position: absolute;
  left: -5px;
  top: 4px;
  bottom: 8px;
  width: 1px;
  background: color-mix(in srgb, var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.14)) 80%, transparent);
  pointer-events: none;
}

.dfd-tile {
  position: relative;
  display: grid;
  place-items: center;
  width: var(--dfd-size, 34px);
  height: var(--dfd-size, 34px);
  border-radius: calc(var(--dfd-size, 34px) * 0.32);
  overflow: hidden;
  transform-origin: 50% 100%;
  will-change: transform;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.38),
    inset 0 -8px 14px rgba(0, 0, 0, 0.20),
    0 5px 12px rgba(0, 0, 0, 0.30);
}
.dfd-tile[data-tint="wall"] {
  background: linear-gradient(145deg, #8fa8ff 0%, #7081ff 44%, #a06bff 100%);
}
.dfd-tile[data-tint="orb"] {
  background: linear-gradient(145deg, #5ceaff 0%, #31c6f7 44%, #0b8fe6 100%);
}
.dfd-tile[data-tint="theme"] {
  background: linear-gradient(145deg, #ffda7f 0%, #ffb05c 46%, #ff7452 100%);
}
.dfd-tile[data-tint="gear"] {
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.26), rgba(255, 255, 255, 0.07));
}
.dfd-tile::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  background: radial-gradient(120% 90% at 28% 6%, rgba(255, 255, 255, 0.42), rgba(255, 255, 255, 0.10) 38%, transparent 62%);
}
.dfd-icon {
  position: relative;
  display: grid;
  place-items: center;
  width: 68%;
  height: 68%;
  color: #ffffff;
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.22));
}
.dfd-icon svg {
  display: block;
  width: 100%;
  height: 100%;
}
.dfd-icon.is-press {
  animation: dfd-press 0.42s cubic-bezier(0.2, 0.9, 0.3, 1);
}

.dfd-dot {
  width: 4px;
  height: 4px;
  margin-top: 4px;
  border-radius: 50%;
  background: var(--dsw-alias-label-dimmed, rgba(255, 255, 255, 0.30));
  opacity: 0.7;
  transition: background 0.25s ease, box-shadow 0.25s ease, opacity 0.25s ease;
}
.dfd-item[data-dot="on"] .dfd-dot {
  background: var(--dfd-accent, #9db4ff);
  box-shadow: 0 0 7px var(--dfd-accent, #9db4ff);
  opacity: 1;
}
.dfd-item[data-dot="na"] .dfd-dot {
  opacity: 0.25;
}
/* Placeholder dot for items without a status: same box, nothing painted, so
   every tile sits on one baseline. */
.dfd-dot--ghost {
  visibility: hidden;
}

.dfd-label {
  position: fixed;
  z-index: 3;
  left: 50%;
  bottom: 90px;
  padding: 5px 10px;
  border-radius: 9px;
  white-space: nowrap;
  font-size: 12px;
  line-height: 16px;
  letter-spacing: 0.01em;
  color: var(--dsw-alias-label-primary, #eaf0ff);
  background: color-mix(in srgb, var(--dsw-specific-menu, #161e2f) 86%, transparent);
  -webkit-backdrop-filter: blur(14px) saturate(1.4);
  backdrop-filter: blur(14px) saturate(1.4);
  border: 0.5px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.14));
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.32);
  pointer-events: none;
  opacity: 0;
  transform: translate(-50%, 6px);
  transition: opacity 0.16s ease, transform 0.16s cubic-bezier(0.2, 0.8, 0.3, 1);
}
.dfd-label.is-open {
  opacity: 1;
  transform: translate(-50%, 0);
}

.dfd-panel {
  position: fixed;
  z-index: 4;
  left: 50%;
  bottom: 76px;
  width: 320px;
  max-width: calc(100vw - 32px);
  box-sizing: border-box;
  padding: 12px 14px 10px;
  border-radius: 16px;
  transform: translateX(-50%);
  color: var(--dsw-alias-label-primary, #eaf0ff);
  background: color-mix(in srgb, var(--dsw-specific-menu, #161e2f) 90%, transparent);
  -webkit-backdrop-filter: blur(24px) saturate(1.5);
  backdrop-filter: blur(24px) saturate(1.5);
  border: 0.5px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.14));
  box-shadow: 0 20px 54px rgba(0, 0, 0, 0.44), inset 0 1px 0 rgba(255, 255, 255, 0.08);
  pointer-events: auto;
  animation: dfd-panel-in 0.22s cubic-bezier(0.2, 0.8, 0.3, 1) both;
}
.dfd-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}
.dfd-panel-title {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.01em;
}
.dfd-panel-close {
  appearance: none;
  border: 0;
  width: 24px;
  height: 24px;
  border-radius: 7px;
  display: grid;
  place-items: center;
  font-size: 16px;
  line-height: 1;
  color: var(--dsw-alias-label-secondary, #aab6cc);
  background: transparent;
  cursor: pointer;
}
.dfd-panel-close:hover {
  color: var(--dsw-alias-label-primary, #eaf0ff);
  background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.08));
}
.dfd-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 0;
  font-size: 12px;
}
.dfd-row-label {
  flex: none;
  width: 56px;
  color: var(--dsw-alias-label-secondary, #aab6cc);
}
.dfd-row input[type="range"] {
  flex: 1;
  min-width: 0;
  height: 18px;
  accent-color: var(--dsw-alias-brand-primary, #4f8cff);
  cursor: pointer;
}
.dfd-row output {
  flex: none;
  width: 44px;
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-tertiary, #8895aa);
}
.dfd-panel-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 6px;
  padding-top: 8px;
  border-top: 0.5px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.10));
}
.dfd-note {
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary, #8895aa);
}
.dfd-reset {
  appearance: none;
  border: 0.5px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.14));
  border-radius: 8px;
  padding: 4px 9px;
  font-size: 11px;
  color: var(--dsw-alias-label-secondary, #aab6cc);
  background: transparent;
  cursor: pointer;
}
.dfd-reset:hover {
  color: var(--dsw-alias-label-primary, #eaf0ff);
  background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.08));
}

/* Wallpaper display rule: only the wallpaper-engine layers and its mascot are
   faded; the plugin keeps running and its settings are untouched. Visibility
   flips after the fade so the hidden mascot also leaves hit-testing and the
   accessibility tree. */
html[data-dfd-wallpaper] .we-layer,
html[data-dfd-wallpaper] .we-scrim,
html[data-dfd-wallpaper] .we-rope {
  transition: opacity 0.45s cubic-bezier(0.22, 0.61, 0.36, 1), visibility 0s linear 0s;
}
html[data-dfd-wallpaper="off"] .we-layer,
html[data-dfd-wallpaper="off"] .we-scrim,
html[data-dfd-wallpaper="off"] .we-rope {
  opacity: 0 !important;
  visibility: hidden !important;
  transition: opacity 0.45s cubic-bezier(0.22, 0.61, 0.36, 1), visibility 0s linear 0.45s;
}
html[data-dfd-wallpaper="off"] .we-rope {
  pointer-events: none !important;
}

@keyframes dfd-enter {
  from { opacity: 0; transform: translateY(14px) scale(0.94); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes dfd-press {
  0% { transform: scale(1); }
  24% { transform: scale(0.82); }
  58% { transform: scale(1.08); }
  100% { transform: scale(1); }
}
@keyframes dfd-panel-in {
  from { opacity: 0; transform: translate(-50%, 8px) scale(0.985); }
  to { opacity: 1; transform: translate(-50%, 0) scale(1); }
}
@media (prefers-reduced-motion: reduce) {
  .dfd-pill { animation: none; }
  .dfd-panel { animation: none; }
  .dfd-icon.is-press { animation: none; }
  .dfd-label { transition: opacity 0.12s linear; }
}
`;

    // ── storage helpers ─────────────────────────────────────────────────────
    function readStorage(key) {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    }
    function writeStorage(key, value) {
      try {
        localStorage.setItem(key, value);
      } catch {
        /* private mode: the dock still works for this page life */
      }
    }
    function clampPref(field, value) {
      const spec = PREF_SPEC[field];
      if (!spec) return value;
      const n = Number(value);
      if (!Number.isFinite(n)) return spec.fallback;
      return Math.min(spec.max, Math.max(spec.min, n));
    }
    function loadPrefs() {
      let raw = null;
      try {
        raw = JSON.parse(readStorage(PREFS_KEY) || 'null');
      } catch {
        raw = null;
      }
      const source = raw && typeof raw === 'object' ? raw : {};
      return {
        size: Math.round(clampPref('size', source.size)),
        zoom: clampPref('zoom', source.zoom),
        range: Math.round(clampPref('range', source.range)),
      };
    }
    function savePrefs(prefs) {
      writeStorage(PREFS_KEY, JSON.stringify(prefs));
    }
    function loadWallpaperOff() {
      return readStorage(WALLPAPER_KEY) === 'off';
    }
    function saveWallpaperOff(off) {
      writeStorage(WALLPAPER_KEY, off ? 'off' : 'on');
    }
    function loadDemo() {
      let raw = null;
      try {
        raw = JSON.parse(readStorage(DEMO_KEY) || 'null');
      } catch {
        raw = null;
      }
      const source = raw && typeof raw === 'object' ? raw : {};
      const out = {};
      for (const key of Object.keys(DEMO_DEFAULTS)) {
        out[key] = typeof source[key] === 'boolean' ? source[key] : DEMO_DEFAULTS[key];
      }
      return out;
    }
    function reduceMotion() {
      try {
        return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      } catch {
        return false;
      }
    }

    // ── orb host client (same-origin routes) ────────────────────────────────
    async function orbRequest(path, init) {
      const response = await fetch(path, {
        cache: 'no-store',
        ...init,
        headers: {
          accept: 'application/json',
          ...(init && init.headers ? init.headers : {}),
        },
      });
      const text = await response.text();
      let body = null;
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          body = null;
        }
      }
      if (!response.ok) {
        const error = new Error(body && body.error ? body.error : 'HTTP ' + response.status);
        error.status = response.status;
        throw error;
      }
      return body || {};
    }
    function orbStateOf(snapshot) {
      return {
        enabled: !!(snapshot && snapshot.ballEnabled === true),
        supported: !(snapshot && snapshot.supported === false),
        phase: snapshot && typeof snapshot.helperPhase === 'string' ? snapshot.helperPhase : '',
      };
    }

    // ── icons (original artwork; `currentColor` keeps them theme-neutral) ──
    function WallpaperIcon() {
      return h('svg', { viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true' },
        h('rect', {
          x: 3.2, y: 4.4, width: 17.6, height: 15.2, rx: 3.4,
          stroke: 'currentColor', strokeWidth: 1.7,
        }),
        h('circle', { cx: 8.1, cy: 9.3, r: 1.55, fill: 'currentColor' }),
        h('path', {
          d: 'M4.6 17.2l4.9-5 3.1 3.1 2.3-2.3 4.5 4.2',
          stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round',
        }));
    }
    function OrbIcon() {
      return h('svg', { viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true' },
        h('circle', { cx: 12, cy: 12.2, r: 5.1, fill: 'currentColor', opacity: 0.92 }),
        h('circle', { cx: 10.1, cy: 10.2, r: 1.5, fill: '#ffffff', opacity: 0.85 }),
        h('ellipse', {
          cx: 12, cy: 12.1, rx: 9.1, ry: 3.7,
          stroke: 'currentColor', strokeWidth: 1.35, opacity: 0.82,
          transform: 'rotate(-24 12 12.1)',
        }),
        h('circle', { cx: 19.3, cy: 8.5, r: 1.05, fill: 'currentColor', opacity: 0.9 }));
    }
    function ThemeIcon(props) {
      if (props && props.scheme === 'light') {
        return h('svg', { viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true' },
          h('circle', { cx: 12, cy: 12, r: 4.1, stroke: 'currentColor', strokeWidth: 1.7 }),
          h('path', {
            d: 'M12 3.1v2.1M12 18.8v2.1M3.1 12h2.1M18.8 12h2.1M5.7 5.7l1.5 1.5M16.8 16.8l1.5 1.5M18.3 5.7l-1.5 1.5M7.2 16.8l-1.5 1.5',
            stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round',
          }));
      }
      return h('svg', { viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true' },
        h('path', {
          d: 'M20.4 13.4A8.4 8.4 0 0 1 10.6 3.6 8.6 8.6 0 1 0 20.4 13.4Z',
          fill: 'currentColor', opacity: 0.94,
        }),
        h('circle', { cx: 8.4, cy: 8.2, r: 1.1, fill: '#ffffff', opacity: 0.55 }));
    }
    function GearIcon() {
      return h('svg', { viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true' },
        h('circle', { cx: 12, cy: 12, r: 3.1, stroke: 'currentColor', strokeWidth: 1.7 }),
        h('path', {
          d: 'M12 2.9v2.3M12 18.8v2.3M2.9 12h2.3M18.8 12h2.3M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6',
          stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round',
        }),
        h('circle', { cx: 12, cy: 12, r: 8.6, stroke: 'currentColor', strokeWidth: 1.3, opacity: 0.55 }));
    }
    // ── demo icons (fake features for a live demo) ─────────────────────────
    function MusicIcon() {
      return h('svg', { viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true' },
        h('path', {
          d: 'M9.4 18.2V6.1l9-2v9.6',
          stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round',
        }),
        h('circle', { cx: 7.2, cy: 18.2, r: 2.3, fill: 'currentColor' }),
        h('circle', { cx: 16.4, cy: 16.2, r: 2.3, fill: 'currentColor' }));
    }
    function PhotosIcon() {
      return h('svg', { viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true' },
        h('rect', {
          x: 2.9, y: 3.2, width: 14.4, height: 14.4, rx: 3,
          stroke: 'currentColor', strokeWidth: 1.5, opacity: 0.55,
        }),
        h('rect', {
          x: 6.7, y: 6.4, width: 14.4, height: 14.4, rx: 3,
          stroke: 'currentColor', strokeWidth: 1.7,
        }),
        h('circle', { cx: 11.3, cy: 10.8, r: 1.4, fill: 'currentColor' }),
        h('path', {
          d: 'M8.5 17.4l3.7-3.7 2.3 2.3 1.8-1.8 3.1 3.1',
          stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round',
        }));
    }
    function CalendarIcon() {
      return h('svg', { viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true' },
        h('rect', {
          x: 3.4, y: 4.8, width: 17.2, height: 15.6, rx: 3,
          stroke: 'currentColor', strokeWidth: 1.7,
        }),
        h('path', {
          d: 'M3.8 9.2h16.4M8.2 2.9v3.4M15.8 2.9v3.4',
          stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round',
        }),
        h('circle', { cx: 8.2, cy: 13, r: 1, fill: 'currentColor' }),
        h('circle', { cx: 12, cy: 13, r: 1, fill: 'currentColor' }),
        h('circle', { cx: 15.8, cy: 13, r: 1, fill: 'currentColor' }),
        h('circle', { cx: 8.2, cy: 16.6, r: 1, fill: 'currentColor' }),
        h('circle', { cx: 12, cy: 16.6, r: 1, fill: 'currentColor' }));
    }
    function WeatherIcon() {
      return h('svg', { viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true' },
        h('circle', { cx: 9, cy: 8.4, r: 3.4, stroke: 'currentColor', strokeWidth: 1.6 }),
        h('path', {
          d: 'M9 2.2v1.6M2.8 8.4h1.6M4.6 4l1.1 1.1M13.4 4l-1.1 1.1',
          stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round',
        }),
        h('path', {
          d: 'M7.4 18.6h9.2a3.4 3.4 0 0 0 .4-6.8 4.6 4.6 0 0 0-8.8 1 2.9 2.9 0 0 0-.8 5.8Z',
          stroke: 'currentColor', strokeWidth: 1.7, strokeLinejoin: 'round',
        }));
    }
    function CalculatorIcon() {
      return h('svg', { viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true' },
        h('rect', {
          x: 4.6, y: 2.9, width: 14.8, height: 18.2, rx: 3.2,
          stroke: 'currentColor', strokeWidth: 1.7,
        }),
        h('rect', {
          x: 7.4, y: 5.6, width: 9.2, height: 3.5, rx: 1.2,
          stroke: 'currentColor', strokeWidth: 1.4,
        }),
        h('circle', { cx: 8.5, cy: 12.4, r: 1.05, fill: 'currentColor' }),
        h('circle', { cx: 12, cy: 12.4, r: 1.05, fill: 'currentColor' }),
        h('circle', { cx: 15.5, cy: 12.4, r: 1.05, fill: 'currentColor' }),
        h('circle', { cx: 8.5, cy: 15.9, r: 1.05, fill: 'currentColor' }),
        h('circle', { cx: 12, cy: 15.9, r: 1.05, fill: 'currentColor' }),
        h('circle', { cx: 15.5, cy: 15.9, r: 1.05, fill: 'currentColor' }));
    }
    function TranslateIcon() {
      return h('svg', { viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true' },
        h('path', {
          d: 'M3.2 5.6h8.4M7.4 3.4v2.2M9.9 5.6c-.6 3.1-2.6 5.7-5.4 7.4M5.2 8.3c1.3 2 3.1 3.6 5.2 4.6',
          stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round',
        }),
        h('path', {
          d: 'M12.4 20.2l3.6-8.4 3.6 8.4M13.8 17.1h4.4',
          stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round',
        }));
    }
    function CaptureIcon() {
      return h('svg', { viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true' },
        h('path', {
          d: 'M8.4 3.4H5.6A2.2 2.2 0 0 0 3.4 5.6v2.8M15.6 3.4h2.8a2.2 2.2 0 0 1 2.2 2.2v2.8M20.6 15.6v2.8a2.2 2.2 0 0 1-2.2 2.2h-2.8M8.4 20.6H5.6a2.2 2.2 0 0 1-2.2-2.2v-2.8',
          stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round',
        }),
        h('circle', { cx: 12, cy: 12, r: 3.4, stroke: 'currentColor', strokeWidth: 1.7 }),
        h('circle', { cx: 12, cy: 12, r: 1.2, fill: 'currentColor' }));
    }
    function NotesIcon() {
      return h('svg', { viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true' },
        h('path', {
          d: 'M6 3.4h9.6L19 6.8v13.8H6z',
          stroke: 'currentColor', strokeWidth: 1.7, strokeLinejoin: 'round',
        }),
        h('path', {
          d: 'M15.2 3.6v3.6h3.6M9 11h6.4M9 14.2h6.4M9 17.4h4.2',
          stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round',
        }));
    }
    function TerminalIcon() {
      return h('svg', { viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true' },
        h('rect', {
          x: 2.9, y: 4.2, width: 18.2, height: 15.6, rx: 3.2,
          stroke: 'currentColor', strokeWidth: 1.7,
        }),
        h('path', {
          d: 'M6.2 9.4l2.8 2.5-2.8 2.5M11.6 14.6h5.6',
          stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round',
        }));
    }
    function DownloadIcon() {
      return h('svg', { viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true' },
        h('path', {
          d: 'M12 3.6v10.2M8.2 10.2l3.8 3.8 3.8-3.8',
          stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round',
        }),
        h('path', {
          d: 'M4.6 15.4v2.8a2.2 2.2 0 0 0 2.2 2.2h10.4a2.2 2.2 0 0 0 2.2-2.2v-2.8',
          stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round',
        }));
    }
    function MailIcon() {
      return h('svg', { viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true' },
        h('rect', {
          x: 2.9, y: 5.2, width: 18.2, height: 13.6, rx: 2.6,
          stroke: 'currentColor', strokeWidth: 1.7,
        }),
        h('path', {
          d: 'M4.4 7.2 12 12.8l7.6-5.6',
          stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round',
        }));
    }
    function ClockIcon() {
      return h('svg', { viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true' },
        h('circle', { cx: 12, cy: 12, r: 8.6, stroke: 'currentColor', strokeWidth: 1.7 }),
        h('path', {
          d: 'M12 6.8V12l3.6 2.4',
          stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round',
        }));
    }

    // ── feature registry ────────────────────────────────────────────────────
    // Adding a feature: append one object here with an icon, label/hint keys, a
    // `stateOf` reader (for the dot / label suffix) and an `activate` action.
    const REAL_FEATURES = [
      {
        id: 'wallpaper',
        hue: 257,
        tint: 'wall',
        accent: '#9db4ff',
        icon: WallpaperIcon,
        nameKey: 'name.wallpaper',
        hintKey: 'hint.wallpaper',
      },
      {
        id: 'orb',
        hue: 196,
        tint: 'orb',
        accent: '#5ce7ff',
        icon: OrbIcon,
        nameKey: 'name.orb',
        hintKey: 'hint.orb',
      },
      {
        id: 'theme',
        hue: 28,
        tint: 'theme',
        accent: '#ffc46b',
        icon: ThemeIcon,
        nameKey: 'name.theme',
        hintKey: 'hint.theme',
      },
    ];

    /**
     * Twelve demo items for a live demo of the dock. They are ordinary toggle
     * entries: clicking one flips its status dot and label, nothing else. Delete
     * this array (or set FEATURES = REAL_FEATURES) to go back to the real dock.
     */
    const DEMO_FEATURES = [
      {
        id: 'music', demo: true, hue: 338, accent: '#ff9ac0',
        gradient: 'linear-gradient(145deg, #ff9ac0 0%, #ff5f8e 48%, #e73a72 100%)',
        icon: MusicIcon, nameKey: 'name.music', hintKey: 'hint.demo',
      },
      {
        id: 'photos', demo: true, hue: 165, accent: '#5be0c0',
        gradient: 'linear-gradient(145deg, #5be0c0 0%, #2bbf9a 48%, #0e9c86 100%)',
        icon: PhotosIcon, nameKey: 'name.photos', hintKey: 'hint.demo',
      },
      {
        id: 'calendar', demo: true, hue: 5, accent: '#ff9b7a',
        gradient: 'linear-gradient(145deg, #ff9b7a 0%, #ff6b57 48%, #e14b46 100%)',
        icon: CalendarIcon, nameKey: 'name.calendar', hintKey: 'hint.demo',
      },
      {
        id: 'weather', demo: true, hue: 208, accent: '#7fd0ff',
        gradient: 'linear-gradient(145deg, #7fd0ff 0%, #3aa0f2 48%, #1f6fe0 100%)',
        icon: WeatherIcon, nameKey: 'name.weather', hintKey: 'hint.demo',
      },
      {
        id: 'calculator', demo: true, hue: 1000, accent: '#9fb2c8',
        gradient: 'linear-gradient(145deg, #9fb2c8 0%, #74869c 48%, #4e5e73 100%)',
        icon: CalculatorIcon, nameKey: 'name.calculator', hintKey: 'hint.demo',
      },
      {
        id: 'translate', demo: true, hue: 135, accent: '#8be08a',
        gradient: 'linear-gradient(145deg, #8be08a 0%, #3fbf6a 48%, #1d9e57 100%)',
        icon: TranslateIcon, nameKey: 'name.translate', hintKey: 'hint.demo',
      },
      {
        id: 'capture', demo: true, hue: 268, accent: '#c39bff',
        gradient: 'linear-gradient(145deg, #c39bff 0%, #9266f2 48%, #6f4bd8 100%)',
        icon: CaptureIcon, nameKey: 'name.capture', hintKey: 'hint.demo',
      },
      {
        id: 'notes', demo: true, hue: 42, accent: '#ffd47a',
        gradient: 'linear-gradient(145deg, #ffd47a 0%, #ffb03d 48%, #e18a1f 100%)',
        icon: NotesIcon, nameKey: 'name.notes', hintKey: 'hint.demo',
      },
      {
        id: 'terminal', demo: true, hue: 212, accent: '#8fd2ff',
        gradient: 'linear-gradient(145deg, #67d8ff 0%, #2f9bf0 48%, #1f5ecf 100%)',
        icon: TerminalIcon, nameKey: 'name.terminal', hintKey: 'hint.demo',
      },
      {
        id: 'download', demo: true, hue: 218, accent: '#78b8ff',
        gradient: 'linear-gradient(145deg, #78b8ff 0%, #4a8cff 48%, #2b62e0 100%)',
        icon: DownloadIcon, nameKey: 'name.download', hintKey: 'hint.demo',
      },
      {
        id: 'mail', demo: true, hue: 235, accent: '#9aa8ff',
        gradient: 'linear-gradient(145deg, #9aa8ff 0%, #6b79f0 48%, #4a56c9 100%)',
        icon: MailIcon, nameKey: 'name.mail', hintKey: 'hint.demo',
      },
      {
        id: 'clock', demo: true, hue: 20, accent: '#ffb38a',
        gradient: 'linear-gradient(145deg, #ffb38a 0%, #ff8a5c 48%, #e8613c 100%)',
        icon: ClockIcon, nameKey: 'name.clock', hintKey: 'hint.demo',
      },
    ];

    /**
     * The dock's registry: the three real toggles, in their original order.
     * The DEMO_FEATURES block above is kept for future demos; to show it again,
     * use `REAL_FEATURES.concat(DEMO_FEATURES).sort((a, b) => a.hue - b.hue)`.
     */
    const FEATURES = REAL_FEATURES;
    const SETTINGS_ITEM = {
      id: 'dock-settings',
      tint: 'gear',
      accent: '#9aa7bd',
      icon: GearIcon,
      nameKey: 'name.settings',
      hintKey: 'hint.settings',
    };

    function featureStateOf(id, snapshot) {
      if (id === 'wallpaper') return snapshot.wallpaperOff ? 'off' : 'on';
      if (id === 'orb') {
        if (snapshot.orb.phase === 'unavailable') return 'na';
        if (snapshot.orb.phase === 'busy' || snapshot.orb.phase === 'loading') return 'busy';
        return snapshot.orb.enabled ? 'on' : 'off';
      }
      if (id === 'theme') return snapshot.scheme === 'light' ? 'light' : 'dark';
      if (Object.prototype.hasOwnProperty.call(snapshot.demo, id)) return snapshot.demo[id] ? 'on' : 'off';
      return '';
    }

    // ── store ───────────────────────────────────────────────────────────────
    /**
     * One small external store for everything the dock renders: preferences,
     * wallpaper visibility, resolved theme scheme, orb state and the settings
     * popover. Components subscribe with `useSyncExternalStore`; the animation
     * loop reads the same snapshot through a ref.
     */
    function createDockStore(ctx) {
      const state = {
        prefs: loadPrefs(),
        wallpaperOff: loadWallpaperOff(),
        demo: loadDemo(),
        scheme: readScheme(ctx),
        orb: { phase: 'loading', enabled: false, supported: true },
        panelOpen: false,
      };
      let snapshot = build();
      const listeners = new Set();

      function build() {
        return {
          prefs: state.prefs,
          wallpaperOff: state.wallpaperOff,
          demo: state.demo,
          scheme: state.scheme,
          orb: state.orb,
          panelOpen: state.panelOpen,
        };
      }
      function emit() {
        snapshot = build();
        for (const listener of Array.from(listeners)) {
          try {
            listener();
          } catch {
            /* a broken subscriber must not stop the others */
          }
        }
      }
      function subscribe(listener) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      }
      function applyWallpaperAttribute() {
        try {
          document.documentElement.setAttribute('data-dfd-wallpaper', state.wallpaperOff ? 'off' : 'on');
        } catch {
          /* document unavailable: SSR-ish call */
        }
      }
      function readSchemeFromService() {
        try {
          const theme = ctx.get('theme');
          const snap = theme && typeof theme.getTheme === 'function' ? theme.getTheme() : null;
          return snap && snap.active && snap.active.colorScheme === 'light' ? 'light' : 'dark';
        } catch {
          return 'dark';
        }
      }

      function setPref(field, value) {
        if (!PREF_SPEC[field]) return;
        state.prefs = { ...state.prefs, [field]: clampPref(field, value) };
        savePrefs(state.prefs);
        emit();
      }
      function resetPrefs() {
        state.prefs = { ...PREF_DEFAULTS };
        savePrefs(state.prefs);
        emit();
      }
      function toggleWallpaper() {
        state.wallpaperOff = !state.wallpaperOff;
        applyWallpaperAttribute();
        saveWallpaperOff(state.wallpaperOff);
        emit();
      }
      function toggleDemo(id) {
        if (!Object.prototype.hasOwnProperty.call(state.demo, id)) return;
        state.demo = { ...state.demo, [id]: !state.demo[id] };
        writeStorage(DEMO_KEY, JSON.stringify(state.demo));
        emit();
      }
      function setPanelOpen(open) {
        const next = !!open;
        if (next === state.panelOpen) return;
        state.panelOpen = next;
        emit();
      }
      function toggleTheme() {
        let theme = null;
        try {
          theme = ctx.get('theme');
        } catch {
          theme = null;
        }
        if (!theme || typeof theme.setTheme !== 'function') return;
        const next = readSchemeFromService() === 'light' ? 'dark' : 'light';
        try {
          theme.setTheme(next);
        } catch {
          /* the service rejects unknown ids; the built-in pair is always known */
        }
      }
      function syncTheme() {
        const next = readSchemeFromService();
        if (next === state.scheme) return;
        state.scheme = next;
        emit();
      }
      async function syncOrb() {
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
        try {
          const snap = await orbRequest('/.dsh-orb/settings');
          const next = orbStateOf(snap);
          const current = state.orb;
          if (current.phase === 'ready' && current.enabled === next.enabled && current.supported === next.supported) return;
          state.orb = { phase: 'ready', ...next };
          emit();
        } catch {
          if (state.orb.phase !== 'ready') {
            state.orb = { phase: 'unavailable', enabled: false, supported: false };
            emit();
          }
        }
      }
      async function toggleOrb() {
        if (state.orb.phase === 'unavailable' || state.orb.phase === 'busy') return;
        const next = !state.orb.enabled;
        state.orb = { ...state.orb, phase: 'busy', enabled: next };
        emit();
        try {
          const snap = await orbRequest('/.dsh-orb/ball', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ enabled: next }),
          });
          state.orb = { phase: 'ready', ...orbStateOf(snap) };
          emit();
        } catch {
          state.orb = { phase: 'unavailable', enabled: false, supported: false };
          emit();
        }
      }
      function dispose() {
        listeners.clear();
      }

      applyWallpaperAttribute();

      return {
        subscribe,
        getSnapshot: () => snapshot,
        setPref,
        resetPrefs,
        toggleWallpaper,
        toggleDemo,
        setPanelOpen,
        toggleTheme,
        syncTheme,
        syncOrb,
        toggleOrb,
        dispose,
      };
    }

    function readScheme(ctx) {
      try {
        const theme = ctx.get('theme');
        const snap = theme && typeof theme.getTheme === 'function' ? theme.getTheme() : null;
        return snap && snap.active && snap.active.colorScheme === 'light' ? 'light' : 'dark';
      } catch {
        return 'dark';
      }
    }

    // ── components ──────────────────────────────────────────────────────────
    /** Height reservation under all three columns; the dock itself floats. */
    function DockSpacer() {
      return h('div', {
        className: 'dfd-spacer',
        'aria-hidden': 'true',
        style: { height: STRIP_HEIGHT + 'px' },
      });
    }

    /**
     * The visible dock. `store` is closed over by the component factory created
     * in `apply` (no registration `inject` dependency).
     */
    function makeDockOverlay(store) {
      return function DockOverlay(props) {
        const tr = typeof props.t === 'function' ? props.t : (key) => key;
        const snap = React.useSyncExternalStore(store.subscribe, store.getSnapshot);

        const items = FEATURES.concat([SETTINGS_ITEM]);
        const [hovered, setHovered] = React.useState(-1);
        const [labelText, setLabelText] = React.useState('');
        const reducedRef = React.useRef(reduceMotion());

        const rootRef = React.useRef(null);
        const pillRef = React.useRef(null);
        const trackRef = React.useRef(null);
        const labelRef = React.useRef(null);
        const panelRef = React.useRef(null);
        const itemRefs = React.useRef([]);
        const tileRefs = React.useRef([]);

        const prefsRef = React.useRef(snap.prefs);
        prefsRef.current = snap.prefs;
        const hoveredRef = React.useRef(-1);
        hoveredRef.current = hovered;

        /**
         * Frame-loop state. Mutated in place by the animation effect; React
         * never re-renders for a pointer move.
         */
        const animRef = React.useRef({
          raf: 0,
          last: 0,
          x: 0,
          tx: 0,
          vx: 0,
          i: 0,
          ti: 0,
          vi: 0,
          centers: [],
          scales: [],
          dx: [],
          originX: 0,
          restWidth: 0,
          measure: null,
          positionLabel: null,
          kick: null,
        });

        // Effects in this order: size changes remeasure after layout; the
        // animation effect installs the pointer listeners once.
        React.useLayoutEffect(() => {
          const anim = animRef.current;
          if (typeof anim.measure === 'function') anim.measure();
        }, [snap.prefs.size]);

        React.useLayoutEffect(() => {
          const pill = pillRef.current;
          const track = trackRef.current;
          if (!pill || !track) return undefined;
          const a = animRef.current;

          function clearTransforms() {
            for (const el of itemRefs.current) if (el) el.style.transform = '';
            for (const el of tileRefs.current) if (el) el.style.transform = '';
          }

          function positionLabel() {
            const label = labelRef.current;
            const index = hoveredRef.current;
            if (!label || index < 0 || index >= a.centers.length || !Number.isFinite(a.centers[index])) return;
            const scale = a.scales[index] || 1;
            const x = a.originX + a.centers[index] + (a.dx[index] || 0);
            const bottom = PILL_MARGIN_BOTTOM + PILL_PAD_BOTTOM + DOT_AREA + prefsRef.current.size * scale + LABEL_GAP;
            label.style.left = x.toFixed(1) + 'px';
            label.style.bottom = bottom.toFixed(1) + 'px';
          }

          function applyFrame() {
            const prefs = prefsRef.current;
            const n = a.centers.length;
            const size = prefs.size;
            let extra = 0;
            let maxScale = 1;
            for (let index = 0; index < n; index += 1) {
              const distance = Math.abs(a.x - a.centers[index]);
              const falloff = Math.exp(-(distance * distance) / (2 * prefs.range * prefs.range));
              const scale = 1 + prefs.zoom * falloff * a.i;
              a.scales[index] = scale;
              extra += size * (scale - 1);
              if (scale > maxScale) maxScale = scale;
            }
            let cumulative = 0;
            const half = extra / 2;
            let visualLeft = Infinity;
            let visualRight = -Infinity;
            for (let index = 0; index < n; index += 1) {
              const scale = a.scales[index];
              const dx = cumulative - half;
              cumulative += size * (scale - 1);
              a.dx[index] = dx;
              const halfWidth = (size * scale) / 2;
              const left = a.centers[index] + dx - halfWidth;
              const right = a.centers[index] + dx + halfWidth;
              if (left < visualLeft) visualLeft = left;
              if (right > visualRight) visualRight = right;
            }
            // Re-center the *visual* span, not the layout centers: a magnified
            // end icon grows past its slot, and without this the first/last
            // icon would poke through the rounded pill on that side.
            const shift = -((visualLeft + visualRight) / 2);
            const pillWidth = (visualRight - visualLeft) + PILL_PAD_X * 2;
            for (let index = 0; index < n; index += 1) {
              const scale = a.scales[index];
              const dx = a.dx[index] + shift;
              a.dx[index] = dx;
              const item = itemRefs.current[index];
              const tile = tileRefs.current[index];
              if (item) item.style.transform = Math.abs(dx) < 0.01 ? '' : 'translate3d(' + dx.toFixed(2) + 'px,0,0)';
              if (tile) tile.style.transform = Math.abs(scale - 1) < 0.0005 ? '' : 'scale(' + scale.toFixed(4) + ')';
            }
            pill.style.width = pillWidth.toFixed(1) + 'px';
            // Grow the glass upward with the tallest magnified icon, so the
            // background always wraps the icons instead of letting them poke
            // above the rounded top edge.
            const baseHeight = size + DOT_AREA + PILL_PAD_TOP + PILL_PAD_BOTTOM;
            pill.style.height = (baseHeight + size * (maxScale - 1)).toFixed(1) + 'px';
            pill.style.setProperty('--dfd-mi', a.i.toFixed(3));
            pill.style.setProperty('--dfd-mx', (pillWidth / 2 + a.x).toFixed(1) + 'px');
            positionLabel();
          }

          function measure() {
            clearTransforms();
            const trackRect = track.getBoundingClientRect();
            a.originX = trackRect.left + trackRect.width / 2;
            a.centers = itemRefs.current.map((el) => {
              if (!el) return 0;
              const rect = el.getBoundingClientRect();
              return rect.left + rect.width / 2 - a.originX;
            });
            a.restWidth = trackRect.width + PILL_PAD_X * 2;
            a.scales = a.centers.map(() => 1);
            a.dx = a.centers.map(() => 0);
            a.x = 0;
            a.tx = 0;
            a.vx = 0;
            a.i = 0;
            a.ti = 0;
            a.vi = 0;
            pill.style.width = a.restWidth.toFixed(1) + 'px';
            applyFrame();
          }

          function step(now) {
            a.raf = 0;
            const dt = Math.min(0.034, Math.max(0.001, (now - a.last) / 1000));
            a.last = now;
            const stiffnessX = 380;
            const dampingX = 28;
            const stiffnessI = 300;
            const dampingI = 30;
            a.vx += (-stiffnessX * (a.x - a.tx) - dampingX * a.vx) * dt;
            a.x += a.vx * dt;
            a.vi += (-stiffnessI * (a.i - a.ti) - dampingI * a.vi) * dt;
            a.i += a.vi * dt;
            if (a.i < 0) { a.i = 0; a.vi = 0; }
            if (a.i > 1) { a.i = 1; a.vi = 0; }
            const settled = Math.abs(a.x - a.tx) < 0.04
              && Math.abs(a.vx) < 0.06
              && Math.abs(a.i - a.ti) < 0.0015
              && Math.abs(a.vi) < 0.004;
            if (settled) {
              a.x = a.tx;
              a.i = a.ti;
              a.vx = 0;
              a.vi = 0;
            }
            applyFrame();
            if (!settled) a.raf = requestAnimationFrame(step);
          }

          function kick() {
            if (a.raf) return;
            a.last = performance.now();
            a.raf = requestAnimationFrame(step);
          }

          function onPointerEnter(event) {
            if (event.pointerType === 'touch' || reducedRef.current) return;
            a.ti = 1;
            kick();
          }
          function onPointerMove(event) {
            if (event.pointerType === 'touch' || reducedRef.current) return;
            const prefs = prefsRef.current;
            a.tx = event.clientX - a.originX;
            a.ti = 1;
            let best = -1;
            let bestDistance = Infinity;
            for (let index = 0; index < a.centers.length; index += 1) {
              const distance = Math.abs(a.tx - a.centers[index]);
              if (distance < bestDistance) {
                bestDistance = distance;
                best = index;
              }
            }
            const limit = Math.max(prefs.size * 1.6, 40);
            const next = bestDistance <= limit ? best : -1;
            if (next !== hoveredRef.current) setHovered(next);
            kick();
          }
          function onPointerLeave(event) {
            if (event.pointerType === 'touch' || reducedRef.current) return;
            a.ti = 0;
            setHovered(-1);
            kick();
          }
          function onResize() {
            measure();
          }

          a.measure = measure;
          a.positionLabel = positionLabel;
          a.kick = kick;
          measure();

          pill.addEventListener('pointerenter', onPointerEnter);
          pill.addEventListener('pointermove', onPointerMove);
          pill.addEventListener('pointerleave', onPointerLeave);
          window.addEventListener('resize', onResize);

          return () => {
            if (a.raf) cancelAnimationFrame(a.raf);
            a.raf = 0;
            a.measure = null;
            a.positionLabel = null;
            a.kick = null;
            pill.removeEventListener('pointerenter', onPointerEnter);
            pill.removeEventListener('pointermove', onPointerMove);
            pill.removeEventListener('pointerleave', onPointerLeave);
            window.removeEventListener('resize', onResize);
          };
        }, []);

        // Keep the label text fresh when hover changes (and when a polled state
        // changes while the pointer still rests on an item).
        React.useEffect(() => {
          if (hovered < 0) return;
          const item = items[hovered];
          if (!item) return;
          if (item.id === 'dock-settings') {
            setLabelText(tr('name.settings'));
            return;
          }
          setLabelText(tr(item.nameKey) + ' · ' + tr('state.' + featureStateOf(item.id, snap)));
        }, [hovered, snap, tr]);

        // Re-position the label on keyboard focus even when the spring is idle.
        React.useEffect(() => {
          if (hovered < 0) return;
          const anim = animRef.current;
          if (typeof anim.positionLabel === 'function') anim.positionLabel();
        }, [hovered, snap.prefs.size]);

        // Settings popover: click outside / Escape closes it.
        React.useEffect(() => {
          if (!snap.panelOpen) return undefined;
          function onPointerDown(event) {
            const panel = panelRef.current;
            const gear = itemRefs.current[items.length - 1];
            if (panel && panel.contains(event.target)) return;
            if (gear && gear.contains(event.target)) return;
            store.setPanelOpen(false);
          }
          function onKeyDown(event) {
            if (event.key === 'Escape') store.setPanelOpen(false);
          }
          document.addEventListener('pointerdown', onPointerDown, true);
          document.addEventListener('keydown', onKeyDown, true);
          return () => {
            document.removeEventListener('pointerdown', onPointerDown, true);
            document.removeEventListener('keydown', onKeyDown, true);
          };
        }, [snap.panelOpen, items.length]);

        function pressAnimation(button) {
          if (!button) return;
          const icon = button.querySelector('.dfd-icon');
          if (!icon) return;
          icon.classList.remove('is-press');
          void icon.offsetWidth;
          icon.classList.add('is-press');
        }

        function activate(id) {
          if (id === 'wallpaper') store.toggleWallpaper();
          else if (id === 'orb') void store.toggleOrb();
          else if (id === 'theme') store.toggleTheme();
          else if (id === 'dock-settings') store.setPanelOpen(!snap.panelOpen);
          else if (Object.prototype.hasOwnProperty.call(snap.demo, id)) store.toggleDemo(id);
        }

        function itemDisabled(item) {
          return item.id === 'orb' && (snap.orb.phase === 'unavailable' || snap.orb.phase === 'busy');
        }

        function dotState(item) {
          if (item.id === 'wallpaper') return snap.wallpaperOff ? 'off' : 'on';
          if (item.id === 'orb') {
            if (snap.orb.phase === 'unavailable') return 'na';
            return snap.orb.enabled ? 'on' : 'off';
          }
          if (Object.prototype.hasOwnProperty.call(snap.demo, item.id)) {
            return snap.demo[item.id] ? 'on' : 'off';
          }
          return null;
        }

        const renderItem = (item, index) => {
          const state = featureStateOf(item.id, snap);
          const disabled = itemDisabled(item);
          const isSettings = item.id === 'dock-settings';
          const label = isSettings ? tr('name.settings') : tr(item.nameKey) + ' · ' + tr('state.' + state);
          const dot = dotState(item);
          return h('button', {
            key: item.id,
            type: 'button',
            ref: (el) => { itemRefs.current[index] = el; },
            className: 'dfd-item',
            'data-item': item.id,
            'data-tint': item.tint,
            'data-dot': dot || undefined,
            'data-disabled': disabled ? 'true' : undefined,
            'aria-label': label,
            'aria-pressed': isSettings || item.id === 'theme' ? undefined : (state === 'on' ? 'true' : 'false'),
            'aria-expanded': isSettings ? (snap.panelOpen ? 'true' : 'false') : undefined,
            'aria-disabled': disabled ? 'true' : undefined,
            style: { '--dfd-accent': item.accent },
            onMouseDown: (event) => { event.preventDefault(); },
            onClick: (event) => {
              if (disabled) return;
              pressAnimation(event.currentTarget);
              activate(item.id);
            },
            onFocus: () => setHovered(index),
            onBlur: () => setHovered(-1),
          },
            h('span', {
              className: 'dfd-tile',
              'data-tint': item.tint,
              style: item.gradient ? { backgroundImage: item.gradient } : undefined,
              ref: (el) => { tileRefs.current[index] = el; },
            },
              h('span', { className: 'dfd-icon' },
                item.icon(item.id === 'theme' ? { scheme: snap.scheme } : undefined))),
            // Every item keeps the same dot strip, even items without a status:
            // otherwise their tiles would sit one dot lower than the toggles.
            h('span', {
              className: 'dfd-dot' + (dot ? '' : ' dfd-dot--ghost'),
              'aria-hidden': 'true',
            }));
        };

        const renderSlider = (field, label, min, max, step, format) => h('div', { className: 'dfd-row', key: field },
          h('span', { className: 'dfd-row-label', id: 'dfd-label-' + field }, label),
          h('input', {
            type: 'range',
            min: min,
            max: max,
            step: step,
            value: snap.prefs[field],
            'aria-labelledby': 'dfd-label-' + field,
            onChange: (event) => store.setPref(field, Number(event.target.value)),
          }),
          h('output', null, format(snap.prefs[field])));

        const labelClass = 'dfd-label' + (hovered >= 0 ? ' is-open' : '');

        return h('div', {
          ref: rootRef,
          className: 'dfd-root',
          style: { '--dfd-size': snap.prefs.size + 'px' },
        },
          h('div', { ref: pillRef, className: 'dfd-pill' },
            h('div', { ref: trackRef, className: 'dfd-track' },
              items.map((item, index) => renderItem(item, index)))),
          h('div', { ref: labelRef, className: labelClass, 'aria-hidden': 'true' }, labelText),
          snap.panelOpen ? h('div', {
            ref: panelRef,
            className: 'dfd-panel',
            role: 'dialog',
            'aria-label': tr('settings.title'),
          },
            h('div', { className: 'dfd-panel-head' },
              h('span', { className: 'dfd-panel-title' }, tr('settings.title')),
              h('button', {
                type: 'button',
                className: 'dfd-panel-close',
                'aria-label': tr('settings.close'),
                onClick: () => store.setPanelOpen(false),
              }, '×')),
            renderSlider('size', tr('settings.size'), PREF_SPEC.size.min, PREF_SPEC.size.max, PREF_SPEC.size.step, (v) => v + ' px'),
            renderSlider('zoom', tr('settings.zoom'), PREF_SPEC.zoom.min, PREF_SPEC.zoom.max, PREF_SPEC.zoom.step, (v) => Math.round(v * 100) + '%'),
            renderSlider('range', tr('settings.range'), PREF_SPEC.range.min, PREF_SPEC.range.max, PREF_SPEC.range.step, (v) => v + ' px'),
            h('div', { className: 'dfd-panel-foot' },
              h('button', {
                type: 'button',
                className: 'dfd-reset',
                onClick: () => store.resetPrefs(),
              }, tr('settings.reset')),
              h('span', { className: 'dfd-note' }, tr('settings.note'))))
            : null);
      };
    }

    // ── plugin ──────────────────────────────────────────────────────────────
    const inject = ['slots', 'locale', 'theme'];

    function apply(ctx) {
      // Replace a style tag left behind by a hot reload instead of stacking.
      for (const stale of document.querySelectorAll('style[data-plugin-css=' + JSON.stringify(STYLE_ID) + ']')) {
        stale.remove();
      }
      ctx.effect(() => {
        const tag = document.createElement('style');
        tag.dataset.plugin = SOURCE;
        tag.dataset.pluginCss = STYLE_ID;
        tag.id = 'dsh-feature-dock-style';
        tag.textContent = STYLES;
        document.head.appendChild(tag);
        return () => {
          if (tag.parentNode) tag.parentNode.removeChild(tag);
        };
      }, 'feature-dock: styles');

      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'feature-dock: dictionaries');

      const store = createDockStore(ctx);
      ctx.effect(() => () => store.dispose(), 'feature-dock: store');

      // Theme scheme tracks the service; the dock's theme item reflects it.
      ctx.effect(() => {
        const off = ctx.on('theme/change', () => store.syncTheme());
        return () => {
          if (typeof off === 'function') off();
        };
      }, 'feature-dock: theme scheme');

      // Orb state: one immediate read, then a slow poll while the page is up.
      ctx.effect(() => {
        void store.syncOrb();
        const timer = window.setInterval(() => { void store.syncOrb(); }, ORB_POLL_MS);
        return () => window.clearInterval(timer);
      }, 'feature-dock: orb state');

      // The wallpaper rule must be re-applied when the plugin (re)mounts.
      ctx.effect(() => {
        const root = document.documentElement;
        const current = root.getAttribute('data-dfd-wallpaper');
        if (current === null) {
          const snap = store.getSnapshot();
          root.setAttribute('data-dfd-wallpaper', snap.wallpaperOff ? 'off' : 'on');
        }
        return () => {
          root.removeAttribute('data-dfd-wallpaper');
        };
      }, 'feature-dock: wallpaper display rule');

      const DockOverlay = makeDockOverlay(store);

      ctx.slots.inject('shell.bottom', () => ctx.slots.register({
        name: 'shell.bottom',
        locale: NS,
      }, DockSpacer));

      ctx.slots.inject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay',
        id: 'feature-dock',
        order: 0,
        locale: NS,
      }, DockOverlay));
    }

    return { inject, apply };
  },
});
