"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Run a long simulation without freezing the page.
 *
 * The problem: a 50,000-path Monte Carlo with 252 steps per path is about 13
 * million random draws. In a single synchronous loop that takes well over a
 * second, and because JavaScript is single-threaded, during that second the
 * browser cannot repaint, cannot process clicks, and cannot even show a spinner.
 * The tab appears frozen, and `startTransition` does not help — React can
 * deprioritise a render, but it cannot interrupt a `for` loop.
 *
 * The fix is cooperative chunking. We process `batchSize` items, then yield to
 * the event loop so the browser can paint and handle input, then continue. The
 * total work is the same; it is simply spread across many macrotasks instead of
 * monopolising one.
 *
 * Yielding uses `setTimeout(0)` rather than `requestAnimationFrame`, because rAF
 * is throttled to the display refresh rate (and paused entirely in background
 * tabs), which would make a large run take far longer than necessary.
 *
 * Cancellation matters as much as chunking. If a user drags a slider, the
 * in-flight simulation is now obsolete. Each run carries a token; when the
 * inputs change, the token is invalidated and the loop exits at its next
 * checkpoint instead of finishing work whose result will be discarded.
 */
export interface BatchedSimulationSpec<TAccumulator, TResult> {
  /** Total number of independent items (e.g. simulation paths). */
  totalItems: number;
  /** How many items to process before yielding. Tune for ~16ms of work. */
  batchSize?: number;
  /** Create the mutable accumulator. */
  init: () => TAccumulator;
  /** Process one item into the accumulator. */
  step: (accumulator: TAccumulator, index: number) => void;
  /** Turn the finished accumulator into the result the UI renders. */
  finalize: (accumulator: TAccumulator) => TResult;
  /**
   * Below this item count the work runs synchronously on the first render, so
   * small simulations produce a result immediately with no loading flash.
   */
  synchronousThreshold?: number;
}

export interface BatchedSimulationState<TResult> {
  result: TResult | null;
  loading: boolean;
  /** 0 to 1. */
  progress: number;
  error: string | null;
}

export function useBatchedSimulation<TAccumulator, TResult>(
  spec: BatchedSimulationSpec<TAccumulator, TResult>,
  deps: readonly unknown[],
): BatchedSimulationState<TResult> {
  const [state, setState] = useState<BatchedSimulationState<TResult>>({
    result: null,
    loading: true,
    progress: 0,
    error: null,
  });

  // Keep the spec in a ref so that changing an inline callback identity does not
  // by itself restart the simulation — only `deps` controls that.
  const specRef = useRef(spec);
  specRef.current = spec;

  // Monotonically increasing token identifying the current run.
  const runToken = useRef(0);

  useEffect(() => {
    const token = ++runToken.current;
    const current = specRef.current;
    const {
      totalItems,
      batchSize = 250,
      init,
      step,
      finalize,
      synchronousThreshold = 2000,
    } = current;

    const runSynchronously = totalItems <= synchronousThreshold;

    try {
      if (runSynchronously) {
        const accumulator = init();
        for (let i = 0; i < totalItems; i++) step(accumulator, i);
        setState({ result: finalize(accumulator), loading: false, progress: 1, error: null });
        return;
      }
    } catch (error) {
      setState({
        result: null,
        loading: false,
        progress: 0,
        error: error instanceof Error ? error.message : "The simulation failed.",
      });
      return;
    }

    setState((previous) => ({ ...previous, loading: true, progress: 0, error: null }));

    let cancelled = false;

    (async () => {
      try {
        const accumulator = init();
        for (let i = 0; i < totalItems; i += batchSize) {
          // Abandon the run if the inputs changed or the component unmounted.
          if (cancelled || runToken.current !== token) return;
          const end = Math.min(i + batchSize, totalItems);
          for (let j = i; j < end; j++) step(accumulator, j);
          setState((previous) => ({ ...previous, progress: end / totalItems }));
          // Yield. Without this line the whole point of the hook is lost.
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
        if (cancelled || runToken.current !== token) return;
        setState({ result: finalize(accumulator), loading: false, progress: 1, error: null });
      } catch (error) {
        if (cancelled || runToken.current !== token) return;
        setState({
          result: null,
          loading: false,
          progress: 0,
          error: error instanceof Error ? error.message : "The simulation failed.",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}

/**
 * Debounce a rapidly-changing value, so dragging a slider does not launch a new
 * simulation on every pixel of movement.
 */
export function useDebounced<T>(value: T, delayMs = 220): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
