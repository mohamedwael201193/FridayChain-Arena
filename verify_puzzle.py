#!/usr/bin/env python3
"""
Verify the Tournament #3 puzzle from the screenshot.
Checks structural validity + solvability via backtracking.
"""

# Puzzle extracted from the screenshot (0 = empty, 1-9 = given)
# Row-by-row, left-to-right
puzzle = [
    [0, 0, 0, 0, 0, 4, 0, 0, 9],  # Row 0
    [0, 0, 3, 0, 8, 0, 0, 0, 4],  # Row 1
    [4, 0, 9, 3, 0, 1, 0, 6, 5],  # Row 2
    [5, 0, 0, 8, 6, 0, 7, 0, 0],  # Row 3
    [6, 0, 8, 0, 0, 0, 3, 0, 1],  # Row 4
    [0, 0, 4, 5, 1, 2, 0, 0, 8],  # Row 5
    [7, 3, 0, 1, 0, 8, 9, 2, 6],  # Row 6
    [9, 0, 0, 0, 2, 0, 4, 1, 7],  # Row 7
    [8, 2, 1, 9, 0, 0, 0, 5, 3],  # Row 8
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

def check_structural_validity(board):
    """Check no duplicate non-zero values in any row, column, or 3x3 box."""
    errors = []

    # Row check
    for r in range(9):
        seen = {}
        for c in range(9):
            v = board[r][c]
            if v != 0:
                if v in seen:
                    errors.append(f"ROW {r}: duplicate {v} at cols {seen[v]} and {c}")
                seen[v] = c

    # Column check
    for c in range(9):
        seen = {}
        for r in range(9):
            v = board[r][c]
            if v != 0:
                if v in seen:
                    errors.append(f"COL {c}: duplicate {v} at rows {seen[v]} and {r}")
                seen[v] = r

    # Box check
    for box_r in range(3):
        for box_c in range(3):
            seen = {}
            for r in range(box_r * 3, box_r * 3 + 3):
                for c in range(box_c * 3, box_c * 3 + 3):
                    v = board[r][c]
                    if v != 0:
                        if v in seen:
                            errors.append(
                                f"BOX ({box_r},{box_c}): duplicate {v} at "
                                f"({seen[v][0]},{seen[v][1]}) and ({r},{c})"
                            )
                        seen[v] = (r, c)

    return errors

def is_safe(board, row, col, val):
    """Check if placing val at (row, col) is valid."""
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
    """Find next empty cell (row-major order)."""
    for r in range(9):
        for c in range(9):
            if board[r][c] == 0:
                return (r, c)
    return None

def solve(board):
    """Solve via backtracking. Returns True if solvable."""
    cell = find_empty(board)
    if cell is None:
        return True  # Solved
    r, c = cell
    for val in range(1, 10):
        if is_safe(board, r, c, val):
            board[r][c] = val
            if solve(board):
                return True
            board[r][c] = 0
    return False

def count_solutions(board, max_count=2):
    """Count solutions up to max_count. Stops early for efficiency."""
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

def find_contradiction(board):
    """Check if any empty cell has zero candidates (immediate contradiction)."""
    contradictions = []
    for r in range(9):
        for c in range(9):
            if board[r][c] == 0:
                candidates = [v for v in range(1, 10) if is_safe(board, r, c, v)]
                if len(candidates) == 0:
                    contradictions.append((r, c))
    return contradictions

# ============================================================
print("=" * 60)
print("PUZZLE (from Tournament #3 screenshot)")
print("=" * 60)
print_board(puzzle)

givens = sum(1 for r in range(9) for c in range(9) if puzzle[r][c] != 0)
blanks = 81 - givens
print(f"\nGivens: {givens}, Blanks: {blanks}")

# 1. Structural validity
print("\n" + "=" * 60)
print("STEP 1: Structural Validity (no duplicates in rows/cols/boxes)")
print("=" * 60)
errors = check_structural_validity(puzzle)
if errors:
    for e in errors:
        print(f"  ERROR: {e}")
else:
    print("  ✓ No constraint violations among given cells.")

# 2. Check for immediate contradictions (empty cells with 0 candidates)
print("\n" + "=" * 60)
print("STEP 2: Check for Immediate Contradictions")
print("=" * 60)
contradictions = find_contradiction(puzzle)
if contradictions:
    for (r, c) in contradictions:
        print(f"  CONTRADICTION at ({r},{c}): no valid candidates!")
        # Show why
        row_vals = {puzzle[r][cc] for cc in range(9) if puzzle[r][cc] != 0}
        col_vals = {puzzle[rr][c] for rr in range(9) if puzzle[rr][c] != 0}
        br, bc = (r // 3) * 3, (c // 3) * 3
        box_vals = {puzzle[rr][cc] for rr in range(br, br+3) for cc in range(bc, bc+3) if puzzle[rr][cc] != 0}
        print(f"    Row values: {sorted(row_vals)}")
        print(f"    Col values: {sorted(col_vals)}")
        print(f"    Box values: {sorted(box_vals)}")
        all_blocked = row_vals | col_vals | box_vals
        print(f"    All blocked: {sorted(all_blocked)}")
        print(f"    Missing from 1-9: {sorted(set(range(1,10)) - all_blocked)}")
else:
    print("  ✓ All empty cells have at least one candidate.")

# 3. Show candidates for each empty cell
print("\n" + "=" * 60)
print("STEP 3: Candidate Analysis")
print("=" * 60)
for r in range(9):
    for c in range(9):
        if puzzle[r][c] == 0:
            candidates = [v for v in range(1, 10) if is_safe(puzzle, r, c, v)]
            if len(candidates) <= 2:
                print(f"  ({r},{c}): candidates = {candidates} {'⚠ CONSTRAINED' if len(candidates) == 1 else ''}")

# 4. Attempt to solve
print("\n" + "=" * 60)
print("STEP 4: Solve via Backtracking")
print("=" * 60)
import copy
board_copy = copy.deepcopy(puzzle)
if solve(board_copy):
    print("  ✓ PUZZLE IS SOLVABLE!")
    print("\n  Solution:")
    print_board(board_copy)
else:
    print("  ✗ PUZZLE IS UNSOLVABLE — no valid solution exists!")

# 5. Count solutions (uniqueness check)
print("\n" + "=" * 60)
print("STEP 5: Uniqueness Check (counting solutions, max 10)")
print("=" * 60)
board_copy2 = copy.deepcopy(puzzle)
num_solutions = count_solutions(board_copy2, max_count=10)
if num_solutions == 0:
    print(f"  ✗ ZERO solutions — puzzle is invalid!")
elif num_solutions == 1:
    print(f"  ✓ EXACTLY 1 solution — puzzle has a unique solution.")
else:
    print(f"  ⚠ {num_solutions}+ solutions — puzzle does NOT have a unique solution!")
    print(f"    This means players can go down 'wrong' paths where valid")
    print(f"    Sudoku placements don't match the stored solution.")

print("\n" + "=" * 60)
print("DONE")
print("=" * 60)
