import * as THREE from 'three';

export type SceneTheme = 'light' | 'dark';

export const DEFAULT_THEME: SceneTheme = 'light';

export interface ThemePalette {
  sceneBg: number;
  sceneFog: THREE.Color;
  ghostFog: THREE.Color;
  milkyFog: THREE.Color;
  fogDensity: number;
  ui: {
    pageBg: string;
    text: string;
    textMuted: string;
    textFaint: string;
    border: string;
    overlay: string;
    errorOverlay: string;
    errorText: string;
  };
}

const LIGHT: ThemePalette = {
  sceneBg: 0xececec,
  sceneFog: new THREE.Color(0.925, 0.925, 0.928),
  ghostFog: new THREE.Color(0.908, 0.908, 0.912),
  milkyFog: new THREE.Color(0.925, 0.925, 0.928),
  fogDensity: 0.048,
  ui: {
    pageBg: '#ececec',
    text: '#1a1a1a',
    textMuted: 'rgba(26, 26, 26, 0.42)',
    textFaint: 'rgba(26, 26, 26, 0.28)',
    border: 'rgba(26, 26, 26, 0.14)',
    overlay: 'rgba(236, 236, 236, 0.72)',
    errorOverlay: 'rgba(236, 236, 236, 0.94)',
    errorText: 'rgba(26, 26, 26, 0.78)',
  },
};

const DARK: ThemePalette = {
  sceneBg: 0x08080f,
  sceneFog: new THREE.Color(0.04, 0.04, 0.068),
  ghostFog: new THREE.Color(0.035, 0.035, 0.06),
  milkyFog: new THREE.Color(0.04, 0.04, 0.068),
  fogDensity: 0.055,
  ui: {
    pageBg: '#08080f',
    text: '#d8d8de',
    textMuted: 'rgba(216, 216, 222, 0.42)',
    textFaint: 'rgba(216, 216, 222, 0.28)',
    border: 'rgba(216, 216, 222, 0.14)',
    overlay: 'rgba(8, 8, 15, 0.72)',
    errorOverlay: 'rgba(8, 8, 15, 0.94)',
    errorText: 'rgba(216, 216, 222, 0.78)',
  },
};

export function getThemePalette(theme: SceneTheme): ThemePalette {
  return theme === 'dark' ? DARK : LIGHT;
}

/** @deprecated use getThemePalette(theme).sceneBg */
export const SCENE_BG = LIGHT.sceneBg;
export const SCENE_FOG = LIGHT.sceneFog;
export const GHOST_FOG = LIGHT.ghostFog;
export const MILKY_FOG = LIGHT.milkyFog;
export const FOG_DENSITY = LIGHT.fogDensity;

export function applySceneFog(scene: THREE.Scene, theme: SceneTheme = DEFAULT_THEME): void {
  const palette = getThemePalette(theme);
  scene.fog = new THREE.FogExp2(palette.sceneBg, palette.fogDensity);
}

export function applyUiTheme(theme: SceneTheme): void {
  const { ui } = getThemePalette(theme);
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.setProperty('--ao-bg', ui.pageBg);
  root.style.setProperty('--ao-text', ui.text);
  root.style.setProperty('--ao-text-muted', ui.textMuted);
  root.style.setProperty('--ao-text-faint', ui.textFaint);
  root.style.setProperty('--ao-border', ui.border);
  root.style.setProperty('--ao-overlay', ui.overlay);
  root.style.setProperty('--ao-error-overlay', ui.errorOverlay);
  root.style.setProperty('--ao-error-text', ui.errorText);

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', ui.pageBg);
}

const STORAGE_KEY = 'ao-theme';

export function loadStoredTheme(): SceneTheme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    /* private browsing */
  }
  return DEFAULT_THEME;
}

export function storeTheme(theme: SceneTheme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* private browsing */
  }
}
