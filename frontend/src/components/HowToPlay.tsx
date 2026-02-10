// FridayChain Arena — How To Play Component

import { Wallet, Clock, Grid3X3, AlertTriangle, Trophy, Shield, Eye, Hash, FileCheck } from 'lucide-react';

export default function HowToPlay() {
  return (
    <div className="glass-card rounded-2xl p-6">
      <div className="space-y-3">
        <Step
          icon={<Wallet className="w-4 h-4" />}
          number={1}
          title="Connect Your Wallet"
          description="Connect MetaMask to claim your personal Linera microchain and register your username."
        />
        <Step
          icon={<Clock className="w-4 h-4" />}
          number={2}
          title="Wait for Tournament"
          description="Tournaments are started by the admin and last 1 hour. All players get the same puzzle."
        />
        <Step
          icon={<Grid3X3 className="w-4 h-4" />}
          number={3}
          title="Solve the Sudoku"
          description="Click cells and select numbers. Every move is recorded as a blockchain transaction on your microchain."
        />
        <Step
          icon={<AlertTriangle className="w-4 h-4" />}
          number={4}
          title="Avoid Penalties"
          description="Invalid placements cost -100 points each. Think carefully before placing — the contract enforces Sudoku rules."
        />
        <Step
          icon={<Trophy className="w-4 h-4" />}
          number={5}
          title="Climb the Leaderboard"
          description="Arena Rating = Base 10K - time - penalties + progress bonus. Faster solving with fewer errors wins!"
        />
      </div>

      <div className="mt-5 p-4 rounded-xl bg-arena-bg/40 border border-arena-border/30">
        <div className="flex items-center gap-2 mb-2.5">
          <Shield className="w-4 h-4 text-arena-success" />
          <h3 className="text-sm font-semibold text-arena-success">
            Anti-Cheat Guarantees
          </h3>
        </div>
        <ul className="text-xs text-arena-text-dim space-y-1.5">
          <li className="flex items-start gap-2">
            <Hash className="w-3 h-3 mt-0.5 text-arena-text-dim flex-shrink-0" />
            <span>Every cell placement is a blockchain transaction</span>
          </li>
          <li className="flex items-start gap-2">
            <Eye className="w-3 h-3 mt-0.5 text-arena-text-dim flex-shrink-0" />
            <span>Puzzles generated deterministically from on-chain seeds</span>
          </li>
          <li className="flex items-start gap-2">
            <Shield className="w-3 h-3 mt-0.5 text-arena-text-dim flex-shrink-0" />
            <span>Scores computed by WASM smart contracts — no client trust</span>
          </li>
          <li className="flex items-start gap-2">
            <FileCheck className="w-3 h-3 mt-0.5 text-arena-text-dim flex-shrink-0" />
            <span>All games are replayable and publicly verifiable</span>
          </li>
        </ul>
      </div>
    </div>
  );
}

function Step({
  icon,
  number,
  title,
  description,
}: {
  icon: React.ReactNode;
  number: number;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-3 group">
      <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-arena-primary/10 border border-arena-primary/20 text-arena-primary flex items-center justify-center group-hover:bg-arena-primary/20 transition-colors">
        {icon}
      </div>
      <div>
        <h3 className="font-semibold text-arena-text text-sm">
          <span className="text-arena-text-dim mr-1">{number}.</span>
          {title}
        </h3>
        <p className="text-arena-text-muted text-xs mt-0.5 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}
