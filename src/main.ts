/**
 * DEV HARNESS (temporary) — minimal DOM binding to the domain so the core loop is
 * visible in a browser. NOT the final UI (that's Phase 8: src/ui, DOM + WebGL).
 * Renders the whole phone farm, the upgrade bar, the bubble minigame, notifications
 * and synthesized sound — all driven by domain events / commands.
 */
import './style.css';
import { Game, type OfflineEarnings, type SwipeWaitMode } from './core/domain/Game';
import { CURRENCIES, type CurrencyId } from './core/economy/currencies';
import { UPGRADE_CATEGORIES } from './core/content/upgrades';
import { SaveManager } from './persistence/SaveManager';
import { SoundManager } from './audio/SoundManager';
import { ChaosShader } from './ui/ChaosShader';

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
      <button class="icon-btn" id="statsBtn" title="Statistics">📊</button>
      <button class="icon-btn" id="achBtn" title="Achievements">🏆</button>
      <button class="icon-btn" id="styleBtn" title="Style — toggle your cosmetics" hidden>🎨</button>
      <button class="icon-btn" id="zenBtn" title="Zen / Prestige">🧘</button>
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

  <!-- #9 vyjížděcí panel upgradů (místo spodní lišty) -->
  <button class="drawer-fab" id="drawerFab" title="Upgrades">
    🛒<span class="drawer-fab__label">Upgrades</span><span class="drawer-fab__badge" id="drawerBadge" hidden></span>
  </button>
  <div class="drawer-backdrop" id="drawerBackdrop" hidden></div>
  <aside class="drawer" id="drawer" aria-hidden="true">
    <header class="drawer__head">
      <span class="drawer__title">🛒 Upgrades</span>
      <button class="icon-btn" id="drawerClose" title="Close" aria-label="Close">✕</button>
    </header>
    <div class="drawer__body" id="drawerBody"></div>
  </aside>
`;

const hud = byId('hud');
const platformsBar = byId('platforms');
const phonesContainer = byId('phones');
const choices = byId('choices');
const notifications = byId('notifications');
const upgradesBar = byId('drawerBody'); // #9: tlačítka upgradů žijí v panelu
const drawer = byId('drawer');
const drawerBackdrop = byId('drawerBackdrop');
const drawerBadge = byId('drawerBadge');

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

// #9 Drawer open/close
function setDrawer(open: boolean): void {
  drawer.classList.toggle('open', open);
  drawer.setAttribute('aria-hidden', String(!open));
  drawerBackdrop.hidden = !open;
}
byId('drawerFab').addEventListener('click', () => setDrawer(!drawer.classList.contains('open')));
byId('drawerClose').addEventListener('click', () => setDrawer(false));
drawerBackdrop.addEventListener('click', () => setDrawer(false));
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') setDrawer(false);
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
  // #5 produkční multiplikátor + náznak měkkého stropu (klesající výnos).
  const prod = game.productionMultiplier;
  const capped = game.isProductionSoftCapped;
  const prodItem = prod.toNumber() > 1.0001
    ? `<span class="hud__item ${capped ? 'hud__softcap' : ''}" ` +
      `title="Global production multiplier${capped ? ' — soft-capped (diminishing returns)' : ''}">` +
      `⚙️ ×${prod.format()}${capped ? ' 🧱' : ''}</span>`
    : '';
  // Fáze 6: Clarity (jen když nějaká je) + Overdose/Prestige pobídka.
  const cla = game.wallet.get('CLA');
  const claItem = cla.isPositive()
    ? `<span class="hud__item hud__clarity" title="Clarity — prestige meta currency">🧘 ${cla.format()}</span>`
    : '';
  const odItem = game.isOverdosing
    ? `<span class="hud__item hud__overdose" title="Dopamine Overdose — prestige for Clarity">💊 OVERDOSE</span>`
    : game.canPrestige
      ? `<span class="hud__item hud__prestige" title="Prestige available">🧘 +${game.clarityOnPrestige().format()}</span>`
      : '';
  hud.innerHTML =
    money +
    claItem +
    rate +
    prodItem +
    synergyItem +
    `<span class="hud__item">📱 ${game.phones.length}</span>` +
    `<span class="hud__item ${overload ? 'hud__overload' : ''}">` +
    `📶 ${game.bandwidthConsumption}/${game.totalBandwidth}${overload ? ' ⚠️' : ''}</span>` +
    focusItem +
    `<span class="hud__item hud__streak">🔥 ×${game.streak.toFixed(2)}</span>` +
    odItem;
}

// ── Phone farm (one card per phone) ──
interface PhoneCard {
  root: HTMLElement;
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

// #8 vizuální varianty zařízení: feed roste z cihly přes RGB až po bot farmu.
const DEVICE_TIERS = [
  { variant: 'brick', icon: '📞' },
  { variant: 'smart', icon: '📱' },
  { variant: 'rgb', icon: '🎮' },
  { variant: 'farm', icon: '🖥️' },
] as const;

function deviceTier(id: number): (typeof DEVICE_TIERS)[number] {
  if (id >= 10) return DEVICE_TIERS[3];
  if (id >= 5) return DEVICE_TIERS[2];
  if (id >= 2) return DEVICE_TIERS[1];
  return DEVICE_TIERS[0];
}

function createCard(id: number): PhoneCard {
  const root = document.createElement('div');
  const tier = deviceTier(id);
  root.className = `phone phone--${tier.variant}`;
  root.innerHTML =
    `<div class="phone__device" title="${tier.variant}">${tier.icon}</div>` +
    `<div class="phone__screen"></div><div class="actions"></div>`;
  phonesContainer.appendChild(root);
  const card: PhoneCard = {
    root,
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
    const rarity = p.post!.rarity;
    card.screen.innerHTML = `<div class="post post--${rarity}">${game.activePlatform.icon}<br /><small>${rarity}</small></div>`;
    card.actions.innerHTML = `
      <button class="icon-btn act" data-act="like" title="Like">👍</button>
      <button class="icon-btn act" data-act="comment" title="Comment">💬</button>
      <button class="icon-btn act" data-act="swipe" title="Swipe">⬆️</button>`;
    const likeBtn = card.actions.querySelector<HTMLButtonElement>('[data-act="like"]')!;
    likeBtn.addEventListener('click', () => {
      if (game.like(id)) {
        likeBtn.classList.add('is-active');
        likeBtn.disabled = true;
        // V3: Skinner-box fontána — víc srdíček s víc nasbíranými Likes (eskalace odměny).
        const likeTier = Math.min(10, 3 + Math.floor(game.wallet.get('LIK').log10()));
        spawnHearts(id, likeTier);
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
      p.state === 'buffering'
        ? `<div class="spinner"></div><div class="loading-tip">${escapeHtml(randomTip())}</div>`
        : `<div class="post">…</div>`;
  }
}

// ── Fáze 9 (C4): dystopické loading tipy (satira) ──
const LOADING_TIPS = [
  'Tip: Blinking is wasted scroll time.',
  'Tip: Sleep is just offline mode for losers.',
  'Tip: Your attention span is a feature we removed.',
  'Tip: Boredom is a bug. We patched it.',
  'Tip: The feed loves you. The feed is all you need.',
  'Tip: Touching grass voids your warranty.',
  'Did you know? You\'ve forgotten what silence feels like.',
];
function randomTip(): string {
  return LOADING_TIPS[Math.floor(Math.random() * LOADING_TIPS.length)]!;
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

// ── Upgrade panel (#9): tlačítka seskupená do kategorií, s popisem a aktuálním bonusem (#B) ──
function upgradeButtonHtml(u: { id: string; icon: string; name: string; description: string }): string {
  return `
    <button class="upg" data-id="${u.id}" title="Shift-click = buy ×10">
      <span class="upg__icon">${u.icon}</span>
      <span class="upg__body">
        <span class="upg__head"><span class="upg__name">${escapeHtml(u.name)}</span><span class="upg__lvl"></span></span>
        <span class="upg__desc">${escapeHtml(u.description)}</span>
        <span class="upg__meta">
          <span class="upg__total"></span><span class="upg__cost"></span><span class="upg__net"></span>
        </span>
      </span>
    </button>`;
}

function buildUpgrades(): void {
  const byCat = new Map<string, ReturnType<typeof game.upgradeView>>();
  for (const u of game.upgradeView()) {
    (byCat.get(u.category) ?? byCat.set(u.category, []).get(u.category)!).push(u);
  }
  upgradesBar.innerHTML = UPGRADE_CATEGORIES.map((cat) => {
    const items = byCat.get(cat.id) ?? [];
    if (items.length === 0) return '';
    return `<section class="drawer__cat" data-cat="${cat.id}">
        <h3 class="drawer__cat-title">${cat.icon} ${cat.label}</h3>
        <div class="drawer__cat-items">${items.map(upgradeButtonHtml).join('')}</div>
      </section>`;
  }).join('');
  for (const btn of Array.from(upgradesBar.querySelectorAll<HTMLButtonElement>('button.upg'))) {
    btn.addEventListener('click', (ev) => {
      const id = btn.dataset['id'];
      if (id) game.buy(id, ev.shiftKey ? 10 : 1);
    });
  }
  refreshUpgrades();
}

function refreshUpgrades(): void {
  const visibleByCat = new Map<string, number>();
  let affordableCount = 0;
  for (const u of game.upgradeView()) {
    const btn = upgradesBar.querySelector<HTMLButtonElement>(`button[data-id="${u.id}"]`);
    if (!btn) continue;
    // #3 vymaxované + #4 dosud neviditelné (zamčené, nedosažitelné) schováme.
    const shown = !(u.maxed || !u.visible);
    btn.style.display = shown ? '' : 'none';
    if (shown) visibleByCat.set(u.category, (visibleByCat.get(u.category) ?? 0) + 1);
    btn.classList.toggle('is-locked', u.locked);
    const lvl = btn.querySelector('.upg__lvl')!;
    const cost = btn.querySelector('.upg__cost')!;
    const net = btn.querySelector<HTMLElement>('.upg__net')!;
    const total = btn.querySelector<HTMLElement>('.upg__total')!;

    // #4 zamčený teaser: místo ceny ukážeme požadavek na odemčení a zakážeme nákup.
    if (u.locked) {
      lvl.textContent = '';
      total.textContent = '';
      cost.textContent = u.unlockHint ?? '🔒';
      net.textContent = '';
      btn.disabled = true;
      btn.classList.remove('is-owned');
      continue;
    }

    lvl.textContent = u.maxed ? 'MAX' : u.level > 0 ? `Lv ${u.level}` : '';
    // #B aktuální celkový bonus (jen když už něco vlastníš)
    total.textContent = u.effectTotal ? `now ${u.effectTotal}` : '';
    cost.textContent = u.maxed ? '' : `${CURRENCIES[u.costCurrency].symbol} ${u.cost.format()}`;
    if (u.networkKind === 'uses') {
      net.textContent = `📶 −${u.networkDelta}`;
      net.className = 'upg__net upg__net--uses';
    } else if (u.networkKind === 'adds') {
      net.textContent = `📶 +${u.networkDelta}`;
      net.className = 'upg__net upg__net--adds';
    } else {
      net.textContent = '';
    }
    btn.disabled = !u.affordable;
    btn.classList.toggle('is-owned', u.level > 0);
    if (u.affordable && shown) affordableCount++;
  }

  // Schovej prázdné kategorie (nic viditelného).
  for (const cat of UPGRADE_CATEGORIES) {
    const section = upgradesBar.querySelector<HTMLElement>(`.drawer__cat[data-cat="${cat.id}"]`);
    if (section) section.style.display = (visibleByCat.get(cat.id) ?? 0) > 0 ? '' : 'none';
  }

  // FAB odznak: kolik upgradů si můžeš teď koupit (i se zavřeným panelem).
  drawerBadge.textContent = String(affordableCount);
  drawerBadge.hidden = affordableCount === 0;
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

// ── #4 Floating combat text: čísla Dopaminu vyletí z telefonů (late-game „život") ──
const floatLayer = document.createElement('div');
floatLayer.className = 'floats';
document.body.appendChild(floatLayer);
const MAX_FLOATS = 36; // strop, ať se DOM nezahltí při stovkách swipů/s

function spawnFloat(phoneId: number, text: string, kind: 'dop' | 'gem' | 'jackpot'): void {
  if (floatLayer.childElementCount >= MAX_FLOATS) return;
  const big = kind !== 'dop' || cosmeticOn('combo_text');
  const el = document.createElement('div');
  el.className = `float float--${kind}${big ? ' float--big' : ''}`;
  el.textContent = text;
  let x = window.innerWidth / 2;
  let y = window.innerHeight * 0.4;
  const card = cards.get(phoneId);
  if (card) {
    const r = card.root.getBoundingClientRect();
    x = r.left + r.width / 2 + (Math.random() * 44 - 22);
    y = r.top + r.height * 0.32;
  }
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  floatLayer.appendChild(el);
  window.setTimeout(() => el.remove(), 1100);
}

// #8/#4 krátké „cinknutí" karty při swipu (jen občas, ať to při 80 telefonech neseká)
let lastPulse = 0;
function pulseCard(phoneId: number): void {
  const now = performance.now();
  if (now - lastPulse < 60) return;
  lastPulse = now;
  const card = cards.get(phoneId);
  if (!card) return;
  card.root.classList.add('is-pop');
  window.setTimeout(() => card.root.classList.remove('is-pop'), 200);
}

// Haptic Overdrive (cosmetic): jackpot roztřese obrazovku.
function screenShake(): void {
  if (!cosmeticOn('screen_shake')) return;
  document.documentElement.classList.add('shaking');
  window.setTimeout(() => document.documentElement.classList.remove('shaking'), 420);
}

// ── V3: Like jako Skinner box — fontána srdíček z telefonu (jen manuální like) ──
function spawnHearts(phoneId: number, count: number): void {
  const card = cards.get(phoneId);
  if (!card || floatLayer.childElementCount >= MAX_FLOATS) return;
  const r = card.root.getBoundingClientRect();
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.className = 'heart';
    el.textContent = ['❤️', '💖', '💕', '💗'][i % 4]!;
    el.style.left = `${r.left + r.width / 2 + (Math.random() * 60 - 30)}px`;
    el.style.top = `${r.top + r.height * 0.5}px`;
    el.style.setProperty('--dx', `${Math.random() * 60 - 30}px`);
    el.style.animationDelay = `${Math.random() * 0.12}s`;
    floatLayer.appendChild(el);
    window.setTimeout(() => el.remove(), 1300);
  }
}

// ── V3: Jackpot = slot machine (přiznaná satira variabilní odměny) ──
const SLOT_SYMBOLS = ['🍒', '🍋', '🔔', '💎', '7️⃣', '🧠'];
const slot = document.createElement('div');
slot.className = 'slot';
slot.hidden = true;
slot.innerHTML =
  `<div class="slot__reels"><span class="slot__r">🎰</span><span class="slot__r">🎰</span><span class="slot__r">🎰</span></div>` +
  `<div class="slot__pay" id="slotPay"></div>`;
document.body.appendChild(slot);
const slotReels = Array.from(slot.querySelectorAll<HTMLElement>('.slot__r'));
const slotPay = slot.querySelector<HTMLElement>('#slotPay')!;
let slotShowing = false;

function showJackpotSlot(payout: string): void {
  if (slotShowing) return; // nepřekrývej běžící
  slotShowing = true;
  slot.hidden = false;
  slot.classList.add('is-spin');
  slotPay.textContent = '';
  const sym = SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)]!;
  // krátké „roztočení" (cyklování symbolů), pak dosednutí na 3× stejný symbol
  let ticks = 0;
  const spin = window.setInterval(() => {
    ticks++;
    for (const r of slotReels) r.textContent = SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)]!;
    if (ticks > 9) {
      window.clearInterval(spin);
      for (const r of slotReels) r.textContent = sym;
      slot.classList.remove('is-spin');
      slotPay.textContent = `JACKPOT! +${payout} 🧠`;
      window.setTimeout(() => {
        slot.hidden = true;
        slotShowing = false;
      }, 900);
    }
  }, 70);
}

// ── Domain events → sound + visual feedback ──
game.bus.on('SwipeResolved', (e) => {
  sound.swipe();
  spawnFloat(e.phoneId, `+${e.dopamine.format()}`, e.rarity === 'common' ? 'dop' : 'gem');
  pulseCard(e.phoneId);
});
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
  // Confetti Cannon (cosmetic): 3× konfety na vzácných postech.
  const cannon = cosmeticOn('confetti_cannon') ? 3 : 1;
  confetti((CONFETTI_BY_RARITY[e.rarity] ?? 12) * cannon);
});
// Vlna 2: jackpot (crit) swipe — velká výplata, ať to „cinkne".
game.bus.on('Jackpot', (e) => {
  sound.gem();
  pushNote(`🎰 JACKPOT ×${e.multiplier}! +${e.dopamine.format()} 🧠`, 'note--gem', 2800);
  spawnFloat(e.phoneId, `🎰 +${e.dopamine.format()}`, 'jackpot');
  confetti(24);
  screenShake();
  showJackpotSlot(e.dopamine.format()); // V3: slot-machine flourish
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

// ── Cosmetics Style menu: odděl „vlastněno" (= trvalý Dopamin bonus, doména) od „zobrazeno"
// (= vizuál, přepínatelné). Stav zobrazení persistován v localStorage (per-zařízení). ──
const STYLE_OFF_KEY = 'ds-cosmetics-off'; // ids RUČNĚ vypnutých kosmetik
const REDUCE_MOTION_KEY = 'ds-reduce-motion';
/** Motion-heavy efekty, které „Reduce motion" potlačí (i když jsou jinak zapnuté). */
const MOTION_COSMETICS = new Set([
  'screen_shake',
  'disco_ball',
  'confetti_cannon',
  'rainbow_text',
  'aurora_skin',
  'galaxy_brain',
]);

const disabledCosmetics = new Set<string>(loadJson<string[]>(STYLE_OFF_KEY, []));
let reduceMotion = localStorage.getItem(REDUCE_MOTION_KEY) === '1';

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function persistStyle(): void {
  localStorage.setItem(STYLE_OFF_KEY, JSON.stringify([...disabledCosmetics]));
  localStorage.setItem(REDUCE_MOTION_KEY, reduceMotion ? '1' : '0');
}

/** Je kosmetika vlastněná A zapnutá? (+ u motion efektů respektuje Reduce motion.) */
function cosmeticOn(id: string): boolean {
  if (game.upgrades.level(id) <= 0) return false;
  if (disabledCosmetics.has(id)) return false;
  if (reduceMotion && MOTION_COSMETICS.has(id)) return false;
  return true;
}
/** Vlastní hráč aspoň jednu kosmetiku? (řídí viditelnost 🎨 tlačítka) */
function ownsAnyCosmetic(): boolean {
  return game.upgradeView().some((u) => u.category === 'cosmetics' && u.level > 0);
}

// ── Theme: Dark Mode upgrade flips the whole UI (respektuje Style přepínač) ──
function applyTheme(): void {
  document.documentElement.classList.toggle('dark', cosmeticOn('dark_mode'));
}

// ── Cosmetic skins (#3): zapnutá vlastněná kosmetika přepne vizuální třídu na <html> ──
// Recolor/text efekty = třída na <html>. Celoobrazovkové (kombinovatelné) skiny jdou přes fx-layer.
const COSMETIC_CLASSES: ReadonlyArray<[id: string, cls: string]> = [
  ['neon_mode', 'neon'],
  ['crt_filter', 'crt'],
  ['vaporwave', 'vaporwave'],
  ['gold_rush', 'gold'],
  ['disco_ball', 'disco'],
  ['rainbow_text', 'rainbow'],
  ['golden_thumb', 'golden-thumb'],
  ['grass_filter', 'grass'],
];
// Combinovatelné celoobrazovkové overlay efekty (každý vlastní vrstva → jdou naráz).
const fxLayer = document.createElement('div');
fxLayer.className = 'fx-layer';
fxLayer.innerHTML = `
  <div class="fx fx--kittens" data-fx="kitten_bg"></div>
  <div class="fx fx--aurora" data-fx="aurora_skin"></div>
  <div class="fx fx--galaxy" data-fx="galaxy_brain"></div>
  <div class="fx fx--sepia" data-fx="sepia_mode"></div>`;
document.body.appendChild(fxLayer);
const FX_OVERLAYS = Array.from(fxLayer.querySelectorAll<HTMLElement>('.fx'));

function applyCosmetics(): void {
  for (const [id, cls] of COSMETIC_CLASSES) {
    document.documentElement.classList.toggle(cls, cosmeticOn(id));
  }
  for (const el of FX_OVERLAYS) el.classList.toggle('on', cosmeticOn(el.dataset.fx!));
  document.documentElement.classList.toggle('reduce-motion', reduceMotion);
  byId('styleBtn').hidden = !ownsAnyCosmetic();
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

// ── Chaos Level (V1) + Color grading (V4): škálování & Dopamin/s poškozují/ladí obraz ──
const chaos = new ChaosShader(); // WebGL glitch overlay (no-op když WebGL chybí)
const colorGrade = document.createElement('div'); // V4: „dopamin metr" jako color grade
colorGrade.className = 'color-grade';
document.body.appendChild(colorGrade);

function applyChaos(nowMs: number): void {
  const c = game.chaosLevel / 100; // 0..1
  const meter = game.dopamineMeter; // 0..1
  document.documentElement.style.setProperty('--chaos', c.toFixed(3));
  document.documentElement.classList.toggle('chaotic', c > 0.5);

  // V1: WebGL glitch je SITUAČNÍ — náběh až od vysokého chaosu (~55 %) a u Overdose.
  // Early/mid hra = čistá obrazovka (žádné blikání na startu). Viz GDD-04 §V1 (glitch = 60–100).
  const fromChaos = Math.max(0, (c - 0.55) / 0.45);
  const fromMeter = Math.max(0, (meter - 0.65) / 0.35) * 0.6;
  chaos.setIntensity(Math.min(1, fromChaos + fromMeter));
  chaos.render(nowMs / 1000);

  // V4: obrazovka se „ohřívá" s Dopaminem/s; u Overdose do hyper-červené (plynule, ne blikání).
  document.documentElement.style.setProperty('--dopa', meter.toFixed(3));
  colorGrade.classList.toggle('overdose', game.isOverdosing);
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

// ── Fáze 6: Zen / Prestige panel ──
const zenModal = document.createElement('div');
zenModal.className = 'modal';
zenModal.hidden = true;
zenModal.innerHTML = `
  <div class="modal__backdrop" data-zclose></div>
  <div class="modal__box zen">
    <header class="modal__head"><span>🧘 Zen — Prestige</span><button class="icon-btn" data-zclose>✕</button></header>
    <div class="zen__summary" id="zenSummary"></div>
    <button class="big-btn" id="zenPrestige"></button>
    <h3 class="zen__title">Permanent Clarity upgrades</h3>
    <div class="zen__shop" id="zenShop"></div>
  </div>`;
document.body.appendChild(zenModal);
const zenSummary = zenModal.querySelector<HTMLElement>('#zenSummary')!;
const zenShop = zenModal.querySelector<HTMLElement>('#zenShop')!;
const zenPrestigeBtn = zenModal.querySelector<HTMLButtonElement>('#zenPrestige')!;

function openZen(open: boolean): void {
  zenModal.hidden = !open;
  if (open) renderZen();
}
byId('zenBtn').addEventListener('click', () => openZen(true));
for (const el of Array.from(zenModal.querySelectorAll('[data-zclose]'))) {
  el.addEventListener('click', () => openZen(false));
}
zenPrestigeBtn.addEventListener('click', () => {
  const s = game.prestige();
  if (s) {
    openZen(false);
    showWrapped(s);
  }
});

function renderZen(): void {
  const cla = game.wallet.get('CLA');
  const gain = game.clarityOnPrestige();
  const lt = game.lifetimeStats;
  zenSummary.innerHTML =
    `<div class="zen__cla">🧘 Clarity: <b>${cla.format()}</b></div>` +
    `<div class="zen__muted">Resets: ${lt.prestiges} · lifetime 🧠 ${lt.dopamineAllTime.format()}</div>`;
  const can = game.canPrestige;
  zenPrestigeBtn.disabled = !can;
  zenPrestigeBtn.className = `big-btn ${can ? 'big-btn--danger' : ''}`;
  zenPrestigeBtn.textContent = can
    ? `💊 OVERDOSE — collapse for +${gain.format()} 🧘 Clarity`
    : 'Earn ~1M 🧠 this run to unlock prestige';
  zenShop.innerHTML = game
    .clarityView()
    .map(
      (u) => `
      <button class="upg" data-cla="${u.id}" ${u.affordable ? '' : 'disabled'}>
        <span class="upg__icon">${u.icon}</span>
        <span class="upg__body">
          <span class="upg__head"><span class="upg__name">${escapeHtml(u.name)}</span>
            <span class="upg__lvl">${u.maxed ? 'MAX' : u.level > 0 ? 'Lv ' + u.level : ''}</span></span>
          <span class="upg__desc">${escapeHtml(u.description)}</span>
          <span class="upg__meta"><span class="upg__total">${u.effectTotal ? 'now ' + u.effectTotal : ''}</span>
            <span class="upg__cost">${u.maxed ? '' : '🧘 ' + u.cost.format()}</span></span>
        </span>
      </button>`,
    )
    .join('');
  for (const btn of Array.from(zenShop.querySelectorAll<HTMLButtonElement>('button[data-cla]'))) {
    btn.addEventListener('click', () => {
      const id = btn.dataset['cla'];
      if (id && game.buyClarity(id, 1)) {
        sound.upgrade();
        renderZen();
      }
    });
  }
}

// ── Doomscroll Wrapped (C5) — shrnutí běhu na prestige ──
const wrappedModal = document.createElement('div');
wrappedModal.className = 'modal';
wrappedModal.hidden = true;
document.body.appendChild(wrappedModal);

interface Wrapped {
  prestige: number;
  clarityGained: { format(): string };
  totalDopamine: { format(): string };
  swipes: number;
  likes: number;
  comments: number;
  gems: number;
  jackpots: number;
  seconds: number;
}
function showWrapped(s: Wrapped): void {
  const n = (x: number): string => x.toLocaleString('en-US');
  const mins = Math.floor(s.seconds / 60);
  wrappedModal.innerHTML = `
    <div class="modal__backdrop" data-wclose></div>
    <div class="modal__box wrapped">
      <header class="modal__head"><span>🎁 Doomscroll Wrapped #${s.prestige}</span><button class="icon-btn" data-wclose>✕</button></header>
      <p class="wrapped__lead">You scrolled yourself into oblivion. Your run in review:</p>
      <ul class="wrapped__stats">
        <li>🧠 Dopamine harvested: <b>${s.totalDopamine.format()}</b></li>
        <li>⬆️ Swipes: <b>${n(s.swipes)}</b></li>
        <li>👍 Likes: <b>${n(s.likes)}</b> · 💬 Comments: <b>${n(s.comments)}</b></li>
        <li>💎 Hidden Gems: <b>${n(s.gems)}</b> · 🎰 Jackpots: <b>${n(s.jackpots)}</b></li>
        <li>⏱️ Time doomscrolled: <b>${mins} min</b></li>
        <li>🧘 Clarity gained: <b>${s.clarityGained.format()}</b></li>
      </ul>
      <p class="wrapped__foot">Your most frequent feeling: <i>emptiness</i>.</p>
      <button class="big-btn" data-wclose>Begin again, wiser 🧘</button>
    </div>`;
  wrappedModal.hidden = false;
  for (const el of Array.from(wrappedModal.querySelectorAll('[data-wclose]'))) {
    el.addEventListener('click', () => (wrappedModal.hidden = true));
  }
}

// ── V5: Overdose = fake crash (BSOD) → bílý střih → klidné Zen Wrapped (tonální whiplash) ──
const crashOverlay = document.createElement('div');
crashOverlay.className = 'crash';
crashOverlay.hidden = true;
crashOverlay.innerHTML = `
  <div class="crash__face">:(</div>
  <p class="crash__title">DOPAMINE OVERDOSE</p>
  <p class="crash__body">Your brain ran into a problem and needs to restart.<br />
    We're just dumping your serotonin reserves, and then we'll reset for you.</p>
  <p class="crash__code">STOP CODE: 0xDEAD5CR0LL · collecting feelings (0% complete)</p>`;
document.body.appendChild(crashOverlay);
const flashOverlay = document.createElement('div');
flashOverlay.className = 'flash';
flashOverlay.hidden = true;
document.body.appendChild(flashOverlay);

function playCrashSequence(done: () => void): void {
  document.documentElement.classList.add('crashing'); // glitch shake přes CSS
  crashOverlay.hidden = false;
  window.setTimeout(() => {
    crashOverlay.hidden = true;
    document.documentElement.classList.remove('crashing');
    flashOverlay.hidden = false; // tvrdý bílý střih
    window.setTimeout(() => {
      flashOverlay.hidden = true;
      done();
    }, 450);
  }, 1500);
}

game.bus.on('Prestiged', (e) => {
  sound.badComment();
  // Reset prezentace: telefonní karty a aktivní minihry.
  for (const card of cards.values()) card.root.remove();
  cards.clear();
  hideAd();
  captchaModal.hidden = true;
  const summary = e.summary as unknown as Wrapped;
  playCrashSequence(() => {
    sound.goodComment();
    showWrapped(summary);
  });
});

// ── Minihra Skip-Ad: banner s tlačítkem Skip ──
const adBanner = document.createElement('div');
adBanner.className = 'ad-banner';
adBanner.hidden = true;
document.body.appendChild(adBanner);

function showAd(id: number, reward: { format(): string }): void {
  adBanner.innerHTML =
    `<span class="ad-banner__label">📺 Sponsored — Buy More Dopamine™</span>` +
    `<button class="ad-banner__skip" id="adSkip">Skip ▶▶ +${reward.format()} 🧠</button>`;
  adBanner.hidden = false;
  adBanner.querySelector<HTMLButtonElement>('#adSkip')!.addEventListener('click', () => {
    const r = game.skipAd(id);
    if (r) pushNote(`⏭️ Ad skipped +${r.format()} 🧠`, 'note--like', 1400);
  });
}
function hideAd(): void {
  adBanner.hidden = true;
}
game.bus.on('AdSpawned', (e) => {
  sound.comment();
  showAd(e.id, e.reward);
});
game.bus.on('AdSkipped', hideAd);
game.bus.on('AdExpired', hideAd);

// ── Minihra CAPTCHA: „prove you're human" mřížka ──
const captchaModal = document.createElement('div');
captchaModal.className = 'modal';
captchaModal.hidden = true;
document.body.appendChild(captchaModal);
let captchaSelected = new Set<number>();

function showCaptcha(id: number, cells: boolean[]): void {
  captchaSelected = new Set();
  const grid = cells
    .map((c, i) => `<button class="cap__cell" data-i="${i}">${c ? '🚦' : '🌫️'}</button>`)
    .join('');
  captchaModal.innerHTML = `
    <div class="modal__backdrop"></div>
    <div class="modal__box captcha">
      <header class="modal__head"><span>🤖 Verify you're human</span></header>
      <p class="captcha__lead">Select all squares with <b>🚦 traffic lights</b></p>
      <div class="cap__grid">${grid}</div>
      <button class="big-btn" id="capVerify">Verify</button>
    </div>`;
  captchaModal.hidden = false;
  for (const cell of Array.from(captchaModal.querySelectorAll<HTMLButtonElement>('.cap__cell'))) {
    cell.addEventListener('click', () => {
      const i = Number(cell.dataset['i']);
      if (captchaSelected.has(i)) {
        captchaSelected.delete(i);
        cell.classList.remove('is-sel');
      } else {
        captchaSelected.add(i);
        cell.classList.add('is-sel');
      }
    });
  }
  captchaModal.querySelector<HTMLButtonElement>('#capVerify')!.addEventListener('click', () => {
    game.solveCaptcha(id, [...captchaSelected]);
  });
}
game.bus.on('CaptchaSpawned', (e) => {
  sound.bubble();
  showCaptcha(e.id, e.cells);
});
game.bus.on('CaptchaResolved', (e) => {
  captchaModal.hidden = true;
  if (e.success) {
    sound.gem();
    pushNote(`✅ Verified! +${e.reward.format()} 🧠`, 'note--like', 1600);
  } else {
    pushNote('❌ CAPTCHA failed', 'note--dislike', 1400);
  }
});

// ── V2: Diegetické dark patterns ──
// Cookie lišta (parodie consent dark patternu: obří „Accept All", drobné šedé „Reject").
function showCookieBar(): void {
  if (localStorage.getItem('cookies-accepted')) return;
  const bar = document.createElement('div');
  bar.className = 'cookie-bar';
  bar.innerHTML = `
    <span class="cookie-bar__text">🍪 We value your privacy. We and our <b>1,847 partners</b> store cookies
      to harvest your attention, sell your soul, and personalize the void.</span>
    <div class="cookie-bar__btns">
      <button class="cookie-bar__reject" id="ckReject">Reject (manage 1,847 vendors)</button>
      <button class="cookie-bar__accept" id="ckAccept">Accept All</button>
    </div>`;
  document.body.appendChild(bar);
  bar.querySelector('#ckAccept')!.addEventListener('click', () => {
    localStorage.setItem('cookies-accepted', '1');
    bar.remove();
  });
  // Dark pattern: „Reject" se brání – uhne myši a tváří se, že něco dělá.
  const reject = bar.querySelector<HTMLButtonElement>('#ckReject')!;
  let dodges = 0;
  reject.addEventListener('mouseenter', () => {
    if (dodges++ < 3) reject.style.transform = `translateX(${Math.random() * 80 - 40}px)`;
  });
  reject.addEventListener('click', () => {
    reject.textContent = 'Loading vendor preferences…';
    window.setTimeout(() => (reject.textContent = 'Reject (manage 1,847 vendors)'), 1200);
  });
}

// Občasné falešné „engagement" notifikace (gated: až od 5 telefonů, řídké – ne furt).
const FAKE_NOTES = [
  '🔔 12 people you don\'t know liked your post',
  '⚠️ You\'ve been scrolling for a while. That\'s totally fine. Keep going.',
  '📵 Your friends are hanging out without you. See photos?',
  '🔥 Your streak is in danger! Don\'t break the chain.',
  '👀 Someone screenshotted your profile (not really)',
  '🧠 New brain-rot just dropped. You wouldn\'t want to miss out.',
];
function scheduleFakeNote(): void {
  const delay = 35000 + Math.random() * 25000; // 35–60 s
  window.setTimeout(() => {
    if (game.phones.length >= 5) {
      pushNote(FAKE_NOTES[Math.floor(Math.random() * FAKE_NOTES.length)]!, 'note--dislike', 4200);
    }
    scheduleFakeNote();
  }, delay);
}

// ── Fáze 9: Achievementy (panel + toasty) ──
const achModal = document.createElement('div');
achModal.className = 'modal';
achModal.hidden = true;
document.body.appendChild(achModal);

function openAchievements(): void {
  const list = game.achievementsView();
  const items = list
    .map(
      (a) => `
      <div class="ach ${a.unlocked ? 'is-unlocked' : ''}">
        <span class="ach__icon">${a.unlocked ? a.icon : '🔒'}</span>
        <span class="ach__body"><b>${escapeHtml(a.name)}</b><span class="ach__desc">${escapeHtml(a.description)}</span></span>
      </div>`,
    )
    .join('');
  achModal.innerHTML = `
    <div class="modal__backdrop" data-aclose></div>
    <div class="modal__box ach-box">
      <header class="modal__head">
        <span>🏆 Achievements (${game.achievementsUnlockedCount}/${game.achievementsTotal})</span>
        <button class="icon-btn" data-aclose>✕</button>
      </header>
      <div class="ach-list">${items}</div>
    </div>`;
  achModal.hidden = false;
  for (const el of Array.from(achModal.querySelectorAll('[data-aclose]'))) {
    el.addEventListener('click', () => (achModal.hidden = true));
  }
}
byId('achBtn').addEventListener('click', openAchievements);
game.bus.on('AchievementUnlocked', (e) => {
  sound.gem();
  pushNote(`🏆 Achievement: ${e.icon} ${e.name}`, 'note--gem', 3600);
  confetti(16);
});

// ── Cosmetics Style menu (🎨): zapni/vypni/kombinuj vlastněné kosmetiky (persist localStorage) ──
const styleModal = document.createElement('div');
styleModal.className = 'modal';
styleModal.hidden = true;
document.body.appendChild(styleModal);

function renderStyleModal(): void {
  const owned = game.upgradeView().filter((u) => u.category === 'cosmetics' && u.level > 0);
  const rows = owned
    .map((c) => {
      const on = cosmeticOn(c.id);
      const muted = reduceMotion && MOTION_COSMETICS.has(c.id);
      return `
      <label class="style-row ${on ? 'is-on' : ''}">
        <span class="style-row__icon">${c.icon}</span>
        <span class="style-row__body"><b>${escapeHtml(c.name)}</b>${
          muted ? '<span class="style-row__hint">muted by Reduce motion</span>' : ''
        }</span>
        <input type="checkbox" class="style-toggle" data-cos="${c.id}" ${
          disabledCosmetics.has(c.id) ? '' : 'checked'
        } />
      </label>`;
    })
    .join('');
  styleModal.innerHTML = `
    <div class="modal__backdrop" data-sclose></div>
    <div class="modal__box style-box">
      <header class="modal__head"><span>🎨 Style — your cosmetics</span><button class="icon-btn" data-sclose>✕</button></header>
      <p class="style-intro">Owning a cosmetic keeps its Dopamine bonus forever — these switches only change how the game <i>looks</i>. Combine as many as you like.</p>
      <label class="style-row style-row--master">
        <span class="style-row__icon">🍃</span>
        <span class="style-row__body"><b>Reduce motion</b><span class="style-row__hint">calm the shaking, flashing &amp; disco</span></span>
        <input type="checkbox" id="reduceMotionToggle" ${reduceMotion ? 'checked' : ''} />
      </label>
      <div class="style-list">${rows || '<p class="style-empty">Buy a cosmetic upgrade to start customizing.</p>'}</div>
    </div>`;
  for (const el of Array.from(styleModal.querySelectorAll('[data-sclose]'))) {
    el.addEventListener('click', () => (styleModal.hidden = true));
  }
  for (const el of Array.from(styleModal.querySelectorAll<HTMLInputElement>('.style-toggle'))) {
    el.addEventListener('change', () => {
      const id = el.dataset.cos!;
      if (el.checked) disabledCosmetics.delete(id);
      else disabledCosmetics.add(id);
      persistStyle();
      applyTheme();
      applyCosmetics();
      renderStyleModal();
    });
  }
  const rm = styleModal.querySelector<HTMLInputElement>('#reduceMotionToggle');
  rm?.addEventListener('change', () => {
    reduceMotion = rm.checked;
    persistStyle();
    applyTheme();
    applyCosmetics();
    renderStyleModal();
  });
}
function openStyle(): void {
  renderStyleModal();
  styleModal.hidden = false;
}
byId('styleBtn').addEventListener('click', openStyle);

// ── Statistiky (📊): tento běh + doživotní souhrny + rekordy ──
const statsModal = document.createElement('div');
statsModal.className = 'modal';
statsModal.hidden = true;
document.body.appendChild(statsModal);

function fmtTime(sec: number): string {
  const s = Math.floor(sec % 60);
  const m = Math.floor((sec / 60) % 60);
  const h = Math.floor(sec / 3600);
  return h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`;
}
function statRow(label: string, value: string): string {
  return `<div class="stat-row"><span class="stat-row__k">${label}</span><span class="stat-row__v">${value}</span></div>`;
}
function openStats(): void {
  const s = game.statsView();
  const num = (n: number): string => Math.round(n).toLocaleString('en-US');
  const runRows = [
    statRow('⏱️ Time this run', fmtTime(s.run.seconds)),
    statRow('📥 Dopamine earned', s.run.dopamine.format()),
    statRow('⚡ Dopamine / sec', s.run.dopPerSec.format()),
    statRow('⚙️ Production ×', s.run.production.format()),
    statRow('👆 Swipes', num(s.run.swipes)),
    statRow('👍 Likes', num(s.run.likes)),
    statRow('💬 Comments', num(s.run.comments)),
    statRow('💎 Hidden gems', num(s.run.gems)),
    statRow('🎰 Jackpots', num(s.run.jackpots)),
    statRow('📱 Phones', num(s.run.phones)),
    statRow('🌐 Platform', escapeHtml(s.run.platform)),
    statRow('🌀 Chaos', `${Math.round(s.run.chaos)}%`),
    statRow('🎯 Attention', `${Math.round(s.run.attention)} / ${Math.round(s.run.maxAttention)}`),
  ].join('');
  const lifeRows = [
    statRow('🔁 Prestiges', num(s.lifetime.prestiges)),
    statRow('🧘 Clarity earned', s.lifetime.clarityEarned.format()),
    statRow('💰 All-time Dopamine', s.lifetime.dopamineAllTime.format()),
    statRow('👆 Total swipes', num(s.lifetime.swipes)),
    statRow('👍 Total likes', num(s.lifetime.likes)),
    statRow('💬 Total comments', num(s.lifetime.comments)),
    statRow('💎 Total gems', num(s.lifetime.gems)),
    statRow('🎰 Total jackpots', num(s.lifetime.jackpots)),
    statRow('⏱️ Total time', fmtTime(s.lifetime.seconds)),
    statRow('🏆 Achievements', `${s.achievements.unlocked} / ${s.achievements.total}`),
  ].join('');
  const recordRows = [
    statRow('⚡ Best Dopamine/sec', s.records.bestDopPerSec.format()),
    statRow('📱 Most phones', num(s.records.maxPhones)),
    statRow('🏁 Fastest prestige', s.records.fastestPrestigeSec > 0 ? fmtTime(s.records.fastestPrestigeSec) : '—'),
  ].join('');
  statsModal.innerHTML = `
    <div class="modal__backdrop" data-stclose></div>
    <div class="modal__box stats-box">
      <header class="modal__head"><span>📊 Statistics</span><button class="icon-btn" data-stclose>✕</button></header>
      <div class="stats-cols">
        <section class="stats-col"><h3>This run</h3>${runRows}</section>
        <section class="stats-col"><h3>Lifetime</h3>${lifeRows}<h3 class="stats-records">Records</h3>${recordRows}</section>
      </div>
    </div>`;
  for (const el of Array.from(statsModal.querySelectorAll('[data-stclose]'))) {
    el.addEventListener('click', () => (statsModal.hidden = true));
  }
  statsModal.hidden = false;
}
byId('statsBtn').addEventListener('click', openStats);

// ── Fáze 9 (C4): „Hlas Algoritmu" — systémový banner ──
const algoBanner = document.createElement('div');
algoBanner.className = 'algo';
algoBanner.hidden = true;
document.body.appendChild(algoBanner);
let algoTimer = 0;
game.bus.on('AlgorithmSpeaks', (e) => {
  sound.badComment();
  algoBanner.innerHTML = `<span class="algo__tag">THE ALGORITHM</span><span class="algo__text">${escapeHtml(e.text)}</span>`;
  algoBanner.hidden = false;
  window.clearTimeout(algoTimer);
  algoTimer = window.setTimeout(() => (algoBanner.hidden = true), 6500);
});

// ── Fáze 9 (C4): Falešné ToS na startu (zeď textu, foreshadowing Overdose) ──
function showToS(): void {
  if (localStorage.getItem('tos-accepted')) return;
  const tos = document.createElement('div');
  tos.className = 'modal';
  tos.innerHTML = `
    <div class="modal__backdrop"></div>
    <div class="modal__box tos">
      <header class="modal__head"><span>📜 Terms of Service</span></header>
      <div class="tos__scroll">
        <p>Welcome to <b>Dopamine Scroller™</b>. By tapping "I Agree" you irrevocably grant us:</p>
        <p>1. Your <b>attention</b>, in perpetuity, across all timelines.</p>
        <p>2. Your <b>data</b>, your contacts' data, and the data of people you merely thought about.</p>
        <p>3. Your <b>evenings</b>, your weekends, and the years 2024 through whenever.</p>
        <p>4. The right to optimize your dopamine until it can no longer be optimized (see: "Overdose").</p>
        <p>5. A non-exclusive license to your <b>soul</b>, redeemable for engagement.</p>
        <p class="tos__fine">You may not reject these terms. There is no reject button. There is only the feed.</p>
      </div>
      <button class="big-btn" id="tosOk">I Agree (you have no choice)</button>
    </div>`;
  document.body.appendChild(tos);
  tos.querySelector('#tosOk')!.addEventListener('click', () => {
    localStorage.setItem('tos-accepted', '1');
    tos.remove();
  });
}

// ── Boot ──
buildUpgrades();
buildPlatforms();
applyTheme();
applyCosmetics();
showToS();
showCookieBar();
scheduleFakeNote();
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
  applyCosmetics();
  applyOverload();
  applyChaos(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
