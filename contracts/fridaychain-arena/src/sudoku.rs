// Copyright (c) FridayChain Arena Contributors
// SPDX-License-Identifier: MIT

//! Deterministic Sudoku puzzle generator and validator.
//!
//! Uses `ChaCha8Rng` seeded with a `u64` so that the same seed always produces
//! the exact same puzzle across every WASM runtime and every chain.

use crate::SudokuBoard;
use rand::prelude::*;
use rand_chacha::ChaCha8Rng;

/// Number of cells to remove from the complete grid to form the puzzle.
/// ~46 removed → ~35 givens → challenging but solvable tournament difficulty.
const CELLS_TO_REMOVE: usize = 46;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Generate a full Sudoku puzzle + solution from a deterministic seed.
///
/// The algorithm:
/// 1. Build a complete valid 9×9 grid via backtracking with shuffled candidates.
/// 2. Remove `CELLS_TO_REMOVE` cells symmetrically to create the puzzle.
///
/// Returns `None` only if the internal generation fails (should never happen
/// with a valid RNG).
pub fn generate_puzzle(seed: u64) -> Option<SudokuBoard> {
    let mut rng = ChaCha8Rng::seed_from_u64(seed);
    let mut grid = [[0u8; 9]; 9];

    if !fill_grid(&mut grid, &mut rng) {
        return None;
    }

    let solution = grid;
    let mut puzzle = grid;

    remove_cells(&mut puzzle, &mut rng);

    Some(SudokuBoard { puzzle, solution })
}

/// Validate whether placing `value` at `(row, col)` is legal per Sudoku rules.
///
/// Checks:
/// - `value` is 1..=9
/// - `row` and `col` are 0..=8
/// - No duplicate in the same row
/// - No duplicate in the same column
/// - No duplicate in the same 3×3 box
///
/// Does NOT check whether the cell is a given — the caller must do that.
pub fn validate_placement(board: &[Vec<u8>], row: usize, col: usize, value: u8) -> bool {
    if value < 1 || value > 9 || row > 8 || col > 8 {
        return false;
    }

    // Row check
    for c in 0..9 {
        if c != col && board[row][c] == value {
            return false;
        }
    }

    // Column check
    for r in 0..9 {
        if r != row && board[r][col] == value {
            return false;
        }
    }

    // 3×3 box check
    let box_r = (row / 3) * 3;
    let box_c = (col / 3) * 3;
    for r in box_r..box_r + 3 {
        for c in box_c..box_c + 3 {
            if (r != row || c != col) && board[r][c] == value {
                return false;
            }
        }
    }

    true
}

/// Verify a complete game replay: given a seed and a list of (row, col, value)
/// moves, deterministically replay them and return the result.
pub fn verify_game(seed: u64, moves: &[(u8, u8, u8)]) -> crate::VerifyResult {
    let board_opt = generate_puzzle(seed);
    let board = match board_opt {
        Some(b) => b,
        None => {
            return crate::VerifyResult {
                valid: false,
                total_moves: 0,
                penalty_count: 0,
                final_score: 0,
                board_complete: false,
            };
        }
    };

    let mut state = crate::PlayerGameState::new(&board.puzzle);
    let mut penalty_count: u32 = 0;

    for &(row, col, value) in moves {
        let r = row as usize;
        let c = col as usize;

        if r > 8 || c > 8 || value < 1 || value > 9 {
            penalty_count = penalty_count.saturating_add(1);
            continue;
        }

        if state.given_mask[r][c] {
            penalty_count = penalty_count.saturating_add(1);
            continue;
        }

        if !validate_placement(&state.board, r, c, value) {
            penalty_count = penalty_count.saturating_add(1);
        }

        // Place regardless (we record the move even if invalid for replay fidelity)
        state.board[r][c] = value;
    }

    let board_complete = state.check_complete(&board.solution);
    // Assume a hypothetical 1-hour window for scoring during verification
    let score = if board_complete {
        10_000u64.saturating_sub((penalty_count as u64).saturating_mul(200))
    } else {
        0
    };

    crate::VerifyResult {
        valid: true,
        total_moves: moves.len() as u32,
        penalty_count,
        final_score: score,
        board_complete,
    }
}

// ---------------------------------------------------------------------------
// Internal: grid generation via backtracking
// ---------------------------------------------------------------------------

/// Fill the entire 9×9 grid with valid numbers using randomised backtracking.
fn fill_grid(grid: &mut [[u8; 9]; 9], rng: &mut ChaCha8Rng) -> bool {
    if let Some((row, col)) = find_empty(grid) {
        let mut candidates: Vec<u8> = (1..=9).collect();
        candidates.shuffle(rng);

        for &val in &candidates {
            if is_safe(grid, row, col, val) {
                grid[row][col] = val;
                if fill_grid(grid, rng) {
                    return true;
                }
                grid[row][col] = 0;
            }
        }
        false
    } else {
        // No empty cell → grid is complete
        true
    }
}

/// Find the first empty cell (value == 0), scanning row-by-row.
fn find_empty(grid: &[[u8; 9]; 9]) -> Option<(usize, usize)> {
    for r in 0..9 {
        for c in 0..9 {
            if grid[r][c] == 0 {
                return Some((r, c));
            }
        }
    }
    None
}

/// Check if placing `val` at `(row, col)` is safe in the fixed-size grid.
fn is_safe(grid: &[[u8; 9]; 9], row: usize, col: usize, val: u8) -> bool {
    // Row
    for c in 0..9 {
        if grid[row][c] == val {
            return false;
        }
    }

    // Column
    for r in 0..9 {
        if grid[r][col] == val {
            return false;
        }
    }

    // 3×3 box
    let box_r = (row / 3) * 3;
    let box_c = (col / 3) * 3;
    for r in box_r..box_r + 3 {
        for c in box_c..box_c + 3 {
            if grid[r][c] == val {
                return false;
            }
        }
    }

    true
}

/// Remove cells from a completed grid to create the puzzle.
/// Uses diagonal symmetry for aesthetic appeal.
fn remove_cells(grid: &mut [[u8; 9]; 9], rng: &mut ChaCha8Rng) {
    // Build list of all cell positions, shuffle them
    let mut positions: Vec<(usize, usize)> = Vec::with_capacity(81);
    for r in 0..9 {
        for c in 0..9 {
            positions.push((r, c));
        }
    }
    positions.shuffle(rng);

    let mut removed = 0;
    for (r, c) in positions {
        if removed >= CELLS_TO_REMOVE {
            break;
        }

        if grid[r][c] != 0 {
            // Remove this cell
            grid[r][c] = 0;
            removed += 1;

            // Also remove symmetric cell if possible (diagonal symmetry)
            let sym_r = 8 - r;
            let sym_c = 8 - c;
            if removed < CELLS_TO_REMOVE && grid[sym_r][sym_c] != 0 && (sym_r != r || sym_c != c)
            {
                grid[sym_r][sym_c] = 0;
                removed += 1;
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_deterministic_generation() {
        let board1 = generate_puzzle(42).expect("should generate");
        let board2 = generate_puzzle(42).expect("should generate");
        assert_eq!(board1.puzzle, board2.puzzle);
        assert_eq!(board1.solution, board2.solution);
    }

    #[test]
    fn test_different_seeds_different_puzzles() {
        let board1 = generate_puzzle(1).expect("should generate");
        let board2 = generate_puzzle(2).expect("should generate");
        assert_ne!(board1.puzzle, board2.puzzle);
    }

    #[test]
    fn test_solution_is_valid() {
        let board = generate_puzzle(12345).expect("should generate");
        for r in 0..9 {
            let mut seen = [false; 10];
            for c in 0..9 {
                let v = board.solution[r][c] as usize;
                assert!(v >= 1 && v <= 9, "Invalid value in solution");
                assert!(!seen[v], "Duplicate in row {}", r);
                seen[v] = true;
            }
        }
        for c in 0..9 {
            let mut seen = [false; 10];
            for r in 0..9 {
                let v = board.solution[r][c] as usize;
                assert!(!seen[v], "Duplicate in col {}", c);
                seen[v] = true;
            }
        }
    }

    #[test]
    fn test_puzzle_has_givens_and_blanks() {
        let board = generate_puzzle(999).expect("should generate");
        let mut givens = 0;
        let mut blanks = 0;
        for r in 0..9 {
            for c in 0..9 {
                if board.puzzle[r][c] == 0 {
                    blanks += 1;
                } else {
                    givens += 1;
                    // Givens must match solution
                    assert_eq!(board.puzzle[r][c], board.solution[r][c]);
                }
            }
        }
        assert!(givens > 0 && blanks > 0);
        assert!(blanks >= 30, "Should remove at least 30 cells, got {}", blanks);
    }

    #[test]
    fn test_validate_placement() {
        let board = generate_puzzle(7777).expect("should generate");
        let state = crate::PlayerGameState::new(&board.puzzle);

        // Valid: placing the solution value in an empty cell
        for r in 0..9 {
            for c in 0..9 {
                if !state.given_mask[r][c] {
                    let correct_val = board.solution[r][c];
                    assert!(
                        validate_placement(&state.board, r, c, correct_val),
                        "Should be valid at ({}, {}) with value {}",
                        r, c, correct_val
                    );
                    return; // Test at least one
                }
            }
        }
    }

    #[test]
    fn test_verify_game_complete() {
        let seed = 55555;
        let board = generate_puzzle(seed).expect("should generate");
        let state = crate::PlayerGameState::new(&board.puzzle);

        // Build the list of moves needed to complete the puzzle
        let mut moves = Vec::new();
        for r in 0..9 {
            for c in 0..9 {
                if !state.given_mask[r][c] {
                    moves.push((r as u8, c as u8, board.solution[r][c]));
                }
            }
        }

        let result = verify_game(seed, &moves);
        assert!(result.valid);
        assert!(result.board_complete);
        assert_eq!(result.penalty_count, 0);
        assert!(result.final_score > 0);
    }
}
