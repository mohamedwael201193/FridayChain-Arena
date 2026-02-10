// FridayChain Arena — Layout Component

import React from 'react';
import Navbar from './Navbar';
import AudioPlayer from './AudioPlayer';
import { Shield, Blocks, ExternalLink, Grid3X3 } from 'lucide-react';
import ArenaLogo from './ArenaLogo';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 container mx-auto px-4 py-6 max-w-7xl">
        {children}
      </main>
      <footer className="border-t border-arena-border/30 bg-arena-surface/40 backdrop-blur-sm">
        <div className="container mx-auto px-4 max-w-7xl py-8">
          <div className="grid md:grid-cols-3 gap-8 mb-8">
            {/* Brand */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <ArenaLogo size={32} />
                <span className="font-bold text-sm">
                  Friday<span className="text-arena-accent">Chain</span> Arena
                </span>
              </div>
              <p className="text-xs text-arena-text-dim leading-relaxed">
                Fully on-chain competitive Sudoku tournaments powered by Linera microchains.
                Every move is a blockchain transaction. Every score is verifiable.
              </p>
            </div>

            {/* Built With */}
            <div>
              <h4 className="text-xs font-semibold text-arena-text-muted uppercase tracking-wider mb-3">
                Built With
              </h4>
              <ul className="space-y-2 text-xs text-arena-text-dim">
                <li className="flex items-center gap-2">
                  <Blocks className="w-3.5 h-3.5 text-arena-primary" />
                  <span>Linera Microchains (Conway Testnet)</span>
                </li>
                <li className="flex items-center gap-2">
                  <Shield className="w-3.5 h-3.5 text-arena-success" />
                  <span>Rust + WASM Smart Contracts</span>
                </li>
                <li className="flex items-center gap-2">
                  <Grid3X3 className="w-3.5 h-3.5 text-arena-accent" />
                  <span>Deterministic Sudoku Engine</span>
                </li>
              </ul>
            </div>

            {/* Links */}
            <div>
              <h4 className="text-xs font-semibold text-arena-text-muted uppercase tracking-wider mb-3">
                Resources
              </h4>
              <ul className="space-y-2 text-xs text-arena-text-dim">
                <li>
                  <a href="https://linera.dev" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-arena-primary transition-colors">
                    <ExternalLink className="w-3 h-3" />
                    Linera Documentation
                  </a>
                </li>
                <li>
                  <a href="https://github.com/linera-io/linera-protocol" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-arena-primary transition-colors">
                    <ExternalLink className="w-3 h-3" />
                    Linera Protocol
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-arena-border/20 pt-4 flex flex-col md:flex-row items-center justify-between gap-2">
            <p className="text-[11px] text-arena-text-dim">
              FridayChain Arena — No cheating possible. Cryptographically guaranteed.
            </p>
            <p className="text-[11px] text-arena-text-dim">
              Built with <span className="text-arena-error">&#9829;</span> on Linera by <span className="text-arena-primary">devmo</span>
            </p>
          </div>
        </div>
      </footer>
      <AudioPlayer />
    </div>
  );
}
