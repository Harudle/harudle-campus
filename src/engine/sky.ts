import * as THREE from "three";

// 카메라를 둘러싼 하늘은 창문 너머에만 그려진다. 해의 방향은 실제 판교 시간으로 계산한다.
export function createSky(scene: THREE.Scene, camera: THREE.Camera) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      daylight: { value: 0 },
      twilight: { value: 0 },
      clouds: { value: 0 },
      sunDirection: { value: new THREE.Vector3(0, -1, 0) },
      nightTop: { value: new THREE.Color(0x0B1738) },
      nightHorizon: { value: new THREE.Color(0x263859) },
      dayTop: { value: new THREE.Color(0x75B6E5) },
      dayHorizon: { value: new THREE.Color(0xC9E5F1) },
      sunset: { value: new THREE.Color(0xF9A477) },
      sunsetUpper: { value: new THREE.Color(0xD49EC3) },
      overcastNight: { value: new THREE.Color(0x303B50) },
      overcastDay: { value: new THREE.Color(0xAFBDC8) },
      sunColor: { value: new THREE.Color(0xFFF2C2) },
      sunWarm: { value: new THREE.Color(0xFFBA75) },
    },
    vertexShader: `
      varying vec3 skyDirection;
      void main() {
        skyDirection = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 skyDirection;
      uniform float daylight;
      uniform float twilight;
      uniform float clouds;
      uniform vec3 sunDirection;
      uniform vec3 nightTop;
      uniform vec3 nightHorizon;
      uniform vec3 dayTop;
      uniform vec3 dayHorizon;
      uniform vec3 sunset;
      uniform vec3 sunsetUpper;
      uniform vec3 overcastNight;
      uniform vec3 overcastDay;
      uniform vec3 sunColor;
      uniform vec3 sunWarm;
      void main() {
        vec3 direction = normalize(skyDirection);
        vec3 sun = normalize(sunDirection);
        float height = smoothstep(-0.08, 0.62, direction.y);
        vec2 directionH = normalize(direction.xz + vec2(0.00001));
        vec2 sunH = normalize(sun.xz + vec2(0.00001));
        float towardSun = pow(max(dot(directionH, sunH), 0.0), 2.0);
        float sunsetStrength = twilight * (1.0 - clouds * 0.65);
        vec3 horizon = mix(nightHorizon, dayHorizon, daylight);
        horizon = mix(horizon, sunset, sunsetStrength * (0.35 + towardSun * 0.6));
        vec3 top = mix(nightTop, dayTop, daylight);
        top = mix(top, sunsetUpper, sunsetStrength * 0.28);
        vec3 color = mix(horizon, top, height);
        color = mix(color, mix(overcastNight, overcastDay, daylight), clouds * 0.58);

        float alignment = max(dot(direction, sun), 0.0);
        float aboveHorizon = smoothstep(-0.018, 0.01, direction.y);
        float sunVisible = smoothstep(-0.03, 0.035, sun.y) * (1.0 - clouds * 0.94);
        float glow = pow(alignment, 48.0) * sunVisible * aboveHorizon;
        float disc = smoothstep(0.9986, 0.9991, alignment) * sunVisible * aboveHorizon;
        vec3 light = mix(sunColor, sunWarm, twilight * 0.8);
        color = mix(color, light, clamp(glow * 0.22 + disc, 0.0, 1.0));
        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    side: THREE.BackSide,
    depthTest: false,
    depthWrite: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(250, 40, 24), material);
  dome.renderOrder = -1000;
  dome.frustumCulled = false;
  scene.add(dome);

  return (daylight: number, twilight: number, clouds: number, sunDirection: THREE.Vector3) => {
    dome.position.copy(camera.position);
    material.uniforms.daylight.value = daylight;
    material.uniforms.twilight.value = twilight;
    material.uniforms.clouds.value = clouds;
    material.uniforms.sunDirection.value.copy(sunDirection);
  };
}
