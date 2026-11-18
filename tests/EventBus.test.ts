import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '@/shared/EventBus';

interface Ev {
  ping: { n: number };
  pong: { text: string };
}

describe('EventBus', () => {
  it('entrega o payload aos ouvintes do evento certo', () => {
    const bus = new EventBus<Ev>();
    const onPing = vi.fn();
    const onPong = vi.fn();
    bus.on('ping', onPing);
    bus.on('pong', onPong);

    bus.emit('ping', { n: 1 });

    expect(onPing).toHaveBeenCalledWith({ n: 1 });
    expect(onPong).not.toHaveBeenCalled();
  });

  it('on() devolve a função que remove o ouvinte', () => {
    const bus = new EventBus<Ev>();
    const fn = vi.fn();
    const off = bus.on('ping', fn);
    off();
    bus.emit('ping', { n: 1 });
    expect(fn).not.toHaveBeenCalled();
  });

  it('once() dispara uma única vez', () => {
    const bus = new EventBus<Ev>();
    const fn = vi.fn();
    bus.once('ping', fn);
    bus.emit('ping', { n: 1 });
    bus.emit('ping', { n: 2 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('emitir sem ouvintes não falha', () => {
    expect(() => new EventBus<Ev>().emit('pong', { text: 'x' })).not.toThrow();
  });

  it('um ouvinte que lança erro não impede os demais', () => {
    const bus = new EventBus<Ev>();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const after = vi.fn();
    bus.on('ping', () => {
      throw new Error('boom');
    });
    bus.on('ping', after);

    bus.emit('ping', { n: 1 });

    expect(after).toHaveBeenCalled();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('remover um ouvinte durante a emissão não pula os outros', () => {
    const bus = new EventBus<Ev>();
    const second = vi.fn();
    const off = bus.on('ping', () => off());
    bus.on('ping', second);
    bus.emit('ping', { n: 1 });
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('clear() remove todos os ouvintes', () => {
    const bus = new EventBus<Ev>();
    const fn = vi.fn();
    bus.on('ping', fn);
    bus.clear();
    bus.emit('ping', { n: 1 });
    expect(fn).not.toHaveBeenCalled();
  });
});
