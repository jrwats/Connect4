import { ROWS, COLS, CellValue, Player, GameState } from '../types/game';

// ─── Board helpers ───────────────────────────────────────────────────────────

export function createEmptyBoard(): CellValue[][] {
  return Array.from({ length: ROWS }, () =>
    Array<CellValue>(COLS).fill('empty')
  );
}

export function createInitialState(): GameState {
  return {
    board: createEmptyBoard(),
    currentPlayer: 1,
    phase: 'normal',
    blockersRemaining: { 1: 2, 2: 2 },
    winner: null,
    winningCells: null,
    usingBlocker: false,
  };
}

/** Returns the lowest empty row in a column, or -1 if the column is full. */
export function getLowestEmptyRow(board: CellValue[][], col: number): number {
  for (let row = ROWS - 1; row >= 0; row--) {
    if (board[row][col] === 'empty') return row;
  }
  return -1;
}

/** Columns into which a piece can still be dropped. */
export function getValidCols(board: CellValue[][]): number[] {
  return Array.from({ length: COLS }, (_, i) => i).filter(
    (col) => getLowestEmptyRow(board, col) !== -1
  );
}

/** Immutably drops `piece` into `col`. Returns null if column is full. */
function dropPiece(
  board: CellValue[][],
  col: number,
  piece: CellValue
): { board: CellValue[][]; row: number } | null {
  const row = getLowestEmptyRow(board, col);
  if (row === -1) return null;
  const next = board.map((r) => [...r]);
  next[row][col] = piece;
  return { board: next, row };
}

// ─── Win / draw detection ────────────────────────────────────────────────────

/** Only 'player1' and 'player2' cells count toward 4-in-a-row. */
export function checkWinner(board: CellValue[][]): {
  winner: Player | null;
  cells: [number, number][];
} {
  const dirs: [number, number][] = [[0, 1], [1, 0], [1, 1], [1, -1]];

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const cell = board[row][col];
      if (cell !== 'player1' && cell !== 'player2') continue;

      for (const [dr, dc] of dirs) {
        const cells: [number, number][] = [[row, col]];
        for (let i = 1; i < 4; i++) {
          const r = row + dr * i;
          const c = col + dc * i;
          if (r < 0 || r >= ROWS || c < 0 || c >= COLS) break;
          if (board[r][c] !== cell) break;
          cells.push([r, c]);
        }
        if (cells.length === 4) {
          return { winner: cell === 'player1' ? 1 : 2, cells };
        }
      }
    }
  }
  return { winner: null, cells: [] };
}

/** Board is full when the top row has no empty cells. */
export function checkDraw(board: CellValue[][]): boolean {
  return board[0].every((cell) => cell !== 'empty');
}

// ─── State machine ───────────────────────────────────────────────────────────

/**
 * Applies a column drop to the given state and returns the new state,
 * or null if the move is illegal (full column, no blockers, game over).
 *
 * The `usingBlocker` flag on the state controls whether this drop is a
 * blocker placement (normal phase) or an ordinary coloured-piece drop.
 */
export function applyMove(state: GameState, col: number): GameState | null {
  if (state.winner) return null;

  const { board, currentPlayer, phase, blockersRemaining, usingBlocker } = state;
  const nextPlayer: Player = currentPlayer === 1 ? 2 : 1;

  // ── Blocker-bonus phase: must place own coloured piece ───────────────────
  if (phase === 'blocker-bonus') {
    const piece: CellValue = currentPlayer === 1 ? 'player1' : 'player2';
    const result = dropPiece(board, col, piece);
    if (!result) return null;

    const { winner, cells } = checkWinner(result.board);
    const isDraw = !winner && checkDraw(result.board);

    return {
      ...state,
      board: result.board,
      currentPlayer: nextPlayer,
      phase: 'normal',
      winner: winner ?? (isDraw ? 'draw' : null),
      winningCells: cells.length > 0 ? cells : null,
      usingBlocker: false,
    };
  }

  // ── Normal phase ─────────────────────────────────────────────────────────
  if (usingBlocker) {
    if (blockersRemaining[currentPlayer] <= 0) return null;

    const piece: CellValue = currentPlayer === 1 ? 'blocker1' : 'blocker2';
    const result = dropPiece(board, col, piece);
    if (!result) return null;

    // Edge case: board is completely full after the blocker — no bonus possible
    if (checkDraw(result.board)) {
      return {
        ...state,
        board: result.board,
        phase: 'normal',
        blockersRemaining: {
          ...blockersRemaining,
          [currentPlayer]: blockersRemaining[currentPlayer] - 1,
        },
        winner: 'draw',
        winningCells: null,
        usingBlocker: false,
      };
    }

    return {
      ...state,
      board: result.board,
      phase: 'blocker-bonus',
      blockersRemaining: {
        ...blockersRemaining,
        [currentPlayer]: blockersRemaining[currentPlayer] - 1,
      },
      usingBlocker: false,
    };
  }

  // Regular coloured-piece drop
  const piece: CellValue = currentPlayer === 1 ? 'player1' : 'player2';
  const result = dropPiece(board, col, piece);
  if (!result) return null;

  const { winner, cells } = checkWinner(result.board);
  const isDraw = !winner && checkDraw(result.board);

  return {
    ...state,
    board: result.board,
    currentPlayer: nextPlayer,
    phase: 'normal',
    winner: winner ?? (isDraw ? 'draw' : null),
    winningCells: cells.length > 0 ? cells : null,
    usingBlocker: false,
  };
}
