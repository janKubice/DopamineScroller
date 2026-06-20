# Dopamine Scroller

Satirická idle/clicker hra o doomscrollingu a závislosti na sociálních sítích.
Hráč začíná s jedním osamoceným telefonem, manuálně scrolluje obsah a získává
**Dopamin**. Postupně automatizuje proces nákupem zařízení, botů a toxického
**Brain Rotu**, naráží na **bottleneck propustnosti sítě** a exponenciálně roste
až k nevyhnutelnému kolapsu — **Dopamine Overdose** (Prestige).

> ⚠️ Hra je satira. Cílem je ukázat mechaniky závislosti tím, že je necháme
> hráče prožít a pojmenuje je.

## Tech stack

- **Platforma:** HTML5 / WebGL (hratelné v prohlížeči, distribuce přes itch.io a podobné).
- **Jazyk:** TypeScript (striktní režim).
- **Build:** [Vite](https://vitejs.dev/) → statické soubory pro itch.io.
- **Testy:** [Vitest](https://vitest.dev/) (doménová vrstva je plně testovatelná headless).
- **Architektura:** Striktní oddělení **doménové/herní logiky** (`src/core`, bez závislosti
  na DOM/WebGL) od **prezentační vrstvy** (`src/ui`). Viz `docs/GDD-05-Architecture.md`.

## Spuštění

```bash
npm install      # instalace závislostí
npm run dev      # vývojový server (http://localhost:5173)
npm run build    # produkční build do dist/ (nahratelné na itch.io)
npm test         # spustí testy doménové vrstvy
npm run typecheck# kontrola typů bez buildu
```

## Struktura repozitáře

```
docs/                  # Game Design Documents (konsolidovaný GDD)
src/
  core/                # DOMÉNA – čistá herní logika, ŽÁDNÁ závislost na UI
    math/              #   BigNumber, seedovaný RNG
    time/              #   herní hodiny / tick systém (s podporou offline převíjení)
    events/            #   event bus (Doména -> Prezentace)
    economy/           #   peněženka (měny), cenové křivky
    domain/            #   stavový automat telefonu, kořenový herní stav
    content/           #   data-driven obsah (komentáře, později posty/upgrady)
  ui/                  # PREZENTACE – DOM + WebGL (přijde ve Fázi 8)
  main.ts              # dev harness (dočasné, propojí doménu s minimálním DOM)
index.html             # vstupní bod HTML5
```

## Dokumentace (GDD)

| Dokument | Obsah |
|---|---|
| [`GDD-00-Overview`](docs/GDD-00-Overview.md) | Koncept, pilíře, tech stack, tón |
| [`GDD-01-CoreLoop`](docs/GDD-01-CoreLoop.md) | Herní smyčka, stavový automat telefonu, **Komentářová ruleta** |
| [`GDD-02-Mechanics`](docs/GDD-02-Mechanics.md) | Ekonomika, Bandwidth, **nové mechaniky M1–M5** |
| [`GDD-03-Content`](docs/GDD-03-Content.md) | Platformy, hardware, upgrady, Brain Rot, **obsah C1–C5** |
| [`GDD-04-Visual-UI`](docs/GDD-04-Visual-UI.md) | Art direction, **Chaos Level**, UI nápady **V1–V5** |
| [`GDD-05-Architecture`](docs/GDD-05-Architecture.md) | Technická architektura pro HTML5/TS/WebGL |
| [`GDD-06-Roadmap`](docs/GDD-06-Roadmap.md) | Fázovaná vývojová roadmapa |

## Stav vývoje

- ✅ **Fáze 0 — Základy:** struktura projektu, BigNumber, seedovaný RNG, event bus, tick systém.
- 🟡 **Fáze 1 — Core Loop (probíhá):** stavový automat telefonu, měna Dopamin, peněženka,
  cenová křivka, základ Komentářové rulety, dev harness.
- ⬜ Fáze 2+ — viz roadmapa.
