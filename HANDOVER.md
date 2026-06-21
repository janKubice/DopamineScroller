# 🤝 HANDOVER — Dopamine Scroller

Předávací dokument pro pokračování projektu (nová session / jiný vývojář).
Cíl: po přečtení tohohle + `docs/` umíš plynule pokračovat bez ztráty kontextu.

**Stav:** **Vlna 2 hotová** (T6 odemykání, nové typy efektů, panel upgradů #9, varianty zařízení #8,
rebalance #5) · větev `claude/serene-goodall-af920r` · **158 testů zelených**. Další: Fáze 6 (Prestige).

---

## 1. Co to je

Satirická **idle/clicker hra o doomscrollingu** v prohlížeči (HTML5, distribuce na itch.io).
Hráč scrolluje feed → získává **Dopamin** → kupuje upgrady/telefony/boty → naráží na bottlenecky
(**Bandwidth** = stroje, **Pozornost** = člověk) → eskaluje přes platformy → temná spirála
**Brain Rot** → (plánovaný) kolaps **Dopamine Overdose / Prestige**.

Kompletní design je v **`docs/GDD-00..06`** + **`docs/TODO.md`** (backlog). Tenhle handover je
shrnutí + stav + jak pokračovat. **Při změnách drž `docs/` v synchronu** (dělal jsem to průběžně).

---

## 2. Tech stack & příkazy

- **TypeScript** (strict) + **Vite** (build) + **Vitest** (testy). Žádný runtime balík — vlastní `BigNumber`.
- Node 22, `npm install` funguje (registry dostupné).

```bash
npm install
npm run dev        # vývojový server (harness)
npm test           # 137 testů (headless doména)
npm run typecheck  # tsc --noEmit (běž často!)
npm run build      # tsc --noEmit && vite build -> dist/ (na itch.io)
```

**Workflow změny:** edit → `npm run typecheck` → `npm test` → `npm run build` → commit → push.

---

## 3. Architektura (NEPORUŠOVAT)

> **Doména (`src/core/`) NEMÁ žádnou závislost na DOM/WebGL.** Čistá, deterministická,
> plně testovatelná headless. Prezentace (`src/main.ts`, později `src/ui/`) je jen pozorovatel:
> čte stav, odebírá eventy z `EventBus`, volá Commands. Detail: `docs/GDD-05-Architecture.md`.

Klíčové principy:
- **`BigNumber`** (vědecká notace) pro všechny měny/ceny — `number` by přetekl. (`math/BigNumber.ts`)
- **Seedovaný RNG** (`math/Rng.ts`) — veškerá náhoda přes něj (determinismus + save).
- **Tick** přes `GameClock` (`time/GameClock.ts`): `update(realDtMs)` krokuje doménu fixním
  krokem; `advanceBy` pro offline. `Game.advance(dt)` je `Tickable`.
- **EventBus** (`events/EventBus.ts`): Doména → Prezentace. Doména nikdy nevolá UI přímo.
- **Content data-driven**: `content/*.ts|json` (upgrady, platformy, komentáře).

---

## 4. Mapa souborů

```
src/core/
  math/        BigNumber.ts (mantisa+exponent), Rng.ts (mulberry32)
  time/        GameClock.ts (fixní krok + offline)
  events/      EventBus.ts (typovaný pub/sub)
  economy/     Wallet.ts, currencies.ts (DOP/LIK/COM/SHR/BR/CLA),
               CostCurve.ts (exp. ceny), UpgradeStore.ts (úrovně+ceny),
               Bandwidth.ts (load/bufferScale)
  domain/      Phone.ts (FSM buffering/ready/swiping), Game.ts (★ orchestrátor, ~900 řádků)
  content/     upgrades.ts (42 upgradů vč. Vlny 2 + UpgradeDef.unlock), platforms.ts (5 platforem),
               comments.json + CommentPool.ts (komentářová ruleta)
  persistence/ SaveData.ts (SaveState typ)
src/audio/     SoundManager.ts (Web Audio, syntetizované tóny)
src/persistence/ SaveManager.ts (localStorage + autosave; mimo doménu)
src/main.ts    ★ dev harness (DOM) — DOČASNÉ UI, plné UI = Fáze 8
src/style.css  styly harnessu (+ dark mode, chaos glitch, overload)
```

`Game.ts` je srdce — skoro vše tečou přes něj. Nové mechaniky = většinou getter/command tam + data v `content/`.

---

## 5. Hotové fáze (✅ 0–5, 7)

- **F0 Základy:** BigNumber, Rng, EventBus, GameClock.
- **F1 Core loop:** Phone FSM, swipe/like, **Komentářová ruleta** (opožděné reakce: liky/disliky
  „naskakují" v čase, outcome až na konci), **Streak (M3)**.
- **F2 Ekonomika:** UpgradeStore, generický `buy(id, count)` (×10 přes Shift), algoritmy (dopamineMultiplier).
- **F3 Bandwidth:** kapacita vs. spotřeba, přetížení exp. zpomalí buffering, síťové upgrady. Viditelný postih (červený banner).
- **F4 Automatizace:** **boti reálně obsluhují telefony** (`processBots`: auto-liker/scroller/commenter,
  škálují s počtem telefonů), **Pozornost (M1)** (manuál čerpá focus, boti ne; `focusFactor`).
- **F5 Obsah:** **Virality → Hidden Gems** (+konfety T1), **Platformy** (Text-It→NeuralFeed, odemykání
  kumul. Dopaminem, TokTik+ generuje Brain Rot), **Brain Rot větev** (toxické upgrady za BR + `chaosLevel`
  glitch UI), **Synergie měn (M2)** (Likes→Reach, Comments→Engagement, Shares→Virality, Omnipresence).
- **F7 Save/Offline (předtaženo):** localStorage autosave, offline těžba (cap 4 h, 50 % efektivita).

Mechaniky M1/M2/M3 + minihry (komentáře, bubliny) hotové. Plná tabulka: `docs/GDD-06-Roadmap.md`.

---

## 6. Klíčové vstupní body v `Game`

**Commands (volá UI):** `swipe(id, manual=true)`, `like(id, manual=true)`, `offerComments(id)`,
`postComment(id, commentId, manual=true)`, `buy(id, count)`, `popBubble(id)`, `setPlatform(id)`,
`setSwipeWaitFor(mode)`, `addPhone()`.

**View/getters (čte UI):** `wallet`, `phones`, `streak`, `attention`/`focusFactor`, `virality`,
`productionMultiplier`/`globalSwipeMultiplier`, `bandwidthConsumption`/`totalBandwidth`/`isOverloaded`,
`chaosLevel`, `estimatedDopaminePerSecond`, `upgradeView()`, `platformView()`, synergie
(`synergyReach/Engagement/...`, `omnipresenceBonus`).

**Eventy (bus):** `PostReady, SwipeResolved, HiddenGemFound, Liked, CommentPosted/Reaction/Resolved,
CurrencyChanged, StreakChanged, UpgradePurchased, PlatformUnlocked/Changed, BubbleSpawned/Popped/Expired`.

**Persistence:** `serialize()→SaveState`, `loadSave(data)`, `computeOfflineEarnings(seconds)`.

---

## 7. Konvence & gotchas (DŮLEŽITÉ)

- **Boti volají akce s `manual=false`** (nečerpají Pozornost, neaplikuje se focusFactor). Manuál = default true.
- **Testy krokuj malými `advance(0.1)`**, ne jedním velkým dt — spawny bublin/botů/grace fungují per-tick;
  velké dt je degenerované (viz historie testů).
- **Platforma určuje** `basePostValue` a `bandwidthPerPhone` (ne konstanty). `text_it` = 1/1 (drží staré testy).
- **`UpgradeDef.sideEffect`** = volitelný downside (AI Slop: +50 % spotřeba přes `consumptionMultiplier`).
  Multiplikativní efekty čte `effectProduct(type)` (kontroluje effect i sideEffect), aditivní `sumEffect(type)`.
- **Synergie přes `log10`** zůstatku měny (klesající výnos, žádné runaway). `virality` je odvozená
  (base + upgrady + platforma + Shares); v save se ukládá jen `viralityBase`.
- **Balanc konstanty** jsou nahoře v `Game.ts` (STREAK_*, ATTENTION_*, SYNERGY_*, BUBBLE_*, MAX_OFFLINE_*,
  OFFLINE_EFFICIENCY, SHARE_BY_RARITY…) a v `content/*.ts`. Cílově → JSON (Fáze 9).
- **Save je verzovaný** (`SAVE_VERSION`); nová pole dělej **volitelná** (jako `activePlatform`/`totalDopamine`),
  ať nezneplatníš hráčův save. Při breaking změně bumpni verzi.
- **`exactOptionalPropertyTypes: false`** v tsconfigu (kvůli volitelným polím).

---

## 8. Git & push (čti pozorně)

- Větev: **`claude/serene-goodall-af920r`** (vyvíjej a pushuj sem).
- **Push proxy v prostředí vrací 403** (App nemá write). Funguje jen **přímý push přes PAT** uživatele:
  ```bash
  git push "https://x-access-token:${TOKEN}@github.com/janKubice/DopamineScroller.git" \
    claude/serene-goodall-af920r:claude/serene-goodall-af920r
  ```
  (token v logu maskuj `| sed "s/${TOKEN}/***/g"`).
- **Token NENÍ v repu** — záměrně. Commitnutí PATu = leak + GitHub ho **automaticky revokuje**
  (secret scanning). Token dodá uživatel v chatu (předán v handover zprávě).
- Commit trailery (na konci každé zprávy):
  ```
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  Claude-Session: <session url>
  ```
- Žádné PR, dokud o něj uživatel výslovně nepožádá.

---

## 9. Co dál (priorita)

### ✅ Vlna 2 (pre-prestige, požadavky hráče) — HOTOVÁ
Hráč dal 10 bodů; **vlna 1 hotová** (#1 auto-scroller čekání, #2 slider hlasitosti, #3 schování maxed,
#5-část offline, #10 fix poskakování). **Vlna 2 hotová:**
- ✅ **#4** Postupné odemykání stromu upgradů (`UpgradeDef.unlock`: práh kumulovaného Dopaminu /
  prerekvizita; `UpgradeView.locked/visible/unlockHint`; `Game.buy` zamčené odmítá; harness
  schová/teaseruje). = backlog **T6**. Detail `GDD-03 §3.2`.
- ✅ **#6/#7** 11 nových „wow" upgradů s **novými typy efektů** (ne jen procenta): `bufferSpeedMult`
  (rychlejší buffering), `attentionMaxMult`/`attentionRegenMult` (Pozornost), `streakCapBonus`,
  `critChance`/`critMult` (**jackpot** swipe + event `Jackpot`), `offlineEfficiencyBonus`/
  `offlineCapHours`, `bandwidthMult`. Vše čteno dynamicky přes gettery. Tabulka `GDD-03 §3.2`.
- ✅ **#8** „Rychlejší načítání" přes `bufferSpeedMult` (doména) + **vizuální varianty zařízení**
  v harnessu (📞→📱→🎮→🖥️ dle pořadí telefonu; `GDD-04 §5`). Plný juice = Fáze 8.
- ✅ **#9** Vyjížděcí **panel upgradů** (boční drawer, FAB + odznak, kategorie Hardware/Algorithms/
  Network/Bots/Brain Rot přes `UpgradeView.category`/`categoryOf`) místo spodní lišty.
- ✅ **#5 rebalance** — měkký strop globálního produkčního multiplikátoru (`productionMultiplier`)
  v log prostoru: pod prahem (×1e6) beze změny, nad ním klesající výnos (`softCapLog10`,
  `PRODUCTION_SOFTCAP_LOG10`/`PRODUCTION_COMPRESSION`). HUD `⚙️ ×… 🧱`. „Od jisté fáze se hra nezlomí."

> ⚠️ **UI Vlny 2 (#8/#9) je build-verified, ne vizuálně** (v prostředí nebyl prohlížeč). Doména
> (#4/#5/#6/#7) je plně testovaná (158 zelených). Při dalším sezení projet harness očima.

### Pak: Fáze 6 — Prestige (Dopamine Overdose)
Overdose trigger (kritický DOP/s nebo milník) → kolaps/reset → **Clarity** měna → Zen shop
(Digitální Mnich…) → **Doomscroll Wrapped** (C5). `totalDopamineEarned` už trackuju (základ pro Clarity).

### Pak: Fáze 8 (plné UI + WebGL chaos shader), Fáze 9 (polish, balanc do JSON, achievementy, CAPTCHA/Skip-Ad minihry).
Backlog: `docs/TODO.md` (T3 loading minihra zbývá).

---

## 10. TL;DR pro start nové session
1. Přečti tenhle soubor + `docs/GDD-06-Roadmap.md` (stav) + `docs/TODO.md` (backlog).
2. Otevři `src/core/domain/Game.ts` — to je srdce.
3. Vezmi **Vlnu 2** (nebo co řekne uživatel). Drž architekturu (doména bez UI), piš testy, drž `docs/` v synchronu.
4. Po změně: typecheck → test → build → commit → push přes PAT (token od uživatele).
