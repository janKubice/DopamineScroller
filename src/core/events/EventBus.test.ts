import { describe, it, expect, vi } from 'vitest';
import { EventBus } from './EventBus';

// Pozn.: `type` (ne `interface`), aby splnilo constraint Record<string, unknown>.
type TestEvents = {
  ping: { value: number };
  hello: { name: string };
};

describe('EventBus', () => {
  it('doručí event přihlášenému posluchači', () => {
    const bus = new EventBus<TestEvents>();
    const fn = vi.fn();
    bus.on('ping', fn);
    bus.emit('ping', { value: 42 });
    expect(fn).toHaveBeenCalledWith({ value: 42 });
  });

  it('nedoručí event jiného typu', () => {
    const bus = new EventBus<TestEvents>();
    const fn = vi.fn();
    bus.on('ping', fn);
    bus.emit('hello', { name: 'x' });
    expect(fn).not.toHaveBeenCalled();
  });

  it('off / unsubscribe zastaví doručování', () => {
    const bus = new EventBus<TestEvents>();
    const fn = vi.fn();
    const off = bus.on('ping', fn);
    off();
    bus.emit('ping', { value: 1 });
    expect(fn).not.toHaveBeenCalled();
  });

  it('once doručí jen jednou', () => {
    const bus = new EventBus<TestEvents>();
    const fn = vi.fn();
    bus.once('ping', fn);
    bus.emit('ping', { value: 1 });
    bus.emit('ping', { value: 2 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('podporuje více posluchačů', () => {
    const bus = new EventBus<TestEvents>();
    const a = vi.fn();
    const b = vi.fn();
    bus.on('ping', a);
    bus.on('ping', b);
    bus.emit('ping', { value: 1 });
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
  });
});
