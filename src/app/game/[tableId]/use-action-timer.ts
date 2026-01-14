import { useEffect, useState, useRef } from 'react';

interface UseActionTimerProps {
  isMyTurn: boolean;
  isActive: boolean; // Only run timer if player is active (not folded, etc.)
  onTimeout: () => void;
  timeLimit?: number; // in seconds, default 30
}

export function useActionTimer({
  isMyTurn,
  isActive,
  onTimeout,
  timeLimit = 30
}: UseActionTimerProps) {
  const [timeRemaining, setTimeRemaining] = useState<number>(timeLimit);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasTimedOutRef = useRef<boolean>(false);

  useEffect(() => {
    // Reset timer when it becomes player's turn
    if (isMyTurn && isActive) {
      setTimeRemaining(timeLimit);
      hasTimedOutRef.current = false;

      // Start countdown
      intervalRef.current = setInterval(() => {
        setTimeRemaining((prev) => {
          const newTime = prev - 1;

          // Trigger timeout action when timer hits 0
          if (newTime <= 0 && !hasTimedOutRef.current) {
            hasTimedOutRef.current = true;
            clearInterval(intervalRef.current!);
            onTimeout();
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
      // Not player's turn - clear timer
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      setTimeRemaining(timeLimit);
      hasTimedOutRef.current = false;
    }
  }, [isMyTurn, isActive, timeLimit, onTimeout]);

  return { timeRemaining };
}
