// 대결 종목이 같이 쓰는 종이 AK-47(사격 대결 · 과녁 사격): FPS처럼
// 선수는 1인칭만 · 누르고 있으면 연사(왼쪽 클릭 · F) · 쏠 때 반동 · 탄창 20발(R · 다 쓰면 저절로 2.2초 장전, 장전 모션)
// 오른쪽 클릭을 누르고 있으면 가늠자 조준(화면이 당겨지고 총이 가운데로, 느리게 걷고 반동이 줄어든다. 장전 중엔 풀린다)
// 총 모양 · 총알 빠르기는 관전자 화면에도 같게 둔다. 화면 아래 오른쪽에 남은 탄(선수만)
import type { DuelCtx } from "../client";
import { SHOOT } from "../arena/shoot.mjs";

export type AK = {
  tick(on: boolean, canShoot: boolean, walk: number): void   // on: 경기 중(조준 · 장전 동작) · canShoot: 지금 쏴도 되나 · walk: 조준 안 할 때 걷기 빠르기 배수
  key(e: KeyboardEvent, on: boolean): boolean                 // F(누르고 있으면 연사) · R(장전). true면 엔진 기본 동작을 막는다
  pointer(e: MouseEvent, on: boolean): boolean                // 왼쪽(연사) · 오른쪽(조준) 버튼
  refill(): void                                              // 탄창 가득(라운드가 바뀔 때)
  stop(): void
};

export function mountAK(ctx: DuelCtx): AK {
  const mine = ctx.mine;
  ctx.gun("ak"); ctx.bulletSpeed(SHOOT.SPEED * 1.25);
  if (mine) { ctx.view("first"); ctx.fireGap(SHOOT.FIRE); document.body.classList.add("duelFps"); }
  let ammo = SHOOT.MAG, reloadAt = 0, firing = false, aiming = false, shown = "";
  const el = document.createElement("div"); el.className = "akAmmo"; if (mine) document.body.append(el);
  const reload = () => { if (reloadAt || ammo >= SHOOT.MAG) return; reloadAt = performance.now() + SHOOT.RELOAD; };
  if (mine) ctx.onFire(() => { ammo = Math.max(0, ammo - 1); ctx.recoil((.012 + Math.random() * .008) * (aiming && !reloadAt ? .55 : 1)); if (!ammo) reload(); });   // 반동: 연사하면 조금씩 위로 뜬다(조준하면 덜)
  function paint() {
    const rl = reloadAt ? Math.min(1, 1 - (reloadAt - performance.now()) / SHOOT.RELOAD) : -1;
    const html = `<span class="sa${ammo <= 5 && !reloadAt ? " low" : ""}">${reloadAt ? `<em>장전 중</em><span class="rl"><b style="width:${Math.round(rl * 100)}%"></b></span>` : `<b>${ammo}</b><small>/ ${SHOOT.MAG}</small>${ammo > 0 && ammo <= 5 ? "<em>R 장전</em>" : ""}`}</span>`;
    if (html !== shown) { shown = html; el.innerHTML = html; }
  }
  return {
    tick(on, canShoot, walk) {
      if (!mine) return;
      if (reloadAt && performance.now() >= reloadAt) { reloadAt = 0; ammo = SHOOT.MAG; }
      ctx.reloading(reloadAt ? 1 - (reloadAt - performance.now()) / SHOOT.RELOAD : null);   // 장전 동작
      const ads = aiming && !reloadAt && on; ctx.ads(ads); document.body.classList.toggle("ads", ads);
      const ok = canShoot && ammo > 0 && !reloadAt; ctx.canFire(ok);
      if (firing && ok) ctx.fire();   // 누르고 있는 동안 연사(간격은 엔진이 지킨다)
      ctx.speed(ads ? .4 : walk);
      paint();
    },
    key(e, on) {
      if (!mine || !on) return false;
      if (e.code === "KeyF") { firing = e.type === "keydown"; return true; }   // F도 누르고 있으면 연사(엔진의 한 발 쏘기 대신)
      if (e.code === "KeyR") { if (e.type === "keydown") reload(); return true; }
      return false;
    },
    pointer(e, on) {
      if (!mine || !on || (e.button !== 0 && e.button !== 2)) return false;
      if (e.button === 2) aiming = e.type === "mousedown"; else firing = e.type === "mousedown";
      return true;
    },
    refill() { ammo = SHOOT.MAG; reloadAt = 0; firing = false; aiming = false; },
    stop() {
      el.remove(); document.body.classList.remove("duelFps", "ads");
      ctx.ads(false); ctx.reloading(null); ctx.view(null); ctx.gun(null); ctx.fireGap(250); ctx.bulletSpeed(0);
    },
  };
}
