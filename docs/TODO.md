# TODO / Backlog

Nápady mimo aktuální fázi. Každá položka má dost detailu, aby šla později rovnou
naprogramovat, a tag fáze, kam logicky patří. Viz roadmapa `GDD-06-Roadmap.md`.

## Od hráče (k zařazení)

### ✅ T1 — Konfety u vzácných postů  `[hotovo]`
Na `HiddenGemFound` spustí harness **konfety** (počet dle rarity: rare 14 / epic 30 /
legendary 70) + zvuk. Plný juice (V3) zůstává pro Fázi 8.

### ✅ T2 — Upgrade na šanci vzácných postů (Virality)  `[hotovo]`
Efekt `virality`; `Game.virality` = base + upgrady. 👁️ Third Eye (+0.5/lvl), 📰 Fake News
Syndicate (+1.5). Vyšší virality → víc Hidden Gems.

### ⬜ T3 — Minihra během načítání (satira na neudržení pozornosti)  `[Fáze 9 · M4]`
Když je telefon ve stavu `buffering`, nabídnout **rychlou tap/clicker minihru** („tap for extra
dopamine") — hráč nevydrží čekat. Dává malý bonus Dopaminu, ale **paroduje neschopnost
tolerovat nudu** (vazba na M1 Pozornost: nadměrné ťukání během loadu může později zhoršit
Focus — satirický downside). Implementovat jako modul přes rozhraní `IMiniGameResolver` (M4).
Limit bonusu na jeden buffer, ať to není zneužitelné.

### ✅ T4 — Auto-Scroller: nastavitelné čekání  `[hotovo]`
`Game.setSwipeWaitFor('none'|'like'|'comment'|'both')` + `canAutoSwipe` — auto-scroller swipne
jen posty splňující podmínku (s pojistkou `MAX_AUTO_WAIT`, ať se nezasekne). UI: select v pruhu.

### ✅ T5 — Schovat vymaxované upgrady  `[hotovo]`
Vymaxované upgrady se v liště skryjí (`display:none` dle `UpgradeView.maxed`). Plný panel = T6/#9.

### ⬜ T6 — Postupné odemykání stromu upgradů  `[Fáze 5/6]`
Upgrady se neukazují všechny hned, ale **odemykají postupně** (prahy kumulovaného Dopaminu
nebo prerekvizity – vlastnit jiný upgrade / platformu). Doména: `UpgradeDef.unlock?` (práh /
prereq), `UpgradeView` přidá `visible`/`locked`. UI ukáže jen odemčené (+ náznak „další brzy").

---

## Na opravu / rework (od hráče)

### ✅ FIX1 — Boti reálně obsluhují telefony  `[hotovo]`
Boti už nejsou abstraktní „+X/s", ale obsluhují telefony rychlostí dle levelu
(`Game.processBots`): **Auto-Liker** lajkuje načtené posty, **Auto-Scroller** je po prodlevě
(`AUTO_SCROLL_GRACE`) swipne, **Auto-Commenter** (nový) vyřeší ruletu. Škáluje s počtem
telefonů (málo levelů na hodně telefonů → posty se hromadí nelajkané/nezahozené). Offline =
closed-form swipe-cykly (`effectiveSwipesPerSecond`).

### ✅ FIX2 — Viditelný postih sítě  `[hotovo]`
Při přetížení: červený banner „NETWORK OVERLOADED" s reálnou rychlostí bufferingu,
zčervenalé telefony + zpomalený červený spinner (`html.overloaded`).

---

## Pozn.
Položky se po implementaci přesouvají do příslušné fáze v `GDD-06-Roadmap.md` a mažou odtud.
