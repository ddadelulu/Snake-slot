// Book event types for CONSTRICTOR (docs/SPEC.md §11). Keep in sync with
// math/games/constrictor/schema/book.schema.json.

export type Cell = [reel: number, row: number];
export type RegSymbol = 'H1' | 'H2' | 'H3' | 'H4' | 'L1' | 'L2' | 'L3' | 'L4';
export type PearlCode = 'P1' | 'P2' | 'P3' | 'P5' | 'P10' | 'P25';
export type SymbolCode = RegSymbol | 'KEY' | 'EGG' | PearlCode;
export type BoardColumn = (SymbolCode | null)[];
export type GameType = 'basegame' | 'freegame';

type Base<T extends string> = { index: number; type: T };

export type BookEventReveal = Base<'reveal'> & { board: BoardColumn[]; gameType: GameType; keys: Cell[] };
export type BookEventHatch = Base<'hatch'> & { at: Cell };
export type BookEventEnterBonus = Base<'enterBonus'> & { reason: 'hunt' | 'venom' };
export type BookEventFreeSpinTrigger = Base<'freeSpinTrigger'> & {
	totalFs: number;
	keys: number;
	positions: Cell[];
};
export type BookEventSnakeEnter = Base<'snakeEnter'> & {
	body: Cell[];
	edge: 'left' | 'right' | 'top' | 'bottom';
	mult: number;
};
export type BookEventUpdateFreeSpin = Base<'updateFreeSpin'> & { amount: number; total: number };
export type SnakeStep = {
	from: Cell;
	to: Cell;
	eat: SymbolCode | null;
	len: number;
	mult: number;
	grow?: true;
	bite?: true;
};
export type BookEventSnakeMoves = Base<'snakeMoves'> & { moves: number; steps: SnakeStep[] };
export type BookEventOuroboros = Base<'ouroboros'> & {
	ring: Cell[];
	enclosed: Cell[];
	crushed: (SymbolCode | 'EMPTY')[];
	symbol: RegSymbol;
	multFrom: number;
	mult: number;
};
export type BookEventSnakeWild = Base<'snakeWild'> & { cells: Cell[]; mult: number };
export type ClusterWin = {
	symbol: RegSymbol;
	clusterSize: number;
	win: number;
	positions: Cell[];
	meta: { globalMult: number; winWithoutMult: number; wildCount: number; overlay: Cell };
};
export type BookEventWinInfo = Base<'winInfo'> & { totalWin: number; wins: ClusterWin[] };
export type BookEventSetWin = Base<'setWin'> & { amount: number; winLevel: number };
export type BookEventSetTotalWin = Base<'setTotalWin'> & { amount: number };
export type BookEventWincap = Base<'wincap'> & { amount: number; uncappedAmount: number };
export type BookEventFreeSpinRetrigger = Base<'freeSpinRetrigger'> & {
	totalFs: number;
	added: number;
	keys: number;
	positions: Cell[];
};
export type BookEventSnakeExit = Base<'snakeExit'>;
export type BookEventFreeSpinEnd = Base<'freeSpinEnd'> & { amount: number; winLevel: number };
export type BookEventFinalWin = Base<'finalWin'> & { amount: number };

export type BookEvent =
	| BookEventReveal
	| BookEventHatch
	| BookEventEnterBonus
	| BookEventFreeSpinTrigger
	| BookEventSnakeEnter
	| BookEventUpdateFreeSpin
	| BookEventSnakeMoves
	| BookEventOuroboros
	| BookEventSnakeWild
	| BookEventWinInfo
	| BookEventSetWin
	| BookEventSetTotalWin
	| BookEventWincap
	| BookEventFreeSpinRetrigger
	| BookEventSnakeExit
	| BookEventFreeSpinEnd
	| BookEventFinalWin;

export type BookEventOfType<T extends BookEvent['type']> = Extract<BookEvent, { type: T }>;

export type Book = { id: number; payoutMultiplier: number; events: BookEvent[]; criteria?: string };

export const REG_SYMBOLS: RegSymbol[] = ['H1', 'H2', 'H3', 'H4', 'L1', 'L2', 'L3', 'L4'];
export const PEARL_VALUE: Record<PearlCode, number> = { P1: 1, P2: 2, P3: 3, P5: 5, P10: 10, P25: 25 };
export const isPearl = (s: string | null | undefined): s is PearlCode => !!s && s[0] === 'P';
export const cellKey = (c: Cell) => c[0] * 7 + c[1];
export const sameCell = (a: Cell, b: Cell) => a[0] === b[0] && a[1] === b[1];

/** Presentation win tiers (× base bet), SPEC §13. */
export const WIN_TIERS = [
	{ level: 1, min: 15, key: 'tier.strike' },
	{ level: 2, min: 50, key: 'tier.constrict' },
	{ level: 3, min: 150, key: 'tier.devour' },
	{ level: 4, min: 500, key: 'tier.apex' },
	{ level: 5, min: 25000, key: 'tier.vaultEmpty' },
] as const;
