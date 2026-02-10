// FridayChain Arena — Countdown Timer Component

import { useTournament } from '../hooks/useTournament';

interface CountdownTimerProps {
  className?: string;
  compact?: boolean;
}

export default function CountdownTimer({
  className = '',
  compact = false,
}: CountdownTimerProps) {
  const { isActive, timeRemainingFormatted, progress } = useTournament();

  if (!isActive) {
    return (
      <div className={`text-center ${className}`}>
        <p className="text-arena-text-muted text-sm">No active tournament</p>
        <p className="text-arena-text-dim text-xs mt-1">
          Tournaments happen every Friday
        </p>
      </div>
    );
  }

  const [hours, minutes, seconds] = timeRemainingFormatted.split(':');

  if (compact) {
    return (
      <div className={`font-mono text-arena-accent font-bold ${className}`}>
        {timeRemainingFormatted}
      </div>
    );
  }

  return (
    <div className={`text-center ${className}`}>
      <p className="text-arena-text-muted text-sm mb-3 uppercase tracking-widest">
        Time Remaining
      </p>

      <div className="flex items-center justify-center gap-2">
        <TimeUnit value={hours} label="HRS" />
        <span className="countdown-separator">:</span>
        <TimeUnit value={minutes} label="MIN" />
        <span className="countdown-separator">:</span>
        <TimeUnit value={seconds} label="SEC" />
      </div>

      {/* Progress bar */}
      <div className="mt-4 w-full max-w-xs mx-auto">
        <div className="h-1.5 rounded-full bg-arena-card overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-arena-primary to-arena-accent transition-all duration-1000"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-xs text-arena-text-dim mt-1">
          {Math.round(progress)}% elapsed
        </p>
      </div>
    </div>
  );
}

function TimeUnit({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="countdown-digit">{value}</span>
      <span className="text-xs text-arena-text-dim tracking-wider">{label}</span>
    </div>
  );
}
