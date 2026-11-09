// 실제 교통 정보가 아닌, 도로 위에 보일 적은 수의 차량을 위한 위치 계산이다.
export function trafficPosition(road, phase, velocity, lane, elapsed, result = {}) {
  const span = road.length - 24;
  const distance = ((phase + velocity * elapsed + span / 2) % span + span) % span - span / 2;
  const c = Math.cos(road.angle), s = Math.sin(road.angle);
  result.x = road.x + distance * c + lane * s;
  result.z = road.z - distance * s + lane * c;
  result.angle = road.angle + (velocity < 0 ? Math.PI : 0);
  // 되돌아가는 부분은 도로의 먼 끝에서 잠깐 감춘다.
  result.visible = Math.abs(distance) < span / 2 - 10;
  return result;
}
