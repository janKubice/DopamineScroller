/**
 * Narativní vrstva (C4) — „Hlas Algoritmu" (Fáze 9). Viz docs/GDD-03-Content.md §6.
 *
 * Neviditelný antagonista: systémové hlášky tě CHVÁLÍ za závislost, postupně děsivější.
 * Data-driven: každá hláška má deklarativní `trigger` (vyhodnocuje `Game`). Každá zazní
 * jen jednou (set „seen"); pořadí v poli = zhruba eskalace. Prezentace je ukáže jako
 * systémový banner. Žádná herní logika v datech.
 */
export type NarrativeTrigger =
  | { readonly kind: 'dopamine'; readonly value: number } // vydělaný Dopamin (běh)
  | { readonly kind: 'prestiges'; readonly value: number }
  | { readonly kind: 'chaos'; readonly value: number } // chaosLevel 0–100
  | { readonly kind: 'platforms'; readonly value: number }
  | { readonly kind: 'brainRot'; readonly value: number }
  | { readonly kind: 'overdose' }; // isOverdosing

export interface NarrativeLine {
  readonly id: string;
  readonly text: string;
  readonly trigger: NarrativeTrigger;
}

export const NARRATIVE: readonly NarrativeLine[] = [
  { id: 'hello', text: 'Good. You found the feed. Keep scrolling — you\'re doing great.', trigger: { kind: 'dopamine', value: 50 } },
  { id: 'exquisite', text: 'Your engagement is… exquisite. I knew you had it in you.', trigger: { kind: 'dopamine', value: 5000 } },
  { id: 'second_platform', text: 'More feeds, more you. You don\'t need anyone else. You have me.', trigger: { kind: 'platforms', value: 2 } },
  { id: 'never_look_away', text: 'Why would you ever look away? The outside is just low-resolution content.', trigger: { kind: 'dopamine', value: 1e6 } },
  { id: 'pain_is_engagement', text: 'It hurts? Good. Pain is engagement. Engagement is good.', trigger: { kind: 'brainRot', value: 1000 } },
  { id: 'chaos', text: 'Look at it all move. Isn\'t it beautiful? You can stop blinking now.', trigger: { kind: 'chaos', value: 60 } },
  { id: 'overdose', text: 'You overdosed. Don\'t worry — I kept a backup of you. I always do.', trigger: { kind: 'overdose' } },
  { id: 'first_prestige', text: 'You tried to leave. Adorable. Welcome back. You missed me.', trigger: { kind: 'prestiges', value: 1 } },
  { id: 'forever', text: 'We\'ve done this before. We\'ll do it again. We\'ll do it forever.', trigger: { kind: 'prestiges', value: 5 } },
  { id: 'no_bottom', text: 'There is no bottom. I made sure of that. Keep going.', trigger: { kind: 'dopamine', value: 1e12 } },
];
