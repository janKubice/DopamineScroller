import { describe, it, expect } from 'vitest';
import { Phone, DEFAULT_PHONE_CONFIG, type Post } from './Phone';
import { BigNumber } from '../math/BigNumber';

const commonPost = (): Post => ({ rarity: 'common', baseValue: BigNumber.of(2) });

describe('Phone — stavový automat', () => {
  it('startuje v bufferingu', () => {
    const phone = new Phone(1, DEFAULT_PHONE_CONFIG, commonPost);
    expect(phone.state).toBe('buffering');
    expect(phone.isReady).toBe(false);
  });

  it('po načtení přejde do ready a vygeneruje post', () => {
    const phone = new Phone(1, DEFAULT_PHONE_CONFIG, commonPost);
    const tick = phone.advance(DEFAULT_PHONE_CONFIG.bufferTime);
    expect(tick).toEqual({ type: 'ready', rarity: 'common' });
    expect(phone.isReady).toBe(true);
    expect(phone.post?.baseValue.toNumber()).toBe(2);
  });

  it('swipe inkasuje Dopamin a vrací do bufferingu', () => {
    const phone = new Phone(1, DEFAULT_PHONE_CONFIG, commonPost);
    phone.advance(DEFAULT_PHONE_CONFIG.bufferTime);
    const result = phone.swipe(BigNumber.of(1));
    expect(result?.dopamine.toNumber()).toBe(2); // base 2 × common 1 × mult 1
    expect(phone.state).toBe('swiping');
    phone.advance(DEFAULT_PHONE_CONFIG.swipeTime);
    expect(phone.state).toBe('buffering');
  });

  it('rarita násobí odměnu', () => {
    const epic: Post = { rarity: 'epic', baseValue: BigNumber.of(2) };
    const phone = new Phone(1, DEFAULT_PHONE_CONFIG, () => epic);
    phone.advance(DEFAULT_PHONE_CONFIG.bufferTime);
    expect(phone.swipe(BigNumber.of(1))?.dopamine.toNumber()).toBe(50); // 2 × 25
  });

  it('swipe mimo ready vrací null', () => {
    const phone = new Phone(1, DEFAULT_PHONE_CONFIG, commonPost);
    expect(phone.swipe(BigNumber.of(1))).toBeNull();
  });

  it('like jen jednou na post', () => {
    const phone = new Phone(1, DEFAULT_PHONE_CONFIG, commonPost);
    phone.advance(DEFAULT_PHONE_CONFIG.bufferTime);
    expect(phone.canLike).toBe(true);
    expect(phone.like(BigNumber.of(1))?.toNumber()).toBe(1);
    expect(phone.canLike).toBe(false);
    expect(phone.like(BigNumber.of(1))).toBeNull(); // už lajknuto
  });

  it('komentář jen jednou na post', () => {
    const phone = new Phone(1, DEFAULT_PHONE_CONFIG, commonPost);
    phone.advance(DEFAULT_PHONE_CONFIG.bufferTime);
    expect(phone.canComment).toBe(true);
    expect(phone.markCommented()).toBe(true);
    expect(phone.canComment).toBe(false);
    expect(phone.markCommented()).toBe(false);
  });

  it('like/komentář se po novém postu resetuje', () => {
    const phone = new Phone(1, DEFAULT_PHONE_CONFIG, commonPost);
    phone.advance(DEFAULT_PHONE_CONFIG.bufferTime);
    phone.like(BigNumber.of(1));
    phone.markCommented();
    phone.swipe(BigNumber.of(1));
    phone.advance(DEFAULT_PHONE_CONFIG.swipeTime); // -> buffering
    phone.advance(DEFAULT_PHONE_CONFIG.bufferTime); // -> ready (nový post)
    expect(phone.canLike).toBe(true);
    expect(phone.canComment).toBe(true);
  });

  it('bufferScale zpomaluje načítání (penalizace Bandwidth)', () => {
    const phone = new Phone(1, DEFAULT_PHONE_CONFIG, commonPost);
    phone.advance(DEFAULT_PHONE_CONFIG.bufferTime, 0.5);
    expect(phone.state).toBe('buffering'); // poloviční rychlost -> ještě nehotovo
    phone.advance(DEFAULT_PHONE_CONFIG.bufferTime, 0.5);
    expect(phone.state).toBe('ready');
  });
});
