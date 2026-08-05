import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * useCountdownTimer(seconds, onExpire)
 * Returns: { remaining, isRunning, start(), pause(), resume(), reset() }
 *
 * Drift-corrected against the wall clock (not tick count), so background
 * tab throttling / slow ticks don't make the timer run long:
 *   remaining = seconds - Math.floor((Date.now() - startedAt) / 1000)
 *
 * At 0: clears the interval and calls onExpire() exactly once.
 * pause(): clears the interval, remaining stays frozen at its current value
 *   (unlike reset(), which snaps it back to `seconds`). Used both when a
 *   round is scored early via Confirm/Skip, and for the player-facing pause
 *   button -- either way the displayed time should stop, not jump back.
 * resume(): re-arms the interval from wherever `remaining` currently sits,
 *   unlike start() which always snaps back to the full duration. Used to
 *   un-pause a round already in progress. No-op once remaining has hit 0.
 * reset(): clears the interval, remaining -> seconds. Does NOT auto-start.
 * start(): sets startedAt = Date.now() and begins ticking from `seconds`.
 */
export function useCountdownTimer(seconds, onExpire) {
  const [remaining, setRemaining] = useState(seconds);
  const [isRunning, setIsRunning] = useState(false);

  const startedAtRef = useRef(null);
  const intervalRef = useRef(null);
  // Plain-value mirror so resume() can read the latest remaining without
  // needing it in its own dependency array (same technique used throughout
  // the round hooks for callbacks that must stay referentially stable).
  const remainingRef = useRef(remaining);
  remainingRef.current = remaining;

  // Ref (not the raw prop) so a re-render with a new onExpire identity
  // doesn't require tearing down and restarting the live interval.
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  const clearTimer = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Shared ticking loop, parameterized by when it should count as having
  // started -- start() passes "now" (full duration ahead), resume() passes
  // a backdated timestamp so the countdown continues from `remaining`
  // instead of restarting.
  const runFrom = useCallback((startedAt) => {
    clearTimer();
    startedAtRef.current = startedAt;
    setIsRunning(true);

    intervalRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAtRef.current) / 1000);
      const next = seconds - elapsed;

      if (next <= 0) {
        setRemaining(0);
        clearTimer();
        setIsRunning(false);
        onExpireRef.current?.(); // fires exactly once
      } else {
        setRemaining(next);
      }
    }, 1000);
  }, [seconds, clearTimer]);

  const start = useCallback(() => {
    setRemaining(seconds);
    runFrom(Date.now());
  }, [seconds, runFrom]);

  const resume = useCallback(() => {
    if (remainingRef.current <= 0) return;
    runFrom(Date.now() - (seconds - remainingRef.current) * 1000);
  }, [seconds, runFrom]);

  const pause = useCallback(() => {
    clearTimer();
    setIsRunning(false);
    // remaining intentionally left as-is -- see header note.
  }, [clearTimer]);

  const reset = useCallback(() => {
    clearTimer();
    startedAtRef.current = null;
    setIsRunning(false);
    setRemaining(seconds);
  }, [seconds, clearTimer]);

  useEffect(() => clearTimer, [clearTimer]);

  return { remaining, isRunning, start, pause, resume, reset };
}
