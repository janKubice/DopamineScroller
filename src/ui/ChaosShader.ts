/**
 * ChaosShader (V1) — fullscreen WebGL glitch overlay nad DOM kompozicí. Viz docs/GDD-04 §V1.
 *
 * Prezentační vrstva: čte jen jednu znormalizovanou „intensitu" (0–1) z domény (`chaosLevel`,
 * `dopamineMeter`) a maluje procedurální glitch — barevné scanline pásy, šum, chromatickou
 * aberaci a vignettu. Žádná herní logika. Raw WebGL (žádná závislost); když WebGL chybí,
 * `available=false` a vše je no-op (graceful degradace).
 */
const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform float uTime;
uniform float uIntensity; // 0..1
uniform vec2 uRes;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float a = hash(i), b = hash(i + vec2(1.0, 0.0)), c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

void main() {
  float I = uIntensity;
  if (I <= 0.001) { gl_FragColor = vec4(0.0); return; }
  vec2 uv = gl_FragCoord.xy / uRes;

  // Horizontální glitch pásy, které „skáčou" v čase.
  float row = floor(uv.y * 48.0);
  float band = step(0.96 - I * 0.18, hash(vec2(row, floor(uTime * 11.0))));

  // Chromatický barevný šum (RGB rozházené).
  vec3 chroma = vec3(
    noise(uv * 220.0 + uTime * 38.0 + 1.0),
    noise(uv * 220.0 + uTime * 38.0 + 7.0),
    noise(uv * 220.0 + uTime * 38.0 + 13.0)
  );

  // Scanlines.
  float scan = 0.5 + 0.5 * sin(uv.y * uRes.y * 1.6);

  // Vignetta (efekt silnější u krajů).
  float vig = smoothstep(1.25, 0.35, distance(uv, vec2(0.5)));

  float a = 0.0;
  a += noise(uv * 90.0 + uTime * 20.0) * 0.05 * I;     // jemný základní šum
  a += band * (0.22 + 0.45 * I);                        // glitch pásy
  a *= mix(0.75, 1.25, vig);                            // zvýraznit kraje

  vec3 col = mix(chroma, vec3(scan), 0.45);
  gl_FragColor = vec4(col, clamp(a, 0.0, 0.8));
}
`;

export class ChaosShader {
  readonly canvas: HTMLCanvasElement;
  readonly available: boolean;
  private gl: WebGLRenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private uTime: WebGLUniformLocation | null = null;
  private uIntensity: WebGLUniformLocation | null = null;
  private uRes: WebGLUniformLocation | null = null;
  private intensity = 0;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'chaos-shader';
    document.body.appendChild(this.canvas);
    const gl =
      this.canvas.getContext('webgl', { premultipliedAlpha: false, alpha: true }) ??
      (this.canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);
    if (!gl) {
      this.available = false;
      this.canvas.hidden = true;
      return;
    }
    this.gl = gl;
    this.available = this.init(gl);
    if (!this.available) this.canvas.hidden = true;
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  setIntensity(value: number): void {
    this.intensity = Math.max(0, Math.min(1, value));
  }

  /** Vykreslí jeden snímek (timeSec = sekundy). No-op když WebGL chybí. */
  render(timeSec: number): void {
    const gl = this.gl;
    if (!gl || !this.program) return;
    // Šetři: při nulové intenzitě vyčisti na průhledno a nekresli šum.
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (this.intensity <= 0.001) return;
    gl.useProgram(this.program);
    gl.uniform1f(this.uTime, timeSec);
    gl.uniform1f(this.uIntensity, this.intensity);
    gl.uniform2f(this.uRes, this.canvas.width, this.canvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private init(gl: WebGLRenderingContext): boolean {
    const program = link(gl, VERT, FRAG);
    if (!program) return false;
    this.program = program;
    // Fullscreen trojúhelník.
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    this.uTime = gl.getUniformLocation(program, 'uTime');
    this.uIntensity = gl.getUniformLocation(program, 'uIntensity');
    this.uRes = gl.getUniformLocation(program, 'uRes');
    return true;
  }

  private resize(): void {
    const gl = this.gl;
    if (!gl) return;
    // Glitch nepotřebuje plné rozlišení – polovina šetří výkon.
    const w = Math.max(1, Math.floor(window.innerWidth * 0.5));
    const h = Math.max(1, Math.floor(window.innerHeight * 0.5));
    this.canvas.width = w;
    this.canvas.height = h;
    gl.viewport(0, 0, w, h);
  }
}

function link(gl: WebGLRenderingContext, vsrc: string, fsrc: string): WebGLProgram | null {
  const vs = compile(gl, gl.VERTEX_SHADER, vsrc);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsrc);
  if (!vs || !fs) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}
