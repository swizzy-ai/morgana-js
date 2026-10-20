/**
 * The world, drawn per pixel: one WebGL2 fragment shader, no meshes, no
 * textures. Every frame is a pure function of the uniforms and the time.
 *
 * Techniques: the sea as layered, choppy noise waves found by bisection
 * (after TDM's "Seascape"); islands as height fields shaped by their handles,
 * raymarched inside their bounds; materials by height and slope with soft
 * shadows; a sky with sun, glow, clouds and stars; height mist and sun-tinted
 * aerial fog (after Íñigo Quilez); a style grade at the end.
 */
export const MAX_ISLANDS = 4

export const VERTEX = `#version 300 es
in vec2 a;
void main(){ gl_Position = vec4(a, 0.0, 1.0); }`

export const FRAGMENT = `#version 300 es
precision highp float;
out vec4 fragColor;

uniform vec2 uRes;
uniform float uTime;
uniform vec3 uRo, uTa;
uniform float uFov;

uniform float uWaveH, uWaveL, uChoppy, uWaveSpeed, uSwellH, uSwellL, uTide, uOctaves;
uniform vec2 uWaveDir, uSwellDir;
uniform vec3 uDeep, uShallow, uScatter, uFoamC;
uniform float uRough, uReflect, uClarity, uFoam, uCrest, uShoreFoam;

uniform vec3 uSunDir, uSunC, uZenith, uHorizon, uGlow, uCloudC;
uniform float uSunSize, uSunStr, uClouds, uCloudScale, uCloudSoft, uCloudStretch, uCloudSpeed, uCloudShade, uStars, uExposure, uCloudSeed;

uniform vec3 uMistC;
uniform float uMist, uMistH, uHaze;

uniform int uIslands;
uniform vec4 uIA[4]; // centre x, centre z, radius, peak
uniform vec4 uIB[4]; // turn (rad), stretch, bays, seed
uniform vec4 uIC[4]; // outline, profile, peaks, ridges
uniform vec4 uID[4]; // cliff height, cliff side (rad), cliff spread, erosion
uniform vec4 uIE[4]; // beach (m), vegetation, treeline, snowline
uniform vec4 uIF[4]; // roughness, reef, lean, unused
uniform vec3 uSand[4], uGrass[4], uRock[4], uSnow[4];

uniform float uWarmth, uSat, uContrast, uGrain, uDetail, uQuality;

const float PI = 3.14159265;
const mat2 M2 = mat2(1.6, 1.2, -1.2, 1.6);

float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f);
  return -1. + 2. * mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p, int oct){ float a = .5, s = 0.; for (int i = 0; i < 8; i++){ if (i >= oct) break; s += a * noise(p); p = M2 * p; a *= .5; } return s; }
float ridged(vec2 p, int oct){ float a = .5, s = 0.; for (int i = 0; i < 8; i++){ if (i >= oct) break; float n = 1. - abs(noise(p)); s += a * n * n; p = M2 * p; a *= .5; } return s; }
mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

// ── sea ──────────────────────────────────────────────────────────────────────
// Many waves, each in its own direction, each pulling the next along (after
// afl_ext's procedural ocean): no lattice, crests that peak like real water.
vec2 waveDx(vec2 pos, vec2 dir, float freq, float shift){
  float x = mod(dot(dir, pos) * freq + shift, 6.2831853);
  float w = exp(sin(x) - 1.);
  return vec2(w, -w * cos(x));
}
float seaH(vec2 p, int iters){
  float base = 6.2831 / uWaveL;
  vec2 pos = p * base + uCloudSeed * 400.;
  float dirA = atan(uWaveDir.x, uWaveDir.y);
  float spread = mix(.9, .45, uChoppy);
  float drag = mix(.12, .48, uChoppy);
  float t = uTime * uWaveSpeed * sqrt(9.81 * base) * .55;
  float iter = 0., freq = 1., tm = 1., weight = 1., sum = 0., wsum = 0.;
  float phase = length(p) * .0005;
  for (int i = 0; i < 48; i++){
    if (i >= iters) break;
    float a = dirA + sin(iter) * 3.14159 * spread;
    vec2 d = vec2(sin(a), cos(a));
    vec2 r = waveDx(pos, d, freq, t * tm + phase);
    pos += d * r.y * weight * drag;
    sum += r.x * weight; wsum += weight;
    weight = mix(weight, 0., .2); freq *= 1.18; tm *= 1.07; iter += 1232.399963;
  }
  float h = (sum / wsum) * uWaveH * 1.6;
  float sk = 6.2831 / uSwellL;
  h += uSwellH * .5 * sin(mod(dot(p, uSwellDir) * sk - uTime * sqrt(9.81 * sk) * uWaveSpeed, 6.2831853));
  return h - uWaveH * .45 + uTide;
}
float seaMap(vec3 p, int it){ return p.y - seaH(p.xz, it); }
int traceIters(){ return 6 + int(uOctaves); }
int detailIters(){ return int(float(14 + int(uOctaves) * 5) * uQuality); }

bool traceSea(vec3 ro, vec3 rd, out float t){
  float tm = 0., tx = 20000.;
  int ti = traceIters();
  float hx = seaMap(ro + rd * tx, ti);
  if (hx > 0.) { t = tx; return false; }
  float hm = seaMap(ro, ti);
  float tmid = 0.;
  for (int i = 0; i < 12; i++){
    tmid = mix(tm, tx, clamp(hm / max(hm - hx, 1e-5), 0., 1.));
    float hmid = seaMap(ro + rd * tmid, ti);
    if (hmid < 0.) { tx = tmid; hx = hmid; } else { tm = tmid; hm = hmid; }
  }
  t = tmid;
  return true;
}

// ── islands ──────────────────────────────────────────────────────────────────
float islandH(int i, vec2 q, out float coast){
  vec4 A = uIA[i], B = uIB[i], C = uIC[i], D = uID[i], E = uIE[i], F = uIF[i];
  vec2 d = q - A.xy;
  float R = A.z;
  coast = -9.;
  if (dot(d, d) > R * R * 4.4) return -60.;
  vec2 e = rot(B.x) * d / R;
  int outline = int(C.x + .5);
  if (outline == 1) e.x /= B.y;
  vec2 dirn = normalize(e + 1e-5);
  float rr = 1. + B.z * .55 * fbm(dirn * 1.7 + B.w, 3);
  if (outline == 3) rr += .3 * fbm(dirn * 5.5 + B.w * 1.7, 4);
  float dist = length(e) / rr;
  if (outline == 4) dist = min(length(e - vec2(.5, 0.)) / (.62 * rr), length(e + vec2(.48, .05)) / (.55 * rr));
  float x = 1. - dist;
  if (outline == 2) x = min(x, length(e - vec2(.55, .1)) / .78 - 1.);
  x += F.z * .25 * e.x;
  coast = x;
  int profile = int(C.y + .5);
  float xp = max(x, 0.);
  float prof;
  if (profile == 1) prof = pow(xp, 1.25) - .5 * smoothstep(.8, .96, x);
  else if (profile == 2) prof = smoothstep(0., .16, x) * .82 + .18 * smoothstep(.35, 1., x);
  else if (profile == 3) prof = pow(xp, 2.6);
  else if (profile == 4) prof = smoothstep(0., .55, x) * .25;
  else prof = pow(smoothstep(0., 1., x), 1.25);
  float bumps = 0.;
  for (int k = 0; k < 4; k++){
    if (float(k) >= C.z) break;
    vec2 c = vec2(hash12(vec2(B.w, float(k))), hash12(vec2(float(k), B.w))) * 1.1 - .55;
    float hgt = .55 + .45 * hash12(vec2(B.w * 3., float(k) * 7.));
    bumps = max(bumps, exp(-dot(e - c, e - c) * 6.) * hgt);
  }
  if (C.z > .5 && profile != 2 && profile != 4) prof = prof * .45 + prof * bumps * 1.1;
  float side = dot(dirn, vec2(sin(D.y), cos(D.y)));
  float sf = smoothstep(1. - (D.z * 2. + .15), 1., side * .5 + .5);
  prof = mix(prof, max(prof, smoothstep(-.005, .05, x) * (.32 + .55 * prof)), D.x * sf);
  vec2 g = q / R;
  int oct = int(3. + uDetail * 3.);
  float det = ridged(g * 3.2 + B.w, oct) * C.w + fbm(g * 7. + B.w * 3., 4) * .35 * F.x;
  float ero = D.w * ridged(g * 9. + B.w * 7., 3);
  float h = A.w * prof * (.72 + .5 * det - .3 * ero);
  float beachX = E.x / R;
  float beachH = x * R * .05 + .4;
  h = mix(min(h, beachH), h, mix(smoothstep(beachX * .5, beachX * 1.6 + .01, x), 1., D.x * sf));
  if (x < 0.){
    h = x * R * .3 - .5;
    float reef = F.y * smoothstep(-.32, -.16, x) * (1. - smoothstep(-.14, -.02, x));
    h = max(h, mix(-30., -1.1, reef));
  }
  return h;
}

float landH(vec2 p, out int which){
  float h = -60.; which = -1;
  for (int i = 0; i < 4; i++){
    if (i >= uIslands) break;
    float c;
    float hi = islandH(i, p, c);
    if (hi > h) { h = hi; which = i; }
  }
  return h;
}
float landH(vec2 p){ int w; return landH(p, w); }

bool traceLand(vec3 ro, vec3 rd, float tmax, out float t, out int which){
  float t0 = 1e9, t1 = -1.;
  for (int i = 0; i < 4; i++){
    if (i >= uIslands) break;
    vec2 oc = ro.xz - uIA[i].xy;
    float r = uIA[i].z * 2.1;
    float b = dot(oc, rd.xz), cc = dot(oc, oc) - r * r, a = dot(rd.xz, rd.xz);
    float disc = b * b - a * cc;
    if (disc < 0.) continue;
    float s = sqrt(disc);
    float ta = (-b - s) / a, tb = (-b + s) / a;
    if (tb < 0.) continue;
    t0 = min(t0, max(ta, 0.)); t1 = max(t1, tb);
  }
  if (t1 < 0.) return false;
  t1 = min(t1, tmax);
  t = max(t0, .5);
  int steps = int(160. * uQuality);
  for (int s = 0; s < 400; s++){
    if (s >= steps || t > t1) break;
    vec3 p = ro + rd * t;
    int w;
    float dh = p.y - landH(p.xz, w);
    if (dh < .0015 * t) { which = w; return true; }
    t += max(.25 + .0015 * t, dh * .42);
  }
  return false;
}

float landShadow(vec3 p, vec3 l){
  float res = 1., t = 2.;
  for (int i = 0; i < 28; i++){
    vec3 q = p + l * t;
    float h = q.y - landH(q.xz);
    res = min(res, 10. * h / t);
    t += clamp(h, 3., 120.);
    if (res < .02 || q.y > 1200.) break;
  }
  return clamp(res, 0., 1.);
}

// ── sky ──────────────────────────────────────────────────────────────────────
vec3 skyCol(vec3 rd, bool withClouds){
  float y = max(rd.y, 0.);
  vec3 col = mix(uHorizon, uZenith, pow(y, .55));
  float s = max(dot(rd, uSunDir), 0.);
  col += uGlow * (pow(s, 14. / uSunSize) * .28 + pow(s, 90. / uSunSize) * .55) * uSunStr * .55;
  col += uSunC * pow(s, 1400. / (uSunSize * uSunSize)) * 18. * uSunStr;
  if (uStars > 0. && rd.y > 0.){
    vec2 sp = rd.xz / (rd.y + .3) * 220.;
    float st = step(.997 - .002 * uStars, hash12(floor(sp)));
    col += st * uStars * .9 * smoothstep(0., .2, rd.y);
  }
  if (withClouds && rd.y > .002 && uClouds > 0.){
    vec2 uv = rd.xz / rd.y * 1.6 * uCloudScale;
    uv.x /= uCloudStretch;
    uv += vec2(uTime * uCloudSpeed * .01, 0.) + uCloudSeed * 50.;
    float n = fbm(uv, int(4. + uDetail * 2.)) * .5 + .5;
    float cov = 1. - uClouds;
    float dens = smoothstep(cov - .08, cov + .1 + uCloudSoft * .25, n);
    float lit = pow(s, 4.) * .6 + .4;
    vec3 cc = mix(uCloudC * mix(1., .45, uCloudShade), uCloudC + uGlow * .35, lit * (1. - dens * uCloudShade * .6));
    col = mix(col, cc, dens * smoothstep(.0, .12, rd.y));
  }
  return col;
}

// ── fog ──────────────────────────────────────────────────────────────────────
vec3 applyFog(vec3 col, vec3 ro, vec3 rd, float t){
  float s = max(dot(rd, uSunDir), 0.);
  vec3 fogC = mix(uHorizon, uGlow, pow(s, 8.) * .6);
  float b = mix(.00004, .00055, uHaze);
  col = mix(col, fogC, 1. - exp(-t * b));
  float hb = 1. / uMistH;
  float a = uMist * .0007;
  float rdy = abs(rd.y) < 1e-4 ? 1e-4 : rd.y;
  float mist = 1. - exp(-max(a / hb * exp(-ro.y * hb) * (1. - exp(-t * rdy * hb)) / rdy, 0.));
  vec3 mc = mix(uMistC, fogC, .45) * mix(.7, 1.1, uSunStr * .4);
  return mix(col, mc, mist);
}

// ── shading ──────────────────────────────────────────────────────────────────
vec3 shadeSea(vec3 ro, vec3 rd, float t){
  vec3 p = ro + rd * t;
  float eps = max(.02, t * 1.5 / uRes.y);
  int it = detailIters();
  float h0 = seaH(p.xz, it);
  vec3 n = normalize(vec3(h0 - seaH(p.xz + vec2(eps, 0.), it), eps, h0 - seaH(p.xz + vec2(0., eps), it)));
  n = normalize(mix(n, vec3(0, 1, 0), smoothstep(150., 2400., t)));
  float cosv = clamp(dot(n, -rd), 0., 1.);
  float fres = (.02 + .98 * pow(1. - cosv, 5.)) * mix(.55, 1., uReflect);
  vec3 refl = skyCol(reflect(rd, n), true);
  float depth = p.y - landH(p.xz);
  float shallowness = 1. - smoothstep(0., 2. + 14. * uClarity, depth);
  float dif = pow(dot(n, uSunDir) * .4 + .6, 80.);
  vec3 refr = mix(uDeep, uShallow, shallowness) + dif * uScatter * .12 * uSunStr;
  vec3 col = mix(refr, refl * .9, fres);
  float atten = max(1. - t * t * .000004, 0.);
  col += uScatter * max(p.y - uTide + uWaveH * .45, 0.) / max(uWaveH, .05) * .16 * atten * (.4 + .6 * uSunStr);
  float hn = (h0 - uTide + uWaveH * .45) / max(uWaveH, .02);
  float foamN = fbm(p.xz * .35 + uTime * .3, 3) * .5 + .5;
  float foam = smoothstep(uCrest, uCrest + .25, hn * .55 + foamN * .45) * uFoam * atten;
  foam = max(foam, uShoreFoam * (1. - smoothstep(0., 1.6, depth)) * step(-1.5, depth) * smoothstep(.35, .7, foamN + .2 * sin(uTime * 1.3 + depth * 2.)));
  col = mix(col, uFoamC * (uSunStr * .5 + .5), clamp(foam, 0., 1.));
  float spec = pow(max(dot(reflect(rd, n), uSunDir), 0.), mix(900., 25., uRough));
  col += uSunC * spec * mix(4., 1., uRough) * uSunStr * (1. - foam);
  return col;
}

vec3 shadeLand(vec3 ro, vec3 rd, float t, int i){
  vec3 p = ro + rd * t;
  float e = .08 + .0012 * t;
  float h = landH(p.xz);
  vec3 n = normalize(vec3(landH(p.xz - vec2(e, 0.)) - landH(p.xz + vec2(e, 0.)), 2. * e, landH(p.xz - vec2(0., e)) - landH(p.xz + vec2(0., e))));
  vec4 A = uIA[i], E = uIE[i];
  float rel = h / max(A.w, 1.);
  float slope = 1. - n.y;
  float nz = fbm(p.xz * .02 + uIB[i].w, 4) * .5 + .5;
  float nz2 = fbm(p.xz * .15, 3) * .5 + .5;
  // Rock with strata on steep faces, so a cliff has form even against the light.
  float strata = .82 + .36 * (noise(vec2(p.y * .22 + fbm(p.xz * .01, 2) * 3., uIB[i].w)) * .5 + .5);
  vec3 rock = uRock[i] * (.7 + .45 * nz2) * mix(1., strata, smoothstep(.3, .7, 1. - n.y));
  vec3 col = rock;
  float sandM = (1. - smoothstep(1.2, 3.2 + nz * 2., h)) * (1. - smoothstep(.25, .45, slope));
  float vegM = E.y * (1. - smoothstep(E.z - .1, E.z + .05, rel + nz * .15)) * (1. - smoothstep(.35, .62, slope)) * smoothstep(.25, .65, nz * .7 + nz2 * .5 + E.y * .3);
  vec3 veg = uGrass[i] * (.6 + .6 * nz2) * mix(vec3(1.), vec3(.85, 1.05, .8), nz);
  col = mix(col, veg, clamp(vegM, 0., 1.));
  col = mix(col, uSand[i] * (.9 + .2 * nz2), clamp(sandM, 0., 1.));
  float snowM = smoothstep(E.w - .04, E.w + .04, rel + nz * .08) * (1. - smoothstep(.55, .8, slope));
  col = mix(col, uSnow[i], snowM);
  col *= mix(.6, 1., smoothstep(.0, 1.2, h));
  float sh = uSunDir.y > -.05 ? landShadow(p + n * 1.5, uSunDir) : 0.;
  float dif = clamp(dot(n, uSunDir), 0., 1.) * sh;
  float amb = .5 + .5 * n.y;
  float bounce = clamp(-n.y * .5 + .5, 0., 1.) * .15;
  float rim = pow(clamp(1. - max(dot(n, -rd), 0.), 0., 1.), 3.) * max(dot(rd, uSunDir), 0.);
  float fill = clamp(dot(n, -rd) * .5 + .5, 0., 1.);
  vec3 light = uSunC * dif * uSunStr * 1.7 + mix(uHorizon, uZenith, .5) * (amb * .7 + fill * .35) + uDeep * bounce + uGlow * rim * .6 * uSunStr;
  return col * light;
}

vec3 grade(vec3 col, vec2 frag){
  col *= uExposure;
  col = (col * (2.51 * col + .03)) / (col * (2.43 * col + .59) + .14);
  col *= mix(vec3(.9, .97, 1.08), vec3(1.08, 1., .88), uWarmth * .5 + .5);
  float l = dot(col, vec3(.299, .587, .114));
  col = mix(vec3(l), col, uSat);
  col = clamp((col - .5) * uContrast + .5, 0., 1.);
  col = pow(col, vec3(1. / 2.2));
  vec2 q = frag / uRes;
  col *= .55 + .45 * pow(16. * q.x * q.y * (1. - q.x) * (1. - q.y), .18);
  col += (hash12(frag + fract(uTime) * 97.) - .5) * uGrain * .08;
  return col;
}

void main(){
  vec2 uv = (gl_FragCoord.xy * 2. - uRes) / uRes.y;
  vec3 ww = normalize(uTa - uRo);
  vec3 uu = normalize(cross(ww, vec3(0, 1, 0)));
  vec3 vv = cross(uu, ww);
  float fl = 1. / tan(radians(uFov) * .5);
  vec3 rd = normalize(uv.x * uu + uv.y * vv + fl * ww);
  vec3 ro = uRo;
  vec3 col;
  float ts;
  bool sea = traceSea(ro, rd, ts);
  float tl; int w = 0;
  bool land = traceLand(ro, rd, sea ? ts : 20000., tl, w);
  if (land && (!sea || tl < ts)){ col = shadeLand(ro, rd, tl, w); col = applyFog(col, ro, rd, tl); }
  else if (sea){ col = shadeSea(ro, rd, ts); col = applyFog(col, ro, rd, ts); }
  else { vec3 sc = skyCol(rd, true); col = mix(applyFog(sc, ro, rd, 9000.), sc, smoothstep(.0, .35, rd.y)); }
  fragColor = vec4(grade(col, gl_FragCoord.xy), 1.);
}`
