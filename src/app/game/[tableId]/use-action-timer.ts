import { useEffect, useState, useRef } from 'react';

interface UseActionTimerProps {
  isMyTurn: boolean;
  activePlayerPosition: number | null; // Track whose turn it is (for all clients)
  onTimeout: () => void;
  timeLimit?: number; // in seconds, default 25
}

export function useActionTimer({
  isMyTurn,
  activePlayerPosition,
  onTimeout,
  timeLimit = 25
}: UseActionTimerProps) {
  const [timeRemaining, setTimeRemaining] = useState<number>(timeLimit);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasTimedOutRef = useRef<boolean>(false);
  const lastActivePositionRef = useRef<number | null>(null);

  // Use refs for values needed in interval callback to avoid stale closures
  const isMyTurnRef = useRef(isMyTurn);
  const onTimeoutRef = useRef(onTimeout);

  // Keep refs updated
  isMyTurnRef.current = isMyTurn;
  onTimeoutRef.current = onTimeout;

  useEffect(() => {
    // Check if active player changed (new turn started)
    const turnChanged = activePlayerPosition !== lastActivePositionRef.current;
    lastActivePositionRef.current = activePlayerPosition;

    // Clear existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // If there's an active player, run the timer for everyone to see
    if (activePlayerPosition !== null) {
      // Reset timer when turn changes
      if (turnChanged) {
        setTimeRemaining(timeLimit);
        hasTimedOutRef.current = false;
      }

      // Start countdown
      intervalRef.current = setInterval(() => {
        setTimeRemaining((prev) => {
          const newTime = prev - 1;

          // Trigger timeout action when timer hits 0 (only if it's MY turn)
          if (newTime <= 0 && !hasTimedOutRef.current && isMyTurnRef.current) {
            hasTimedOutRef.current = true;
            clearInterval(intervalRef.current!);
            onTimeoutRef.current();
            return 0;
          }

          // Just show 0 for other players
          if (newTime <= 0) {
            return 0;
          }

          return newTime;
        });
      }, 1000);

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
      };
    } else {
      // No active player - reset timer
      setTimeRemaining(timeLimit);
      hasTimedOutRef.current = false;
    }
  }, [activePlayerPosition, timeLimit]);

  return { timeRemaining };
}
