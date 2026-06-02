import * as THREE from 'three';

const fadeVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const fadeFragment = /* glsl */ `
  uniform sampler2D tPrev;
  uniform float uFade;
  uniform vec3 uBg;
  uniform float uHasPrev;
  varying vec2 vUv;

  void main() {
    vec3 prev = uHasPrev > 0.5 ? texture2D(tPrev, vUv).rgb : uBg;
    gl_FragColor = vec4(mix(prev, uBg, uFade), 1.0);
  }
`;

/**
 * Ink-in-water trail — fade previous frame toward fog, draw fresh geometry, blit to canvas.
 */
export class TrailPass {
  private readonly fadeScene = new THREE.Scene();
  private readonly fadeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly fadeMaterial: THREE.ShaderMaterial;
  private readonly fadeMesh: THREE.Mesh;
  private rtA: THREE.WebGLRenderTarget;
  private rtB: THREE.WebGLRenderTarget;
  private readIndex = 0;
  private width = 0;
  private height = 0;
  private primed = false;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly bgColor: THREE.Color,
  ) {
    this.fadeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tPrev: { value: null as THREE.Texture | null },
        uFade: { value: 0.06 },
        uBg: { value: bgColor.clone() },
        uHasPrev: { value: 0 },
      },
      vertexShader: fadeVertex,
      fragmentShader: fadeFragment,
      depthTest: false,
      depthWrite: false,
    });

    this.fadeMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.fadeMaterial);
    this.fadeScene.add(this.fadeMesh);

    this.rtA = this.makeTarget(4, 4);
    this.rtB = this.makeTarget(4, 4);
  }

  resize(width: number, height: number): void {
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.rtA.dispose();
    this.rtB.dispose();
    this.rtA = this.makeTarget(width, height);
    this.rtB = this.makeTarget(width, height);
    this.readIndex = 0;
    this.primed = false;
  }

  /** Fade previous frame toward fog, return RT to render the scene into. */
  beginFrame(trailFade: number): THREE.WebGLRenderTarget {
    const write = this.writeTarget();
    const read = this.readTarget();
    const fade = THREE.MathUtils.clamp(trailFade, 0.012, 0.12);

    this.fadeMaterial.uniforms.tPrev.value = read.texture;
    this.fadeMaterial.uniforms.uFade.value = this.primed ? fade : 1;
    this.fadeMaterial.uniforms.uBg.value.copy(this.bgColor);
    this.fadeMaterial.uniforms.uHasPrev.value = this.primed ? 1 : 0;

    this.renderer.setRenderTarget(write);
    this.renderer.render(this.fadeScene, this.fadeCamera);
    return write;
  }

  setBackground(color: THREE.Color): void {
    this.bgColor.copy(color);
  }

  endFrame(): void {
    const written = this.writeTarget();
    this.renderer.setRenderTarget(null);
    this.fadeMaterial.uniforms.tPrev.value = written.texture;
    this.fadeMaterial.uniforms.uFade.value = 0;
    this.fadeMaterial.uniforms.uHasPrev.value = 1;
    this.renderer.render(this.fadeScene, this.fadeCamera);
    this.primed = true;
    this.readIndex = 1 - this.readIndex;
  }

  dispose(): void {
    this.rtA.dispose();
    this.rtB.dispose();
    this.fadeMaterial.dispose();
    this.fadeMesh.geometry.dispose();
  }

  private makeTarget(w: number, h: number): THREE.WebGLRenderTarget {
    return new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
    });
  }

  private readTarget(): THREE.WebGLRenderTarget {
    return this.readIndex === 0 ? this.rtA : this.rtB;
  }

  private writeTarget(): THREE.WebGLRenderTarget {
    return this.readIndex === 0 ? this.rtB : this.rtA;
  }
}
