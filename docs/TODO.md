# TODO / Backlog

Nápady mimo aktuální fázi. Každá položka má dost detailu, aby šla později rovnou
naprogramovat, a tag fáze, kam logicky patří. Viz roadmapa `GDD-06-Roadmap.md`.

## Od hráče (k zařazení)

### ⬜ T1 — Konfety / juice u vzácných postů  `[Fáze 8 · quick-win možný dřív]`
Když padne **Rare/Epic/Legendary** post (event `HiddenGemFound` už existuje), spustit
**konfety / particle burst** + zvuk. Intenzita škáluje s raritou (Legendary = obrazovku
zaplaví). V dev harnessu lze udělat levnou CSS/canvas variantu hned; plný efekt ve Fázi 8
(juice, V3 — viz `GDD-04-Visual-UI.md`). Vstup: `rarity` z eventu.

### ⬜ T2 — Upgrade na šanci vzácných postů (Virality)  `[Fáze 5]`
Kupovatelný upgrade(y) zvyšující parametr `virality` → vyšší RNG šance na Rare/Epic/Legendary.
Doména: nový `UpgradeEffectType = 'virality'` (aditivní), `Game.rollRarity` už `virality`
bere — stačí ho napojit na upgrady místo konstanty 0. Tematicky: **„Third Eye"** (Clarity
shop, `GDD-03 §5`) a **Fake News Syndikát** (Brain Rot, `GDD-03 §4`). Příklad: „Third Eye" +0.2 virality/lvl.

### ⬜ T3 — Minihra během načítání (satira na neudržení pozornosti)  `[Fáze 9 · M4]`
Když je telefon ve stavu `buffering`, nabídnout **rychlou tap/clicker minihru** („tap for extra
dopamine") — hráč nevydrží čekat. Dává malý bonus Dopaminu, ale **paroduje neschopnost
tolerovat nudu** (vazba na M1 Pozornost: nadměrné ťukání během loadu může později zhoršit
Focus — satirický downside). Implementovat jako modul přes rozhraní `IMiniGameResolver` (M4).
Limit bonusu na jeden buffer, ať to není zneužitelné.

---

## Pozn.
Položky se po implementaci přesouvají do příslušné fáze v `GDD-06-Roadmap.md` a mažou odtud.
