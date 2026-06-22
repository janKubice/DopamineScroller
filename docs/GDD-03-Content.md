# GDD 03 — Obsah & Progrese

Konkrétní herní obsah: platformy, hardware, upgrady, Brain Rot, Clarity shop.
Slouží jako podklad pro datové soubory (`src/core/content/`).

## 1. Evoluce platforem (Social Networks)

Hráč postupně odemyká novější, náročnější a návykovější platformy. Každá mění vizuál
feedu a nároky na síť.

| Platforma | Parodie | Obsah | Vlastnosti |
|---|---|---|---|
| **Text-It** | X/Twitter, stará fóra | Čistě textový feed | Nízká spotřeba, rychlé načítání, nízký base Dopamin |
| **Fakebook** | Facebook | Text + komprimované obrázky, rodinné hoaxy | Plný potenciál Like/Comment, střední nároky |
| **Insta-Klam** | Instagram | Dokonalé fotky, filtry, „influenceři" | Vysoká spotřeba, důraz na Shares + Hidden Gems |
| **TokTik** | TikTok | Krátká uřvaná low-res videa | Extrémní spotřeba; rychlý swipe = masivní Dopamin, ale pasivně generuje Brain Rot |
| **NeuralFeed** | — (end-game) | Přímé napojení na mozek, jen barvy/zvuky/čísla | Absolutní zátěž, nevyhnutelně vede k Overdose |

### 1.1 (C1) Nové fiktivní sítě — rozšíření
| Platforma | Parodie | Vtip / mechanika |
|---|---|---|
| **LinkedOut** | LinkedIn | Hustle-culture a humblebragy. „Souhlasím s tímto příspěvkem ✋." Generuje měnu **Cringe**. |
| **OnlyFanoušci** | OnlyFans | Paywall content; sázíš Dopamin na „odemčení" (creator economy + gambling). |
| **BeRealný** | BeReal | Jednou za „den" notifikace přinutí **všechny telefony naráz** k povinnému záběru. |
| **Mastodont** | Mastodon | Decentralizovaný, musíš vybrat „instanci"; nulový Brain Rot i dosah. Miluje to 12 lidí. |
| **Diskuze.cz** | Sekce pod článkem | Vrchol boomer rage-baitu. Maximální Brain Rot. Ryze český vtip. |
| **Vlákno** | Threads | Zoufalý klon Insta-Klamu „aby pobral zbytek pozornosti". |

### 1.2 Implementovaný systém platforem (Fáze 5)
Data v `src/core/content/platforms.ts` (`PlatformDef`). Platforma určuje **base Dopamin/post**,
**spotřebu sítě/telefon**, **virality bonus** a **Brain Rot/swipe**. Odemyká se kumulovaným
Dopaminem (`Game.totalDopamineEarned`); hráč přepíná aktivní (`Game.setPlatform`, eventy
`PlatformUnlocked`/`PlatformChanged`).

| Platforma | base DOP | Mbps/tel. | virality | BR/swipe | odemkne při |
|---|---|---|---|---|---|
| 🔤 Text-It | 1 | 1.0 | 0 | 0 | 0 |
| 📘 Fakebook | 4 | 1.5 | 0 | 0 | 500 |
| 📸 Insta-Klam | 12 | 2.5 | +0.5 | 0 | 10 000 |
| 🎵 TokTik | 40 | 4.0 | +0.3 | 0.5 | 250 000 |
| 🧠 NeuralFeed | 150 | 8.0 | +1.0 | 2.0 | 5 000 000 |

> Vyšší platforma = velký skok zisku, ale větší nároky na síť a (TokTik+) generuje **Brain Rot**
> (temná měna pro budoucí toxickou větev). Harness: přepínač pod HUD, feed mění ikonu dle platformy.

## 2. Hardware & Infrastruktura

### 2.1 Zařízení (Phones)
| Zařízení | Popis |
|---|---|
| Zděděná Cihla (tlačítkáč) | První telefon, pomalý swipe, žádný multitasking |
| Bazarový Smartfoun | Otevírá 2./3. instanci feedu |
| Gamer Pro RGB Phone | Svítí, obří výkon, swipe cooldown ~0 |
| Serverový Stojan (Bot Farm) | Místo telefonu rack s 10 emulátory |

### 2.2 (C3) Absurdní hardware — rozšíření
- **Lednička se Samsung Tizen OS** — „proč ne." Pomalý, ale always-on.
- **Neuralink klon (AliExpress edice)** — přímé napojení, 30 % šance „modřit obrazovku" (BSOD mozku).
- **Babiččin tablet se 400 toolbary** — vizuálně zahlcený malwarem, a přesto funguje.
- **Chytré hodinky (scrolluješ i na záchodě)** — drobný výnos, vždy po ruce.
- **Projektor na strop** — odemyká „3 ráno" noční bonus.
- **Server Rack v garáži** — eskalace bot farmy (konverze z krypto-mineru).

### 2.3 Infrastruktura sítě (Bandwidth)
| Upgrade | Bonus |
|---|---|
| Kradená sousedova Wi-Fi | +2 Mbps |
| Starý ADSL Modem | +10 Mbps |
| Optický kabel | +100 Mbps |
| 5G Vysílač na střeše | +1000 Mbps |

## 3. Strom vylepšení & Boti (základní progrese)

Kupováno za Dopamin (DOP) a mikro-měny (LCS).

**Software & Automatizace:**
- Ztvrdlý palec — manuální swipe cooldown −10 %.
- Auto-Liker v1.0 — 1×/s automaticky lajkne.
- Indická klikací farma (API) — auto-Comments na všech zařízeních.
- Dopamine-driven Auto-Scroller — po vyčerpání interakcí automaticky swipne.

**Algoritmy (zvyšování zisku):**
- Echo Chamber — ukazuje jen souhlasný obsah. +50 % base Dopaminu.
- Kitten Video Boost — každý 10. post roztomilé zvíře, garantovaný ×2.
- Outrage Algorithm — záměrně naštve = víc Comments (LCS).

### 3.1 Implementovaný nákupní systém (Fáze 2)
Upgrady jsou **data-driven** (`src/core/content/upgrades.ts`, typ `UpgradeDef`): cena
(měna, base, exponenciální multiplikátor), volitelný `maxLevel` a deklarativní `effect`
(`addPhone` | `dopamineMultiplier`). Ceny a úrovně spravuje `UpgradeStore`, nákup
(včetně **hromadného ×10**) a aplikaci efektů řeší `Game.buy`. Startovní sada:

| id | Název | Měna · base · mult | Efekt | Fáze |
|---|---|---|---|---|
| `secondhand_phone` | Secondhand Smartphone | DOP · 100 · 1.15 | +1 telefon (neomezeně) | F2 |
| `clickbait` | Clickbait Optimizer | DOP · 50 · 1.2 | ×1.1 Dopamin / úroveň | F2 |
| `echo_chamber` | Echo Chamber | DOP · 500 · — | ×1.5 Dopamin (max 1) | F2 |
| `kitten_boost` | Kitten Video Boost | DOP · 2500 · — | ×2 Dopamin (max 1) | F2 |
| `stolen_wifi` | Stolen Neighbor's Wi-Fi | DOP · 80 · 1.3 | +2 Mbps | F3 |
| `adsl` | Old ADSL Modem | DOP · 800 · 1.3 | +10 Mbps | F3 |
| `fiber` | Fiber Optics | DOP · 10000 · 1.4 | +100 Mbps | F3 |
| `finger_warmup` | Finger Warm-Up | DOP · 35 · 1.3 | auto-swipe +0.2 postů/s (žere síť) | F4 |
| `auto_liker` | Auto-Liker Bot | DOP · 150 · 1.25 | auto-lajk +1 post/s (žere síť) | F4 |
| `auto_scroller` | Auto-Scroller Bot | DOP · 200 · 1.25 | auto-swipe +0.5 postů/s, **těží i offline** | F4 |
| `auto_commenter` | Auto-Commenter Bot | DOP · 350 · 1.3 | auto-komentář +0.3/s (COM + reakce) | F4 |

> Algoritmy se skládají **multiplikativně** do `Game.productionMultiplier` (spolu se Streakem
> = globální multiplikátor swipe Dopaminu). **Boti obsluhují reálné telefony** rychlostí dle
> levelu (`Game.processBots`): lajk → komentář → swipe (po prodlevě `AUTO_SCROLL_GRACE`). Když
> bot nestíhá počet telefonů, posty se hromadí nelajkané/nezahozené → tlak kupovat lepší boty.
> Offline = closed-form swipe-cykly (`effectiveSwipesPerSecond`). Balanc konstanty → JSON (Fáze 9).

> **Virality (Hidden Gems):** 👁️ **Third Eye** (DOP 400 ·1.45, +0.5 virality/lvl),
> 📰 **Fake News Syndicate** (DOP 5000, +1.5 virality, max 1). Vyšší virality = víc Rare/Epic/
> Legendary postů (`Game.virality`, efekt `virality`).

> **Rozšířený roster (early/mid pacing):** v `upgrades.ts` je nyní **51 upgradů** (vč. Vlny 2 §3.2,
> Cosmetics §3.3 a Brain Rot větve §4.2) seřazených
> od nejlevnějšího — první (🥤 Energy Drink) je dostupný už za **10 DOP**, takže hned je co
> kupovat. Mix: levné dopamine-multiplikátory (Dark Mode, Push Notifications, Infinite Scroll,
> For You Page, Verified Badge, Algorithm Whisperer…), early auto-tapper (Finger Warm-Up),
> minihra (🫧 Dopamine Detector odemyká bubliny, 💧 Bigger Hits, ⏩ Faster Bubbles), hardware,
> síť a boti. 🌙 **Dark Mode** navíc přepne UI do tmavého motivu. Zdroj pravdy je `upgrades.ts`.

> **Síťový dopad v UI:** tlačítka upgradů ukazují `📶 −X` (spotřeba: telefony, boti) nebo
> `📶 +X` (kapacita: routery), a po nákupu vyskočí notifikace s aktuální spotřebou/kapacitou.
> View model: `UpgradeView.networkDelta`/`networkKind`.

### 3.2 Vlna 2 — postupné odemykání + nové typy efektů (pre-prestige)

**Postupné odemykání stromu (T6/#4):** `UpgradeDef.unlock?` se dvěma nezávislými podmínkami:
`dopamine` (práh **kumulovaného** Dopaminu, `Game.totalDopamineEarned` — ne aktuální zůstatek!)
a `requires`/`requiresLevel` (vlastnictví jiného upgradu). `Game.buy` zamčený upgrade odmítne.
`UpgradeView` nese `locked` (nelze koupit), `visible` (ukázat v UI) a `unlockHint`:
- **prerekvizita nesplněna** → úplně schováno (`visible:false`, žádný spoiler),
- **chybí jen práh Dopaminu** → „teaser" (`visible:true`, `locked:true`) jakmile je práh aspoň
  z poloviny (`UNLOCK_TEASER_FRACTION`) dosažen; harness ukáže `🔒 <práh> 🧠 total` a zakáže nákup.

Aplikováno na bubble upgrady (`bigger_hits`/`faster_bubbles` ⇒ `requires dopamine_detector`) a na
mid/late strom + celou Vlnu 2 (prahy Dopaminu). Early upgrady zůstávají bez zámku (start není prázdný).

**Nové typy efektů** (deklarativní, čtené dynamicky přes gettery — žádná akce při nákupu):

| efekt | getter | význam |
|---|---|---|
| `bufferSpeedMult` | `bufferSpeedMultiplier` | × rychlost bufferingu (rychlejší načítání postů) |
| `attentionMaxMult` | `maxAttention` | × maximum Pozornosti (M1) |
| `attentionRegenMult` | `attentionRegenMultiplier` | × regenerace Pozornosti |
| `streakCapBonus` | `streakMax` | + strop streaku (M3) |
| `critChance` | `critChance` | šance na **jackpot** swipe (0–1, cap `CRIT_CHANCE_CAP` 0.9) |
| `critMult` | `critMultiplier` | + násobič jackpotu (base `JACKPOT_BASE_MULT` 5) |
| `offlineEfficiencyBonus` | `offlineEfficiency` | + efektivita offline těžby (cap 1.0) |
| `offlineCapHours` | `maxOfflineSeconds` | + strop offline těžby (hodiny) |
| `bandwidthMult` | `totalBandwidth` | × celková kapacita sítě |

> **Jackpot (crit):** při swipe se hodí RNG **jen pokud `critChance > 0`** (jinak se nesahá na
> RNG stream → determinismus starších save/testů). Trefa vynásobí Dopamin `critMultiplier`× a
> emituje event `Jackpot`. Odhad i offline počítají očekávaný přínos přes `expectedCritFactor`.

| id | Název | Měna · base · mult | Efekt | Odemčení |
|---|---|---|---|---|
| `fresh_battery` | 🔋 Close Background Apps | DOP · 45 · 1.3 | +10 % buffering/lvl | — (early) |
| `gigabit_thumbs` | ⚡ Gigabit Thumbs | DOP · 400 · 1.4 | +15 % buffering/lvl (telefon) | — (early) |
| `predictive_preload` | 🔮 Predictive Preload | DOP · 9000 · 1.5 | +25 % buffering/lvl | 12k 🧠 + Gigabit Thumbs Lv3 |
| `meditation_app` | 🧘 Meditation App | DOP · 600 · 1.45 | +50 % regen Pozornosti/lvl | 500 🧠 |
| `adderall` | 💊 Off-Brand Adderall | DOP · 1200 · 1.5 | +40 % max Pozornost/lvl (max 8) | 900 🧠 |
| `doomscroll_stamina` | 🥵 Doomscroll Stamina | DOP · 2000 · 1.6 | +0.5 strop streaku/lvl (max 6) | 1.8k 🧠 |
| `jackpot_algo` | 🎰 Jackpot Algorithm | DOP · 3000 · 1.55 | +5 % šance jackpotu/lvl (max 12) | 2.5k 🧠 |
| `mega_jackpot` | 💰 Mega-Jackpot Mode | DOP · 18000 · 1.6 | +3 výplata jackpotu/lvl (max 8) | 20k 🧠 + Jackpot Algo Lv2 |
| `time_dilation` | ⏳ Time-Dilation Field | DOP · 5000 · 1.5 | +10 % offline efektivita/lvl (max 5) | 5k 🧠 |
| `cloud_backup` | ☁️ Cloud Backup | DOP · 7000 · 1.5 | +2 h offline cap/lvl (max 6) | 6k 🧠 |
| `data_center` | 🏢 Personal Data Center | DOP · 25000 · 1.7 | ×2 kapacita sítě/lvl (max 4) | 30k 🧠 + Fiber Optics |

### 3.3 Cosmetics & čitelnost karet (pre-prestige polish)

**Kosmetické skiny** (kategorie `cosmetics`, `category` natvrdo): vlastněný upgrade přepne vizuální
třídu UI a dá malý bonus Dopaminu (satira placení za vzhled). 🌙 Dark Mode, 🌈 Neon, 📺 CRT, 🌴 Vaporwave,
🏆 Gold, 🪩 Disco + „juice" 🎉 Confetti Cannon / 💥 Floating Combo Text / 📳 Haptic Overdrive (jackpot shake).
Harness je čte podle `id` (jako Dark Mode) — žádné nové efekt-typy. Detaily vizuálu `GDD-04 §5`.

**Čitelnost karet (#B):** `UpgradeView.effectTotal` (← `effectTotalLabel(def, level)`) dává lidsky
čitelný **aktuální** bonus (`×N.NN Dopamine`, `+N Mbps`, `+N% jackpot chance`, `active`…). Karta ukazuje
popis *co dělá* + tento souhrn + úroveň + cenu.

**Kategorie & discoverability:** `categoryOf` řadí `bufferSpeedMult` (rychlost telefonu) do **Hardware**
vedle `addPhone`; `fresh_battery`/`gigabit_thumbs` jsou bez zámku (hned je čím „upgradovat telefon").

## 4. Temná větev: Brain Rot

Kupováno za Brain Rot. Způsobuje vizuální poškození UI (glitche, reklamy), ale obrovsky zvyšuje produkci.

| Upgrade | Efekt |
|---|---|
| Rage-Bait Generátor | Provokativní popisky, výrazně ↑ zisk z Comments |
| AI Slop Factory | Levný AI balast: +300 % Dopaminu, ale +50 % spotřeba sítě |
| Hate-Speech Boti | Vyklikají všechny interakce za sekundu |
| Fake News Syndikát | Maximalizuje šanci na Hidden Gems mezi konspiracemi |

### 4.1 (C2) Brain Rot upgrady — rozšíření
- **Alfa Samec Podcast** — pasivně generuje Brain Rot, občas tě „pro motivaci" urazí.
- **Skibidi Generátor** — Gen-Alpha balast; masivní Dopamin, ale „Mozkový věk −5 let".
- **Dezinformační Babička** — přeposílač hoaxů z rodinného chatu.
- **Pětiminutová Nenávist** (1984) — naplánovaná outrage událost, globální boost Comments.
- **AI Přítelkyně (beta)** — parasociální companion, „miluje" tě za engagement.
- **Influencer Detox Čaj (MLM)** — pyramidový bot.

### 4.2 Implementováno (Fáze 5)
Kupováno za 🧟 **Brain Rot** (generuje TokTik+). Velký boost, ale **poškozuje UI** (zvyšují
`chaosLevel` → glitch/saturace v harnessu, viz `GDD-04 §V1`).

| id | Název | Cena (BR) | Efekt | Downside |
|---|---|---|---|---|
| `rage_bait` | 😡 Rage-Bait Generator | 20 ·1.5 | ×1.6 Dopamin/lvl | — |
| `hate_bots` | 💢 Hate-Speech Bots | 40 ·1.4 | +3 auto-lajky/s/lvl | — |
| `ai_slop` | 🗑️ AI Slop Factory | 150 (max 1) | ×4 Dopamin | **+50 % spotřeba sítě** (`consumptionMultiplier`) |
| `neural_implant` | 🧠 Neural Implant (Beta) | 80 ·1.5 | ×2 regen Pozornosti/lvl (max 5) | chaos ↑ (vyžaduje AI Slop) |
| `skibidi` | 🚽 Skibidi Generator | 300 (max 1) | ×2.5 Dopamin | „mozkový věk −5 let" (vyžaduje AI Slop) |

> `UpgradeDef.sideEffect` umožní upgradu mít i downside (AI Slop). `chaosLevel` = f(telefony,
> Brain Rot upgrady, tier platformy).

## 5. Prestige Obchod (Clarity Upgrades) — „Zenový obchod"

### 5.1 Implementováno (Fáze 6)
**Prestige** („Dopamine Overdose"): `Game.prestige()` vymění běh za 🧘 **Clarity** a vše resetuje.
Zisk: `clarityOnPrestige()` = `floor((totalDopamineEarned / 1e6)^0.5)` (sqrt škálování, klesající výnos;
`canPrestige` = ≥ 1 Clarity). `isOverdosing` = Dopamin/s ≥ ~1e9 (UI flavor + pobídka). Reset vynuluje
běhové měny (DOP/LIK/COM/SHR/BR), upgrady, telefony (→1), platformy, streak, virality, totalDopamine;
**Clarity + Zen upgrady přežijí** (samostatný `clarity` store). Emituje `Prestiged` s Wrapped.

Clarity (Zen) upgrady (`content/clarity.ts`, **trvalé**, čteny stejnými gettery přes 2. store, **bez
měkkého stropu**):

| id | Název | Cena (CLA) | Efekt |
|---|---|---|---|
| `digital_monk` | 🧘 Digital Monk | 1 ·1.6 | trvale +10 % Dopamin/lvl |
| `cleared_cache` | 🧹 Cleared Cache | 1 ·1.6 | trvale +12 % buffering/lvl |
| `inner_eye` | 👁️‍🗨️ Inner Eye | 2 ·1.7 | trvale +0.5 virality/lvl |
| `lossless_mind` | 🗜️ Lossless Compression | 2 ·1.7 | trvale ×1.2 bandwidth/lvl |
| `astral_projection` | ☯️ Astral Projection | 3 ·1.8 | trvale +10 % offline/lvl (max 5) |
| `flow_state` | 🌊 Flow State | 4 ·1.8 | trvale +0.5 strop streaku/lvl (max 8) |

Save **v2**: `clarityUpgrades`, `lifetime` (prestiges/clarityEarned/dopamineAllTime), `run` (statistiky).
Stará v1 save se načte s defaulty.

### 5.2 (C5) „Doomscroll Wrapped" — implementováno
Na prestige se ukáže shrnutí běhu (`WrappedSummary`): vydělaný Dopamin, swipy, lajky, komentáře,
Hidden Gems, jackpoty, čas, zisk Clarity + hláška *„Your most frequent feeling: emptiness."*
Parodie Spotify Wrapped — emocionální tečka resetu.

## 6. (C4) Narativní vrstva

- **Hlas „Algoritmu"** — neviditelný antagonista; systémové hlášky tě chválí za závislost,
  postupně děsivější.
- **Falešné ToS** na startu (zeď textu, vtipy + foreshadowing Overdose).
- **Dystopické loading tipy** („Tip: Mrkání je ztráta času.").
- **Fake patch notes** jako flavor („Text-It koupil miliardář a přejmenoval na ‚X'.").

## 7. (C1 obsah) Komentáře pro Komentářovou ruletu

Datová sada `src/core/content/comments.json` (cílově ~100). Kategorie: `hot-take`,
`wholesome`, `copypasta`, `troll`, `normie`, `cringe`. Schéma viz `GDD-01 §4.2`.
Startovní sada je součástí Fáze 1 a postupně se rozšiřuje.
