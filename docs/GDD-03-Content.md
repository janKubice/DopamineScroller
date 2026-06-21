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

> **Rozšířený roster (early/mid pacing):** v `upgrades.ts` je nyní **27 upgradů** seřazených
> od nejlevnějšího — první (🥤 Energy Drink) je dostupný už za **10 DOP**, takže hned je co
> kupovat. Mix: levné dopamine-multiplikátory (Dark Mode, Push Notifications, Infinite Scroll,
> For You Page, Verified Badge, Algorithm Whisperer…), early auto-tapper (Finger Warm-Up),
> minihra (🫧 Dopamine Detector odemyká bubliny, 💧 Bigger Hits, ⏩ Faster Bubbles), hardware,
> síť a boti. 🌙 **Dark Mode** navíc přepne UI do tmavého motivu. Zdroj pravdy je `upgrades.ts`.

> **Síťový dopad v UI:** tlačítka upgradů ukazují `📶 −X` (spotřeba: telefony, boti) nebo
> `📶 +X` (kapacita: routery), a po nákupu vyskočí notifikace s aktuální spotřebou/kapacitou.
> View model: `UpgradeView.networkDelta`/`networkKind`.

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
| `skibidi` | 🚽 Skibidi Generator | 300 (max 1) | ×2.5 Dopamin | „mozkový věk −5 let" |

> `UpgradeDef.sideEffect` umožní upgradu mít i downside (AI Slop). `chaosLevel` = f(telefony,
> Brain Rot upgrady, tier platformy).

## 5. Prestige Obchod (Clarity Upgrades) — „Zenový obchod"

Po Overdose hra spadne; hráč začíná od nuly s **Clarity**. Utratí ji před novým během:

| Upgrade | Efekt |
|---|---|
| Digitální Mnich | Trvalý +10 % ke všem ziskům Dopaminu / úroveň |
| Vyčištěná cache | Base Buffering trvale −15 % (rychlejší) |
| Třetí Oko (vnímavost) | Trvale ↑ RNG šance na Hidden Gems |
| Bezztrátová komprese | Telefony i boti trvale −10 % Bandwidth |

### 5.1 (C5) „Doomscroll Wrapped"
Na Overdose/Clarity obrazovce parodie Spotify Wrapped:
> *„Naskrolloval jsi 47 km. Lajkoval jsi 12 400×. Strávil jsi 0 minut venku.
> Tvůj nejčastější pocit: prázdnota."*

Spojuje prestige s nejtvrdší satirou a dává resetu emocionální tečku.

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
