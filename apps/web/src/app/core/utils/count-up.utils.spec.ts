import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { createAnimatedNumber } from './count-up.utils';

@Component({
  selector: 'app-test-count-up-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
})
class TestCountUpHostComponent {
  readonly source = signal<number | null>(null);
  readonly animated = createAnimatedNumber(this.source);
}

describe('count-up.utils', () => {
  const originalMatchMedia = window.matchMedia;
  const originalRaf = window.requestAnimationFrame;
  const originalCancelRaf = window.cancelAnimationFrame;

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    window.requestAnimationFrame = originalRaf;
    window.cancelAnimationFrame = originalCancelRaf;
  });

  it('settles immediately when prefers-reduced-motion is enabled or target <= 1', () => {
    window.matchMedia = (() => ({
      matches: true,
    })) as unknown as typeof window.matchMedia;

    const fixture = TestBed.configureTestingModule({
      imports: [TestCountUpHostComponent],
    }).createComponent(TestCountUpHostComponent);

    fixture.componentInstance.source.set(4200);
    TestBed.flushEffects();
    expect(fixture.componentInstance.animated()).toBe(4200);

    window.matchMedia = (() => ({
      matches: false,
    })) as unknown as typeof window.matchMedia;
    const queuedCallbacks: FrameRequestCallback[] = [];
    window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      queuedCallbacks.push(cb);
      return queuedCallbacks.length;
    }) as unknown as typeof window.requestAnimationFrame;

    const fixtureSmall = TestBed.createComponent(TestCountUpHostComponent);
    fixtureSmall.componentInstance.source.set(1);
    TestBed.flushEffects();
    expect(fixtureSmall.componentInstance.animated()).toBe(1);
    expect(queuedCallbacks.some((cb) => cb.name === 'tick')).toBe(false);
  });

  it('starts initial >=20 loads from 40% floor with quartic ease-out and morphs on updates', () => {
    window.matchMedia = (() => ({
      matches: false,
    })) as unknown as typeof window.matchMedia;

    let nextId = 1;
    const pendingCallbacks = new Map<number, FrameRequestCallback>();
    window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      const id = nextId++;
      pendingCallbacks.set(id, cb);
      return id;
    }) as unknown as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = ((id: number) => {
      pendingCallbacks.delete(id);
    }) as unknown as typeof window.cancelAnimationFrame;

    const runNextFrame = (nowMs: number): void => {
      const first = pendingCallbacks.entries().next().value;
      if (!first) return;
      const [id, cb] = first;
      pendingCallbacks.delete(id);
      cb(nowMs);
    };

    const fixture = TestBed.configureTestingModule({
      imports: [TestCountUpHostComponent],
    }).createComponent(TestCountUpHostComponent);
    const host = fixture.componentInstance;

    host.source.set(1000);
    TestBed.flushEffects();
    expect(host.animated()).toBe(400);

    runNextFrame(1000);
    expect(host.animated()).toBe(400);

    runNextFrame(1260);
    const midValue = host.animated();
    expect(midValue).toBeGreaterThan(900);
    expect(midValue).toBeLessThan(1000);

    runNextFrame(1520);
    expect(host.animated()).toBe(1000);
    expect(pendingCallbacks.size).toBe(0);

    // Filter switch morphs smoothly from current 1000 down to 250 without dropping to 0.
    host.source.set(250);
    TestBed.flushEffects();
    expect(host.animated()).toBe(1000);

    runNextFrame(2000);
    expect(host.animated()).toBe(1000);

    runNextFrame(2190);
    expect(host.animated()).toBeGreaterThan(250);
    expect(host.animated()).toBeLessThan(1000);

    runNextFrame(2380);
    expect(host.animated()).toBe(250);
    expect(pendingCallbacks.size).toBe(0);
  });
});
