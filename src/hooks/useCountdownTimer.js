import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * useCountdownTimer(seconds, onExpire)
 * Returns: { remaining, isRunning, start(), pause(), reset() }
 *
 * Drift-corrected against the wall clock (not tick count), so background
 * tab throttling / slow ticks don't make the timer run long:
 *   remaining = seconds - Math.floor((Date.now() - startedAt) / 1000)
 *
 * At 0: clears the interval and calls onExpire() exactly once.
 * pause(): clears the interval, remaining stays frozen at its current value
 *   (unlike reset(), which snaps it back to `seconds`). Used once a round is
 *   scored early via Confirm/Skip, before the 2-min clock would've expired
 *   on its own -- the displayed time should stop, not jump back to full.
 * reset(): clears the interval, remaining -> seconds. Does NOT auto-start.
 * start(): sets startedAt = Date.now() and begins ticking.
 */
export function useCountdownTimer(seconds, onExpire) {
  const [remaining, setRemaining] = useState(seconds);
  const [isRunning, setIsRunning] = useState(false);

  const startedAtRef = useRef(null);
  const intervalRef = useRef(null);

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

  const start = useCallback(() => {
    clearTimer();
    startedAtRef.current = Date.now();
    setRemaining(seconds);
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

  // Cleanup on unmount.
  useEffect(() => clearTimer, [clearTimer]);

  return { remaining, isRunning, start, pause, reset };
}
