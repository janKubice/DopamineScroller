# GDD 06 — Vývojová roadmapa

**Filozofie:** domain-first, vertikální řezy. Veškerou logiku stavíme a testujeme
**headless** dřív, než ji napojíme na DOM/WebGL. Prezentace přichází naplno až ve Fázi 8,
kdy je doména hotová a otestovaná.

| Fáze | Milník | Obsah | Stav |
|---|---|---|---|
| **F0 — Základy** | „Běží tick a testy" | Vite+TS+Vitest, **BigNumber**, seedovaný **RNG**, **EventBus**, **GameClock** (offline-ready), kostra GameState | ✅ |
| **F1 — Core Loop** | „Scrolluju 1 telefon, Dopamin roste" | **Phone FSM**, měna Dopamin, **Wallet**, **CostCurve**, **Komentářová ruleta** (opožděné reakce), 1 platforma (Text-It), **Streak (M3)**, dev DOM harness | ✅ |
| **F2 — Ekonomika & Upgrady** | „Kupuju, čísla rostou exponenciálně" | **UpgradeStore** (generický Purchasable) + **hromadný nákup**, hardware (další telefony), algoritmy (**dopamineMultiplier**), spodní lišta upgradů | ✅ |
| **F3 — Bandwidth** | „Síť mě reálně omezuje" | Total vs. Consumption, **penalizační křivka** (exp. zpomalení), network upgrady (📡☎️🛜). QoS alokace (M5) → odloženo | ✅ |
| **F4 — Automatizace** | „Hra se hraje sama" | Boti **obsluhují telefony** (Auto-Liker/Scroller/Commenter) dle levelu, škálují s počtem telefonů, **Bandwidth náklad**, viditelný postih přetížení, **Pozornost (M1)**. (drobnost: streak bot-floor) | ✅ |
| **F5 — Obsah** | „Platformy se vyvíjejí, padají Gemy" | ✅ **Virality → Hidden Gems** (+T2, T1 konfety), ✅ **Platformy** (Text-It → NeuralFeed, odemykání, BR generování). Zbývá: **Brain Rot** větev (C2 toxické upgrady), **Synergie (M2)**, content provider | 🟡 |
| **F6 — Prestige** | „Loop se uzavírá" | **Dopamine Overdose** trigger + reset, výpočet **Clarity**, Zen shop, perzistence Clarity | ⬜ |
| **F7 — Offline & Save** | „Zavřu a otevřu, progres zůstal" | localStorage save + autosave, verzování, **offline výpočet** (closed-form rate × čas, cap 8 h) — *předtaženo* | ✅ |
| **F8 — UI & Juice** | „Vypadá to jako ta vize" | **Chaos Level (V1)** + WebGL shader overlay, **V3/V4** juice & color grading, **V2** dark patterns, audio, fixace rendereru (Pixi.js / raw WebGL) | ⬜ |
| **F9 — Polish & Balance** | „Hratelná satira" | Zbývající **minihry (M4)**: CAPTCHA, Skip-Ad, Outrage; balanc (konstanty jako data), achievementy, **Doomscroll Wrapped (C5)**, narativní hlas Algoritmu (C4) | ⬜ |

## Průřezové zásady (platí od F0)
- Balanc konstanty jako **externí data** (JSON), ne v kódu.
- **Determinismus** (seedovaný RNG) kvůli testům a save kompatibilitě.
- **BigNumber** všude pro měny a ceny.
- Tick **bez alokací** v horké smyčce.
- Data-driven obsah.

## Priorita nových mechanik (přání hráče)
Pořadí obliby: **Minihry (M4) → Streak (M3) → Pozornost (M1) → Synergie (M2)**.
Toto je priorita *designové důležitosti* (featured status, jistota zařazení).
**Sekvencování** ve fázích výše se přesto řídí technickými závislostmi:
- M3 (Streak) a Komentářová ruleta (M4) startují už v **F1** (jsou součástí core loopu).
- M1 (Pozornost) přijde s boty ve **F4**.
- M2 (Synergie) s obsahem ve **F5**.
- Zbylé minihry (M4) ve **F9** (rozhraní `IMiniGameResolver` připraveno dřív).

## Aktuální stav
- ✅ **F0 hotová** — `src/core/{math,time,events}`.
- ✅ **F1 hotová** — Phone FSM, Wallet, CostCurve, CommentPool (opožděné reakce), Streak, dev harness.
- ✅ **F2 hotová** — UpgradeStore + hromadný nákup, hardware, algoritmy (multiplikátory), spodní lišta.
- ✅ **F3 hotová** — Bandwidth bottleneck (kapacita vs. spotřeba, exp. penalizace, síťové upgrady).
- ✅ **F4 hotová** — boti obsluhují telefony (liker/scroller/commenter, škálují s telefony), viditelný postih sítě, **Pozornost (M1)**.
- ✅ **F7 hotová (předtaženo)** — save/load do localStorage + autosave + offline těžba (cap 8 h).
- 🟡 **F5 probíhá** — Virality/Hidden Gems (+T2, T1 konfety) a **platformy** (Text-It → NeuralFeed) hotové; zbývá Brain Rot větev (C2), Synergie (M2).
