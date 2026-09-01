class AnimatedBackground {
  constructor(canvas) {
    this.canvas = canvas;

    this.gl =
      canvas.getContext("webgl", {
        alpha: true,
        antialias: false,
        premultipliedAlpha: false,
      }) || canvas.getContext("experimental-webgl");

    if (!this.gl) return;

    this.init();
  }

  /* =========================
     COLOR HELPERS
  ========================= */

  hexToRgb(hex) {
    const value = hex.replace("#", "");

    const normalized =
      value.length === 3
        ? value
            .split("")
            .map((char) => char + char)
            .join("")
        : value;

    return [
      parseInt(normalized.substring(0, 2), 16) / 255,
      parseInt(normalized.substring(2, 4), 16) / 255,
      parseInt(normalized.substring(4, 6), 16) / 255,
    ];
  }

  getAccentColor() {
    const accent = getComputedStyle(document.documentElement)
      .getPropertyValue("--color-primary")
      .trim();

    return this.hexToRgb(accent || "#ff8933");
  }

  /* =========================
     SHADER HELPER
  ========================= */

  createShader(type, source) {
    const gl = this.gl;

    const shader = gl.createShader(type);

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error("Shader error:", gl.getShaderInfoLog(shader));

      gl.deleteShader(shader);

      return null;
    }

    return shader;
  }

  /* =========================
     INITIALIZATION
  ========================= */

  init() {
    const gl = this.gl;

    /* =========================
       VERTEX SHADER
    ========================= */

    const vertexShaderSource = `
      attribute vec2 a_position;

      varying vec2 v_texCoord;

      void main() {

        v_texCoord =
          a_position * 0.5 + 0.5;

        gl_Position =
          vec4(
            a_position,
            0.0,
            1.0
          );

      }
    `;

    /* =========================
       FRAGMENT SHADER
    ========================= */

    const fragmentShaderSource = `
      precision highp float;

      uniform float u_time;
      uniform vec2 u_resolution;
      uniform vec3 u_accent;

      varying vec2 v_texCoord;


      /* =========================
         NOISE
      ========================= */

      float hash(vec2 p) {

        p = fract(
          p * vec2(
            123.34,
            456.21
          )
        );

        p += dot(
          p,
          p + 45.32
        );

        return fract(
          p.x * p.y
        );

      }


      float noise(vec2 p) {

        vec2 i = floor(p);
        vec2 f = fract(p);

        f =
          f * f *
          (3.0 - 2.0 * f);

        float a = hash(i);

        float b = hash(
          i + vec2(1.0, 0.0)
        );

        float c = hash(
          i + vec2(0.0, 1.0)
        );

        float d = hash(
          i + vec2(1.0, 1.0)
        );

        return mix(
          mix(a, b, f.x),
          mix(c, d, f.x),
          f.y
        );

      }


      /* =========================
         MAIN
      ========================= */

      void main() {

        vec2 uv = v_texCoord;


        /* =========================
           PIXELATED TERRAIN
        ========================= */

        float pixelSize = 120.0;

        vec2 p_uv =
          floor(uv * pixelSize)
          / pixelSize;


        /* =========================
           ANIMATED TERRAIN HEIGHTS
        ========================= */

        float h1 =
          noise(
            vec2(
              p_uv.x * 2.0,
              u_time * 0.05
            )
          ) * 0.20 + 0.30;


        float h2 =
          noise(
            vec2(
              p_uv.x * 3.0 + 10.0,
              u_time * 0.08
            )
          ) * 0.15 + 0.20;


        float h3 =
          noise(
            vec2(
              p_uv.x * 4.0 + 20.0,
              u_time * 0.10
            )
          ) * 0.10 + 0.10;


        /* =========================
           TERRAIN PALETTE
        ========================= */

        vec3 baseTerrain =
          vec3(
            0.055,
            0.045,
            0.030
          );


        vec3 layerOne =
          mix(
            baseTerrain,
            u_accent,
            0.08
          );


        vec3 layerTwo =
          mix(
            baseTerrain,
            u_accent,
            0.14
          );


        vec3 layerThree =
          mix(
            baseTerrain,
            u_accent,
            0.20
          );


        /* =========================
           TRANSPARENT SKY
        ========================= */

        vec3 col = vec3(0.0);

        float alpha = 0.0;


        /* =========================
           TERRAIN LAYERS

           IMPORTANT:
           Terrain is fully opaque.
           Grid behind it cannot show through.
        ========================= */

        if (p_uv.y < h1) {

          col = layerOne;
          alpha = 1.0;

        }


        if (p_uv.y < h2) {

          col = layerTwo;
          alpha = 1.0;

        }


        if (p_uv.y < h3) {

          col = layerThree;
          alpha = 1.0;

        }


        /* =========================
           SUBTLE TERRAIN DEPTH
        ========================= */

        if (alpha > 0.0) {

          float depth =
            (1.0 - uv.y) * 0.025;

          col +=
            u_accent * depth;

        }


        /* =========================
           OUTPUT

           Sky = transparent
           Terrain = opaque
        ========================= */

        gl_FragColor =
          vec4(
            col,
            alpha
          );

      }
    `;

    /* =========================
       CREATE SHADERS
    ========================= */

    const vertexShader = this.createShader(
      gl.VERTEX_SHADER,
      vertexShaderSource,
    );

    const fragmentShader = this.createShader(
      gl.FRAGMENT_SHADER,
      fragmentShaderSource,
    );

    if (!vertexShader || !fragmentShader) {
      return;
    }

    /* =========================
       CREATE PROGRAM
    ========================= */

    this.program = gl.createProgram();

    gl.attachShader(this.program, vertexShader);

    gl.attachShader(this.program, fragmentShader);

    gl.linkProgram(this.program);

    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      console.error("Program error:", gl.getProgramInfoLog(this.program));

      return;
    }

    gl.useProgram(this.program);

    /* =========================
       FULL SCREEN QUAD
    ========================= */

    const buffer = gl.createBuffer();

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );

    const position = gl.getAttribLocation(this.program, "a_position");

    gl.enableVertexAttribArray(position);

    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    /* =========================
       UNIFORMS
    ========================= */

    this.uniforms = {
      time: gl.getUniformLocation(this.program, "u_time"),

      resolution: gl.getUniformLocation(this.program, "u_resolution"),

      accent: gl.getUniformLocation(this.program, "u_accent"),
    };

    /* =========================
       WEBGL TRANSPARENCY
    ========================= */

    gl.enable(gl.BLEND);

    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    gl.clearColor(0, 0, 0, 0);

    /* =========================
       RESIZE
    ========================= */

    this.resize();

    window.addEventListener("resize", () => this.resize());

    /* =========================
       ACCESSIBILITY
    ========================= */

    this.reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    /* =========================
       START
    ========================= */

    this.render();
  }

  /* =========================
     RESIZE
  ========================= */

  resize() {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

    const width = Math.floor(this.canvas.clientWidth * pixelRatio);

    const height = Math.floor(this.canvas.clientHeight * pixelRatio);

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  /* =========================
     RENDER
  ========================= */

  render(time = 0) {
    const gl = this.gl;

    this.resize();

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);

    /* Clear canvas to transparent */

    gl.clear(gl.COLOR_BUFFER_BIT);

    /* Accent color */

    const accent = this.getAccentColor();

    /* Uniforms */

    gl.uniform1f(this.uniforms.time, this.reducedMotion ? 0 : time * 0.001);

    gl.uniform2f(
      this.uniforms.resolution,
      this.canvas.width,
      this.canvas.height,
    );

    gl.uniform3f(this.uniforms.accent, accent[0], accent[1], accent[2]);

    /* Draw */

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    /* Continue animation */

    if (!this.reducedMotion) {
      requestAnimationFrame((nextTime) => this.render(nextTime));
    }
  }
}

/* =========================
   INITIALIZE
========================= */

document.addEventListener("DOMContentLoaded", () => {
  const canvas = document.querySelector(".animated-background");

  if (canvas) {
    new AnimatedBackground(canvas);
  }
});
