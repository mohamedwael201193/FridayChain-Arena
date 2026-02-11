#!/usr/bin/env python3
"""
Verify the ORIGINAL puzzle (bob's clean view — no player moves).
This is the puzzle as generated, before any user input.
"""

# Bob's puzzle: the ORIGINAL givens only (0 = empty)
puzzle = [
    [0, 0, 0, 0, 0, 4, 0, 0, 9],  # Row 0
    [0, 0, 3, 0, 8, 0, 0, 0, 4],  # Row 1
    [4, 0, 9, 3, 0, 1, 0, 6, 5],  # Row 2
    [5, 0, 0, 8, 6, 0, 7, 0, 0],  # Row 3
    [6, 0, 8, 0, 0, 0, 3, 0, 1],  # Row 4
    [0, 0, 4, 5, 1, 2, 0, 0, 8],  # Row 5
    [7, 3, 0, 1, 0, 8, 9, 0, 6],  # Row 6
    [9, 0, 0, 0, 2, 0, 4, 0, 0],  # Row 7
    [8, 0, 0, 9, 0, 0, 0, 0, 0],  # Row 8
]

def print_board(board):
    for r in range(9):
        if r % 3 == 0 and r > 0:
            print("-" * 25)
        row_str = ""
        for c in range(9):
            if c % 3 == 0 and c > 0:
                row_str += " | "
            v = board[r][c]
            row_str += f" {v if v != 0 else '.'} "
        print(row_str)

def is_safe(board, row, col, val):
    for c in range(9):
        if board[row][c] == val:
            return False
    for r in range(9):
        if board[r][col] == val:
            return False
    br, bc = (row // 3) * 3, (col // 3) * 3
    for r in range(br, br + 3):
        for c in range(bc, bc + 3):
            if board[r][c] == val:
                return False
    return True

def find_empty(board):
    for r in range(9):
        for c in range(9):
            if board[r][c] == 0:
                return (r, c)
    return None

def solve(board):
    cell = find_empty(board)
    if cell is None:
        return True
    r, c = cell
    for val in range(1, 10):
        if is_safe(board, r, c, val):
            board[r][c] = val
            if solve(board):
                return True
            board[r][c] = 0
    return False

def count_solutions(board, max_count=2):
    cell = find_empty(board)
    if cell is None:
        return 1
    r, c = cell
    total = 0
    for val in range(1, 10):
        if is_safe(board, r, c, val):
            board[r][c] = val
            total += count_solutions(board, max_count - total)
            board[r][c] = 0
            if total >= max_count:
                return total
    return total

def check_structural_validity(board):
    errors = []
    for r in range(9):
        seen = {}
        for c in range(9):
            v = board[r][c]
            if v != 0:
                if v in seen:
                    errors.append(f"ROW {r}: duplicate {v} at cols {seen[v]} and {c}")
                seen[v] = c
    for c in range(9):
        seen = {}
        for r in range(9):
            v = board[r][c]
            if v != 0:
                if v in seen:
                    errors.append(f"COL {c}: duplicate {v} at rows {seen[v]} and {r}")
                seen[v] = r
    for box_r in range(3):
        for box_c in range(3):
            seen = {}
            for r in range(box_r * 3, box_r * 3 + 3):
                for c in range(box_c * 3, box_c * 3 + 3):
                    v = board[r][c]
                    if v != 0:
                        if v in seen:
                            errors.append(f"BOX ({box_r},{box_c}): dup {v} at {seen[v]} and ({r},{c})")
                        seen[v] = (r, c)
    return errors

import copy

print("=" * 60)
print("ORIGINAL PUZZLE (bob's view — no player moves)")
print("=" * 60)
print_board(puzzle)

givens = sum(1 for r in range(9) for c in range(9) if puzzle[r][c] != 0)
print(f"\nGivens: {givens}, Blanks: {81 - givens}")

print("\n--- Structural Validity ---")
errors = check_structural_validity(puzzle)
if errors:
    for e in errors:
        print(f"  ERROR: {e}")
else:
    print("  OK: No duplicates in rows/cols/boxes.")

print("\n--- Candidates for empty cells ---")
constrained = []
for r in range(9):
    for c in range(9):
        if puzzle[r][c] == 0:
            cands = [v for v in range(1, 10) if is_safe(puzzle, r, c, v)]
            if len(cands) == 0:
                print(f"  ({r},{c}): ZERO candidates — CONTRADICTION!")
            elif len(cands) <= 2:
                print(f"  ({r},{c}): {cands}")
                constrained.append((r, c, cands))

print("\n--- Solving via backtracking ---")
board_copy = copy.deepcopy(puzzle)
if solve(board_copy):
    print("  SOLVABLE!")
    print("\n  Solution:")
    print_board(board_copy)
else:
    print("  UNSOLVABLE!")

print("\n--- Uniqueness check (counting up to 10 solutions) ---")
board_copy2 = copy.deepcopy(puzzle)
num = count_solutions(board_copy2, max_count=10)
if num == 0:
    print(f"  ZERO solutions — puzzle is INVALID")
elif num == 1:
    print(f"  EXACTLY 1 solution — puzzle is VALID and UNIQUE")
else:
    print(f"  {num}+ solutions — puzzle has MULTIPLE solutions!")
    print(f"  This means a player can place Sudoku-valid values")
    print(f"  that don't match the stored solution → dead ends")

# Now also check devmo's board (with 7 player-placed cells)
print("\n" + "=" * 60)
print("DEVMO'S BOARD (with player-placed cells)")
print("=" * 60)

devmo_board = copy.deepcopy(puzzle)
# Player-placed cells (from earlier comparison):
player_moves = [
    (6, 7, 2),  # Row 6, Col 7 = 2
    (7, 7, 1),  # Row 7, Col 7 = 1
    (7, 8, 7),  # Row 7, Col 8 = 7
    (8, 1, 2),  # Row 8, Col 1 = 2
    (8, 2, 1),  # Row 8, Col 2 = 1
    (8, 7, 5),  # Row 8, Col 7 = 5
    (8, 8, 3),  # Row 8, Col 8 = 3
]

for r, c, v in player_moves:
    devmo_board[r][c] = v

print_board(devmo_board)
print(f"\nPlayer moves: {player_moves}")

# Check if each move was Sudoku-valid at time of placement
print("\n--- Replaying player moves in order ---")
replay = copy.deepcopy(puzzle)
for i, (r, c, v) in enumerate(player_moves):
    valid = is_safe(replay, r, c, v)
    replay[r][c] = v
    print(f"  Move {i+1}: ({r},{c})={v} — {'VALID' if valid else 'INVALID (penalty)'}")

print("\n--- Is devmo's board still solvable? ---")
devmo_copy = copy.deepcopy(devmo_board)
if solve(devmo_copy):
    print("  YES — still solvable")
    print_board(devmo_copy)
else:
    print("  NO — devmo's moves created a dead end!")
    # Find the contradiction
    for r in range(9):
        for c in range(9):
            if devmo_board[r][c] == 0:
                cands = [v for v in range(1, 10) if is_safe(devmo_board, r, c, v)]
                if len(cands) == 0:
                    print(f"  Contradiction at ({r},{c}): no valid candidates")
                    row_vals = sorted({devmo_board[r][cc] for cc in range(9) if devmo_board[r][cc] != 0})
                    col_vals = sorted({devmo_board[rr][c] for rr in range(9) if devmo_board[rr][c] != 0})
                    br, bc = (r // 3) * 3, (c // 3) * 3
                    box_vals = sorted({devmo_board[rr][cc] for rr in range(br, br+3) for cc in range(bc, bc+3) if devmo_board[rr][cc] != 0})
                    print(f"    Row: {row_vals}, Col: {col_vals}, Box: {box_vals}")
