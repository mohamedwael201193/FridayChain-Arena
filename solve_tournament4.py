#!/usr/bin/env python3
"""
Solve Tournament #4 puzzle and show the solution + moves to enter.
"""
import copy

# Puzzle from Tournament #4 — same seed as Tournament #3
# Using the verified original puzzle from verify_original.py
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

def print_board(board, highlight=None):
    """Print board. highlight = set of (r,c) to mark with *"""
    if highlight is None:
        highlight = set()
    for r in range(9):
        if r % 3 == 0 and r > 0:
            print("  ------+-------+------")
        row_str = "  "
        for c in range(9):
            if c % 3 == 0 and c > 0:
                row_str += "| "
            v = board[r][c]
            if (r, c) in highlight:
                row_str += f"\033[92m{v}\033[0m "  # green
            elif v == 0:
                row_str += ". "
            else:
                row_str += f"{v} "
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

def solve(board):
    cell = None
    for r in range(9):
        for c in range(9):
            if board[r][c] == 0:
                cell = (r, c)
                break
        if cell:
            break
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

# ── Solve ──
solution = copy.deepcopy(puzzle)
if not solve(solution):
    print("ERROR: Puzzle is unsolvable!")
    exit(1)

# ── Find cells to fill ──
moves = []
for r in range(9):
    for c in range(9):
        if puzzle[r][c] == 0:
            moves.append((r, c, solution[r][c]))

cells_to_fill = set((r, c) for r, c, _ in moves)

print("=" * 50)
print("  TOURNAMENT #4 — PUZZLE")
print("=" * 50)
print_board(puzzle)

print()
print("=" * 50)
print("  SOLUTION")
print("=" * 50)
print_board(solution, highlight=cells_to_fill)

print()
print("=" * 50)
print(f"  MOVES TO ENTER ({len(moves)} cells)")
print("=" * 50)
print()
print("  Enter these values (row, col → value):")
print("  Row/Col are 0-indexed from top-left")
print()

# Group by row for easier reading
for r in range(9):
    row_moves = [(r2, c, v) for r2, c, v in moves if r2 == r]
    if row_moves:
        cells = ", ".join([f"({r},{c})→{v}" for _, c, v in row_moves])
        # Also show as readable: "Row 3: col1=val, col3=val..."
        readable = ", ".join([f"col {c} = {v}" for _, c, v in row_moves])
        print(f"  Row {r}: {readable}")

print()
print("=" * 50)
print("  QUICK REFERENCE (read left-to-right, top-to-bottom)")
print("=" * 50)
print()
for r in range(9):
    row_str = "  "
    for c in range(9):
        if c % 3 == 0 and c > 0:
            row_str += "| "
        v = solution[r][c]
        if puzzle[r][c] == 0:
            row_str += f"\033[1;93m{v}\033[0m "  # bold yellow = you enter
        else:
            row_str += f"\033[90m{v}\033[0m "     # gray = given
    print(row_str)

print()
print("  \033[90mGray\033[0m = given (already filled)")
print("  \033[1;93mYellow\033[0m = YOU enter these")
print(f"\n  Total cells to fill: {len(moves)}")
print(f"  Take your time, avoid penalties (-100 pts each)!")
