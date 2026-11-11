/*
Copyright (c) 2026, Volodymyr Agafonkin
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are
permitted provided that the following conditions are met:

   1. Redistributions of source code must retain the above copyright notice, this list of
      conditions and the following disclaimer.

   2. Redistributions in binary form must reproduce the above copyright notice, this list
      of conditions and the following disclaimer in the documentation and/or other materials
      provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY
EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE
COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

*/

// ../../../../../../../Users/green/Desktop/Green/WoowaCourse/harudle/harudle-campus/node_modules/suncalc/index.js
var { PI, sin, cos, tan, asin, atan2: atan, acos, sqrt, abs, round, floor } = Math;
var rad = PI / 180;
var dayMs = 1e3 * 60 * 60 * 24;
var J1970 = 2440588;
var J2000 = 2451545;
var earthRadius = 6378.14;
function toDays(date) {
  return date.valueOf() / dayMs - 0.5 + J1970 - J2000;
}
function deltaT(d) {
  const y = 2e3 + d / 365.2425;
  let t;
  if (y < 1920) {
    t = y - 1900;
    return -2.79 + t * (1.494119 + t * (-0.0598939 + t * (61966e-7 - t * 197e-6)));
  }
  if (y < 1941) {
    t = y - 1920;
    return 21.2 + t * (0.84493 + t * (-0.0761 + t * 20936e-7));
  }
  if (y < 1961) {
    t = y - 1950;
    return 29.07 + t * (0.407 + t * (-1 / 233 + t / 2547));
  }
  if (y < 1986) {
    t = y - 1975;
    return 45.45 + t * (1.067 + t * (-1 / 260 - t / 718));
  }
  if (y < 2005) {
    t = y - 2e3;
    return 63.86 + t * (0.3345 + t * (-0.060374 + t * (17275e-7 + t * (651814e-9 + t * 2373599e-11))));
  }
  if (y < 2050) {
    t = y - 2e3;
    return 62.92 + t * (0.32217 + t * 5589e-6);
  }
  t = (y - 1820) / 100;
  return -20 + 32 * t * t - 0.5628 * (2150 - y);
}
function toDaysTT(d) {
  return d + deltaT(d) / 86400;
}
function azimuth(H, phi, dec) {
  return (atan(sin(H), cos(H) * sin(phi) - tan(dec) * cos(phi)) / rad + 540) % 360;
}
function altitude(H, phi, dec) {
  return asin(sin(phi) * sin(dec) + cos(phi) * cos(dec) * cos(H));
}
function siderealTime(d, lw) {
  return rad * (280.46061837 + 360.98564736629 * d) - lw;
}
function astroRefraction(h) {
  if (h < 0) h = 0;
  return 2967e-7 / tan(h + 312536e-8 / (h + 0.08901179));
}
function sunCoords(d) {
  const t = d / 36525;
  const L0 = rad * (280.46646 + t * (36000.76983 + t * 3032e-7));
  const M = rad * (357.52911 + t * (35999.05029 - t * 1537e-7));
  const sinM = sin(M);
  const cosM = cos(M);
  const C = rad * ((1.914602 - t * (4817e-6 + t * 14e-6)) * sinM + // equation of center
  (0.019993 - 101e-6 * t) * 2 * sinM * cosM + 289e-6 * sinM * (3 - 4 * sinM * sinM));
  const Om = rad * (125.04 - 1934.136 * t);
  const L = L0 + C - rad * (569e-5 + 478e-5 * sin(Om));
  const e = rad * (23.439291 - t * (0.0130042 + t * (16e-8 - t * 504e-9))) + rad * 256e-5 * cos(Om);
  return {
    ra: atan(cos(e) * sin(L), cos(L)),
    // 25.6
    dec: asin(sin(e) * sin(L)),
    // 25.7
    lon: L
  };
}
function getPosition(date, lat, lng) {
  const lw = rad * -lng;
  const phi = rad * lat;
  const d = toDays(date);
  const c = sunCoords(toDaysTT(d));
  const H = siderealTime(d, lw) - c.ra;
  const h = altitude(H, phi, c.dec);
  return {
    azimuth: azimuth(H, phi, c.dec),
    // apparent (refraction-corrected) altitude in degrees
    altitude: (h + astroRefraction(h)) / rad
  };
}
function nutationObliquity(t) {
  const om = rad * (125.04452 - 1934.136261 * t);
  const ls = rad * (280.4665 + 36000.7698 * t);
  const lm = rad * (218.3165 + 481267.8813 * t);
  const dpsi = (-17.2 * sin(om) - 1.32 * sin(2 * ls) - 0.23 * sin(2 * lm) + 0.21 * sin(2 * om)) / 3600;
  const deps = (9.2 * cos(om) + 0.57 * cos(2 * ls) + 0.1 * cos(2 * lm) - 0.09 * cos(2 * om)) / 3600;
  const eps0 = 23.439291 - t * (0.0130042 + t * (16e-8 - t * 504e-9));
  return { dpsi, eps: rad * (eps0 + deps) };
}
var moonLon = new Int32Array([
  0,
  0,
  1,
  0,
  6288774,
  -20905355,
  2,
  0,
  -1,
  0,
  1274027,
  -3699111,
  2,
  0,
  0,
  0,
  658314,
  -2955968,
  0,
  0,
  2,
  0,
  213618,
  -569925,
  0,
  1,
  0,
  0,
  -185116,
  48888,
  0,
  0,
  0,
  2,
  -114332,
  -3149,
  2,
  0,
  -2,
  0,
  58793,
  246158,
  2,
  -1,
  -1,
  0,
  57066,
  -152138,
  2,
  0,
  1,
  0,
  53322,
  -170733,
  2,
  -1,
  0,
  0,
  45758,
  -204586,
  0,
  1,
  -1,
  0,
  -40923,
  -129620,
  1,
  0,
  0,
  0,
  -34720,
  108743,
  0,
  1,
  1,
  0,
  -30383,
  104755,
  2,
  0,
  0,
  -2,
  15327,
  10321,
  0,
  0,
  1,
  2,
  -12528,
  0,
  0,
  0,
  1,
  -2,
  10980,
  79661,
  4,
  0,
  -1,
  0,
  10675,
  -34782,
  0,
  0,
  3,
  0,
  10034,
  -23210,
  4,
  0,
  -2,
  0,
  8548,
  -21636,
  2,
  1,
  -1,
  0,
  -7888,
  24208,
  2,
  1,
  0,
  0,
  -6766,
  30824,
  1,
  0,
  -1,
  0,
  -5163,
  -8379,
  1,
  1,
  0,
  0,
  4987,
  -16675,
  2,
  -1,
  1,
  0,
  4036,
  -12831,
  2,
  0,
  2,
  0,
  3994,
  -10445,
  4,
  0,
  0,
  0,
  3861,
  -11650,
  2,
  0,
  -3,
  0,
  3665,
  14403,
  0,
  1,
  -2,
  0,
  -2689,
  -7003,
  2,
  0,
  -1,
  2,
  -2602,
  0,
  2,
  -1,
  -2,
  0,
  2390,
  10056,
  1,
  0,
  1,
  0,
  -2348,
  6322,
  2,
  -2,
  0,
  0,
  2236,
  -9884,
  0,
  1,
  2,
  0,
  -2120,
  5751,
  0,
  2,
  0,
  0,
  -2069,
  0,
  2,
  -2,
  -1,
  0,
  2048,
  -4950,
  2,
  0,
  1,
  -2,
  -1773,
  4130,
  2,
  0,
  0,
  2,
  -1595,
  0,
  4,
  -1,
  -1,
  0,
  1215,
  -3958,
  0,
  0,
  2,
  2,
  -1110,
  0,
  3,
  0,
  -1,
  0,
  -892,
  3258,
  2,
  1,
  1,
  0,
  -810,
  2616,
  4,
  -1,
  -2,
  0,
  759,
  -1897,
  0,
  2,
  -1,
  0,
  -713,
  -2117,
  2,
  2,
  -1,
  0,
  -700,
  2354,
  2,
  1,
  -2,
  0,
  691,
  0,
  2,
  -1,
  0,
  -2,
  596,
  0,
  4,
  0,
  1,
  0,
  549,
  -1423,
  0,
  0,
  4,
  0,
  537,
  -1117,
  4,
  -1,
  0,
  0,
  520,
  -1571,
  1,
  0,
  -2,
  0,
  -487,
  -1739,
  2,
  1,
  0,
  -2,
  -399,
  0,
  0,
  0,
  2,
  -2,
  -381,
  -4421,
  1,
  1,
  1,
  0,
  351,
  0,
  3,
  0,
  -2,
  0,
  -340,
  0,
  4,
  0,
  -3,
  0,
  330,
  0,
  2,
  -1,
  2,
  0,
  327,
  0,
  0,
  2,
  1,
  0,
  -323,
  1165,
  1,
  1,
  -1,
  0,
  299,
  0,
  2,
  0,
  3,
  0,
  294,
  0,
  2,
  0,
  -1,
  -2,
  0,
  8752
]);
var moonLat = new Int32Array([
  0,
  0,
  0,
  1,
  5128122,
  0,
  0,
  1,
  1,
  280602,
  0,
  0,
  1,
  -1,
  277693,
  2,
  0,
  0,
  -1,
  173237,
  2,
  0,
  -1,
  1,
  55413,
  2,
  0,
  -1,
  -1,
  46271,
  2,
  0,
  0,
  1,
  32573,
  0,
  0,
  2,
  1,
  17198,
  2,
  0,
  1,
  -1,
  9266,
  0,
  0,
  2,
  -1,
  8822,
  2,
  -1,
  0,
  -1,
  8216,
  2,
  0,
  -2,
  -1,
  4324,
  2,
  0,
  1,
  1,
  4200,
  2,
  1,
  0,
  -1,
  -3359,
  2,
  -1,
  -1,
  1,
  2463,
  2,
  -1,
  0,
  1,
  2211,
  2,
  -1,
  -1,
  -1,
  2065,
  0,
  1,
  -1,
  -1,
  -1870,
  4,
  0,
  -1,
  -1,
  1828,
  0,
  1,
  0,
  1,
  -1794,
  0,
  0,
  0,
  3,
  -1749,
  0,
  1,
  -1,
  1,
  -1565,
  1,
  0,
  0,
  1,
  -1491,
  0,
  1,
  1,
  1,
  -1475,
  0,
  1,
  1,
  -1,
  -1410,
  0,
  1,
  0,
  -1,
  -1344,
  1,
  0,
  0,
  -1,
  -1335,
  0,
  0,
  3,
  1,
  1107,
  4,
  0,
  0,
  -1,
  1021,
  4,
  0,
  -1,
  1,
  833,
  0,
  0,
  1,
  -3,
  777,
  4,
  0,
  -2,
  1,
  671,
  2,
  0,
  0,
  -3,
  607,
  2,
  0,
  2,
  -1,
  596,
  2,
  -1,
  1,
  -1,
  491,
  2,
  0,
  -2,
  1,
  -451,
  0,
  0,
  3,
  -1,
  439,
  2,
  0,
  2,
  1,
  422,
  2,
  0,
  -3,
  -1,
  421,
  2,
  1,
  -1,
  1,
  -366,
  2,
  1,
  0,
  1,
  -351,
  4,
  0,
  0,
  1,
  331,
  2,
  -1,
  1,
  1,
  315,
  2,
  -2,
  0,
  -1,
  302,
  0,
  0,
  1,
  3,
  -283,
  2,
  1,
  1,
  -1,
  -229,
  1,
  1,
  0,
  -1,
  223,
  1,
  1,
  0,
  1,
  223,
  0,
  1,
  -2,
  -1,
  -220,
  2,
  1,
  -1,
  -1,
  -220,
  1,
  0,
  1,
  1,
  -185,
  2,
  -1,
  -2,
  -1,
  181,
  0,
  1,
  2,
  1,
  -177,
  4,
  0,
  -2,
  -1,
  176,
  4,
  -1,
  -1,
  -1,
  166,
  1,
  0,
  1,
  -1,
  -164,
  4,
  0,
  1,
  -1,
  132,
  1,
  0,
  -1,
  -1,
  -119,
  4,
  -1,
  0,
  -1,
  115,
  2,
  -2,
  0,
  1,
  107
]);
function moonCoords(d) {
  const t = d / 36525;
  const Lp = 218.3164477 + t * (481267.88123421 + t * (-15786e-7 + t * (1 / 538841 - t / 65194e3)));
  const D = 297.8501921 + t * (445267.1114034 + t * (-18819e-7 + t * (1 / 545868 - t / 113065e3)));
  const M = 357.5291092 + t * (35999.0502909 + t * (-1536e-7 + t / 2449e4));
  const Mp = 134.9633964 + t * (477198.8675055 + t * (87414e-7 + t * (1 / 69699 - t / 14712e3)));
  const F = 93.272095 + t * (483202.0175233 + t * (-36539e-7 + t * (-1 / 3526e3 + t / 86331e4)));
  const A1 = 119.75 + 131.849 * t;
  const A2 = 53.09 + 479264.29 * t;
  const A3 = 313.45 + 481266.484 * t;
  const E = 1 - t * (2516e-6 + t * 74e-7);
  const Dr = rad * D, Mr = rad * M, Mpr = rad * Mp, Fr = rad * F;
  let sl = 0, sr = 0, sb = 0;
  for (let i = 0; i < moonLon.length; i += 6) {
    const m = moonLon[i + 1];
    const arg = moonLon[i] * Dr + m * Mr + moonLon[i + 2] * Mpr + moonLon[i + 3] * Fr;
    const f = m === 1 || m === -1 ? E : m === 2 || m === -2 ? E * E : 1;
    sl += moonLon[i + 4] * f * sin(arg);
    sr += moonLon[i + 5] * f * cos(arg);
  }
  for (let i = 0; i < moonLat.length; i += 5) {
    const m = moonLat[i + 1];
    const arg = moonLat[i] * Dr + m * Mr + moonLat[i + 2] * Mpr + moonLat[i + 3] * Fr;
    const f = m === 1 || m === -1 ? E : m === 2 || m === -2 ? E * E : 1;
    sb += moonLat[i + 4] * f * sin(arg);
  }
  const A1r = rad * A1, Lpr = rad * Lp;
  sl += 3958 * sin(A1r) + 1962 * sin(Lpr - Fr) + 318 * sin(rad * A2);
  sb += -2235 * sin(Lpr) + 382 * sin(rad * A3) + 175 * sin(A1r - Fr) + 175 * sin(A1r + Fr) + 127 * sin(Lpr - Mpr) - 115 * sin(Lpr + Mpr);
  const { dpsi, eps } = nutationObliquity(t);
  const l = rad * (Lp + sl / 1e6 + dpsi);
  const b = rad * (sb / 1e6);
  return {
    ra: atan(sin(l) * cos(eps) - tan(b) * sin(eps), cos(l)),
    // 13.3
    dec: asin(sin(b) * cos(eps) + cos(b) * sin(eps) * sin(l)),
    // 13.4
    dist: 385000.56 + sr / 1e3,
    // distance to the Moon in km
    lon: l
  };
}
function getMoonPosition(date, lat, lng) {
  const lw = rad * -lng;
  const phi = rad * lat;
  const d = toDays(date);
  const c = moonCoords(toDaysTT(d));
  const H = siderealTime(d, lw) - c.ra;
  const hGeo = altitude(H, phi, c.dec);
  const h = hGeo - asin(earthRadius / c.dist * cos(hGeo));
  const pa = atan(sin(H), tan(phi) * cos(c.dec) - sin(c.dec) * cos(H));
  return {
    azimuth: azimuth(H, phi, c.dec),
    // apparent (refraction-corrected) altitude in degrees
    altitude: (h + astroRefraction(h)) / rad,
    distance: c.dist,
    parallacticAngle: pa / rad
  };
}
function getMoonIllumination(date = /* @__PURE__ */ new Date()) {
  const d = toDaysTT(toDays(date));
  const s = sunCoords(d);
  const m = moonCoords(d);
  const sdist = 149598e3;
  const phi = acos(sin(s.dec) * sin(m.dec) + cos(s.dec) * cos(m.dec) * cos(s.ra - m.ra));
  const inc = atan(sdist * sin(phi), m.dist - sdist * cos(phi));
  const angle = atan(cos(s.dec) * sin(s.ra - m.ra), sin(s.dec) * cos(m.dec) - cos(s.dec) * sin(m.dec) * cos(s.ra - m.ra));
  const phase = ((m.lon - s.lon) / (2 * PI) % 1 + 1) % 1;
  const waxing = phase < 0.5;
  return {
    // illuminated fraction, 0 (new) → 1 (full); reaches the exact extrema only at perfect
    // syzygy (eclipses), so a "full" moon typically peaks a hair under 1 — this is correct
    fraction: (1 + cos(inc)) / 2,
    // phase, 0 → 1: 0 new, 0.25 first quarter, 0.5 full, 0.75 last quarter (waxing for phase < 0.5)
    phase,
    // position angle of the bright limb, degrees (v2: all angles emitted in degrees) — subtract
    // getMoonPosition().parallacticAngle, also degrees, to get the zenith-relative tilt
    angle: angle / rad,
    waxing
    // true while the Moon is waxing (new → full), false while waning (full → new)
  };
}

// src/engine/solar.ts
var LATITUDE = 37.4064;
var LONGITUDE = 127.0888;
var RAD = Math.PI / 180;
var smooth = (a, b, x) => {
  const v = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return v * v * (3 - 2 * v);
};
function campusSun(time) {
  const position = getPosition(new Date(time), LATITUDE, LONGITUDE);
  const altitude2 = position.altitude * RAD, azimuth2 = position.azimuth * RAD;
  const horizontal = Math.cos(altitude2);
  return {
    altitude: altitude2,
    x: Math.sin(azimuth2) * horizontal,
    y: Math.sin(altitude2),
    z: -Math.cos(azimuth2) * horizontal,
    daylight: smooth(-0.1, 0.18, altitude2),
    twilight: smooth(-0.16, -0.01, altitude2) * (1 - smooth(0.03, 0.24, altitude2))
  };
}
function campusMoon(time) {
  const date = new Date(time), position = getMoonPosition(date, LATITUDE, LONGITUDE), light = getMoonIllumination(date);
  const altitude2 = position.altitude * RAD, azimuth2 = position.azimuth * RAD, horizontal = Math.cos(altitude2);
  return {
    x: Math.sin(azimuth2) * horizontal,
    y: Math.sin(altitude2),
    z: -Math.cos(azimuth2) * horizontal,
    fraction: light.fraction,
    tilt: (light.angle - position.parallacticAngle) * RAD
  };
}
export {
  campusMoon,
  campusSun
};
