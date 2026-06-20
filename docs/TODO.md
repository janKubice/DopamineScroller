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

## Na opravu / rework (od hráče)

### 🔧 FIX1 — Boti mají reálně obsluhovat telefony (ne abstraktní rate)  `[F4 rework]`
**Dnešní stav:** `auto_liker`/`auto_scroller` jsou jen `passiveLikes`/`passiveDopamine`
(+X/s do peněženky) — *neinteragují s telefony*. **Cíl** (očekávání hráče + původní GDD):
- **Auto-Liker** — lajkuje *načtené, nelajknuté* posty rychlostí danou levelem (lajků/s).
  Čím víc telefonů, tím vyšší level potřeba, aby to stíhal; co nestihne, zůstane nelajknuté
  (ušlý zisk). Upgrady zvyšují rychlost.
- **Auto-Scroller** — jakmile jsou interakce hotové (nebo po prodlevě dle levelu), automaticky
  swipne post. Rychlost/prodleva dle levelu; musí stíhat počet telefonů.
- **Auto-Commenter (NOVÝ)** — automaticky vybere a postne komentář (vyřeší ruletu) na načtené
  posty; rychlost dle levelu. Generuje COM + reakce. Upgrady: rychlost (příp. bias na kvalitu).
- **Návrh:** každý bot = „pool pracovníků" s propustností (akcí/s); každý tick rozdělí akce
  mezi vhodné telefony. Škálování s počtem telefonů → tlak kupovat lepší boty (přesně jak chce hráč).
- **Offline:** s auto-scrollerem řídícím telefony počítat swipe-cykly **uzavřeně**
  (cycleTime ≈ bufferTime/scale + prodleva) × telefony, zastropováno. Nahradí dnešní plochý
  `passiveDopamine` offline výpočet.
- Spotřeba sítě botů zůstává (napojení na bandwidth z F3).
- *Pozn.: tohle je posun od „idle rate" abstrakce zpět k „bots jako tick-aktoři na telefonech".*

### 🔧 FIX2 — Viditelný postih při nedostatku sítě  `[F8 · lze hned]`
Při přetížení (`game.isOverloaded`) udělat postih **vidět**, ne jen malé ⚠️ v HUD:
- Telefony v „throttled" stavu — červený/zpomalený spinner, ztmavnutí karty, štítek „SLOW".
- Výrazný banner: „⚠️ NETWORK OVERLOADED — everything is crawling".
- Volitelně: ukazatel reálné rychlosti bufferingu (×0.07 apod.).

---

## Pozn.
Položky se po implementaci přesouvají do příslušné fáze v `GDD-06-Roadmap.md` a mažou odtud.
