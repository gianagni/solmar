// Solmar — the HUD: health, money, wanted stars, mission objective, speed,
// toast messages, and a live 2D minimap drawn on a canvas.

import { clamp } from './util.js';

export class HUD {
  constructor(game) {
    this.game = game;
    this.el = {
      healthFill: document.getElementById('health-fill'),
      healthText: document.getElementById('health-text'),
      money: document.getElementById('money'),
      stars: document.getElementById('stars'),
      objective: document.getElementById('objective'),
      objectiveDist: document.getElementById('objective-dist'),
      speed: document.getElementById('speed'),
      speedLabel: document.getElementById('speed-label'),
      toast: document.getElementById('toast'),
      banner: document.getElementById('banner'),
      bannerTitle: document.getElementById('banner-title'),
      bannerSub: document.getElementById('banner-sub'),
      minimap: document.getElementById('minimap'),
      damage: document.getElementById('damage'),
      hint: document.getElementById('hint'),
      weapons: document.getElementById('weapons'),
    };
    this.mapCtx = this.el.minimap.getContext('2d');
    this.toastTimer = 0;
    this.bannerTimer = 0;
    this.lastHealth = 100;
    this.weaponHtml = '';
  }

  toast(text, seconds = 3.5) {
    this.el.toast.textContent = text;
    this.el.toast.classList.add('show');
    this.toastTimer = seconds;
  }

  banner(title, sub = '', seconds = 3) {
    this.el.bannerTitle.textContent = title;
    this.el.bannerSub.textContent = sub;
    this.el.banner.classList.add('show');
    this.bannerTimer = seconds;
  }

  update(dt) {
    const g = this.game;
    const p = g.player;
    // Health.
    const hp = Math.round(p.health);
    this.el.healthFill.style.width = `${clamp(hp, 0, 100)}%`;
    this.el.healthText.textContent = `${hp}`;
    this.el.healthFill.classList.toggle('low', hp <= 30);
    // Damage flash when health drops.
    if (hp < this.lastHealth) {
      this.el.damage.classList.add('show');
      setTimeout(() => this.el.damage.classList.remove('show'), 250);
    }
    this.lastHealth = hp;
    // Money.
    this.el.money.textContent = `$${Math.floor(p.money).toLocaleString('en-US')}`;
    // Wanted stars.
    const wanted = g.police.wanted;
    let stars = '';
    for (let i = 0; i < 5; i++) stars += i < wanted ? '★' : '☆';
    this.el.stars.textContent = stars;
    this.el.stars.classList.toggle('hot', wanted > 0);
    // Objective + distance.
    const obj = g.missions.objective;
    this.el.objective.textContent = obj.text;
    if (obj.x !== null && obj.x !== undefined) {
      const d = Math.hypot(p.x - obj.x, p.z - obj.z);
      this.el.objectiveDist.textContent = `${Math.round(d)}m`;
    } else {
      this.el.objectiveDist.textContent = '';
    }
    // Mission timer.
    const tl = g.missions.timeLeft;
    if (tl !== null) {
      this.el.objectiveDist.textContent += `  ⏱ ${Math.ceil(tl)}s`;
    }
    // Speed.
    if (p.mode === 'car' && p.car) {
      const kmh = Math.abs(p.car.speed) * 3.6;
      this.el.speed.textContent = `${Math.round(kmh)}`;
      this.el.speedLabel.textContent = 'km/h';
    } else {
      this.el.speed.textContent = p.moving ? `${Math.round(p.speed * 3.6)}` : '0';
      this.el.speedLabel.textContent = 'km/h';
    }
    // Context hint (enter car / punch prompts).
    this.el.hint.textContent = g.hintText || '';
    // Weapon slots (1 pistol, 2 SMG, 3 shotgun) — only the bar's text is
    // rebuilt when the selection changes, so it never flickers.
    const html = ['Pistol', 'SMG', 'Shotgun'].map((name, i) => {
      const on = i === p.weaponIndex;
      return `<span class="slot${on ? ' on' : ''}"><b>${i + 1}</b> ${name}</span>`;
    }).join('');
    if (html !== this.weaponHtml) {
      this.weaponHtml = html;
      this.el.weapons.innerHTML = html;
    }
    this.el.weapons.classList.toggle('hidden', p.mode !== 'foot');
    // Toast / banner timers.
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.el.toast.classList.remove('show');
    }
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.el.banner.classList.remove('show');
    }
    this.drawMinimap();
  }

  drawMinimap() {
    const g = this.game;
    const ctx = this.mapCtx;
    const S = 190;
    const scale = S / 660; // world -330..330 -> canvas
    const toMap = (x, z) => [(x + 330) * scale, (z + 330) * scale];
    ctx.clearRect(0, 0, S, S);
    // Sea + land.
    ctx.fillStyle = '#20262e';
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#2e7fa8';
    const [bx] = toMap(300, 0);
    ctx.fillRect(bx, 0, S - bx, S);
    // Roads.
    ctx.strokeStyle = '#565b62';
    ctx.lineWidth = 4;
    for (const line of g.city.roadsX) {
      const [x1] = toMap(line, -330);
      ctx.beginPath(); ctx.moveTo(x1, 0); ctx.lineTo(x1, S); ctx.stroke();
      const [, z1] = toMap(0, line);
      ctx.beginPath(); ctx.moveTo(0, z1); ctx.lineTo(S, z1); ctx.stroke();
    }
    // Park + plaza.
    ctx.fillStyle = '#4a7a35';
    const [px, py] = toMap(47, 127);
    ctx.fillRect(px, py, 66 * scale, 66 * scale);
    ctx.fillStyle = '#c98d5a';
    const [qx, qy] = toMap(-113, -193);
    ctx.fillRect(qx, qy, 66 * scale, 66 * scale);
    // Mission marker.
    const obj = g.missions.objective;
    if (obj.x !== null && obj.x !== undefined) {
      const [mx, my] = toMap(obj.x, obj.z);
      ctx.fillStyle = '#ffd21e';
      ctx.beginPath();
      ctx.arc(mx, my, 5 + Math.sin(g.timeSec * 4) * 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#20262e';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    // Traffic cars (blue), police (flashing red/blue), peds (grey dots).
    for (const t of g.traffic.cars) {
      const [cx, cy] = toMap(t.car.x, t.car.z);
      ctx.fillStyle = '#7fb8e8';
      ctx.fillRect(cx - 1.5, cy - 1.5, 3, 3);
    }
    for (const car of g.police.cars) {
      const [cx, cy] = toMap(car.x, car.z);
      ctx.fillStyle = Math.sin(g.timeSec * 10) > 0 ? '#ff3030' : '#3080ff';
      ctx.beginPath(); ctx.arc(cx, cy, 3.5, 0, Math.PI * 2); ctx.fill();
    }
    // Roadblocks: red squares where the PD sealed the street.
    ctx.fillStyle = '#ff2020';
    for (const b of g.roadblocks.blocks) {
      for (const car of b.cars) {
        const [cx, cy] = toMap(car.x, car.z);
        ctx.fillRect(cx - 2.5, cy - 2.5, 5, 5);
      }
    }
    // CONDOR-1: a big amber dot when the air unit is overhead.
    if (g.heli.active) {
      const [hx, hy] = toMap(g.heli.x, g.heli.z);
      ctx.fillStyle = '#ffb020';
      ctx.beginPath(); ctx.arc(hx, hy, 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#20262e';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    for (const p of g.peds.peds) {
      if (p.state === 'down') continue;
      const [cx, cy] = toMap(p.x, p.z);
      ctx.fillStyle = '#9a9a9a';
      ctx.fillRect(cx - 1, cy - 1, 2, 2);
    }
    // Health pickups.
    ctx.fillStyle = '#3ad84a';
    for (const s of g.city.pickupSpots) {
      const [cx, cy] = toMap(s.x, s.z);
      ctx.fillRect(cx - 2, cy - 2, 4, 4);
    }
    // Player arrow (rotates with heading).
    const [ux, uy] = toMap(g.player.x, g.player.z);
    ctx.save();
    ctx.translate(ux, uy);
    ctx.rotate(-g.player.heading);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(7, 0); ctx.lineTo(-5, -5); ctx.lineTo(-5, 5); ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#20262e';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
    // Border + N.
    ctx.strokeStyle = '#ffffff55';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, S - 1, S - 1);
    ctx.fillStyle = '#ffffffcc';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('N', S - 14, 14);
  }
}
