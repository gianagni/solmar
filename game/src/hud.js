// Solmar — the HUD: health, money, wanted stars, objective, speed, the
// weapon-slot bar, toasts, mission banners, the 2D minimap, and the
// start / pause / BUSTED / WASTED screens.
export function initHud(G) {
  const $ = (id) => document.getElementById(id);
  const el = {
    hud: $('hud'),
    healthFill: $('health-fill'),
    healthNum: $('health-num'),
    money: $('money'),
    stars: $('stars'),
    objective: $('objective'),
    speed: $('speed'),
    slots: [ $('slot-0'), $('slot-1'), $('slot-2') ],
    map: $('minimap'),
    toast: $('toast'),
    banner: $('banner'),
    bannerTitle: $('banner-title'),
    bannerSub: $('banner-sub'),
    crosshair: $('crosshair'),
    damage: $('damage'),
    hint: $('hint'),
    start: $('screen-start'),
    pause: $('screen-pause'),
    busted: $('screen-busted'),
    wasted: $('screen-wasted'),
    bustedText: $('busted-text'),
    wastedText: $('wasted-text'),
    btnPlay: $('btn-play'),
    btnContinue: $('btn-continue'),
    btnResume: $('btn-resume'),
    btnBusted: $('btn-busted'),
    btnWasted: $('btn-wasted'),
  };
  const mapCtx = el.map.getContext('2d');
  let toastTimer = null;
  let bannerTimer = null;

  const H = {
    money(n) {
      el.money.textContent = '$' + Math.round(n).toLocaleString('en-US');
    },
    health(n) {
      el.healthFill.style.width = Math.max(0, Math.min(100, n)) + '%';
      el.healthNum.textContent = Math.round(n);
      el.healthFill.style.background = n > 50 ? '#58c96b' : n > 25 ? '#e8b04b' : '#d94b4b';
    },
    stars(n) {
      el.stars.textContent = '★'.repeat(n) + '☆'.repeat(Math.max(0, 5 - n));
      el.stars.style.color = n > 0 ? '#ffd24d' : '#8a8a92';
    },
    objective(text) {
      el.objective.textContent = text;
    },
    speed(kmh, driving) {
      el.speed.textContent = driving ? Math.round(kmh) + ' km/h' : '';
    },
    weaponBar(slot) {
      el.slots.forEach((s, i) => s.classList.toggle('active', i === slot));
    },
    // While driving the weapon bar and crosshair hide; on foot they show.
    driving(isDriving) {
      document.getElementById('weapons').style.display = isDriving ? 'none' : 'flex';
      el.crosshair.style.display = isDriving ? 'none' : '';
    },
    toast(msg) {
      el.toast.textContent = msg;
      el.toast.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => el.toast.classList.remove('show'), G.shot ? 6000 : 3000);
    },
    banner(title, sub) {
      el.bannerTitle.textContent = title;
      el.bannerSub.textContent = sub;
      el.banner.classList.add('show');
      clearTimeout(bannerTimer);
      // In screenshot mode the banner stays up for the shot.
      bannerTimer = setTimeout(() => el.banner.classList.remove('show'), G.shot ? 30000 : 4500);
    },
    flashDamage() {
      el.damage.classList.add('show');
      setTimeout(() => el.damage.classList.remove('show'), 180);
    },
    showScreen(kind, title, sub) {
      H.hideScreens();
      // A screen needs a free cursor: release the pointer lock the canvas
      // took while shooting, or the screen's button cannot be clicked.
      if (document.pointerLockElement) document.exitPointerLock();
      const s = el[kind];
      if (!s) return;
      const h = s.querySelector('h1');
      const p = s.querySelector('p');
      if (h) h.textContent = title;
      if (p) p.textContent = sub;
      s.classList.add('show');
      el.crosshair.style.display = 'none';
    },
    hideScreens() {
      for (const k of ['start', 'pause', 'busted', 'wasted']) el[k].classList.remove('show');
      el.crosshair.style.display = '';
    },
    drawMinimap() {
      const ctx = mapCtx;
      const W = 180;
      const s = W / 440;
      const X = (x) => (x + 220) * s;
      const Z = (z) => (z + 220) * s;
      ctx.clearRect(0, 0, W, W);
      ctx.fillStyle = '#20242e';
      ctx.fillRect(0, 0, W, W);
      // Sea on the east edge.
      ctx.fillStyle = '#2e7fa8';
      ctx.fillRect(X(200), 0, W - X(200), W);
      // Roads.
      ctx.strokeStyle = '#5a5a66';
      ctx.lineWidth = 14 * s;
      for (const l of G.city.roads) {
        ctx.beginPath(); ctx.moveTo(X(l), 0); ctx.lineTo(X(l), W); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, Z(l)); ctx.lineTo(W, Z(l)); ctx.stroke();
      }
      // Landmarks.
      ctx.fillStyle = '#8fa8b8';
      ctx.fillRect(X(-53), Z(-53), 26 * s, 26 * s); // Tower
      ctx.fillStyle = '#6b7c8c';
      ctx.fillRect(X(31), Z(34), 18 * s, 12 * s); // Garage
      ctx.fillStyle = '#b8a67e';
      ctx.fillRect(X(-130), Z(114), 20 * s, 12 * s); // Station
      ctx.fillStyle = '#4fa3c8';
      ctx.beginPath(); ctx.arc(X(0), Z(0), 5 * s, 0, Math.PI * 2); ctx.fill(); // Fountain
      ctx.strokeStyle = '#8a6f4d';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(X(185), Z(0)); ctx.lineTo(X(232), Z(0)); ctx.stroke(); // Pier
      // Mission marker.
      if (G.missionMarker && G.missionMarker.visible) {
        const mx = X(G.missionMarker.position.x);
        const mz = Z(G.missionMarker.position.z);
        ctx.fillStyle = '#ffd24d';
        ctx.beginPath();
        ctx.moveTo(mx, mz - 6); ctx.lineTo(mx + 5, mz); ctx.lineTo(mx, mz + 6); ctx.lineTo(mx - 5, mz);
        ctx.closePath(); ctx.fill();
      }
      // Roadblock.
      if (G.police.roadblock) {
        ctx.fillStyle = '#ff4444';
        ctx.fillRect(X(G.police.roadblock.x) - 4, Z(G.police.roadblock.z) - 4, 8, 8);
      }
      // Police cars and foot cops.
      ctx.fillStyle = '#5aa2ff';
      for (const car of G.cars) {
        if (car.isPolice && !car.dead) {
          ctx.beginPath(); ctx.arc(X(car.pos.x), Z(car.pos.z), 3, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.fillStyle = '#9ecfff';
      for (const cop of G.police.cops) {
        ctx.beginPath(); ctx.arc(X(cop.pos.x), Z(cop.pos.z), 2.5, 0, Math.PI * 2); ctx.fill();
      }
      // The helicopter, amber.
      if (G.police.heli) {
        ctx.fillStyle = '#ffb02e';
        ctx.beginPath(); ctx.arc(X(G.police.heli.group.position.x), Z(G.police.heli.group.position.z), 3.5, 0, Math.PI * 2); ctx.fill();
      }
      // The player, a white arrow.
      const p = G.player;
      const yaw = p.onFoot ? p.yaw : (p.car ? p.car.yaw : 0);
      ctx.save();
      ctx.translate(X(p.pos.x), Z(p.pos.z));
      ctx.rotate(Math.atan2(Math.sin(yaw), Math.cos(yaw)) * -1 + Math.PI);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(0, -6); ctx.lineTo(4.5, 5); ctx.lineTo(-4.5, 5);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    },
  };

  // Screen buttons.
  el.btnPlay.addEventListener('click', () => G.events.startGame(false));
  el.btnContinue.addEventListener('click', () => G.events.startGame(true));
  el.btnResume.addEventListener('click', () => G.events.resumeGame());
  el.btnBusted.addEventListener('click', () => G.events.afterBusted && G.events.afterBusted());
  el.btnWasted.addEventListener('click', () => G.events.afterWasted && G.events.afterWasted());

  G.hud = H;
  return H;
}
