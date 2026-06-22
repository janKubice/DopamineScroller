# GDD 04 — Vizuál & UI

Prezentační vrstva. **Žádná herní logika zde nežije** — UI je pouze pozorovatel domény
(odebírá eventy z event busu, čte stav). Implementace: Fáze 8 (`src/ui/`).

## 1. Art Direction & eskalace chaosu

| Fáze hry | Obrazovka |
|---|---|
| Early | 1 telefon, čisté rozhraní, pomalé načítání, bílé pozadí. Zvládnutelné tempo. |
| Mid | 5+ telefonů, skákají notifikace, červené bubliny, maily. UI zahlcené, nutně potřebuješ boty. |
| Late (Brain Rot) | Desítky zařízení, glitch efekty, saturace barev, stroboskop (Hidden Gems). Dopamine Overdose. |

## V1 — Chaos Level: chaos jako jeden měřitelný parametr ⭐

Klíčový nápad, který dělá „postupné zhoršování vizuálu" **programovatelným a balancovatelným**.

Doména exponuje jediný normalizovaný `chaosLevel ∈ [0,100]`:
```
chaosLevel = clamp(0..100,
    w1·deviceCount + w2·brainRotOwned + w3·pendingNotifications + w4·platformTier)
```
Prezentace ho jen **interpretuje** na efekty (žádná logika chaosu v UI):

| Chaos | Stav obrazovky |
|---|---|
| 0–20 | Klid, bílé pozadí, jeden telefon, žádný zvuk |
| 20–40 | První notifikace, mírné zvýšení saturace |
| 40–60 | Screen shake při swipe, autoplay zvuky, cookie lišty |
| 60–80 | Pop-up reklamy překrývají UI, blikání saturace, falešný kurzor |
| 80–100 | Glitch shadery, stroboskop, prvky rotují/odjíždějí, text se „rozpadá" |

> **WebGL vrstva:** glitch/stroboskop/saturace běží jako fullscreen **shader pass** nad DOM
> kompozicí (Pixi.js nebo raw WebGL). Vstup shaderu = `chaosLevel` + `dopaminePerSec`.

> 🟡 **Částečně implementováno (Fáze 5):** `Game.chaosLevel` (0–100) = f(telefony, Brain Rot
> upgrady, tier platformy). Harness ho mapuje na saturaci + hue-rotate (`--chaos`) a nad prahem
> na jemný glitch/chromatickou aberaci (`html.chaotic`). Plný WebGL shader pass je Fáze 8.

## V2 — Diegetické dark patterns (UI prvky)

Okamžitě čitelná satira poskládaná z reálných DOM prvků:
- **Cookie lišta**, kde „Odmítnout vše" je šedé / vyžaduje 7 kliků.
- **Falešné systémové varování** („Váš telefon je zavirován!") — klikatelné, někdy odměna, někdy past.
- **Nekonečný scrollbar** — táhlo se zmenšuje, jak scrolluješ, ale **nikdy nedojede dolů**.
- **„Úložiště plné" / „Slabá baterie"** na telefonu → zpomalí ho, dokud „nedokoupíš úložiště".

## V3 — Like button jako Skinner box (variabilní odměna)

Tlačítko Like vizuálně **eskaluje** s upgrady: prostý palec → částice srdíček → fontána →
výbuch přes celou obrazovku → **animace výplaty jako automat**. Mechanicky: Like dává většinou
×1, vzácně **jackpot ×50** s plnou slot-machine animací. Přiznaná satira variabilního posilovacího schématu.

## V4 — Color grading jako „dopamin metr"

Barevné ladění celé obrazovky řízené aktuálním **Dopaminem/s**: klid = šedá; růst → barvy
se sytí a oteplují; u prahu Overdose vše do hyper-saturované červené/magenty. Jediný
normalizovaný vstup → post-process LUT. Hráč „vidí" stav ekonomiky periferně.

## V5 — Overdose = fake crash → Zen Clarity (tonální whiplash)

Při Overdose: simulovaný **fake OS crash / kernel panic / BSOD** → tvrdý střih do **naprosto
klidné, minimalistické bílé** obrazovky Clarity (zde i „Doomscroll Wrapped", `GDD-03 §5.1`).
Prestige obrazovka je *jediná* dobře navržená, tichá obrazovka ve hře. Kontrast chaos → zen
je nejsilnější satirický moment loopu.

## 2. Obsah feedu (vizuál)

- Úmyslně low-budget: ~100 low-res obrázků procedurálně kombinovaných s tisíci texty.
- Ikonický „točící se kolečko" pomalého načítání jako podpis early game.
- Floating combat text: Dopamin vyskakuje z telefonů jako čísla; Hidden Gem = zlatá exploze
  čísel přes celou obrazovku (matchuje NeuralFeed „čísla skákající po obrazovce").

## 3. Layout & kamera

- 16:9, škálovatelné v prohlížeči (responsivní canvas/DOM).
- Start: jeden telefon uprostřed obří prázdné plochy.
- Rozšiřování: nová zařízení se přidávají vedle sebe — „farma". V late game auto-zoom-out + minimapa.
- Telefon „hladovějící" po Bandwidth je dim/desaturovaný s točícím kolečkem → okamžitý vizuální
  read bottlenecku.

## 4. Hranice Doména ↔ Prezentace

```
Doména (src/core)  ──events──►  Prezentace (src/ui)
   - emituje: PostReady, SwipeResolved, CurrencyChanged,
              CommentReaction(like/dislike), ChaosLevelChanged,
              HiddenGemFound, OverdoseTriggered ...
   - NEVÍ nic o DOM, canvasu, zvuku.
Prezentace čte stav + reaguje na eventy; do domény posílá jen Commands
(BuyPhone, Swipe, PostComment, AllocateBandwidth ...).
```

## 5. Stav dev harnessu (dočasné UI)

Než přijde plné UI (Fáze 8), dev harness už ukazuje principy:
- **Farma telefonů** — vykresluje se *každý* telefon (po koupi se rovnou objeví nová karta).
- **Vizuální varianty zařízení (#8)** — karty telefonů mají tier dle pořadí (📞 Cihla → 📱 Smartfoun →
  🎮 RGB → 🖥️ Bot Farma): rámeček/pozadí + ikonka zařízení, takže farma vizuálně „roste". Čistě
  prezentační (doména telefony nerozlišuje); plný juice (V1/V3) zůstává pro Fázi 8.
- **Vyjížděcí panel upgradů (#9)** — místo spodní lišty boční drawer (FAB 🛒 + odznak „kolik teď
  koupíš"), upgrady **seskupené do kategorií** Hardware/Algorithms/Network/Bots/Cosmetics/Brain Rot
  (`UpgradeView.category` ← `categoryOf`). Prázdné kategorie se schovají, zamčené (#4) teaserují.
- **Bohaté karty upgradů (#B)** — každá karta nese **popis (co dělá)** + **aktuální celkový bonus**
  (`now ×N.NN …` / `+N …` přes `UpgradeView.effectTotal` ← `effectTotalLabel`) + úroveň + cenu.
  Upgrady telefonů (rychlost načítání) jsou v **Hardware** a dostupné brzy (jeden bez zámku).
- **Floating combat text (#4 late-game „život")** — čísla Dopaminu vyletí z telefonů při swipu
  (zlatá u vzácných, `🎰` u jackpotu), karta krátce „cinkne", rarita postu má barvu. Strop `MAX_FLOATS`.
- **Kosmetické skiny (#3)** — vlastněný upgrade přepne třídu na `<html>`: 🌈 Neon, 📺 CRT scanlines,
  🌴 Vaporwave, 🏆 Gold, 🪩 Disco (+ juice: 🎉 Confetti Cannon, 💥 bigger floats, 📳 jackpot shake).
  Každý dá i malý bonus (satira placení za vzhled). Dark Mode 🌙 je teď taky v Cosmetics.
- **Síťové indikátory** — upgrady ukazují `📶 ±X`, HUD `📶 spotřeba/kapacita` + ⚠️ při přetížení.
- **Jackpot (V3 základ)** — crit swipe (upgrade 🎰 Jackpot Algorithm) vyplatí násobek, harness
  ukáže `🎰 JACKPOT ×N` notifikaci + konfety + zvuk (event `Jackpot`). Plná slot-machine animace = Fáze 8.
- **Produkční multiplikátor + měkký strop (#5)** — HUD ukáže `⚙️ ×<mult>`; nad prahem `🧱` (klesající
  výnos, viz `GDD-03 §3.2` rebalance) ať „se hra od jisté fáze nezlomí".
- **Prestige / Zen (Fáze 6)** — tlačítko 🧘 v topbaru otevře **Zen panel**: stav Clarity + „💊 OVERDOSE
  — collapse for +N 🧘" (aktivní při `canPrestige`) + obchod trvalých **Clarity upgradů** (`buyClarity`/
  `clarityView`). Po prestige se ukáže **Doomscroll Wrapped** modal (statistiky běhu). HUD má 🧘 Clarity
  + 💊 OVERDOSE / 🧘 +N pobídku. Po `Prestiged` se resetují telefonní karty a aktivní minihry.
- **Minihry Skip-Ad & CAPTCHA (M4)** — `AdSpawned` ukáže banner „📺 Sponsored — Buy More Dopamine™"
  s tlačítkem **Skip ▶▶ +N 🧠** (`skipAd`). `CaptchaSpawned` ukáže mřížku 3×3 „Select all 🚦"
  (`solveCaptcha` – přesný výběr správných dlaždic = odměna). Odemykají se vydělaným Dopaminem.
- **Zvuky** — syntetizované přes Web Audio (`SoundManager`): like, comment, dobrý/špatný komentář,
  pop bubliny, swipe, upgrade, hidden gem, cvakání naskakujících reakcí. Mute v horním pruhu.
- Vše čistě jako reakce na doménové eventy / Commands — žádná herní logika v UI.
