// Extracted verbatim from the Entoptic Cemetery prototype. Do not "clean up"
// or reformat the GLSL here — every constant and term was tuned by eye in
// the original, and this file exists specifically so the math stays
// byte-for-byte what was verified working there.

export const vertexSrc = `
attribute vec2 position;
void main(){ gl_Position = vec4(position, 0.0, 1.0); }
`;

export const fieldFragmentSrc = `
precision mediump float;
uniform vec2 resolution;
uniform vec2 pointer;
uniform vec2 uCameraOffset;
uniform float time;
uniform float uSeed;
uniform float uSplit;
uniform float uChaos;
uniform float uLurk;
uniform float uBgBright;
uniform float uBgSat;
uniform float uBgContrast;
uniform vec4 uRipples[4];
uniform int uRippleCount;
uniform vec4 sources[24];
uniform int sourceCount;
uniform vec3 uFlyerLens[6];
uniform int uFlyerCount;

float hash(vec2 p){
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 19.19);
  return fract(p.x * p.y);
}
float noise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p);
  f = f*f*(3.0-2.0*f);
  return mix(
    mix(hash(i), hash(i+vec2(1.0,0.0)), f.x),
    mix(hash(i+vec2(0.0,1.0)), hash(i+vec2(1.0)), f.x),
    f.y
  );
}
float fbm(vec2 p){
  float v = 0.0; float a = 0.5;
  for(int i=0;i<3;i++){ v += noise(p)*a; p = p*2.03 + 17.3; a*=0.5; }
  return v;
}
mat2 rot(float a){ float s=sin(a), c=cos(a); return mat2(c,-s,s,c); }

float sdSegment(vec2 p, vec2 a, vec2 b){
  vec2 pa = p-a, ba = b-a;
  float h = clamp(dot(pa,ba)/max(dot(ba,ba),1e-5), 0.0, 1.0);
  return length(pa - ba*h);
}

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5*resolution) / resolution.y;
  uv += uCameraOffset;
  float t = time * 0.20;
  float seedA = fract(uSeed * 0.0001) * 6.2831;
  float seedB = fract(uSeed * 0.00037) * 6.2831;
  float driftA = seedA + time*0.0065 + 0.6*sin(time*0.0091 + seedB);
  float driftB = seedB - time*0.0048 + 0.5*sin(time*0.0067 + seedA*1.3);

  float glitchPeriod = 3.4 + 4.2 * fract(uSeed*0.00029 + 0.5);
  float gPhase = time / glitchPeriod;
  float gCell = floor(gPhase);
  float gFrac = fract(gPhase);
  vec2 gHcell = vec2(gCell*9.13 + uSeed*0.00007, gCell*5.77 - uSeed*0.00011);
  float gBurst = step(0.4, hash(gHcell));
  float gEnv = smoothstep(0.0,0.04,gFrac) * (1.0 - smoothstep(0.09,0.20,gFrac));
  float glitchActive = gBurst * gEnv;

  float bandY = floor(gl_FragCoord.y / 10.0);
  float bandNoise = hash(vec2(bandY, gCell*3.0 + uSeed*0.0002)) - 0.5;
  uv.x += bandNoise * glitchActive * 0.10;
  uv.y += (hash(vec2(gCell, 4.2))-0.5) * glitchActive * 0.02;

  float stripeBand = floor(gl_FragCoord.y / 24.0);
  float sbSeed  = hash(vec2(stripeBand*7.31 + 11.0, uSeed*0.00004));
  float sbSeed2 = hash(vec2(stripeBand*3.19 + 41.0, uSeed*0.00006));
  float sbSeed3 = hash(vec2(stripeBand*5.53 + 71.0, uSeed*0.00003));
  float stripeDrift =
      sin(time*(0.028 + sbSeed*0.09)  + stripeBand*4.13 + sbSeed3*6.28) * 0.065 +
      sin(time*(0.009 + sbSeed2*0.03) + stripeBand*1.71 + sbSeed*6.28)  * 0.035;
  uv.x += stripeDrift;
  uv.y += stripeDrift * 0.12 * (sbSeed2-0.5);

  vec2 pd = pointer / resolution.y - uv;
  float pm = exp(-dot(pd,pd) * 5.5);
  uv += pd * pm * 0.14;

  for(int i=0;i<6;i++){
    if(i >= uFlyerCount) break;
    vec2 fd = uFlyerLens[i].xy - uv;
    float fm = exp(-dot(fd,fd) * 7.0) * uFlyerLens[i].z;
    uv += fd * fm * 0.09;
  }

  vec2 rawUv = uv;

  float lurkPeriod = 7.0 + 5.0 * fract(uSeed * 0.00013);
  float lurkPhase = time / lurkPeriod;
  float lcell = floor(lurkPhase);
  float lfrac = fract(lurkPhase);
  vec2 hcell = vec2(lcell*13.17 + uSeed*0.0001, lcell*7.31 - uSeed*0.00023);
  float spawnRoll = hash(hcell);
  float envelope = smoothstep(0.0,0.16,lfrac) * (1.0 - smoothstep(0.5,1.0,lfrac));
  float lurkActive = step(0.5, spawnRoll) * envelope * uLurk;
  vec2 lurkCenter = (vec2(hash(hcell+11.1), hash(hcell+53.7)) * 2.0 - 1.0) * 0.4;

  if(lurkActive > 0.001){
    vec2 toL = uv - lurkCenter;
    float distL = length(toL);
    float swirl = lurkActive * exp(-distL*4.5) * 1.3;
    float ang = atan(toL.y, toL.x) + swirl;
    uv = lurkCenter + vec2(cos(ang), sin(ang)) * distL;
  }

  float chaosVal = uChaos + 0.30*sin(time*0.045 + driftA) + 0.14*sin(time*0.0117 + driftB*1.3);
  float splitVal = uSplit + 0.16*sin(time*0.031 + driftB + 1.7) + 0.08*sin(time*0.0086 + driftA*0.7);

  vec2 q = uv;
  float chaos = 0.35 + chaosVal * 0.9;
  for(int i=0;i<3;i++){
    q = abs(q) - vec2(0.19 + 0.035*sin(t+driftA), 0.14 + 0.02*cos(t*0.6+driftB));
    q *= rot(0.42*chaos + 0.14*sin(t*0.7 + float(i) + driftA));
    q += 0.055 * vec2( sin(q.y*7.0 + t + driftB), cos(q.x*7.0 - t*1.17 + driftA) );
  }

  float radial = length(q);
  float angular = atan(q.y, q.x);

  float p1 = sin(radial*43.0 - t*2.2 + angular*7.0 + driftA);
  float p2 = sin(radial*39.0 + t*1.6 - angular*7.0 + 1.5708 + driftB);
  float interference = p1 * p2;

  float filaments = sin(q.x*58.0 + sin(q.y*21.0 + t)*3.0 + fbm(q*2.4 + driftA*0.1)*7.0);
  filaments *= sin(q.y*47.0 - t*1.3);

  float waves = 0.0;
  for(int i=0;i<24;i++){
    if(i >= sourceCount) break;
    vec2 d = uv - sources[i].xy;
    float dist = length(d);
    waves += sin(dist*50.0 - sources[i].w) * exp(-dist*7.5) * sources[i].z;
  }

  float structure =
      pow(abs(interference), 1.8) * 0.62 +
      pow(abs(filaments), 5.0) * 0.24 +
      abs(waves) * 0.20;

  float splitBoost = splitVal * (1.0 + glitchActive*2.6);
  float split = (0.006 + splitBoost*0.032) + pm*0.02;
  float r = structure + 0.16*sin(t*2.1 + angular*5.0 + split*40.0);
  float grn = abs(interference + split*22.0*sin(angular*3.0 + t));
  float b = structure + 0.16*cos(t*1.7 - angular*6.0 - split*40.0);

  vec3 magenta = vec3(0.62, 0.14, 0.34);
  vec3 cyan    = vec3(0.12, 0.52, 0.46);
  vec3 violet  = vec3(0.19, 0.13, 0.32);
  vec3 voidCol = vec3(0.022, 0.013, 0.041);

  vec3 col = vec3(0.0);
  col += magenta * clamp(r*0.8 + grn*0.14, 0.0, 1.0);
  col += cyan    * clamp(b*0.8 + grn*0.18, 0.0, 1.0);
  col += violet  * clamp(structure*0.9, 0.0, 1.0);

  vec3 luminous = voidCol + col * 0.38;
  luminous *= 0.72 + 0.20*sin(t*0.31 + seedA + vec3(0.0, 2.1, 4.2));

  if(lurkActive > 0.001){
    vec2 lp = rawUv - lurkCenter;
    vec2 primary = normalize(-lurkCenter + vec2(0.0001));
    float baseAng = atan(primary.y, primary.x);
    float reach = 0.35 + 0.85*envelope;
    float legField = 1.0;
    for(int li=0; li<6; li++){
      float fi = float(li);
      float spread = (hash(hcell+fi*2.1) - 0.5) * 1.3;
      float a0 = baseAng + spread;
      float curl = 0.5 + 0.9*envelope + hash(hcell+fi*3.7)*0.4;
      float len1 = (0.05 + hash(hcell+fi*3.3)*0.035) * reach;
      float len2 = (0.045 + hash(hcell+fi*4.4)*0.03) * reach;
      float len3 = (0.035 + hash(hcell+fi*5.1)*0.025) * reach;
      vec2 j0 = vec2(0.0);
      vec2 d1 = vec2(cos(a0), sin(a0));
      vec2 j1 = d1*len1;
      vec2 d2 = vec2(cos(a0+curl*0.6), sin(a0+curl*0.6));
      vec2 j2 = j1 + d2*len2;
      vec2 d3 = vec2(cos(a0+curl*1.3), sin(a0+curl*1.3));
      vec2 tip = j2 + d3*len3;
      float d = min(min(sdSegment(lp, j0, j1), sdSegment(lp, j1, j2)), sdSegment(lp, j2, tip));
      legField = min(legField, d);
    }
    float legLine = smoothstep(0.0055, 0.0, legField);
    float legAlpha = legLine * lurkActive * 0.55;
    luminous = mix(luminous, luminous*0.18, legAlpha);
    luminous -= vec3(0.02,0.015,0.03) * legAlpha;
    luminous += vec3(0.05,0.07,0.09) * legLine * lurkActive * 0.12;

    float ringR = 0.035 + 0.1*envelope;
    float ring = smoothstep(0.01,0.0, abs(distance(rawUv,lurkCenter) - ringR));
    luminous += vec3(0.05,0.09,0.11) * ring * lurkActive * 0.35;
  }

  float idleFlicker = hash(vec2(floor(time*22.0), 3.7));
  luminous *= 0.95 + 0.05*idleFlicker;
  luminous *= mix(1.0, 0.35+0.5*hash(vec2(floor(time*34.0),1.0)), glitchActive*0.8);

  for(int i=0;i<4;i++){
    if(i >= uRippleCount) break;
    vec2 rp = uRipples[i].xy;
    float age = uRipples[i].z;
    float amp = uRipples[i].w;
    float dist = length(rawUv - rp);
    float ringR = age * 1.2;
    float ringW = 0.045 + age*0.07;
    float ring = exp(-pow((dist-ringR)/ringW, 2.0)) * (1.0-age) * amp;
    luminous += vec3(0.62, 0.56, 0.78) * ring * 1.4;
  }

  luminous *= uBgBright;
  float bgLum = dot(luminous, vec3(0.299, 0.587, 0.114));
  luminous = mix(vec3(bgLum), luminous, uBgSat);
  luminous = (luminous - 0.5) * uBgContrast + 0.5;

  gl_FragColor = vec4(luminous, 1.0);
}
`;

// Foreground overlay: TV static snow. Ported here 1:1 for step 1 parity —
// step 4 of the migration plan replaces this WebGL pass with a CSS tiled
// texture and deletes the canvas that uses it, but until that step lands
// this needs to exist and behave exactly like the prototype's.
export const overlayFragmentSrc = `
precision mediump float;
uniform float time;
uniform float uStaticAmt;
uniform float uStaticSpeed;

float hash(vec2 p){
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 19.19);
  return fract(p.x * p.y);
}

void main(){
  vec2 snowCell = floor(gl_FragCoord.xy * 0.7);
  float snowStep = floor(time * (4.0 + uStaticSpeed*56.0));
  float snowVal = hash(snowCell + vec2(snowStep*1.37, snowStep*0.71));
  float snowA = uStaticAmt * 0.55;

  gl_FragColor = vec4(vec3(snowVal), snowA);
}
`;
