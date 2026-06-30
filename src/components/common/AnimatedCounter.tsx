import { useEffect, useRef, useState } from 'react';

interface AnimatedCounterProps {
  value: number;
  duration?: number;
}

export default function AnimatedCounter({ value, duration = 800 }: AnimatedCounterProps) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const prev = prevRef.current;
    if (prev === value) return;
    prevRef.current = value;

    const diff = value - prev;
    const start = performance.now();

    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      setDisplay(Math.round(prev + diff * progress));
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      }
    };

    frameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameRef.current);
  }, [value, duration]);

  return <>{display}</>;
}
