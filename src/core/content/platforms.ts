/**
 * Platformy (sociální sítě). Viz docs/GDD-03-Content.md §1.
 *
 * Hráč odemyká novější platformy podle kumulovaného Dopaminu a přepíná aktivní platformu.
 * Každá mění base zisk, spotřebu sítě, viralitu a generování Brain Rotu.
 */
export interface PlatformDef {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  readonly basePostValue: number; // base Dopamin za post
  readonly bandwidthPerPhone: number; // Mbps spotřeby na telefon
  readonly viralityBonus: number; // přičte se k virality
  readonly brainRotPerSwipe: number; // BR generovaný každým swipem (TokTik+)
  readonly unlockAtDopamine: number; // kumulovaný Dopamin nutný k odemčení
}

export const PLATFORMS: readonly PlatformDef[] = [
  {
    id: 'text_it',
    name: 'Text-It',
    icon: '🔤',
    basePostValue: 1,
    bandwidthPerPhone: 1,
    viralityBonus: 0,
    brainRotPerSwipe: 0,
    unlockAtDopamine: 0,
  },
  {
    id: 'fakebook',
    name: 'Fakebook',
    icon: '📘',
    basePostValue: 4,
    bandwidthPerPhone: 1.5,
    viralityBonus: 0,
    brainRotPerSwipe: 0,
    unlockAtDopamine: 500,
  },
  {
    id: 'insta_klam',
    name: 'Insta-Klam',
    icon: '📸',
    basePostValue: 12,
    bandwidthPerPhone: 2.5,
    viralityBonus: 0.5,
    brainRotPerSwipe: 0,
    unlockAtDopamine: 10000,
  },
  {
    id: 'toktik',
    name: 'TokTik',
    icon: '🎵',
    basePostValue: 40,
    bandwidthPerPhone: 4,
    viralityBonus: 0.3,
    brainRotPerSwipe: 0.5, // uřvaná videa pasivně hnijou mozek
    unlockAtDopamine: 250000,
  },
  {
    id: 'neuralfeed',
    name: 'NeuralFeed',
    icon: '🧠',
    basePostValue: 150,
    bandwidthPerPhone: 8,
    viralityBonus: 1,
    brainRotPerSwipe: 2,
    unlockAtDopamine: 5000000,
  },
];

export const DEFAULT_PLATFORM_ID = 'text_it';
