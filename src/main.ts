/**
 * DEV HARNESS (temporary) — minimal DOM binding to the domain so the core loop is
 * visible in a browser. This is NOT the final UI (that comes in Phase 8: src/ui,
 * DOM + WebGL). It demonstrates the Domain ↔ Presentation split: read state, call
 * Commands, subscribe to events.
 */
import './style.css';
import { Game, type OfflineEarnings } from './core/domain/Game';
import { CURRENCIES, type CurrencyId } from './core/economy/currencies';
import { SaveManager } from './persistence/SaveManager';

const game = new Game({ seed: Date.now() & 0xffff });

// Persistence: načti uložený stav PŘED navázáním UI, ať reference telefonu i lišta sedí.
const saver = new SaveManager();
let offlineResult: OfflineEarnings | null = null;
const loaded = saver.load();
if (loaded) {
  game.loadSave(loaded.state);
  const seconds = Math.max(0, (Date.now() - loaded.savedAt) / 1000);
  const earned = game.computeOfflineEarnings(seconds);
  if (earned.dopamine.isPositive() || earned.likes.isPositive()) offlineResult = earned;
}

const phone = game.phones[0]!;

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header class="topbar">
    <div class="brand"><span class="brand__logo">🧠</span><span>Dopamine Scroller</span></div>
    <button class="icon-btn topbar__settings" title="Settings" aria-label="Settings">⚙️</button>
  </header>

  <div class="hud" id="hud"></div>

  <main class="stage">
    <div class="phone">
      <div class="phone__screen" id="screen"></div>
      <div class="actions" id="actions"></div>
    </div>
    <div class="choices" id="choices"></div>
  </main>

  <div class="notifications" id="notifications"></div>

  <footer class="upgrades" id="upgrades"></footer>
`;

const hud = byId('hud');
const screen = byId('screen');
const actions = byId('actions');
const choices = byId('choices');
const notifications = byId('notifications');
const upgrades = byId('upgrades');

const HUD_ORDER: CurrencyId[] = ['DOP', 'LIK', 'COM', 'BR'];

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing`);
  return el;
}

function renderHud(): void {
  const money = HUD_ORDER.map(
    (id) => `<span class="hud__item">${CURRENCIES[id].symbol} ${game.wallet.get(id).format()}</span>`,
  ).join('');
  const overload = game.isOverloaded;
  const dps = game.passiveDopamineRate;
  const rate = dps.isPositive() ? `<span class="hud__item hud__rate">+${dps.format()}/s 🧠</span>` : '';
  hud.innerHTML =
    money +
    rate +
    `<span class="hud__item">📱 ${game.phones.length}</span>` +
    `<span class="hud__item ${overload ? 'hud__overload' : ''}">` +
    `📶 ${game.bandwidthConsumption}/${game.totalBandwidth}${overload ? ' ⚠️' : ''}</span>` +
    `<span class="hud__item hud__streak">🔥 ×${game.streak.toFixed(2)}</span>`;
}

function buildUpgrades(): void {
  upgrades.innerHTML = game
    .upgradeView()
    .map(
      (u) => `
      <button class="upg" data-id="${u.id}" title="${escapeHtml(u.description)} (Shift = ×10)">
        <span class="upg__icon">${u.icon}</span>
        <span class="upg__name">${escapeHtml(u.name)}</span>
        <span class="upg__meta"><span class="upg__lvl"></span><span class="upg__cost"></span></span>
      </button>`,
    )
    .join('');
  for (const btn of Array.from(upgrades.querySelectorAll<HTMLButtonElement>('button.upg'))) {
    btn.addEventListener('click', (ev) => {
      const id = btn.dataset['id'];
      if (id) game.buy(id, ev.shiftKey ? 10 : 1);
    });
  }
  refreshUpgrades();
}

function refreshUpgrades(): void {
  for (const u of game.upgradeView()) {
    const btn = upgrades.querySelector<HTMLButtonElement>(`button[data-id="${u.id}"]`);
    if (!btn) continue;
    btn.querySelector('.upg__lvl')!.textContent = u.maxed ? 'MAX' : u.level > 0 ? `Lv ${u.level}` : '';
    btn.querySelector('.upg__cost')!.textContent = u.maxed
      ? ''
      : `${CURRENCIES[u.costCurrency].symbol} ${u.cost.format()}`;
    btn.disabled = u.maxed || !u.affordable;
    btn.classList.toggle('is-owned', u.level > 0);
  }
}

// Rebuild the phone screen + action buttons only when the phone's state changes,
// so the streaming reactions / choices aren't clobbered every frame.
let lastStateKey = '';
function syncPhone(): void {
  const key = phone.isReady ? 'ready' : phone.state;
  if (key === lastStateKey) return;
  lastStateKey = key;

  if (phone.isReady) {
    screen.innerHTML = `<div class="post">📱<br /><small>post · ${phone.post!.rarity}</small></div>`;
    actions.innerHTML = `
      <button class="icon-btn act" id="like" title="Like" aria-label="Like">👍</button>
      <button class="icon-btn act" id="comment" title="Comment" aria-label="Comment">💬</button>
      <button class="icon-btn act" id="swipe" title="Swipe" aria-label="Swipe">⬆️</button>`;
    byId('like').addEventListener('click', onLike);
    byId('comment').addEventListener('click', onComment);
    byId('swipe').addEventListener('click', onSwipe);
  } else {
    clearChoices();
    actions.innerHTML = '';
    screen.innerHTML =
      phone.state === 'buffering' ? `<div class="spinner"></div>` : `<div class="post">…</div>`;
  }
}

function onLike(): void {
  if (game.like(phone.id)) {
    byId('like').classList.add('is-active');
    byId('like').setAttribute('disabled', 'true');
  }
}

function onComment(): void {
  if (!phone.canComment) return;
  const offered = game.offerComments(phone.id);
  if (!offered) return;
  choices.innerHTML =
    `<p class="choices__label">Pick a comment</p>` +
    offered
      .map((c) => `<button class="choice" data-id="${c.id}">${escapeHtml(c.text)}</button>`)
      .join('');
  for (const btn of Array.from(choices.querySelectorAll<HTMLButtonElement>('button.choice'))) {
    btn.addEventListener('click', () => {
      const id = btn.dataset['id'];
      if (id && game.postComment(phone.id, id)) {
        byId('comment').classList.add('is-active');
        byId('comment').setAttribute('disabled', 'true');
      }
      clearChoices();
    });
  }
}

function onSwipe(): void {
  game.swipe(phone.id);
}

function clearChoices(): void {
  choices.innerHTML = '';
}

// ── Reactions stream in over time as little notifications (the delayed feedback) ──
game.bus.on('CommentReaction', (e) => {
  pushNote(e.kind === 'like' ? '👍 +1' : '👎 −1', e.kind === 'like' ? 'note--like' : 'note--dislike');
});
game.bus.on('CommentResolved', (e) => {
  const r = e.result;
  const label =
    r.outcome === 'viral' ? '🌟 Viral!' : r.outcome === 'flop' ? '💀 Flop' : '😐 Meh';
  const gain = r.dopamine.isPositive() ? ` +${r.dopamine.format()} 🧠` : '';
  const br = r.brainRot.isPositive() ? ` +${r.brainRot.format()} 🧟` : '';
  pushNote(`${label}${gain}${br}`, 'note--outcome', 4000);
});
game.bus.on('HiddenGemFound', (e) => pushNote(`💎 ${e.rarity.toUpperCase()}!`, 'note--gem', 3000));

// ── Dopamine bubble minigame: tap the bubbles for bonus Dopamine ──
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
game.bus.on('BubblePopped', (e) => removeBubble(e.id));
game.bus.on('BubbleExpired', (e) => removeBubble(e.id));

function removeBubble(id: number): void {
  const el = bubbleEls.get(id);
  if (el) {
    el.remove();
    bubbleEls.delete(id);
  }
}

function pushNote(text: string, cls: string, ttl = 1400): void {
  const note = document.createElement('div');
  note.className = `note ${cls}`;
  note.textContent = text;
  notifications.prepend(note);
  setTimeout(() => note.remove(), ttl);
  while (notifications.childElementCount > 8) notifications.lastElementChild?.remove();
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
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

buildUpgrades();

// Offline earnings toast + autosave to localStorage.
if (offlineResult) showOfflineToast(offlineResult);
saver.startAutosave(() => game.serialize(), 5000);
window.addEventListener('beforeunload', () => saver.save(game.serialize()));

// Game loop: presentation measures real time, GameClock steps the domain at a fixed rate.
let last = performance.now();
function frame(now: number): void {
  game.clock.update(now - last);
  last = now;
  renderHud();
  syncPhone();
  refreshUpgrades();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
