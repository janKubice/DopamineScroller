/**
 * DEV HARNESS (dočasné) — minimální DOM napojení na doménu, aby šel core loop vidět
 * v prohlížeči. NENÍ to cílové UI; to přijde ve Fázi 8 (src/ui, DOM + WebGL).
 * Slouží jako živá ukázka oddělení Doména ↔ Prezentace (čteme stav, voláme Commands).
 */
import './style.css';
import { Game } from './core/domain/Game';
import { CURRENCIES, type CurrencyId } from './core/economy/currencies';

const game = new Game({ seed: Date.now() & 0xffff });
const phone = game.phones[0]!;

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <h1>Dopamine Scroller</h1>
  <p style="opacity:.6;margin-top:-12px">dev harness — Fáze 1 (core loop)</p>
  <div class="hud" id="hud"></div>
  <div class="phone">
    <div class="phone__screen" id="screen"></div>
    <div id="actions"></div>
  </div>
  <div id="comments"></div>
  <p id="log" style="min-height:1.2em;opacity:.75"></p>
`;

const hud = byId('hud');
const screen = byId('screen');
const actions = byId('actions');
const commentsEl = byId('comments');
const logEl = byId('log');

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} chybí`);
  return el;
}

function wallet(id: CurrencyId): string {
  return `${CURRENCIES[id].symbol} ${game.wallet.get(id).format()}`;
}

function renderHud(): void {
  hud.textContent =
    `${wallet('DOP')}  |  ${wallet('LIK')}  |  ${wallet('COM')}  |  ${wallet('BR')}` +
    `  |  🔥 streak ×${game.streak.toFixed(2)}`;
}

let lastStateKey = '';
function syncPhone(): void {
  const key = phone.isReady ? 'ready' : phone.state;
  if (key === lastStateKey) return;
  lastStateKey = key;

  if (phone.isReady) {
    screen.innerHTML = `<div>📱 Načtený post<br /><small>rarita: ${phone.post!.rarity}</small></div>`;
    actions.innerHTML = `
      <button id="like">👍 Like</button>
      <button id="comment">💬 Komentovat</button>
      <button id="swipe">⬆️ Swipe</button>`;
    byId('like').onclick = () => {
      game.like(phone.id);
      renderHud();
    };
    byId('comment').onclick = showComments;
    byId('swipe').onclick = () => {
      const res = game.swipe(phone.id);
      if (res) logEl.textContent = `Swipe: +${res.dopamine.format()} DOP (${res.rarity})`;
    };
  } else {
    clearComments();
    actions.innerHTML = '';
    screen.innerHTML =
      phone.state === 'buffering' ? `<div class="spinner"></div>` : `<div>…</div>`;
  }
}

function showComments(): void {
  const offered = game.offerComments(phone.id);
  if (!offered) return;
  commentsEl.innerHTML =
    `<p>Vyber komentář:</p>` +
    offered.map((c) => `<button class="cmt" data-id="${c.id}">${c.text}</button>`).join('');
  for (const btn of Array.from(commentsEl.querySelectorAll<HTMLButtonElement>('button.cmt'))) {
    btn.addEventListener('click', () => {
      const id = btn.dataset['id'];
      if (!id) return;
      const res = game.postComment(phone.id, id);
      if (res) {
        logEl.textContent =
          `Komentář (${res.outcome}): +${res.likes}👍 / -${res.dislikes}👎` +
          ` → +${res.dopamine.format()} DOP, +${res.brainRot.format()} BR`;
      }
      clearComments();
      renderHud();
    });
  }
}

function clearComments(): void {
  commentsEl.innerHTML = '';
}

// Herní smyčka: prezentace odměřuje reálný čas, doménu krokuje GameClock fixním krokem.
let last = performance.now();
function frame(now: number): void {
  game.clock.update(now - last);
  last = now;
  renderHud();
  syncPhone();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
