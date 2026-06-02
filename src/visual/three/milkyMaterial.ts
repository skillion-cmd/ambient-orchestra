import * as THREE from 'three';
import { MILKY_FOG } from '../ScenePalette';

const vertexShader = /* glsl */ `
  varying float vDepth;
  varying vec3 vNormal;
  varying vec3 vViewPosition;

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = mvPosition.xyz;
    vDepth = -mvPosition.z;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 fogColor;
  uniform float fogDensity;
  uniform float time;
  uniform float grain;
  uniform float milky;
  uniform float uPresence;
  uniform float uDarkField;

  varying float vDepth;
  varying vec3 vNormal;
  varying vec3 vViewPosition;

  float filmGrain(vec2 uv, float t) {
    return fract(sin(dot(uv + t * 0.017, vec2(12.9898, 78.233))) * 43758.5453);
  }

  void main() {
    vec3 viewDir = normalize(-vViewPosition);
    vec3 normal = normalize(vNormal);

    float depthT = smoothstep(1.5, 24.0, vDepth);
    float base = uDarkField > 0.5
      ? mix(0.82, 0.1, depthT)
      : mix(0.94, 0.14, depthT);

    float wrap = dot(normal, vec3(0.12, 0.38, 0.92)) * 0.5 + 0.5;
    float rim = pow(1.0 - abs(dot(normal, viewDir)), 1.6);
    float tone = base * mix(0.62, 0.98, wrap);
    tone += rim * (0.08 + milky * 0.14);

    float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vDepth * vDepth);

    // Carry the field's chroma (blue-black in dark mode) into the bodies so they
    // share the palette instead of rendering as flat grey. In light mode the
    // fog colour is near-neutral, so this is effectively a no-op.
    vec3 chroma = fogColor - vec3(dot(fogColor, vec3(0.3333)));
    vec3 col = vec3(tone) + chroma * (uDarkField > 0.5 ? 2.6 : 1.0) * (0.5 + tone);

    col = mix(col, fogColor, fogFactor * (0.68 + milky * 0.22));

    col += (filmGrain(gl_FragCoord.xy, time) - 0.5) * grain;

    col = mix(fogColor, col, uPresence);

    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
  }
`;

export interface MilkyUniforms {
  time: THREE.IUniform<number>;
  grain: THREE.IUniform<number>;
  milky: THREE.IUniform<number>;
  uPresence: THREE.IUniform<number>;
  fogColor: THREE.IUniform<THREE.Color>;
  fogDensity: THREE.IUniform<number>;
  uDarkField: THREE.IUniform<number>;
}

export function createMilkyMaterial(): MilkyMaterial {
  const uniforms: MilkyUniforms = {
    time: { value: 0 },
    grain: { value: 0.035 },
    milky: { value: 0.65 },
    uPresence: { value: 1 },
    fogColor: { value: MILKY_FOG.clone() },
    fogDensity: { value: 0.045 },
    uDarkField: { value: 0 },
  };

  return new THREE.ShaderMaterial({
    uniforms: uniforms as unknown as { [uniform: string]: THREE.IUniform },
    vertexShader,
    fragmentShader,
    fog: false,
  }) as MilkyMaterial;
}

export type MilkyMaterial = THREE.ShaderMaterial & { uniforms: MilkyUniforms };
