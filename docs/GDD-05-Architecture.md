# GDD 05 — Technická architektura (HTML5 / TypeScript / WebGL)

## 1. Hlavní princip

> **Doménová vrstva (`src/core`) nesmí mít žádnou závislost na DOM, WebGL ani frameworku.**
> Je čistá, deterministická a plně testovatelná headless. Prezentace (`src/ui`) je pouze
> pozorovatel: čte stav, odebírá eventy, posílá zpět příkazy.

Tím zachováváme původní C# princip „logika nezávislá na prezentaci" i v TypeScriptu, a
zároveň získáváme okamžitou hratelnost na webu (itch.io).

## 2. Vrstvy

```
┌──────────────────────────────────────────────────────────┐
│ PRESENTATION (src/ui)  — DOM + WebGL overlay, audio        │
│   čte stav, odebírá eventy, vykresluje, posílá Commands    │
└───────────────▲───────────────────────────┬───────────────┘
        events  │                           │  commands
┌───────────────┴───────────────────────────▼───────────────┐
│ DOMAIN (src/core)  — čistá logika, deterministická         │
│   Game, Phone(FSM), Wallet, CostCurve, CommentPool,        │
│   Bandwidth, Prestige, GameClock, EventBus, Rng, BigNumber │
└────────────────────────────────────────────────────────────┘
```

## 3. Tři kritická rozhodnutí (řešena od Fáze 0)

### 3.1 BigNumber (vědecká notace)
Idle hry s exponenciálním růstem přetečou `number` (double, max ≈ 1.8e308) během hodin.
`BigNumber` ukládá **mantisu ∈ [1,10) + celočíselný exponent**, takže pojme prakticky
neomezené hodnoty.

- Operace: `add, sub, mul, div, pow, log10, cmp, eq/gt/gte/lt/lte, isZero, toNumber, format`.
- `pow` přes logaritmus (`10^(n·log10(this))`) → zvládá obří exponenty bez přetečení.
- `format` → idle notace (`1.23K`, `4.56M`, … `1.23e42`).
- Implementace: `src/core/math/BigNumber.ts`. Lze vyměnit za `break_eternity.js`, až bude potřeba (> ~1e308 vrstvy).

### 3.2 Deterministický seedovaný RNG
Veškerá náhoda (rarity, komentářové reakce, hidden gems) jde přes **seedovaný** generátor
(`mulberry32`). Oddělené streamy pro logiku vs. kosmetiku.
- Důvod: testovatelnost ekonomiky (reprodukovatelné scénáře) a kompatibilita save (seed v save).
- Implementace: `src/core/math/Rng.ts`.

### 3.3 Tick systém s offline převíjením
Hráč zavře hru na hodiny → po návratu se musí dopočítat zisk. Simulace proto musí umět
zpracovat velké `dt` **bez iterace milionů ticků**.
- `GameClock` drží **fixní logický krok** (`STEP_MS`, např. 100 ms) s akumulátorem reálného času.
- `advance(seconds)` umožní hromadné převinutí; auto-procesy (boti, Fáze 4) se počítají
  **uzavřeně** (closed-form: kolik cyklů proběhlo), ne po jednom ticku.
- Manuální akce offline negenerují nic (hráč nebyl přítomen) — korektní.
- Implementace: `src/core/time/GameClock.ts`.

## 4. Event Bus (Doména → Prezentace)
Typovaný publish/subscribe. Doména emituje doménové eventy; prezentace se přihlašuje.
Doména **nikdy** nevolá UI přímo.
```ts
bus.on('SwipeResolved', e => renderFloatingDopamine(e.phoneId, e.amount));
bus.emit('SwipeResolved', { phoneId, amount });
```
Implementace: `src/core/events/EventBus.ts`.

## 5. Příkazy (Prezentace → Doména)
UI nepíše do stavu přímo — volá metody `Game` (Commands): `buyPhone()`, `swipe(phoneId)`,
`postComment(phoneId, commentId)`, `allocateBandwidth(...)`. Doména validuje a emituje eventy.

## 6. Save / Load & perzistence  ✅ (implementováno, předtaženo z F7)
- Doména je čistá: `Game.serialize()` → `SaveState` (verze, RNG stav, peněženka, úrovně
  upgradů, streak, virality, počet telefonů), `Game.loadSave()` ho obnoví. Přechodný stav
  telefonů (post, časovače, reakce) se resetuje do bufferingu.
- `SaveManager` (`src/persistence/`, mimo doménu) řeší **localStorage** + časové razítko +
  **autosave** (5 s) + uložení na `beforeunload`. Funguje i v itch.io iframe.
- **Verzování** (`SAVE_VERSION`); při neshodě verze se save ignoruje (migrace = TODO).
- **Offline těžba:** `Game.computeOfflineEarnings(seconds)` (closed-form, cap 8 h). Spočítá
  `effectiveSwipesPerSecond = min(rychlost auto-scrolleru, kolik postů farma vyrobí)` — supply
  závisí na počtu telefonů, bufferTime a penalizaci sítě. Dopamin = swipy × hodnota/swipe
  (s očekávanou raritou × algoritmy); lajky/komentáře ≤ počet swipů. Bez auto-scrolleru = 0.
  SaveManager dodá `now - savedAt`.

## 7. Data-driven obsah
Obsah (komentáře, posty, upgrady, platformy) žije v **datech** (`src/core/content/*.json`),
ne v kódu. Umožní snadné balancování a rozšiřování bez zásahu do logiky.
- Balanc konstanty (ceny, multiplikátory, prahy) externalizované do dat (Fáze 9).

## 8. Výkon (late game)
Late game = desítky telefonů × botů × ticků. Zásady:
- Tick **bez alokací** v horké smyčce (žádné nové objekty/closury per tick) → žádný GC thrashing.
- Aktualizace prezentace dávkově (jednou za frame), ne per event.
- WebGL overlay jen pro efekty, ne pro logiku.

## 9. Struktura zdrojáků
```
src/
  core/
    math/      BigNumber.ts, Rng.ts
    time/      GameClock.ts
    events/    EventBus.ts
    economy/   Wallet.ts, CostCurve.ts, currencies.ts
    domain/    Phone.ts, Game.ts
    content/   comments.json, CommentPool.ts
  ui/          (Fáze 8) DOM komponenty + WebGL overlay
  main.ts      dev harness (dočasné propojení domény s minimálním DOM)
```

## 10. Toolchain
- **Vite** — dev server (`npm run dev`) + produkční build (`npm run build` → `dist/` pro itch.io).
- **Vitest** — testy (`npm test`).
- **tsc --noEmit** — kontrola typů (`npm run typecheck`).
- TypeScript **strict** režim zapnutý.
