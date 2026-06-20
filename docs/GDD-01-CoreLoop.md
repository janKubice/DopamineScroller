# GDD 01 — Core Loop & Stavový automat

Tento dokument popisuje **doménovou logiku** herní smyčky. Neřeší UI (viz `GDD-04`).

## 1. Mikro-smyčka: životní cyklus jednoho telefonu (State Machine)

Každý telefon je nezávislá entita s vlastním stavovým automatem. Obsah prochází fázemi:

| Stav | Popis | Přechod |
|---|---|---|
| `Buffering` | Telefon stahuje data postu. Doba = funkce přidělené **Bandwidth**. Hráč nemůže nic dělat. | po uplynutí `bufferTime` → `Ready` |
| `Ready` | Post je načten a zobrazen. | hráč/bot zahájí interakci → `Interacting`, nebo rovnou `Swipe` |
| `Interacting` | Probíhají akce Like / Comment / Share. Každá má cooldown a generuje mikro-měnu. | po vyčerpání/ukončení interakcí → zpět `Ready` |
| `Swiping` | Krátká animace zahození postu, inkasuje se hlavní odměna v **Dopaminu**. | → `Buffering` (nový post) |

```
 Buffering ──(bufferTime hotovo)──> Ready ──(swipe)──> Swiping ──> Buffering
                                      │  ▲
                          (like/comment/share)
                                      ▼  │
                                  Interacting
```

**Implementační poznámka:** stav telefonu je čistá data + funkce `advance(dt)`.
Žádné časovače na vláknech — vše řídí centrální `GameClock` (viz `GDD-05`). Stav je
serializovatelný (save/load i offline převíjení).

> Implementace: `src/core/domain/Phone.ts` (Fáze 1).

## 2. Makro-smyčka: hráč a multitasking

Hráč obsluhuje více telefonů najednou. Typický mid-game okamžik: Telefony 1 a 2 jsou
v `Buffering`, na Telefonu 3 hráč zuřivě kliká Likes a pak swipne. Multitasking je jádrem
aktivní hry a později se naráží na **Pozornost** (M1, viz `GDD-02`).

## 3. Interakce a měny za swipe

- **Swipe** inkasuje hlavní **Dopamin** = `basePostValue × algorithmMultiplier × streakMultiplier × rarityMultiplier`.
- **Like / Comment / Share** generují mikro-měny (LCS) a krmí synergie (M2).
- **Rarita postu** (Hidden Gems) se losuje při generování postu podle parametru `Virality` (viz `GDD-02 §5`).

## 4. ⭐ Komentářová ruleta (Comment Roulette) — klíčová mechanika

> Nahrazuje původní „klikni na Comment → měna". Komentování je nyní **minihra o validaci**
> — gamifikovaný gambling o liky, který doslova zhmotňuje variabilní odměnu sociálních sítí.

### 4.1 Průběh

1. Hráč na postu ve stavu `Ready` zvolí **Komentovat**.
2. Hra nabídne **3 náhodné komentáře** vylosované z datové sady (`comments.json`, cílově ~100 typů).
3. Hráč jeden vybere a „postne" ho.
4. Komentář začne v reálném čase sbírat **liky a disliky** — reakce „naskakují"
   k příspěvku postupně po dobu `reactionWindow` (≈ 4 s), **ne najednou**.
5. **Výsledné net-liky** určí odměnu v **Dopaminu** (+ Comment měna). Smůla = převaha disliků
   = malá odměna, případně drobná penalizace (nalomení streaku / kapka Brain Rotu).

**Pravidla & implementace (důležité):**

- **Jen jednou na post:** Like i Komentář lze na jeden načtený post dát **pouze jednou**
  (jako na reálné síti). UI po akci tlačítko obarví a deaktivuje; reset přijde s novým postem.
- **Opožděný outcome:** Hráč se výsledek (`viral`/`ok`/`flop`) **nedozví hned**. Komentář
  se odešle, reakce naskakují v čase a teprve na konci okna „vyskočí" notifikace s výsledkem.
  Dopamin/Brain Rot se připisují **průběžně**, jak liky naskakují. Reakce běží **nezávisle**
  na telefonu — můžeš mezitím dál scrollovat, liky na tvém komentáři dál přibývají.
- **Doménové eventy:** `CommentPosted` (odesláno) → opakovaně `CommentReaction`
  (`{kind: 'like'|'dislike'}`, jeden naskočený lajk/dislajk) → `CommentResolved`
  (`{result}`, finální outcome). Logika streamování žije v `Game.advanceReactions`.

### 4.2 Datový model komentáře (`comments.json`)

```jsonc
{
  "id": "hot_take_01",
  "text": "Tohle je přesně důvod, proč už nikomu nevěřím.",
  "category": "hot-take",      // hot-take | wholesome | copypasta | troll | normie | cringe
  "baseQuality": 0.55,          // 0..1 střední úspěšnost (posun rozdělení reakcí)
  "variance": 0.35,             // 0..1 rozptyl (vyšší = větší risk/reward)
  "brainRotAffinity": 0.2       // 0..1 podíl odměny, který padne jako Brain Rot místo Dopaminu
}
```

### 4.3 Matematika reakce (deterministicky, seedovaný RNG)

```
quality  = clamp01( baseQuality + playerSuccessBonus )         // upgrady posouvají střed
spread   = variance × (1 - playerConsistencyBonus)             // upgrady snižují rozptyl
score    = clamp(-1..1)  z N(mean = (quality*2 - 1), sd = spread)   // -1 = totální flop, +1 = viral

likes    = max(0,  score) × likeYield × phoneReachMultiplier × notificationDensity
dislikes = max(0, -score) × dislikeYield × (1 - thickSkin)
net      = likes - dislikes

dopamin  = max(0, net) × (1 - brainRotAffinity) × commentDopamineValue
brainRot = max(0, net) × brainRotAffinity × commentBrainRotValue
penalty  = max(0, -net) × flopPenalty            // smůla: malá ztráta / nalomení streaku
```

- `notificationDensity` roste s počtem telefonů a upgradů → **víc telefonů = víc skákajících
  reakcí = víc Dopaminu, ale i víc co ztratit** (přesně jak si přál hráč).
- Reakce se přehrávají jako **stream událostí** (liky/disliky po jednom) v `reactionWindow`
  pro maximální „juice" — viz prezentační vrstva (`GDD-04`).

### 4.4 Související upgrady (designové háčky)

| Upgrade | Efekt na vzorec |
|---|---|
| „Provokatér" | `playerSuccessBonus` ↑ (vyšší šance na viral) |
| „Copywriter AI" | `playerConsistencyBonus` ↑ (menší rozptyl, stabilnější výnos) |
| „Klakeři / bot army" | `likeYield` ↑ (víc liků za stejný score) |
| „Silná kůže" (Thick Skin) | `thickSkin` ↑ (disliky méně bolí) |
| „Náhled algoritmu" | odhalí odhad kvality 3 nabízených komentářů **před** postnutím |
| „Čtvrtá možnost" | nabídne 4 komentáře místo 3 (lepší volba) |

### 4.5 Vazby na ostatní systémy

- **Streak (M3):** viral komentář prodlouží/posílí Doomscroll Streak; flop ho nalomí.
- **Brain Rot:** toxické kategorie (`troll`, `hot-take`) mají vyšší `brainRotAffinity`.
- **Virality:** část net-liků může přispívat do Shares → vyšší šance na Hidden Gems.
- **Pozornost (M1):** výběr a sledování reakcí stojí Pozornost (aktivní akce).

> Implementace startu: `src/core/content/CommentPool.ts` + `comments.json` (Fáze 1, rozšiřuje se ve Fázi 5).

## 5. Čekání na obsah (Loading / Buffering)

Obsah se nenačítá okamžitě — `bufferTime` závisí na přidělené propustnosti (viz Bandwidth, `GDD-02 §3`).
Na začátku hraje roli „rychlost internetu"; ikonické točící se kolečko je vizuální podpis early game.

## 6. Pseudokód jednoho ticku (Game.advance)

```
Game.advance(dt):
    for phone in phones:
        phone.advance(dt)          # posune časovače stavu, vyřeší auto-akce botů (Fáze 4)
    economy.applyPassiveIncome(dt) # pasivní zdroje (Fáze 4+)
    chaos.recompute()              # přepočet Chaos Level (Fáze 8)
    bus.flush()                    # doručí nasbírané eventy prezentaci
```
