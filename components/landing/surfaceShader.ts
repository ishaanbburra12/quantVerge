/**
 * GLSL for the landing-page surface.
 *
 * The shape is not arbitrary noise. It is the geometry of an implied-volatility
 * surface: convex in moneyness (the smile), flattening as maturity grows, and
 * drifting toward a long-run level along the term axis. A slow undulation sits
 * on top, standing in for the surface being re-marked through a trading day.
 *
 * Doing it in a shader rather than in JavaScript matters for one reason: the
 * displacement is evaluated per vertex on the GPU, so a 160x160 grid costs the
 * CPU nothing per frame. Only the clock uniform crosses the boundary.
 */

export const SURFACE_VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uAmplitude;
  uniform float uBreath;

  varying vec2 vUv;
  varying float vHeight;

  // Moneyness m in [-1, 1], maturity fraction u in [0, 1].
  float surfaceHeight(vec2 p, float t) {
    float m = p.x;
    float tau = p.y * 0.75 + 0.25;

    // The smile: implied vol is convex in moneyness and the convexity decays
    // roughly like 1/sqrt(tau), which is why long-dated surfaces look flat.
    float smile = 1.45 * m * m / sqrt(tau);

    // Term structure: mean reversion toward a long-run variance level.
    float term = 0.40 * (1.0 - exp(-2.2 * tau));

    // Re-marking through the session.
    float breath =
        0.085 * sin(p.x * 3.1 + t * 0.35) * cos(p.y * 2.4 - t * 0.27)
      + 0.045 * sin((p.x + p.y * 1.7) * 5.3 - t * 0.52)
      + 0.025 * sin(p.y * 9.1 - t * 0.81);

    return smile + term + uBreath * breath;
  }

  void main() {
    vUv = uv;

    vec2 p = vec2(uv.x * 2.0 - 1.0, uv.y);
    float h = surfaceHeight(p, uTime);

    vHeight = h;

    vec3 displaced = position;
    displaced.z += h * uAmplitude;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`;

export const SURFACE_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uAccent;
  uniform vec3 uDeep;
  uniform float uGridDensity;
  uniform float uOpacity;

  varying vec2 vUv;
  varying float vHeight;

  // Antialiased grid.
  //
  // The line width is taken from the screen-space derivative so lines stay
  // about one pixel wide at any distance instead of aliasing into moire. The
  // clamp on that derivative is the part that matters: as the surface tilts
  // away, one pixel comes to span many grid cells, fwidth blows up, and an
  // unclamped threshold test collapses to zero everywhere — the grid silently
  // disappears into black exactly where the scene needs its horizon. Capping
  // the width leaves a soft haze there instead.
  float gridLine(vec2 uv, float density) {
    vec2 coord = uv * density;
    vec2 width = min(fwidth(coord), vec2(0.34));
    vec2 cell = fract(coord);
    vec2 edge = min(cell, 1.0 - cell);
    vec2 line = smoothstep(width * 1.6, vec2(0.0), edge);
    return clamp(max(line.x, line.y), 0.0, 1.0);
  }

  void main() {
    float fine = gridLine(vUv, uGridDensity);
    float coarse = gridLine(vUv, uGridDensity * 0.125);

    // Height drives the colour ramp, so the high-vol wings read brightest.
    float lift = clamp(vHeight * 0.8, 0.0, 1.0);
    vec3 base = mix(uDeep, uAccent, lift);

    float ink = max(fine * 0.55, coarse * 1.0);
    vec3 colour = base * (0.10 + 0.90 * ink) + uAccent * ink * lift * 0.55;

    // Fade the far edge and the two flanks so the mesh dissolves into the
    // background rather than ending on a visible hard border.
    float depthFade = smoothstep(1.0, 0.45, vUv.y);
    float flankFade = smoothstep(0.0, 0.05, vUv.x) * smoothstep(1.0, 0.95, vUv.x);

    float alpha = (0.06 + ink * 0.94) * depthFade * flankFade * uOpacity;

    if (alpha < 0.004) discard;

    gl_FragColor = vec4(colour, alpha);
  }
`;

export const TICK_VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uSize;
  uniform float uSpan;
  uniform float uPixelRatio;

  attribute float aSeed;
  attribute float aSpeed;

  varying float vFade;

  void main() {
    vec3 p = position;

    // Ticks drift upward and wrap, so the field never empties and never needs
    // reseeding on the CPU.
    float travel = mod(p.y + uTime * aSpeed, uSpan);
    p.y = travel;

    // A little lateral sway, keyed off the per-point seed so no two agree.
    p.x += 0.35 * sin(uTime * 0.25 + aSeed * 6.2831);
    p.z += 0.35 * cos(uTime * 0.21 + aSeed * 6.2831);

    vec4 viewPosition = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * viewPosition;

    // Brightest in the middle of the column; fades in at the floor and out at
    // the ceiling so the wrap is invisible.
    float t = travel / uSpan;
    vFade = smoothstep(0.0, 0.18, t) * smoothstep(1.0, 0.62, t);

    gl_PointSize = uSize * uPixelRatio * (1.0 + aSeed * 0.9) / max(-viewPosition.z, 0.75);
  }
`;

export const TICK_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uAccent;

  varying float vFade;

  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r = length(d);
    if (r > 0.5) discard;

    float core = smoothstep(0.5, 0.0, r);
    gl_FragColor = vec4(uAccent, core * core * vFade * 0.75);
  }
`;
