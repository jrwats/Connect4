import { useState, useEffect, useCallback, useRef } from 'react';
import { GameState, Player, Difficulty, CellValue, COLS, ROWS } from './types/game';
import { createInitialState, applyMove, getLowestEmptyRow } from './lib/gameLogic';
import { getBestMove, applyAIMove } from './lib/ai';
import './App.css';

const AI_PLAYER: Player = 2;
const HUMAN_PLAYER: Player = 1;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cellClass(cell: CellValue, winning: boolean, colHovered: boolean): string {
  const classes = ['cell'];
  if (cell !== 'empty') classes.push(`piece-${cell}`);
  if (winning) classes.push('winning');
  if (colHovered && cell === 'empty') classes.push('col-hover');
  return classes.join(' ');
}

function previewClass(piece: CellValue | null, visible: boolean): string {
  const classes = ['preview-cell'];
  if (visible && piece) classes.push(`piece-${piece}`);
  else classes.push('piece-empty');
  return classes.join(' ');
}

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [state, setState] = useState<GameState>(createInitialState);
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [hoverCol, setHoverCol] = useState<number | null>(null);
  const [isThinking, setIsThinking] = useState(false);
  const thinkingRef = useRef(false);
  const boardRef = useRef<HTMLDivElement>(null);

  // ── AI turn ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (state.currentPlayer !== AI_PLAYER || state.winner) return;
    if (thinkingRef.current) return;

    thinkingRef.current = true;
    setIsThinking(true);

    // Slightly longer delay for the bonus move so the blocker is visible first
    const delay = state.phase === 'blocker-bonus' ? 500 : 300;

    const id = setTimeout(() => {
      setState((prev) => {
        // Re-check: state might have changed while we were waiting
        if (prev.currentPlayer !== AI_PLAYER || prev.winner) {
          thinkingRef.current = false;
          setIsThinking(false);
          return prev;
        }
        const move = getBestMove(prev, difficulty, AI_PLAYER);
        const next = move ? applyAIMove(prev, move) : null;
        thinkingRef.current = false;
        setIsThinking(false);
        return next ?? prev;
      });
    }, delay);

    return () => {
      clearTimeout(id);
      thinkingRef.current = false;
      setIsThinking(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.currentPlayer, state.phase, state.winner, difficulty]);

  // ── Human move ─────────────────────────────────────────────────────────────
  const handleColClick = useCallback(
    (col: number) => {
      if (state.currentPlayer !== HUMAN_PLAYER) return;
      if (state.winner || isThinking) return;
      const next = applyMove(state, col);
      if (next) setState(next);
    },
    [state, isThinking]
  );

  const toggleBlocker = useCallback(() => {
    if (
      state.currentPlayer !== HUMAN_PLAYER ||
      state.winner ||
      state.phase !== 'normal' ||
      state.blockersRemaining[HUMAN_PLAYER] <= 0 ||
      isThinking
    )
      return;
    setState((s) => ({ ...s, usingBlocker: !s.usingBlocker }));
  }, [state, isThinking]);

  // Maps a Touch point to a column index using the board element's bounds.
  const colFromTouch = useCallback((t: React.Touch): number | null => {
    if (!boardRef.current) return null;
    const r = boardRef.current.getBoundingClientRect();
    const x = t.clientX - r.left - 8; // subtract 8px board padding
    const innerW = r.width - 16;       // subtract padding on both sides
    if (x < 0 || x > innerW) return null;
    return Math.min(COLS - 1, Math.floor((x * COLS) / innerW));
  }, []);

  const resetGame = useCallback(() => {
    thinkingRef.current = false;
    setIsThinking(false);
    setState(createInitialState());
  }, []);

  // ── Derived UI state ───────────────────────────────────────────────────────
  const isHumanTurn = state.currentPlayer === HUMAN_PLAYER && !state.winner;

  /** The piece that would appear if the human clicked right now */
  const humanDroppingPiece: CellValue | null = isHumanTurn
    ? state.phase === 'blocker-bonus'
      ? 'player1'
      : state.usingBlocker
      ? 'blocker1'
      : 'player1'
    : null;

  function isWinCell(row: number, col: number) {
    return state.winningCells?.some(([r, c]) => r === row && c === col) ?? false;
  }

  function statusMessage(): string {
    if (state.winner === 'draw') return "It's a draw!";
    if (state.winner === HUMAN_PLAYER) return 'You win! 🎉';
    if (state.winner === AI_PLAYER) return `AI wins!`;
    if (state.phase === 'blocker-bonus') {
      return state.currentPlayer === HUMAN_PLAYER
        ? 'Blocker placed — now drop your free piece!'
        : 'AI is placing its free piece…';
    }
    if (state.usingBlocker) return 'Click a column to place your blue blocker';
    if (isThinking) return 'AI is thinking…';
    return 'Your turn';
  }

  const gameActive =
    !state.winner &&
    state.board.some((row) => row.some((c) => c !== 'empty'));

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="app">
      <h1 className="title">Connect 4</h1>

      {/* Controls */}
      <div className="top-controls">
        <div className="difficulty-group">
          <span className="label">Difficulty:</span>
          {(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => (
            <button
              key={d}
              className={`diff-btn ${difficulty === d ? 'active' : ''}`}
              onClick={() => {
                setDifficulty(d);
                if (state.winner || !gameActive) resetGame();
              }}
            >
              {d[0].toUpperCase() + d.slice(1)}
            </button>
          ))}
        </div>
        <button className="new-game-btn" onClick={resetGame}>
          New Game
        </button>
      </div>

      {/* Player panels */}
      <div className="player-row">
        <PlayerPanel
          label="You"
          pieceClass="piece-player1"
          blockersRemaining={state.blockersRemaining[HUMAN_PLAYER]}
          active={isHumanTurn}
        />
        <div className="vs">vs</div>
        <PlayerPanel
          label={`AI (${difficulty})`}
          pieceClass="piece-player2"
          blockersRemaining={state.blockersRemaining[AI_PLAYER]}
          active={state.currentPlayer === AI_PLAYER && !state.winner}
          flip
        />
      </div>

      {/* Status */}
      <div className={`status ${state.winner ? 'status-over' : ''}`}>
        {statusMessage()}
      </div>

      {/* Board */}
      <div
        className="board-wrap"
        onMouseLeave={() => setHoverCol(null)}
        onTouchStart={e => setHoverCol(colFromTouch(e.touches[0]))}
        onTouchMove={e => setHoverCol(colFromTouch(e.touches[0]))}
        onTouchEnd={() => setHoverCol(null)}
      >
        {/* Per-column interactive strips */}
        <div className="col-strips">
          {Array.from({ length: COLS }, (_, col) => (
            <div
              key={col}
              className="col-strip"
              onMouseEnter={() => setHoverCol(col)}
              onClick={() => handleColClick(col)}
            />
          ))}
        </div>

        {/* Drop-preview row */}
        <div className="preview-row">
          {Array.from({ length: COLS }, (_, col) => {
            const active = hoverCol === col && isHumanTurn;
            return (
              <div
                key={col}
                className={previewClass(humanDroppingPiece, active)}
              />
            );
          })}
        </div>

        {/* Board frame + cells */}
        <div className="board" ref={boardRef}>
          {Array.from({ length: ROWS }, (_, row) =>
            Array.from({ length: COLS }, (_, col) => {
              const cell = state.board[row][col];
              const hovered =
                hoverCol === col &&
                isHumanTurn &&
                row === getLowestEmptyRow(state.board, col);
              return (
                <div
                  key={`${row}-${col}`}
                  className={cellClass(cell, isWinCell(row, col), hovered)}
                />
              );
            })
          )}
        </div>
      </div>

      {/* Blocker controls */}
      {isHumanTurn && state.phase === 'normal' && (
        <div className="blocker-zone">
          <button
            className={`blocker-btn ${state.usingBlocker ? 'active' : ''}`}
            onClick={toggleBlocker}
            disabled={state.blockersRemaining[HUMAN_PLAYER] === 0}
            title={
              state.blockersRemaining[HUMAN_PLAYER] === 0
                ? 'No blockers remaining'
                : 'Place a blocker to get a free follow-up piece'
            }
          >
            <span className="blocker-dot" />
            {state.usingBlocker
              ? 'Cancel blocker'
              : `Use blocker (${state.blockersRemaining[HUMAN_PLAYER]} left)`}
          </button>
          {state.usingBlocker && (
            <p className="blocker-hint">
              Your blue blocker occupies a cell but doesn&apos;t count for
              4-in-a-row.&nbsp;After placing it you get one free coloured piece!
            </p>
          )}
        </div>
      )}

      {/* Blocker legend */}
      <div className="legend">
        <span className="legend-item">
          <span className="legend-dot piece-player1" /> You (red)
        </span>
        <span className="legend-item">
          <span className="legend-dot piece-player2" /> AI (yellow)
        </span>
        <span className="legend-item">
          <span className="legend-dot piece-blocker1" /> Blocker
        </span>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface PlayerPanelProps {
  label: string;
  pieceClass: string;
  blockersRemaining: number;
  active: boolean;
  flip?: boolean;
}

function PlayerPanel({ label, pieceClass, blockersRemaining, active, flip }: PlayerPanelProps) {
  const dots = Array.from({ length: 2 }, (_, i) => (
    <span
      key={i}
      className={`blocker-pip ${i < blockersRemaining ? 'available' : 'used'}`}
    />
  ));

  return (
    <div className={`player-panel ${active ? 'active' : ''}`}>
      {flip ? (
        <>
          <div className="blocker-pips">{dots}</div>
          <span className="player-label">{label}</span>
          <div className={`player-disc ${pieceClass}`} />
        </>
      ) : (
        <>
          <div className={`player-disc ${pieceClass}`} />
          <span className="player-label">{label}</span>
          <div className="blocker-pips">{dots}</div>
        </>
      )}
    </div>
  );
}
