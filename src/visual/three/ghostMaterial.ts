import * as THREE from 'three';
import type { SceneTheme } from '../ScenePalette';

const vertexShader = /* glsl */ `
  attribute float aHeat;
  attribute float aDepth;
  attribute vec2 aVelocity;
  attribute float aSize;
  varying float vDepth;
  varying float vHeat;
  varying float vDepthAttr;
  varying vec2 vVelocity;

  uniform float uSizeScale;

  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vDepth = -mv.z;
    vHeat = aHeat;
    vDepthAttr = aDepth;
    vVelocity = aVelocity;

    float depthSize = 1.0 + clamp(22.0 / max(vDepth, 1.0), 0.0, 3.6);
    // Per-particle size class (two discrete scales) with a global trim.
    float baseSize = (2.8 + aDepth * 5.4 + aHeat * 4.2) * uSizeScale * depthSize * aSize;
    gl_PointSize = baseSize;
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uAlpha;
  uniform float uFogDensity;
  uniform vec3 uFogColor;
  uniform float uDarkField;

  varying float vDepth;
  varying float vHeat;
  varying float vDepthAttr;
  varying vec2 vVelocity;

  void main() {
    // Pure radial disc — particles stay circular at every speed. Directional
    // smear comes from the trail pass, not from deforming the sprite itself.
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);

    if (d > 0.5) discard;

    float velLen = length(vVelocity);
    // Soft inky circle — diffuse gradient (not a hard-edged dot/raindrop), so
    // ghosts read as flowing ink and recede behind the body tubes.
    float soft = 1.0 - smoothstep(0.05, 0.5, d);
    float core = 1.0 - smoothstep(0.0, 0.26 + vHeat * 0.16, d);
    float depthT = smoothstep(0.6, 18.0, vDepth);

    float tone;
    if (uDarkField > 0.5) {
      tone = mix(0.96, 0.14, depthT);
      tone *= mix(0.45, 1.0, vHeat * 0.7 + vDepthAttr * 0.3);
      tone = mix(tone, 1.0, core * vHeat * 0.55);
      tone *= 0.9; // grey the ghosts back ~10% — softens the strong white
    } else {
      tone = mix(0.05, 0.84, depthT);
      tone *= mix(0.42, 0.92, vHeat * 0.65 + vDepthAttr * 0.35);
      tone = mix(tone, 0.025, core * vHeat * 0.5);
    }

    float fog = 1.0 - exp(-uFogDensity * uFogDensity * vDepth * vDepth);
    tone = mix(tone, uFogColor.r, fog * (uDarkField > 0.5 ? 0.55 : 0.72));

    float alpha = soft * uAlpha * (0.4 + vHeat * 0.6);
    alpha *= 1.0 + core * vHeat * (uDarkField > 0.5 ? 0.25 : 0.35);
    // Faster particles glow a touch brighter — energy without shape distortion.
    alpha *= 1.0 + clamp(velLen, 0.0, 1.0) * 0.18;

    gl_FragColor = vec4(vec3(tone), alpha);
  }
`;

export interface GhostUniforms {
  uAlpha: THREE.IUniform<number>;
  uFogDensity: THREE.IUniform<number>;
  uFogColor: THREE.IUniform<THREE.Color>;
  uSizeScale: THREE.IUniform<number>;
  uDarkField: THREE.IUniform<number>;
}

export function createGhostMaterial(fogColor: THREE.Color, theme: SceneTheme = 'light'): GhostMaterial {
  const dark = theme === 'dark';
  return new THREE.ShaderMaterial({
    uniforms: {
      uAlpha: { value: dark ? 0.2 : 0.14 },
      uFogDensity: { value: dark ? 0.042 : 0.038 },
      uFogColor: { value: fogColor.clone() },
      uSizeScale: { value: 1 },
      uDarkField: { value: dark ? 1 : 0 },
    } as GhostUniforms as unknown as { [uniform: string]: THREE.IUniform },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: dark ? THREE.AdditiveBlending : THREE.NormalBlending,
  }) as GhostMaterial;
}

export function applyGhostTheme(material: GhostMaterial, theme: SceneTheme, fogColor: THREE.Color): void {
  const dark = theme === 'dark';
  material.uniforms.uDarkField.value = dark ? 1 : 0;
  material.uniforms.uAlpha.value = dark ? 0.2 : 0.14;
  material.uniforms.uFogDensity.value = dark ? 0.042 : 0.038;
  material.uniforms.uFogColor.value.copy(fogColor);
  material.blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
}

export type GhostMaterial = THREE.ShaderMaterial & { uniforms: GhostUniforms };
