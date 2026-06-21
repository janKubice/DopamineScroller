/**
 * DEV HARNESS (temporary) — minimal DOM binding to the domain so the core loop is
 * visible in a browser. NOT the final UI (that's Phase 8: src/ui, DOM + WebGL).
 * Renders the whole phone farm, the upgrade bar, the bubble minigame, notifications
 * and synthesized sound — all driven by domain events / commands.
 */
import './style.css';
import { Game, type OfflineEarnings, type SwipeWaitMode } from './core/domain/Game';
import { CURRENCIES, type CurrencyId } from './core/economy/currencies';
import { SaveManager } from './persistence/SaveManager';
import { SoundManager } from './audio/SoundManager';

const game = new Game({ seed: Date.now() & 0xffff });

// Persistence: load before wiring UI so phone refs & upgrade bar reflect saved state.
const saver = new SaveManager();
let offlineResult: OfflineEarnings | null = null;
const loaded = saver.load();
if (loaded) {
  game.loadSave(loaded.state);
  const seconds = Math.max(0, (Date.now() - loaded.savedAt) / 1000);
  const earned = game.computeOfflineEarnings(seconds);
  if (earned.dopamine.isPositive() || earned.likes.isPositive()) offlineResult = earned;
}

const sound = new SoundManager();

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header class="topbar">
    <div class="brand"><span class="brand__logo">🧠</span><span>Dopamine Scroller</span></div>
    <div class="topbar__controls">
      <label class="ctl" title="What the Auto-Scroller waits for before swiping">
        🤖
        <select id="waitfor">
          <option value="none">swipe now</option>
          <option value="like">wait for 👍</option>
          <option value="comment">wait for 💬</option>
          <option value="both">wait for both</option>
        </select>
      </label>
      <label class="ctl" title="Volume">
        🔊
        <input type="range" id="volume" min="0" max="1" step="0.05" />
      </label>
      <button class="icon-btn topbar__settings" id="mute" title="Mute" aria-label="Mute">🔊</button>
    </div>
  </header>

  <div class="hud" id="hud"></div>

  <div class="platforms" id="platforms"></div>

  <main class="stage">
    <div class="phones" id="phones"></div>
    <div class="choices" id="choices"></div>
  </main>

  <div class="notifications" id="notifications"></div>

  <footer class="upgrades" id="upgrades"></footer>
`;

const hud = byId('hud');
const platformsBar = byId('platforms');
const phonesContainer = byId('phones');
const choices = byId('choices');
const notifications = byId('notifications');
const upgradesBar = byId('upgrades');

const HUD_ORDER: CurrencyId[] = ['DOP', 'LIK', 'COM', 'SHR', 'BR'];

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing`);
  return el;
}

// ── Sound: mute toggle on settings button ──
const muteBtn = byId('mute');
muteBtn.addEventListener('click', () => {
  sound.setEnabled(!sound.isEnabled);
  muteBtn.textContent = sound.isEnabled ? '🔊' : '🔇';
});

// #1 Auto-Scroller wait mode
const waitSelect = document.querySelector<HTMLSelectElement>('#waitfor')!;
waitSelect.value = game.swipeWaitFor;
waitSelect.addEventListener('change', () => {
  game.setSwipeWaitFor(waitSelect.value as SwipeWaitMode);
});

// #2 Volume slider
const volumeSlider = document.querySelector<HTMLInputElement>('#volume')!;
volumeSlider.value = String(sound.masterVolume);
volumeSlider.addEventListener('input', () => {
  sound.setVolume(Number(volumeSlider.value));
});

// ── HUD ──
function renderHud(): void {
  const money = HUD_ORDER.map(
    (id) => `<span class="hud__item">${CURRENCIES[id].symbol} ${game.wallet.get(id).format()}</span>`,
  ).join('');
  const dps = game.estimatedDopaminePerSecond;
  const rate = dps.isPositive() ? `<span class="hud__item hud__rate">~${dps.format()}/s 🧠</span>` : '';
  const overload = game.isOverloaded;
  const att = Math.round(game.attention);
  const fatigued = game.focusFactor < 0.999;
  const focusItem =
    `<span class="hud__item ${fatigued ? 'hud__fatigued' : ''}" ` +
    `title="Attention — manual actions cost focus; bots don't">🎯 ${att}%${fatigued ? ' 😵' : ''}</span>`;
  const reach = Math.round(game.synergyReach * 100);
  const eng = Math.round(game.synergyEngagement * 100);
  const omni = Math.round(game.omnipresenceBonus * 100);
  const synergyItem =
    reach + eng + omni > 0
      ? `<span class="hud__item hud__synergy" title="Likes→Reach, Comments→Engagement, platforms→Omnipresence">` +
        `✨ R+${reach}% E+${eng}% O+${omni}%</span>`
      : '';
  hud.innerHTML =
    money +
    rate +
    synergyItem +
    `<span class="hud__item">📱 ${game.phones.length}</span>` +
    `<span class="hud__item ${overload ? 'hud__overload' : ''}">` +
    `📶 ${game.bandwidthConsumption}/${game.totalBandwidth}${overload ? ' ⚠️' : ''}</span>` +
    focusItem +
    `<span class="hud__item hud__streak">🔥 ×${game.streak.toFixed(2)}</span>`;
}

// ── Phone farm (one card per phone) ──
interface PhoneCard {
  screen: HTMLElement;
  actions: HTMLElement;
  lastKey: string;
}
const cards = new Map<number, PhoneCard>();

function syncPhones(): void {
  for (const p of game.phones) {
    let card = cards.get(p.id);
    if (!card) card = createCard(p.id);
    // klíč zahrnuje liked/commented, aby se projevily i akce botů
    const key = p.isReady ? `ready:${p.liked ? 'L' : '-'}${p.commented ? 'C' : '-'}` : p.state;
    if (key !== card.lastKey) {
      card.lastKey = key;
      renderCard(p.id, card);
    }
  }
}

function createCard(id: number): PhoneCard {
  const root = document.createElement('div');
  root.className = 'phone';
  root.innerHTML = `<div class="phone__screen"></div><div class="actions"></div>`;
  phonesContainer.appendChild(root);
  const card: PhoneCard = {
    screen: root.querySelector('.phone__screen')!,
    actions: root.querySelector('.actions')!,
    lastKey: '',
  };
  cards.set(id, card);
  return card;
}

function renderCard(id: number, card: PhoneCard): void {
  const p = game.phones.find((x) => x.id === id);
  if (!p) return;
  if (p.isReady) {
    card.screen.innerHTML = `<div class="post">${game.activePlatform.icon}<br /><small>${p.post!.rarity}</small></div>`;
    card.actions.innerHTML = `
      <button class="icon-btn act" data-act="like" title="Like">👍</button>
      <button class="icon-btn act" data-act="comment" title="Comment">💬</button>
      <button class="icon-btn act" data-act="swipe" title="Swipe">⬆️</button>`;
    const likeBtn = card.actions.querySelector<HTMLButtonElement>('[data-act="like"]')!;
    likeBtn.addEventListener('click', () => {
      if (game.like(id)) {
        likeBtn.classList.add('is-active');
        likeBtn.disabled = true;
      }
    });
    const commentBtn = card.actions.querySelector<HTMLButtonElement>('[data-act="comment"]')!;
    commentBtn.addEventListener('click', () => openComments(id, commentBtn));
    card.actions
      .querySelector<HTMLButtonElement>('[data-act="swipe"]')!
      .addEventListener('click', () => game.swipe(id));
    // odrazit už provedené akce (i od botů)
    if (p.liked) {
      likeBtn.classList.add('is-active');
      likeBtn.disabled = true;
    }
    if (p.commented) {
      commentBtn.classList.add('is-active');
      commentBtn.disabled = true;
    }
  } else {
    card.actions.innerHTML = '';
    card.screen.innerHTML =
      p.state === 'buffering' ? `<div class="spinner"></div>` : `<div class="post">…</div>`;
  }
}

// ── Comment roulette (choices tied to a phone) ──
function openComments(phoneId: number, commentBtn: HTMLButtonElement): void {
  const offered = game.offerComments(phoneId);
  if (!offered) return;
  choices.innerHTML =
    `<p class="choices__label">Pick a comment</p>` +
    offered.map((c) => `<button class="choice" data-id="${c.id}">${escapeHtml(c.text)}</button>`).join('');
  for (const btn of Array.from(choices.querySelectorAll<HTMLButtonElement>('button.choice'))) {
    btn.addEventListener('click', () => {
      const id = btn.dataset['id'];
      if (id && game.postComment(phoneId, id)) {
        commentBtn.classList.add('is-active');
        commentBtn.disabled = true;
      }
      clearChoices();
    });
  }
}

function clearChoices(): void {
  choices.innerHTML = '';
}

// ── Upgrade bar ──
function buildUpgrades(): void {
  upgradesBar.innerHTML = game
    .upgradeView()
    .map(
      (u) => `
      <button class="upg" data-id="${u.id}" title="${escapeHtml(u.description)} (Shift = ×10)">
        <span class="upg__icon">${u.icon}</span>
        <span class="upg__name">${escapeHtml(u.name)}</span>
        <span class="upg__meta">
          <span class="upg__lvl"></span><span class="upg__cost"></span><span class="upg__net"></span>
        </span>
      </button>`,
    )
    .join('');
  for (const btn of Array.from(upgradesBar.querySelectorAll<HTMLButtonElement>('button.upg'))) {
    btn.addEventListener('click', (ev) => {
      const id = btn.dataset['id'];
      if (id) game.buy(id, ev.shiftKey ? 10 : 1);
    });
  }
  refreshUpgrades();
}

function refreshUpgrades(): void {
  for (const u of game.upgradeView()) {
    const btn = upgradesBar.querySelector<HTMLButtonElement>(`button[data-id="${u.id}"]`);
    if (!btn) continue;
    btn.querySelector('.upg__lvl')!.textContent = u.maxed ? 'MAX' : u.level > 0 ? `Lv ${u.level}` : '';
    btn.querySelector('.upg__cost')!.textContent = u.maxed
      ? ''
      : `${CURRENCIES[u.costCurrency].symbol} ${u.cost.format()}`;
    const net = btn.querySelector<HTMLElement>('.upg__net')!;
    if (u.networkKind === 'uses') {
      net.textContent = `📶 −${u.networkDelta}`;
      net.className = 'upg__net upg__net--uses';
    } else if (u.networkKind === 'adds') {
      net.textContent = `📶 +${u.networkDelta}`;
      net.className = 'upg__net upg__net--adds';
    } else {
      net.textContent = '';
    }
    // #3 vymaxované upgrady schováme (odkup je hotový)
    btn.style.display = u.maxed ? 'none' : '';
    btn.disabled = !u.affordable;
    btn.classList.toggle('is-owned', u.level > 0);
  }
}

// ── Platform switcher ──
function buildPlatforms(): void {
  platformsBar.innerHTML = game
    .platformView()
    .map(
      (p) => `
      <button class="platform" data-id="${p.id}">
        <span class="platform__icon">${p.icon}</span>
        <span class="platform__name">${escapeHtml(p.name)}</span>
        <span class="platform__lock"></span>
      </button>`,
    )
    .join('');
  for (const btn of Array.from(platformsBar.querySelectorAll<HTMLButtonElement>('button.platform'))) {
    btn.addEventListener('click', () => {
      const id = btn.dataset['id'];
      if (id) game.setPlatform(id);
    });
  }
  refreshPlatforms();
}

function refreshPlatforms(): void {
  for (const p of game.platformView()) {
    const btn = platformsBar.querySelector<HTMLButtonElement>(`button[data-id="${p.id}"]`);
    if (!btn) continue;
    btn.classList.toggle('is-active', p.active);
    btn.classList.toggle('is-locked', !p.unlocked);
    btn.disabled = !p.unlocked;
    btn.querySelector('.platform__lock')!.textContent = p.unlocked ? '' : `🔒 ${p.unlockAt.format()}`;
  }
}

// ── Notifications ──
function pushNote(text: string, cls: string, ttl = 1400): void {
  const note = document.createElement('div');
  note.className = `note ${cls}`;
  note.textContent = text;
  notifications.prepend(note);
  window.setTimeout(() => note.remove(), ttl);
  while (notifications.childElementCount > 8) notifications.lastElementChild?.remove();
}

function showOfflineToast(e: OfflineEarnings): void {
  const parts: string[] = [];
  if (e.dopamine.isPositive()) parts.push(`+${e.dopamine.format()} 🧠`);
  if (e.likes.isPositive()) parts.push(`+${e.likes.format()} 👍`);
  pushNote(`💤 While away (${formatDuration(e.seconds)}): ${parts.join(' · ')}`, 'note--offline', 7000);
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${Math.floor(seconds)}s`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

// ── Domain events → sound + visual feedback ──
game.bus.on('SwipeResolved', () => sound.swipe());
game.bus.on('Liked', () => sound.like());
game.bus.on('CommentPosted', () => sound.comment());
game.bus.on('CommentReaction', (e) => sound.reactionTick(e.kind === 'like'));
game.bus.on('CommentResolved', (e) => {
  const r = e.result;
  if (r.outcome === 'viral') sound.goodComment();
  else if (r.outcome === 'flop') sound.badComment();
  const label = r.outcome === 'viral' ? '🌟 Viral!' : r.outcome === 'flop' ? '💀 Flop' : '😐 Meh';
  const gain = r.dopamine.isPositive() ? ` +${r.dopamine.format()} 🧠` : '';
  const br = r.brainRot.isPositive() ? ` +${r.brainRot.format()} 🧟` : '';
  pushNote(`${label}${gain}${br}`, 'note--outcome', 4000);
});
const CONFETTI_BY_RARITY: Record<string, number> = { rare: 14, epic: 30, legendary: 70 };
game.bus.on('HiddenGemFound', (e) => {
  sound.gem();
  pushNote(`💎 ${e.rarity.toUpperCase()}!`, 'note--gem', 3000);
  confetti(CONFETTI_BY_RARITY[e.rarity] ?? 12);
});
game.bus.on('UpgradePurchased', (e) => {
  sound.upgrade();
  const u = game.upgradeView().find((x) => x.id === e.id);
  if (u && u.networkKind === 'uses') {
    pushNote(
      `📶 +${u.networkDelta} Mbps used (${game.bandwidthConsumption}/${game.totalBandwidth})`,
      game.isOverloaded ? 'note--dislike' : 'note--like',
      2600,
    );
  } else if (u && u.networkKind === 'adds') {
    pushNote(
      `📶 +${u.networkDelta} Mbps capacity (${game.bandwidthConsumption}/${game.totalBandwidth})`,
      'note--like',
      2600,
    );
  }
  if (game.isOverloaded) pushNote('⚠️ Network overloaded — buffering slowed!', 'note--dislike', 3000);
});

// ── Dopamine bubble minigame ──
const bubbleLayer = document.createElement('div');
bubbleLayer.className = 'bubbles';
document.body.appendChild(bubbleLayer);
const bubbleEls = new Map<number, HTMLElement>();

game.bus.on('BubbleSpawned', (e) => {
  const el = document.createElement('button');
  el.className = 'bubble';
  el.textContent = '🧠';
  el.style.top = `${22 + Math.random() * 48}%`;
  el.style.left = `${8 + Math.random() * 78}%`;
  el.addEventListener('click', () => {
    const v = game.popBubble(e.id);
    if (v) pushNote(`+${v.format()} 🧠`, 'note--like', 1200);
  });
  bubbleLayer.appendChild(el);
  bubbleEls.set(e.id, el);
});
game.bus.on('BubblePopped', (e) => {
  sound.bubble();
  removeBubble(e.id);
});
game.bus.on('BubbleExpired', (e) => removeBubble(e.id));

function removeBubble(id: number): void {
  const el = bubbleEls.get(id);
  if (el) {
    el.remove();
    bubbleEls.delete(id);
  }
}

// ── Confetti burst on rare+ posts (T1) ──
const confettiLayer = document.createElement('div');
confettiLayer.className = 'confetti-layer';
document.body.appendChild(confettiLayer);

function confetti(count: number): void {
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.className = 'confetti';
    el.style.left = `${Math.random() * 100}%`;
    el.style.background = `hsl(${Math.random() * 360}, 90%, 60%)`;
    el.style.animationDuration = `${0.9 + Math.random() * 0.9}s`;
    el.style.animationDelay = `${Math.random() * 0.2}s`;
    confettiLayer.appendChild(el);
    window.setTimeout(() => el.remove(), 2200);
  }
}

// ── Theme: Dark Mode upgrade flips the whole UI ──
function applyTheme(): void {
  document.documentElement.classList.toggle('dark', game.upgrades.level('dark_mode') > 0);
}

// ── FIX2: visible penalty when the network is overloaded ──
const overloadBanner = document.createElement('div');
overloadBanner.className = 'overload-banner';
overloadBanner.hidden = true;
document.body.appendChild(overloadBanner);

function applyOverload(): void {
  const over = game.isOverloaded;
  document.documentElement.classList.toggle('overloaded', over);
  overloadBanner.hidden = !over;
  if (over) {
    overloadBanner.textContent =
      `⚠️ NETWORK OVERLOADED — buffering at ×${game.bandwidthBufferScale.toFixed(2)} speed. Buy bandwidth!`;
  }
}

// ── Chaos Level (V1): Brain Rot / scale damages the UI visually ──
function applyChaos(): void {
  const c = game.chaosLevel / 100; // 0..1
  document.documentElement.style.setProperty('--chaos', c.toFixed(3));
  document.documentElement.classList.toggle('chaotic', c > 0.5);
}

game.bus.on('PlatformUnlocked', (e) => {
  sound.upgrade();
  const p = game.platformView().find((x) => x.id === e.id);
  pushNote(`🔓 New platform unlocked: ${p?.name ?? e.id}`, 'note--offline', 4500);
});
game.bus.on('PlatformChanged', (e) => {
  const p = game.platformView().find((x) => x.id === e.id);
  pushNote(`📲 Switched to ${p?.name ?? e.id}`, 'note--like', 1800);
});

// ── Boot ──
buildUpgrades();
buildPlatforms();
applyTheme();
if (offlineResult) showOfflineToast(offlineResult);
saver.startAutosave(() => game.serialize(), 5000);
window.addEventListener('beforeunload', () => saver.save(game.serialize()));

// Game loop: presentation measures real time, GameClock steps the domain at a fixed rate.
let last = performance.now();
function frame(now: number): void {
  game.clock.update(now - last);
  last = now;
  renderHud();
  syncPhones();
  refreshUpgrades();
  refreshPlatforms();
  applyTheme();
  applyOverload();
  applyChaos();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
