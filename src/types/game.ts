export const ROWS = 6;
export const COLS = 7;

/** What can live in a board cell */
export type CellValue =
  | 'empty'
  | 'player1'   // human – red
  | 'player2'   // AI    – yellow
  | 'blocker1'  // human's blue blocker
  | 'blocker2'; // AI's   blue blocker

export type Player = 1 | 2;

export type Difficulty = 'easy' | 'medium' | 'hard';

/**
 * 'normal'       – regular turn (place coloured piece, or activate blocker)
 * 'blocker-bonus'– same player just placed a blocker; now places one free coloured piece
 */
export type GamePhase = 'normal' | 'blocker-bonus';

export interface GameState {
  board: CellValue[][];
  currentPlayer: Player;
  phase: GamePhase;
  /** How many blocker pieces each player still has available */
  blockersRemaining: { 1: number; 2: number };
  winner: Player | 'draw' | null;
  /** Coordinates of the four winning cells (for highlight) */
  winningCells: [number, number][] | null;
  /** UI flag: human has clicked "Use Blocker" and is about to drop one */
  usingBlocker: boolean;
}
