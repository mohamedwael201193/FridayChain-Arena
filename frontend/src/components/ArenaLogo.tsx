// FridayChain Arena — Custom SVG Logo Component

export default function ArenaLogo({ size = 40 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className="flex-shrink-0"
    >
      <defs>
        <linearGradient id="logoBg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1a103d" />
          <stop offset="100%" stopColor="#0a0a1a" />
        </linearGradient>
        <linearGradient id="logoGrid" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#8b5cf6" />
          <stop offset="50%" stopColor="#a855f7" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
        <linearGradient id="logoAccent" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#f97316" />
        </linearGradient>
        <filter id="logoGlow">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {/* Background */}
      <rect width="64" height="64" rx="14" fill="url(#logoBg)" />
      <rect
        width="64"
        height="64"
        rx="14"
        fill="none"
        stroke="url(#logoGrid)"
        strokeWidth="1.5"
        opacity="0.4"
      />
      {/* 3×3 Sudoku grid with numbers */}
      <g transform="translate(14,12)" filter="url(#logoGlow)">
        {/* Grid frame */}
        <rect x="0" y="0" width="36" height="36" rx="3" fill="none" stroke="url(#logoGrid)" strokeWidth="1.8" />
        {/* Inner lines */}
        <line x1="12" y1="0" x2="12" y2="36" stroke="url(#logoGrid)" strokeWidth="1" opacity="0.6" />
        <line x1="24" y1="0" x2="24" y2="36" stroke="url(#logoGrid)" strokeWidth="1" opacity="0.6" />
        <line x1="0" y1="12" x2="36" y2="12" stroke="url(#logoGrid)" strokeWidth="1" opacity="0.6" />
        <line x1="0" y1="24" x2="36" y2="24" stroke="url(#logoGrid)" strokeWidth="1" opacity="0.6" />
        {/* Numbers — diagonal golden, rest purple */}
        <text x="6" y="10" fontFamily="sans-serif" fontSize="9" fontWeight="700" fill="url(#logoAccent)" textAnchor="middle">9</text>
        <text x="18" y="10" fontFamily="sans-serif" fontSize="9" fontWeight="700" fill="#8b5cf6" textAnchor="middle" opacity="0.7">2</text>
        <text x="30" y="10" fontFamily="sans-serif" fontSize="9" fontWeight="700" fill="#8b5cf6" textAnchor="middle" opacity="0.7">7</text>
        <text x="6" y="22" fontFamily="sans-serif" fontSize="9" fontWeight="700" fill="#8b5cf6" textAnchor="middle" opacity="0.7">4</text>
        <text x="18" y="22" fontFamily="sans-serif" fontSize="9" fontWeight="700" fill="url(#logoAccent)" textAnchor="middle">1</text>
        <text x="30" y="22" fontFamily="sans-serif" fontSize="9" fontWeight="700" fill="#8b5cf6" textAnchor="middle" opacity="0.7">5</text>
        <text x="6" y="34" fontFamily="sans-serif" fontSize="9" fontWeight="700" fill="#8b5cf6" textAnchor="middle" opacity="0.7">3</text>
        <text x="18" y="34" fontFamily="sans-serif" fontSize="9" fontWeight="700" fill="#8b5cf6" textAnchor="middle" opacity="0.7">6</text>
        <text x="30" y="34" fontFamily="sans-serif" fontSize="9" fontWeight="700" fill="url(#logoAccent)" textAnchor="middle">8</text>
      </g>
      {/* Chain link dots */}
      <g transform="translate(20,53)">
        <circle cx="0" cy="0" r="2" fill="#8b5cf6" opacity="0.8" />
        <line x1="3" y1="0" x2="9" y2="0" stroke="#8b5cf6" strokeWidth="1.2" opacity="0.4" />
        <circle cx="12" cy="0" r="2" fill="#a855f7" opacity="0.8" />
        <line x1="15" y1="0" x2="21" y2="0" stroke="#a855f7" strokeWidth="1.2" opacity="0.4" />
        <circle cx="24" cy="0" r="2" fill="#f59e0b" opacity="0.8" />
      </g>
    </svg>
  );
}
