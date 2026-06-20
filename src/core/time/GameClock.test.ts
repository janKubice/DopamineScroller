import { describe, it, expect } from 'vitest';
import { GameClock, type Tickable } from './GameClock';

class Recorder implements Tickable {
  readonly dts: number[] = [];
  advance(dt: number): void {
    this.dts.push(dt);
  }
  get total(): number {
    return this.dts.reduce((a, b) => a + b, 0);
  }
}

describe('GameClock — fixní krok', () => {
  it('krokuje doménu po fixních krocích', () => {
    const rec = new Recorder();
    const clock = new GameClock(rec, 100);
    clock.update(250); // 2 plné kroky, zbytek 50 ms
    expect(rec.dts).toHaveLength(2);
    expect(rec.dts.every((d) => Math.abs(d - 0.1) < 1e-9)).toBe(true);
  });

  it('akumuluje zbytek mezi voláními', () => {
    const rec = new Recorder();
    const clock = new GameClock(rec, 100);
    clock.update(60); // 0 kroků, akumulátor 60
    clock.update(60); // 1 krok, akumulátor 20
    expect(rec.dts).toHaveLength(1);
  });

  it('ignoruje nekladné dt', () => {
    const rec = new Recorder();
    const clock = new GameClock(rec, 100);
    clock.update(0);
    clock.update(-50);
    expect(rec.dts).toHaveLength(0);
  });

  it('chrání proti spirále smrti', () => {
    const rec = new Recorder();
    const clock = new GameClock(rec, 100);
    clock.update(1e9); // obrovský skok
    expect(rec.dts.length).toBeLessThanOrEqual(1000);
  });
});

describe('GameClock — offline převinutí', () => {
  it('advanceBy provede jeden velký krok', () => {
    const rec = new Recorder();
    const clock = new GameClock(rec, 100);
    clock.advanceBy(3600);
    expect(rec.dts).toEqual([3600]);
    expect(clock.elapsed).toBe(3600);
  });

  it('advanceBy ignoruje nekladné dt', () => {
    const rec = new Recorder();
    const clock = new GameClock(rec, 100);
    clock.advanceBy(0);
    expect(rec.dts).toHaveLength(0);
  });
});
