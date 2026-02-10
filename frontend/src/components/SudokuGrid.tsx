// FridayChain Arena — Sudoku Grid Component
//
// Interactive 9x9 Sudoku grid that reads state from the chain
// and sends mutations for cell placements.

import { useState, useCallback } from 'react';
import { useArena } from '../hooks/useArena';

interface SudokuGridProps {
  puzzleBoard: number[][];
  playerBoard?: number[][];
  givenMask?: boolean[][];
  completed?: boolean;
  onCellPlace?: (row: number, col: number, value: number) => Promise<boolean>;
  onCellClear?: (row: number, col: number) => Promise<void>;
}

export default function SudokuGrid({
  puzzleBoard,
  playerBoard,
  givenMask,
  completed = false,
  onCellPlace,
  onCellClear,
}: SudokuGridProps) {
  const [selectedCell, setSelectedCell] = useState<[number, number] | null>(null);
  const [invalidCells, setInvalidCells] = useState<Set<string>>(new Set());
  const [processingCell, setProcessingCell] = useState<string | null>(null);

  // Use playerBoard if available, otherwise puzzleBoard
  const displayBoard = playerBoard || puzzleBoard;

  const handleCellClick = useCallback(
    (row: number, col: number) => {
      if (completed) return;
      const isGiven = givenMask ? givenMask[row][col] : puzzleBoard[row][col] !== 0;
      if (isGiven) return;

      if (selectedCell && selectedCell[0] === row && selectedCell[1] === col) {
        setSelectedCell(null);
      } else {
        setSelectedCell([row, col]);
      }
    },
    [selectedCell, givenMask, puzzleBoard, completed],
  );

  const handleNumberSelect = useCallback(
    async (value: number) => {
      if (!selectedCell || !onCellPlace) return;
      const [row, col] = selectedCell;
      const cellKey = `${row}-${col}`;

      setProcessingCell(cellKey);
      try {
        const success = await onCellPlace(row, col, value);
        if (!success) {
          setInvalidCells((prev) => {
            const next = new Set(prev);
            next.add(cellKey);
            return next;
          });
          // Clear invalid state after animation
          setTimeout(() => {
            setInvalidCells((prev) => {
              const next = new Set(prev);
              next.delete(cellKey);
              return next;
            });
          }, 1500);
        }
      } finally {
        setProcessingCell(null);
        setSelectedCell(null);
      }
    },
    [selectedCell, onCellPlace],
  );

  const handleClear = useCallback(async () => {
    if (!selectedCell || !onCellClear) return;
    const [row, col] = selectedCell;
    await onCellClear(row, col);
    setSelectedCell(null);
  }, [selectedCell, onCellClear]);

  const getCellClasses = (row: number, col: number): string => {
    const classes: string[] = ['sudoku-cell'];
    const isGiven = givenMask ? givenMask[row][col] : puzzleBoard[row][col] !== 0;
    const cellKey = `${row}-${col}`;

    if (isGiven) classes.push('given');
    if (completed) classes.push('completed');
    if (
      selectedCell &&
      selectedCell[0] === row &&
      selectedCell[1] === col
    ) {
      classes.push('selected');
    }
    if (invalidCells.has(cellKey)) classes.push('invalid');
    if (processingCell === cellKey) classes.push('opacity-50');

    // 3x3 box borders
    if (col === 2 || col === 5) classes.push('box-right');
    if (row === 2 || row === 5) classes.push('box-bottom');

    return classes.join(' ');
  };

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Grid */}
      <div className="sudoku-grid w-full max-w-[450px]">
        {displayBoard.map((row, r) =>
          row.map((cell, c) => (
            <div
              key={`${r}-${c}`}
              className={getCellClasses(r, c)}
              onClick={() => handleCellClick(r, c)}
            >
              {cell !== 0 ? cell : ''}
            </div>
          )),
        )}
      </div>

      {/* Number Picker */}
      {!completed && selectedCell && (
        <div className="animate-slide-up">
          <p className="text-sm text-arena-text-muted mb-2 text-center">
            Select a number for cell ({selectedCell[0] + 1},{' '}
            {selectedCell[1] + 1})
          </p>
          <div className="number-picker w-44">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
              <button
                key={n}
                className="number-btn"
                onClick={() => handleNumberSelect(n)}
                disabled={processingCell !== null}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="flex gap-2 mt-2 justify-center">
            <button
              onClick={handleClear}
              className="px-4 py-1.5 text-xs rounded-lg border border-arena-border text-arena-text-muted hover:border-arena-warning hover:text-arena-warning transition-all"
            >
              Clear
            </button>
            <button
              onClick={() => setSelectedCell(null)}
              className="px-4 py-1.5 text-xs rounded-lg border border-arena-border text-arena-text-muted hover:border-arena-text hover:text-arena-text transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
