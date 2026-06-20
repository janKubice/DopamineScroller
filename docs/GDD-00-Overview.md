# GDD 00 — High-Level Overview

## 1. Základní koncept (Core Premise)

**Dopamine Scroller** je satirická idle/clicker hra zaměřená na doomscrolling a
závislost na sociálních sítích. Hráč začíná s jedním základním zařízením, manuálně
„scrolluje" obsah a získává primární měnu **Dopamin**. Postupně automatizuje proces
nákupem lepších zařízení, softwarových botů a toxického obsahu (**Brain Rot**), aby
exponenciálně zvýšil zisk — což vede k nevyhnutelnému kolapsu (**Dopamine Overdose / Prestige**).

Satira funguje tak, že hráče nechá **prožít** mechaniky závislosti (variabilní odměna,
nekonečný scroll, FOMO, dark patterns) a zároveň je **pojmenuje**.

## 2. Designové pilíře

1. **Bottleneck jako napětí.** Růst není zadarmo. Propustnost sítě (a později lidská
   Pozornost) tvoří tvrdé stropy, které nutí hráče volit a optimalizovat.
2. **Chaos je odměna i trest.** Vizuální přetížení roste s úspěchem. Čím víc hráč „vyhrává",
   tím nesnesitelnější je obrazovka — až do Overdose.
3. **Aktivní vs. pasivní hra.** Hra jde hrát zběsile rukama i nechat běžet na botech.
   Optimální výkon vyžaduje obojí ve správný čas.
4. **Satira nad realismem.** Každá mechanika i název slouží vtipu a kritice. Tón je tmavý,
   absurdní, lokalizovaný do češtiny.
5. **Doména oddělená od prezentace.** Veškerá herní logika je čistá, deterministická a
   testovatelná bez UI. Prezentace je jen pozorovatel.

## 3. Technologický stack

| Vrstva | Volba | Poznámka |
|---|---|---|
| Platforma | **HTML5 / WebGL** | Hratelné v prohlížeči, distribuce přes itch.io a podobné weby. |
| Jazyk | **TypeScript** (strict) | Typová bezpečnost pro čistou doménovou vrstvu. |
| Build | **Vite** | Rychlý dev server + produkční build do statických souborů. |
| Testy | **Vitest** | Headless testy domény (ekonomika, stavové automaty). |
| Rendering | **DOM + WebGL overlay** | Crisp app-UI přes DOM; chaos/glitch/color-grading přes WebGL shader vrstvu (Pixi.js nebo raw WebGL). Fixujeme ve Fázi 8. |
| Čísla | Vlastní **`BigNumber`** | Vědecká notace (mantisa+exponent) kvůli exponenciálnímu růstu. Lze vyměnit za `break_eternity.js`. |

> **Důvod změny oproti původnímu C#:** cílem je okamžitá hratelnost na webu (itch.io)
> bez instalace. TypeScript zachovává původní architektonický princip — striktní
> oddělení logiky od prezentace — a doménová vrstva zůstává agnostická vůči rendereru.

**Jazyk:** Hra (player-facing: UI i obsah jako komentáře) je **anglicky** kvůli
mezinárodnímu publiku na itch.io. Tyto **GDD dokumenty zůstávají česky** jako interní
podklad pro vývoj.

## 4. Core Gameplay Loop (přehled)

```
        ┌─────────────────────────────────────────────────────┐
        │  SCROLL: hráč konzumuje obsah na 1+ telefonech       │
        │  -> Buffering -> Ready -> Interaction -> Swipe -> $   │
        └───────────────┬─────────────────────────────────────┘
                        │ Dopamin / Likes / Comments / Shares
                        ▼
        ┌─────────────────────────────────────────────────────┐
        │  INVESTICE: hardware, síť, boti, algoritmy           │
        └───────────────┬─────────────────────────────────────┘
                        │ naráží na
                        ▼
        ┌─────────────────────────────────────────────────────┐
        │  BOTTLENECK: Bandwidth (stroj) + Pozornost (člověk)  │
        └───────────────┬─────────────────────────────────────┘
                        │ automatizace + eskalace platforem
                        ▼
        ┌─────────────────────────────────────────────────────┐
        │  OVERDOSE: kolaps -> reset -> Clarity (trvalý bonus) │
        └─────────────────────────────────────────────────────┘
```

Detail viz `GDD-01-CoreLoop.md`.

## 5. Art Direction (přehled)

- **Rozlišení:** širokoúhlé 16:9, škálovatelné v prohlížeči.
- **Začátek:** jeden osamocený telefon uprostřed obří prázdné plochy. Klid, bílé pozadí.
- **Rozšiřování:** nová zařízení se fyzicky přidávají vedle sebe — „farma" telefonů.
- **Obsah feedu:** úmyslně low-budget. ~100 low-res obrázků procedurálně kombinovaných
  s tisíci náhodnými texty. Ikonický „točící se kolečko" pomalého načítání.
- **Eskalace chaosu:** řízená jedním parametrem **Chaos Level** (0–100). Viz `GDD-04-Visual-UI.md`.

Detail tónu a vizuálu viz `GDD-04-Visual-UI.md`.
