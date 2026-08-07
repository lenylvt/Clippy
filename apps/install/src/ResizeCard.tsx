import { useLayoutEffect, useRef, type ReactNode } from 'react';

/**
 * Card resize (transitions.dev): tween height when stepKey changes,
 * then keep in sync via ResizeObserver while staggered enters settle.
 */
export function ResizeCard({
  stepKey,
  children,
  className = '',
}: {
  stepKey: string;
  children: ReactNode;
  className?: string;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const prevHeightRef = useRef<number | null>(null);
  const tweeningRef = useRef(false);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const measure = () => Math.ceil(inner.getBoundingClientRect().height);

    const next = measure();
    const from = prevHeightRef.current;

    if (from == null || reduce || Math.abs(from - next) < 1) {
      outer.style.height = 'auto';
      prevHeightRef.current = next;
      tweeningRef.current = false;
      return;
    }

    tweeningRef.current = true;
    outer.style.transition = 'none';
    outer.style.height = `${from}px`;
    void outer.offsetHeight;
    outer.style.transition = '';
    outer.style.height = `${next}px`;
    prevHeightRef.current = next;

    const onEnd = (e: TransitionEvent) => {
      if (e.target !== outer || e.propertyName !== 'height') return;
      tweeningRef.current = false;
      outer.style.height = 'auto';
      prevHeightRef.current = measure();
    };
    outer.addEventListener('transitionend', onEnd);

    const ro = new ResizeObserver(() => {
      if (tweeningRef.current) return;
      const h = measure();
      prevHeightRef.current = h;
      if (outer.style.height === 'auto' || outer.style.height === '') return;
      outer.style.height = `${h}px`;
    });
    ro.observe(inner);

    return () => {
      outer.removeEventListener('transitionend', onEnd);
      ro.disconnect();
    };
  }, [stepKey]);

  return (
    <div ref={outerRef} className={['t-resize', className].join(' ')}>
      <div ref={innerRef}>{children}</div>
    </div>
  );
}
