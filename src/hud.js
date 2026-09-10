// DOM HUD. Updates health bar, kill count, survival timer, and the
// game-over panel. Pure DOM — no framework.

const HP_GREEN = { r: 0x4a, g: 0xd9, b: 0x4a };
const HP_RED   = { r: 0xe8, g: 0x5a, b: 0x5a };

export function createHud() {
  const root = document.getElementById('hud');
  const healthFill = document.getElementById('health-fill');
  const healthLabel = document.getElementById('health-label');
  const killCount = document.getElementById('kill-count');
  const timer = document.getElementById('timer');
  const gameOver = document.getElementById('game-over');
  const finalKills = document.getElementById('final-kills');
  const finalTime = document.getElementById('final-time');
  const restartBtn = document.getElementById('restart-btn');

  if (!root || !healthFill || !killCount || !timer || !gameOver || !restartBtn) {
    throw new Error('HUD elements missing from index.html');
  }

  let onRestart = null;
  restartBtn.addEventListener('click', () => {
    if (onRestart) onRestart();
  });

  return {
    setHealth(hp, maxHp) {
      const ratio = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
      healthFill.style.width = (ratio * 100).toFixed(1) + '%';
      healthFill.style.backgroundColor = lerpColor(HP_RED, HP_GREEN, ratio);
      healthLabel.textContent = `HP ${Math.round(hp)} / ${Math.round(maxHp)}`;
    },
    setKills(n) {
      killCount.textContent = `Kills: ${n}`;
    },
    setTime(seconds) {
      timer.textContent = formatTime(seconds);
    },
    showGameOver(kills, seconds) {
      root.classList.add('dim');
      gameOver.classList.add('visible');
      finalKills.textContent = String(kills);
      finalTime.textContent = formatTime(seconds);
    },
    hideGameOver() {
      root.classList.remove('dim');
      gameOver.classList.remove('visible');
    },
    onRestart(cb) {
      onRestart = cb;
    },
  };
}

export function formatTime(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function lerpColor(a, b, t) {
  // Returns an rgb() string. t=0 -> a, t=1 -> b.
  const r = Math.round(a.r + (b.r - a.r) * t);
  const g = Math.round(a.g + (b.g - a.g) * t);
  const bl = Math.round(a.b + (b.b - a.b) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}
