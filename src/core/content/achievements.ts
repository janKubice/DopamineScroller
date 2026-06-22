/**
 * Achievementy (Fáze 9). Viz docs/GDD-06-Roadmap.md (F9).
 *
 * Data-driven: každý achievement má deklarativní `condition`, kterou `Game` vyhodnocuje proti
 * stavu (žádné closury v datech). Odemčení je trvalé (přežije prestige, ukládá se). Satira
 * „gamifikace závislosti" — odměňujeme hráče za to, jak hluboko spadl.
 */
export type AchievementCondition =
  | { readonly kind: 'dopamine'; readonly value: number } // vydělaný Dopamin za běh
  | { readonly kind: 'phones'; readonly value: number }
  | { readonly kind: 'swipes'; readonly value: number } // swipy za běh
  | { readonly kind: 'jackpots'; readonly value: number }
  | { readonly kind: 'gems'; readonly value: number }
  | { readonly kind: 'brainRot'; readonly value: number } // zůstatek 🧟
  | { readonly kind: 'clarity'; readonly value: number } // vydělaná Clarity (lifetime)
  | { readonly kind: 'prestiges'; readonly value: number }
  | { readonly kind: 'platforms'; readonly value: number } // počet odemčených platforem
  | { readonly kind: 'upgrade'; readonly id: string; readonly value: number }; // úroveň upgradu

export interface AchievementDef {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly icon: string;
  readonly condition: AchievementCondition;
  /** Skrytý: popis se ukáže až po odemčení. */
  readonly secret?: boolean;
}

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { id: 'first_swipe', name: 'Welcome to the Feed', description: 'Swipe your first post.', icon: '👋', condition: { kind: 'swipes', value: 1 } },
  { id: 'just_one_more', name: 'Just One More', description: 'Swipe 100 posts in a run.', icon: '🔁', condition: { kind: 'swipes', value: 100 } },
  { id: 'thumb_of_steel', name: 'Thumb of Steel', description: 'Swipe 1,000 posts in a run.', icon: '💪', condition: { kind: 'swipes', value: 1000 } },
  { id: 'two_screens', name: 'Two Screens Are Better', description: 'Own a second phone.', icon: '📱', condition: { kind: 'phones', value: 2 } },
  { id: 'phone_farmer', name: 'Phone Farmer', description: 'Own 10 phones at once.', icon: '🚜', condition: { kind: 'phones', value: 10 } },
  { id: 'bot_farm', name: 'Industrial Doomscroll', description: 'Own 40 phones at once.', icon: '🖥️', condition: { kind: 'phones', value: 40 } },
  { id: 'first_gem', name: 'Hidden Gem', description: 'Find a rare+ post.', icon: '💎', condition: { kind: 'gems', value: 1 } },
  { id: 'first_jackpot', name: 'Variable Reward', description: 'Hit a jackpot swipe.', icon: '🎰', condition: { kind: 'jackpots', value: 1 } },
  { id: 'millionaire', name: 'Dopamine Millionaire', description: 'Earn 1M Dopamine in a run.', icon: '🤑', condition: { kind: 'dopamine', value: 1e6 } },
  { id: 'billionaire', name: 'Dopamine Billionaire', description: 'Earn 1B Dopamine in a run.', icon: '💰', condition: { kind: 'dopamine', value: 1e9 } },
  { id: 'brain_rotter', name: 'Certified Brain Rot', description: 'Hoard 1,000 Brain Rot.', icon: '🧟', condition: { kind: 'brainRot', value: 1000 } },
  { id: 'omnipresent', name: 'Omnipresent', description: 'Unlock all 5 platforms.', icon: '🌐', condition: { kind: 'platforms', value: 5 } },
  { id: 'touched_grass', name: 'Touched Grass (briefly)', description: 'Prestige for the first time.', icon: '🌱', condition: { kind: 'prestiges', value: 1 } },
  { id: 'eternal_return', name: 'Eternal Return', description: 'Prestige 5 times.', icon: '♾️', condition: { kind: 'prestiges', value: 5 } },
  { id: 'enlightened', name: 'Digitally Enlightened', description: 'Earn 25 Clarity total.', icon: '🧘', condition: { kind: 'clarity', value: 25 } },
  { id: 'slop_merchant', name: 'Slop Merchant', description: 'Build the AI Slop Factory.', icon: '🗑️', condition: { kind: 'upgrade', id: 'ai_slop', value: 1 }, secret: true },
  { id: 'sigma', name: 'Sigma', description: 'Deploy the Skibidi Generator.', icon: '🚽', condition: { kind: 'upgrade', id: 'skibidi', value: 1 }, secret: true },
];
