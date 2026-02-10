// FridayChain Arena — Audio Player
//
// Background music that plays during active tournaments.
// Respects browser autoplay policies: music only starts on user interaction.

import { useState, useRef, useEffect } from 'react';
import { useTournament } from '../hooks/useTournament';

export default function AudioPlayer() {
  const { isActive } = useTournament();
  const [isPlaying, setIsPlaying] = useState(false);
  const [userAllowed, setUserAllowed] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!audioRef.current) return;

    if (isActive && userAllowed) {
      audioRef.current.play().catch(() => {
        // Autoplay blocked — user needs to interact first
        setIsPlaying(false);
      });
      setIsPlaying(true);
    } else {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  }, [isActive, userAllowed]);

  const toggleMusic = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
      setUserAllowed(false);
    } else {
      setUserAllowed(true);
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  if (!isActive) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <audio
        ref={audioRef}
        loop
        preload="none"
        src="/audio/tournament-bgm.mp3"
      />
      <button
        onClick={toggleMusic}
        className="w-10 h-10 rounded-full bg-arena-card border border-arena-border flex items-center justify-center hover:bg-arena-surface transition-colors group"
        title={isPlaying ? 'Mute music' : 'Play music'}
      >
        {isPlaying ? (
          <svg
            className="w-4 h-4 text-arena-primary group-hover:text-arena-accent"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
          </svg>
        ) : (
          <svg
            className="w-4 h-4 text-arena-text-muted group-hover:text-arena-text"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
          </svg>
        )}
      </button>
    </div>
  );
}
