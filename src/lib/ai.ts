import { ROWS, COLS, CellValue, Player, Difficulty, GameState } from '../types/game';
import { getValidCols, applyMove, checkWinner, checkDraw } from './gameLogic';

// ─── Move representation ─────────────────────────────────────────────────────

export interface AIMove {
  col: number;
  /** True when the move is a blocker placement rather than a coloured piece. */
  useBlocker: boolean;
}

/** All legal moves from the given state (used by both AI and minimax). */
function generateMoves(state: GameState): AIMove[] {
  if (state.winner) return [];

  const validCols = getValidCols(state.board);

  // In blocker-bonus phase the same player must drop their coloured piece —
  // no option to use another blocker.
  if (state.phase === 'blocker-bonus') {
    return validCols.map((col) => ({ col, useBlocker: false }));
  }

  const moves: AIMove[] = validCols.map((col) => ({ col, useBlocker: false }));

  if (state.blockersRemaining[state.currentPlayer] > 0) {
    for (const col of validCols) {
      moves.push({ col, useBlocker: true });
    }
  }

  return moves;
}

/** Apply an AI-generated move to a state. */
export function applyAIMove(state: GameState, move: AIMove): GameState | null {
  return applyMove({ ...state, usingBlocker: move.useBlocker }, move.col);
}

// ─── Evaluation ──────────────────────────────────────────────────────────────

/**
 * Score a window of 4 cells from the perspective of `aiPiece`.
 * Any blocker in the window makes it useless for both players.
 */
function scoreWindow(
  window: CellValue[],
  aiPiece: CellValue,
  humanPiece: CellValue
): number {
  // Blockers neutralise the window completely
  if (window.some((c) => c === 'blocker1' || c === 'blocker2')) return 0;

  const ai = window.filter((c) => c === aiPiece).length;
  const human = window.filter((c) => c === humanPiece).length;

  // Mixed window — neither side can complete a 4 through here
  if (ai > 0 && human > 0) return 0;

  const empty = window.filter((c) => c === 'empty').length;

  if (ai > 0) {
    if (ai === 4) return 100_000;
    if (ai === 3 && empty === 1) return 120;
    if (ai === 2 && empty === 2) return 12;
    return 1;
  }

  if (human > 0) {
    if (human === 4) return -100_000;
    if (human === 3 && empty === 1) return -150; // slightly over-weight blocking
    if (human === 2 && empty === 2) return -15;
    return -1;
  }

  return 0;
}

function evaluate(board: CellValue[][], aiPlayer: Player): number {
  const aiPiece: CellValue = aiPlayer === 1 ? 'player1' : 'player2';
  const humanPiece: CellValue = aiPlayer === 1 ? 'player2' : 'player1';

  let score = 0;

  // Centre-column bonus: occupying the centre gives more winning possibilities
  for (let row = 0; row < ROWS; row++) {
    if (board[row][3] === aiPiece) score += 4;
    else if (board[row][3] === humanPiece) score -= 4;
    // Adjacent centre columns
    if (board[row][2] === aiPiece || board[row][4] === aiPiece) score += 2;
    if (board[row][2] === humanPiece || board[row][4] === humanPiece) score -= 2;
  }

  // Horizontal
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col <= COLS - 4; col++) {
      score += scoreWindow(
        [board[row][col], board[row][col + 1], board[row][col + 2], board[row][col + 3]],
        aiPiece,
        humanPiece
      );
    }
  }

  // Vertical
  for (let col = 0; col < COLS; col++) {
    for (let row = 0; row <= ROWS - 4; row++) {
      score += scoreWindow(
        [board[row][col], board[row + 1][col], board[row + 2][col], board[row + 3][col]],
        aiPiece,
        humanPiece
      );
    }
  }

  // Diagonal ↘
  for (let row = 0; row <= ROWS - 4; row++) {
    for (let col = 0; col <= COLS - 4; col++) {
      score += scoreWindow(
        [
          board[row][col],
          board[row + 1][col + 1],
          board[row + 2][col + 2],
          board[row + 3][col + 3],
        ],
        aiPiece,
        humanPiece
      );
    }
  }

  // Diagonal ↙
  for (let row = 0; row <= ROWS - 4; row++) {
    for (let col = 3; col < COLS; col++) {
      score += scoreWindow(
        [
          board[row][col],
          board[row + 1][col - 1],
          board[row + 2][col - 2],
          board[row + 3][col - 3],
        ],
        aiPiece,
        humanPiece
      );
    }
  }

  return score;
}

// ─── Quick terminal checks ───────────────────────────────────────────────────

/**
 * Returns a winning column for `player` if one exists (immediate win), else -1.
 * Used to prioritise obvious moves before running full minimax.
 */
function findImmediateWin(state: GameState, player: Player): number {
  const piece: CellValue = player === 1 ? 'player1' : 'player2';
  for (const col of getValidCols(state.board)) {
    const result = applyAIMove(
      { ...state, currentPlayer: player, usingBlocker: false, phase: 'normal' },
      { col, useBlocker: false }
    );
    if (result?.winner === player) return col;
  }
  return -1;
}

// ─── Minimax with alpha-beta pruning ─────────────────────────────────────────

function minimax(
  state: GameState,
  depth: number,
  alpha: number,
  beta: number,
  aiPlayer: Player
): number {
  const humanPlayer: Player = aiPlayer === 1 ? 2 : 1;

  // Terminal checks
  if (state.winner === aiPlayer) return 90_000 + depth;
  if (state.winner === humanPlayer) return -90_000 - depth;
  if (state.winner === 'draw') return 0;
  if (depth === 0) return evaluate(state.board, aiPlayer);

  const moves = generateMoves(state);
  if (moves.length === 0) {
    // Shouldn't happen if winner checks above are correct, but handle gracefully
    const { winner } = checkWinner(state.board);
    if (winner === aiPlayer) return 90_000 + depth;
    if (winner !== null) return -90_000 - depth;
    if (checkDraw(state.board)) return 0;
    return 0;
  }

  // Order moves: centre columns first → better alpha-beta pruning
  const ordered = [...moves].sort(
    (a, b) => Math.abs(a.col - 3) - Math.abs(b.col - 3)
  );

  const maximising = state.currentPlayer === aiPlayer;

  if (maximising) {
    let best = -Infinity;
    for (const move of ordered) {
      const next = applyAIMove(state, move);
      if (!next) continue;
      best = Math.max(best, minimax(next, depth - 1, alpha, beta, aiPlayer));
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const move of ordered) {
      const next = applyAIMove(state, move);
      if (!next) continue;
      best = Math.min(best, minimax(next, depth - 1, alpha, beta, aiPlayer));
      beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    return best;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Returns the best move for `aiPlayer` given the current state and difficulty.
 *
 * Depths used:
 *   easy   – 70% random, otherwise depth 2
 *   medium – depth 4
 *   hard   – depth 7
 */
export function getBestMove(
  state: GameState,
  difficulty: Difficulty,
  aiPlayer: Player
): AIMove | null {
  const moves = generateMoves(state);
  if (moves.length === 0) return null;

  // ── Easy: mostly random ──────────────────────────────────────────────────
  if (difficulty === 'easy') {
    if (Math.random() < 0.70) {
      // Still take an immediate win if available, otherwise random
      const winCol = findImmediateWin(state, aiPlayer);
      if (winCol !== -1) return { col: winCol, useBlocker: false };
      return moves[Math.floor(Math.random() * moves.length)];
    }
    // Fall through to shallow minimax with depth 2
  }

  const depth = difficulty === 'easy' ? 2 : difficulty === 'medium' ? 4 : 7;

  // ── Immediate win: always take it ───────────────────────────────────────
  if (state.phase !== 'blocker-bonus') {
    const winCol = findImmediateWin(state, aiPlayer);
    if (winCol !== -1) return { col: winCol, useBlocker: false };
  }

  // ── Full minimax ─────────────────────────────────────────────────────────
  const ordered = [...moves].sort(
    (a, b) => Math.abs(a.col - 3) - Math.abs(b.col - 3)
  );

  let bestMove = ordered[0];
  let bestScore = -Infinity;

  for (const move of ordered) {
    const next = applyAIMove(state, move);
    if (!next) continue;
    const score = minimax(next, depth - 1, -Infinity, Infinity, aiPlayer);
    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }

  return bestMove;
}
