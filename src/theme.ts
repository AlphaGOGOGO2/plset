// Color themes re-tint the app's green brand palette at runtime.
// Every stylesheet is scanned once per theme change; colors whose hue falls in the
// green/mint band are rotated toward the theme hue, while gold (leader), red (danger),
// blue (team B) and photos stay untouched. The choice is a local preference, not session data.
export interface Theme { id: string; name: string; description: string; hue: number | null; saturation: number; lightness: number }
export const BRAND_HUE = 135;
const BAND: [number, number] = [80, 180];
export const THEMES: Theme[] = [
  { id: 'forest', name: '포레스트', description: '기본 · 딥 그린', hue: null, saturation: 1, lightness: 0 },
  { id: 'midnight', name: '미드나이트', description: '깊은 네이비 블루', hue: 218, saturation: 1.05, lightness: 0 },
  { id: 'violet', name: '바이올렛', description: '차분한 보라', hue: 268, saturation: 0.95, lightness: 0 },
  { id: 'burgundy', name: '버건디', description: '와인 · 로즈', hue: 348, saturation: 0.9, lightness: 0 },
  { id: 'gold', name: '골드', description: '샴페인 골드', hue: 44, saturation: 1.1, lightness: 0 },
  { id: 'amber', name: '앰버', description: '따뜻한 브론즈', hue: 26, saturation: 1, lightness: 0 },
  { id: 'teal', name: '틸', description: '맑은 청록', hue: 182, saturation: 1.05, lightness: 0 },
  { id: 'mono', name: '블랙 & 화이트', description: '완전한 무채색', hue: null, saturation: 0, lightness: 0 },
];
export const DEFAULT_THEME = THEMES[0];
const KEY = 'plset.theme';
export const themeById = (id: string | null | undefined) => THEMES.find(t => t.id === id) ?? DEFAULT_THEME;

export interface Rgba { r: number; g: number; b: number; a: number }
export function parseHex(hex: string): Rgba | null {
  const h = hex.replace('#', '');
  if (![3, 4, 6, 8].includes(h.length) || /[^0-9a-f]/i.test(h)) return null;
  const full = h.length <= 4 ? h.split('').map(c => c + c).join('') : h;
  const n = parseInt(full.slice(0, 6), 16);
  return { r: n >> 16 & 255, g: n >> 8 & 255, b: n & 255, a: full.length === 8 ? parseInt(full.slice(6), 16) / 255 : 1 };
}
export function toHex({ r, g, b, a }: Rgba) {
  const c = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}${a < 1 ? c(a * 255) : ''}`;
}
export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}
export function remapRgba(color: Rgba, theme: Theme): Rgba {
  const [h, s, l] = rgbToHsl(color.r, color.g, color.b);
  if (s === 0 || h < BAND[0] || h > BAND[1]) return color;
  const hue = theme.hue === null ? h : (((theme.hue + (h - BRAND_HUE)) % 360) + 360) % 360;
  const [r, g, b] = hslToRgb(hue, Math.min(1, s * theme.saturation), Math.max(0, Math.min(1, l + theme.lightness)));
  return { r, g, b, a: color.a };
}
export function remapHex(hex: string, theme: Theme) { const c = parseHex(hex); return c ? toHex(remapRgba(c, theme)) : hex; }
// Serialized CSSOM text uses rgb()/rgba(); custom properties keep their raw hex values.
const RGB = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/g, HEX = /#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b/gi;
export function remapText(text: string, theme: Theme) {
  return text
    .replace(RGB, (m, r, g, b, a) => { const next = remapRgba({ r: +r, g: +g, b: +b, a: a === undefined ? 1 : +a }, theme); return next === null ? m : `rgb${next.a < 1 ? 'a' : ''}(${Math.round(next.r)}, ${Math.round(next.g)}, ${Math.round(next.b)}${next.a < 1 ? `, ${next.a}` : ''})`; })
    .replace(HEX, m => remapHex(m, theme));
}
const HAS_COLOR = /rgba?\(|#[0-9a-f]{3,8}/i;
// Only color-bearing declarations are cloned, in source order, so layout properties and the
// original cascade between same-specificity rules are left exactly as the stylesheets define them.
function colorDeclarations(style: CSSStyleDeclaration, theme: Theme) {
  const decls: string[] = [];
  for (let i = 0; i < style.length; i++) {
    const name = style[i], value = style.getPropertyValue(name);
    if (!HAS_COLOR.test(value)) continue;
    decls.push(`${name}:${remapText(value, theme)}${style.getPropertyPriority(name) ? ' !important' : ''}`);
  }
  return decls;
}
function collect(rules: CSSRuleList, theme: Theme, out: string[]) {
  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSStyleRule) { const decls = colorDeclarations(rule.style, theme); if (decls.length) out.push(`${rule.selectorText}{${decls.join(';')}}`); }
    else if (rule instanceof CSSMediaRule) { const inner: string[] = []; collect(rule.cssRules, theme, inner); if (inner.length) out.push(`@media ${rule.conditionText}{${inner.join('')}}`); }
    else if (rule instanceof CSSSupportsRule) { const inner: string[] = []; collect(rule.cssRules, theme, inner); if (inner.length) out.push(`@supports ${rule.conditionText}{${inner.join('')}}`); }
  }
}
const STYLE_ID = 'plset-theme';
export function buildThemeCss(theme: Theme, sheets: Iterable<CSSStyleSheet> = document.styleSheets) {
  if (theme.id === DEFAULT_THEME.id) return '';
  const out: string[] = [];
  for (const sheet of Array.from(sheets)) {
    if ((sheet.ownerNode as Element | null)?.id === STYLE_ID) continue;
    try { collect(sheet.cssRules, theme, out); } catch { /* cross-origin sheet */ }
  }
  return out.join('\n');
}
export function applyTheme(theme: Theme) {
  document.getElementById(STYLE_ID)?.remove();
  const css = buildThemeCss(theme);
  document.documentElement.dataset.theme = theme.id;
  if (!css) return;
  const style = document.createElement('style'); style.id = STYLE_ID; style.textContent = css; document.head.append(style);
}
export function loadTheme(): Theme { try { return themeById(localStorage.getItem(KEY)); } catch { return DEFAULT_THEME; } }
export function saveTheme(theme: Theme) { try { localStorage.setItem(KEY, theme.id); } catch { /* private mode */ } }
// Re-applies the stored theme when stylesheets are added later (dev HMR, lazy chunks).
export function initTheme() {
  applyTheme(loadTheme());
  let pending = 0;
  new MutationObserver(records => {
    if (!records.some(r => Array.from(r.addedNodes).some(n => (n instanceof HTMLStyleElement && n.id !== STYLE_ID) || n instanceof HTMLLinkElement))) return;
    cancelAnimationFrame(pending); pending = requestAnimationFrame(() => applyTheme(loadTheme()));
  }).observe(document.head, { childList: true });
}
// Swatches for the settings page preview.
export const PREVIEW_BASE = { bg: '#101514', panel: '#171d1a', line: '#2a322c', deep: '#294331', accent: '#a4e5bc', text: '#e5e9e1', muted: '#839086' } as const;
export function previewPalette(theme: Theme) { return Object.fromEntries(Object.entries(PREVIEW_BASE).map(([k, v]) => [k, remapHex(v, theme)])) as Record<keyof typeof PREVIEW_BASE, string>; }
