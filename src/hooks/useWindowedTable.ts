import { useLayoutEffect, useState, type RefObject } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

/**
 * The app scrolls inside AppShell's single <main>, not the window, and pages reach
 * it through two wrapper divs. Resolving it lazily by selector keeps the pages from
 * having to thread a ref down through the shell.
 */
const appScroller = () => document.querySelector<HTMLElement>('main');

/**
 * Window a <tbody> that scrolls with the app scroller instead of its own box.
 *
 * Render the returned slice, then place `topPad` and `bottomPad` spacer rows before
 * and after it so the scrollbar keeps the full list height:
 *
 *   {topPad > 0 && <tr aria-hidden style={{ height: topPad }}><td colSpan={n} /></tr>}
 *   {rows.slice(startIndex, endIndex).map(...)}
 *   {bottomPad > 0 && <tr aria-hidden style={{ height: bottomPad }}><td colSpan={n} /></tr>}
 *
 * `topRef` must point at a zero-height element directly above the table, so its
 * offset inside the scroller can be measured.
 */
export function useWindowedTable({
  count,
  topRef,
  estimateRowHeight,
  overscan = 12,
  getScroller = appScroller,
}: {
  count: number;
  topRef: RefObject<HTMLElement | null>;
  estimateRowHeight: number;
  overscan?: number;
  getScroller?: () => HTMLElement | null;
}) {
  const [scrollMargin, setScrollMargin] = useState(0);

  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => getScroller(),
    estimateSize: () => estimateRowHeight,
    overscan,
    scrollMargin,
  });

  useLayoutEffect(() => {
    const top = topRef.current;
    const scroller = getScroller();
    if (!top || !scroller) return;
    const next =
      top.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top +
      scroller.scrollTop;
    setScrollMargin((prev) => (Math.abs(prev - next) < 1 ? prev : next));
  }, [topRef, count, getScroller]);

  const items = virtualizer.getVirtualItems();
  const first = items.length ? items[0] : null;
  const last = items.length ? items[items.length - 1] : null;

  return {
    virtualizer,
    startIndex: first ? first.index : 0,
    endIndex: last ? last.index + 1 : 0,
    topPad: first ? Math.max(0, first.start - scrollMargin) : 0,
    bottomPad: last ? Math.max(0, virtualizer.getTotalSize() - last.end) : 0,
  };
}
