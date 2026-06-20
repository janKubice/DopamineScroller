# GDD 02 — Mechaniky & Systémy

Doménová logika ekonomiky, bottlenecku a nových mechanik. UI neřeší (viz `GDD-04`).

## 1. Měny (Currencies)

| Měna | Kód | Zdroj | Využití |
|---|---|---|---|
| Dopamin | `DOP` | Swipe, interakce | Hlavní nákupní měna (hardware, boti) |
| Likes | `LIK` | Like na postu / komentář | Synergie (Reach), algoritmy |
| Comments | `COM` | Komentářová ruleta | Synergie (Engagement), influencer upgrady |
| Shares | `SHR` | Share na postu | Virality → Hidden Gems |
| Brain Rot | `BR` | Toxický obsah, TokTik, toxické komentáře | Temná větev automatizace |
| Clarity | `CLA` | Prestige (Overdose) | Trvalé globální multiplikátory |

**Implementace:** `src/core/economy/Wallet.ts` — `Map<CurrencyId, BigNumber>` s operacemi
`add/spend/canAfford/get`. Všechny hodnoty jsou `BigNumber` (viz `GDD-05`).

## 2. Cenová matematika (exponenciální růst)

Standardní vzorec pro `N`-tý kus stejné položky:

```
Cena(n) = ZakladniCena × Multiplikator^(početJižZakoupených)
```

Příklad (bazarové telefony, base = 100 DOP, mult = 1.15):

| Kus | Cena |
|---|---|
| 1. | 100 × 1.15⁰ = 100 |
| 2. | 100 × 1.15¹ = 115 |
| 10. | 100 × 1.15⁹ ≈ 351 |

**Hromadný nákup (×10, ×100):** součet geometrické řady —
`base × mult^owned × (mult^count − 1) / (mult − 1)`.

> Implementace: `src/core/economy/CostCurve.ts` (Fáze 1).

## 3. Bandwidth Bottleneck (propustnost sítě)

Zásadní omezovač. Hráč nemá neomezený internet.

- **Total Bandwidth:** kapacita (Mbps), zvyšuje se nákupem routerů/tarifů/optiky.
- **Consumption:** každý aktivní telefon i bot spotřebovává část kapacity.
- **Penalizace při překročení:** je-li `consumption > capacity`, `bufferTime` všech zařízení
  se **exponenciálně prodlouží**:

```
load   = consumption / capacity
factor = load <= 1 ? 1 : pow(load, OVERLOAD_EXPONENT)   // OVERLOAD_EXPONENT ≈ 2.0
bufferTime_effective = bufferTime_base × factor
```

20 telefonů na slabém routeru = nekonečné načítání a zisk se zastaví. Hráč musí balancovat.

> **Implementováno (Fáze 3):** čisté funkce v `src/core/economy/Bandwidth.ts`
> (`bandwidthLoad`, `bufferScale`, `OVERLOAD_EXPONENT = 2`). `Game` počítá `totalBandwidth`
> (BASE 3 Mbps + síťové upgrady) a `bandwidthConsumption` (1 Mbps/telefon), výsledný
> `bufferScale` předává do `Phone.advance`. Síťové upgrady: 📡 Stolen Wi-Fi (+2),
> ☎️ ADSL (+10), 🛜 Fiber (+100). Boti do spotřeby přibydou ve Fázi 4.

### 3.1 (M5) Bandwidth QoS — alokace propustnosti
Mid-game **Network Manager** umožní **prioritizovat** propustnost konkrétním telefonům
(váhy per telefon). Default = rovnoměrné rozdělení (žádná mikro-správa pro casual hráče);
manuální váhy jsou opt-in strategická vrstva (telefon s Hidden Gem dostane prioritu).
> `BandwidthAllocator` rozdělí `TotalBandwidth` dle vah → `bufferTime` = funkce přidělené propustnosti.

## 4. Upgrady a automatizace (kategorie)

- **Hardware (škálování do šířky):** další telefony. Přidávají místa na obrazovce, zvyšují nároky na Bandwidth.
- **Network (infrastruktura):** zvyšuje Total Bandwidth.
- **Software / Boti (automatizace):** Auto-Liker, Auto-Commenter, Auto-Scroller — přebírají manuální práci, stojí Bandwidth (a šetří **Pozornost**, viz M1).
- **Algorithms (kvalita obsahu):** zvyšují základní hodnotu Dopaminu (Echo Chamber, Kitten Boost…).

Konkrétní položky a názvy: `GDD-03-Content.md`.

## 5. Virality & Hidden Gems

- Shares + algoritmy zvyšují parametr `Virality`.
- Při generování postu se losuje rarita (Common → Rare → Epic → Legendary „Hidden Gem")
  s pravděpodobností funkcí `Virality`.
- Hidden Gem má obří multiplikátor (např. 100×) a spouští silný audiovizuální feedback.

```
rarity = rollRarity(virality, rng)   // seedovaný RNG, deterministicky
rarityMultiplier = { Common:1, Rare:5, Epic:25, Legendary:100 }[rarity]
```

> ✅ **Implementováno:** `Game.virality` = base + upgrady (`virality` efekt): 👁️ **Third Eye**
> (+0.5/level), 📰 **Fake News Syndicate** (+1.5). Šance: `rare = 0.05·(1+virality)`,
> `epic = 0.01·(1+virality)`, `legendary = 0.001·(1+virality)`. Rare+ post emituje
> `HiddenGemFound` → v harnessu **konfety** (počet dle rarity) + zvuk. `expectedRarityMultiplier`
> se používá v odhadu příjmu a offline. (Shares-driven virality přijde s M2 synergiemi.)

## 6. Prestige: Dopamine Overdose

- **Trigger:** překročení kritického Dopaminu/s nebo milníku v Brain Rot stromu.
- **Efekt:** telefony zčervenají, generují nesmysly, vizuální/zvukový chaos vrcholí, hra se „zhroutí".
- **Následek:** ztráta všech telefonů, botů, upgradů a měn (DOP, LCS, BR).
- **Odměna:** **Clarity** podle velikosti overdose. Clarity dává trvalý pasivní bonus
  (např. +10 % Dopaminu a +5 % rychlosti Bufferingu za bod) do dalšího běhu.

```
clarityGained = floor( pow(totalDopamineThisRun / CLARITY_DIVISOR, CLARITY_EXPONENT) )
```

Detail Zen obchodu: `GDD-03 §5`.

---

# Nové mechaniky (M1–M5)

> **Priorita dle hráče (jak moc se mu líbí):** 1) Minihry (M4) → 2) Streak (M3) →
> 3) Pozornost (M1) → 4) Synergie (M2). Priorita = designová důležitost a „featured" status;
> **sekvencování ve vývoji** se přesto řídí závislostmi (viz roadmapa `GDD-06`).
> M5 (QoS) je rozšíření bottlenecku, popsáno výše v §3.1.

## M1 — Pozornost (Focus): lidský bottleneck  ✅ implementováno
Druhý zdroj vedle Bandwidth. Bandwidth omezuje **stroje**, Pozornost omezuje **člověka**.

- `attention` je regenerující se zdroj (`MAX_ATTENTION = 100`, `ATTENTION_REGEN = 8/s`).
- Každá **manuální** akce stojí pozornost: swipe 6, like 3, comment 5, bublina 4.
  **Boti ji nestojí** (volají akce s `manual=false`).
- Při poklesu pozornosti klesá **`focusFactor`** (1 → `FOCUS_MIN = 0.35`), který násobí
  odměnu manuálního swipe a bubliny → vyčerpaný hráč „scrolluje naprázdno".

```
focusFactor = FOCUS_MIN + (1 - FOCUS_MIN) * min(1, (attention/MAX) / FOCUS_THRESHOLD)
```

- **Dvojí ekonomika rozhodování:** boti stojí Bandwidth, ale šetří Pozornost; manuál stojí
  Pozornost, ale ne Bandwidth. Při 1 telefonu pozornost nikdy nedojde; **multitasking mnoha
  telefonů ručně ji vyčerpá** → tlak automatizovat. Skutečný strop není internet, ale mozek.
- HUD: `🎯 %` (oranžová + 😵 při únavě). Implementace: `Game.attention`/`focusFactor`/`spendAttention`.

## M2 — Synergie měn
Uzavřený trojúhelník mikro-měn + cross-platform bonus:

- **Likes → Reach** → zvyšuje base Dopamin/swipe.
- **Comments → Engagement** → zvyšuje hodnotu *dalších* Likes (kombo).
- **Shares → Virality** → šance na Hidden Gems.
- **Omnipresence:** za každou *současně běžící* platformu globální multiplikátor (např. +8 %).

```
Reach      = f(totalLikes)         // monotónní, klesající mezní výnos (log/odmocnina)
Engagement = f(totalComments)
Virality   = base + f(totalShares) + algorithmBonus
DopaminePerSwipe ×= (1 + Reach) ; LikeYield ×= (1 + Engagement)
GlobalMult ×= (1 + 0.08 × activePlatforms)
```
Derivované staty se počítají **jednosměrně** z kumulovaných měn (žádné zacyklení).
> Fáze 5.

## M3 — Doomscroll Streak (kombo za aktivní hru)
Souvislé swajpy budují multiplikátor; pasivita ho sráží.

- `streakValue` 1.0 → 3.0, `decayPerSec` při nečinnosti.
- Každý swipe v okně `streakWindow` → `streakValue += step`.
- **Boti streak udržují (~1.5), ale nebudují** → aktivní hráč ho žene na 3.0. Důvod hrát aktivně i v late game.
- Necháš telefon „hnít" v `Ready` moc dlouho → decay.

```
on swipe:        streakValue = min(MAX, streakValue + STEP)
each dt idle:    streakValue = max(botFloor, streakValue - DECAY*dt)
streakMultiplier = streakValue
```
> Fáze 1 (základ) + Fáze 4 (bot floor).

## M4 — Minihry (nejvyšší priorita)
Diegetické dark patterns. Krátké přerušovací moduly s rozhraním `IMiniGameResolver`
(Doména spustí, vyhodnotí `{success, timing}` → modifikátor odměny).

- **Komentářová ruleta** — viz `GDD-01 §4` (vlajková minihra, součást core loopu).
- **Dopaminové bubliny** ✅ — *implementováno*: **odemyká se upgradem** 🫧 Dopamine Detector
  (~30 DOP). Pak klikatelné 🧠 bubliny vyskakují ~8–14 s (max 2 naráz), kliknutím dají Dopamin
  (≈ 2 swipy hodnoty) a posílí streak. **Vylepšitelné**: 💧 Bigger Hits (hodnota), ⏩ Faster
  Bubbles (frekvence). Doména: `Game.bubblesUnlocked`/`popBubble`, eventy `BubbleSpawned/Popped/Expired`.
- **CAPTCHA** („Ověřte, že jste člověk") — ironie: snažíš se *být bot*. Manuál = burst odměny.
  **Boti CAPTCHU nevyřeší** → buď klikáš, nebo koupíš „Farmu na řešení CAPTCHA".
- **Skip Ad** — trefit mizející drobné „×". „Premium bez reklam" = **opakovaný náklad** (satira předplatného).
- **Outrage třídění** — rychlé třídění „Souhlas/Nesouhlas" na kombo (k Outrage Algorithm).
> Komentářová ruleta + Dopaminové bubliny: hotovo. Ostatní minihry: Fáze 9 (+ rozhraní `IMiniGameResolver`).
