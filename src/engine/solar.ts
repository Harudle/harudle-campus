import { getPosition } from "suncalc";

// 우아한테크코스 판교 캠퍼스 근처. x는 동쪽, z는 남쪽이다.
const LATITUDE = 37.4064, LONGITUDE = 127.0888;
const RAD = Math.PI / 180;
const smooth = (a: number, b: number, x: number) => {
  const v = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return v * v * (3 - 2 * v);
};

export function campusSun(time: number) {
  const position = getPosition(new Date(time), LATITUDE, LONGITUDE);
  // SunCalc 2는 북쪽부터 시계 방향의 각도를 도(degree)로 돌려준다.
  const altitude = position.altitude * RAD, azimuth = position.azimuth * RAD;
  const horizontal = Math.cos(altitude);
  return {
    altitude,
    x: Math.sin(azimuth) * horizontal,
    y: Math.sin(altitude),
    z: -Math.cos(azimuth) * horizontal,
    daylight: smooth(-.10, .18, altitude),
    twilight: smooth(-.16, -.01, altitude) * (1 - smooth(.03, .24, altitude)),
  };
}
