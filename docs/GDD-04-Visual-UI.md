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
- **Dark Mode** — upgrade 🌙 přepne celé UI do tmavého motivu (CSS proměnné + třída `html.dark`).
- **Síťové indikátory** — upgrady ukazují `📶 ±X`, HUD `📶 spotřeba/kapacita` + ⚠️ při přetížení.
- **Zvuky** — syntetizované přes Web Audio (`SoundManager`): like, comment, dobrý/špatný komentář,
  pop bubliny, swipe, upgrade, hidden gem, cvakání naskakujících reakcí. Mute v horním pruhu.
- Vše čistě jako reakce na doménové eventy / Commands — žádná herní logika v UI.
