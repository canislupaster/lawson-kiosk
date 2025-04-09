import { MineMessageToClient, MineMessageToServer, Player } from "./server";

export const DEATH_LIMIT = 2;

export type BaseMineState = Readonly<{
	size: readonly [number, number],
	nMine: number,
	deaths: number,
	otherDeaths: number
}>;

export type ActiveMineState = Readonly<BaseMineState&{
	board: Readonly<{
		flagged: readonly [boolean, boolean],
		revealed: readonly [boolean, boolean],
		mine: boolean,
		number: number
	}>[][],
	startSquare: readonly [number, number],
	start: number
}>;

export type MineLeaderboard = {
	idx: number, name: string|null
};

export type MineState = (BaseMineState&{status: "notstarted"})|({status:"ongoing"}&ActiveMineState)
	| ({status: "won"|"lost", end: number, why: "death"|"speed", leaderboard: MineLeaderboard|null}&ActiveMineState)|{status: "idle"};

function* neighbors(m: BaseMineState, i: number, j: number): Generator<[number,number]> {
	for (let di=-1; di<=1; di++)
		for (let dj=-1; dj<=1; dj++) {
			if (di==0 && dj==0) continue;
			const ni=i+di, nj=j+dj;
			if (ni>=0 && ni<m.size[0] && nj>=0 && nj<m.size[1])
				yield [ni,nj];
		}
}

function reveal(m: ActiveMineState, idx: 0|1, i: number, j: number): ActiveMineState {
	const dfs: [number,number][] = [];
	if (m.board[i][j].revealed[idx]) {
		for (const [a,b] of neighbors(m,i,j)) {
			if (!m.board[a][b].flagged[idx] && !m.board[a][b].revealed[idx])
				dfs.push([a,b]);
		}
	} else {
		dfs.push([i,j]);
	}

	const newRevealed = new Map<number,Set<number>>();
	const mark = (a: number,b: number)=>{
		const r = newRevealed.get(a);
		if (!r) newRevealed.set(a, new Set([b])); else r.add(b);
	};

	let died=false;
	for (const [a,b] of dfs) {
		mark(a,b);
		if (m.board[a][b].mine) died=true;
	}

	while (dfs.length>0) {
		const [x,y] = dfs[dfs.length-1];
		dfs.pop();

		if (m.board[x][y].number!=0 || m.board[x][y].mine) continue;

		for (const [a,b] of neighbors(m,x,y)) {
			if (!m.board[a][b].revealed[idx] && !newRevealed.get(a)?.has(b)) {
				mark(a,b);
				dfs.push([a,b]);
			}
		}
	}

	return {
		...m,
		...died ? (idx==0 ? {deaths: m.deaths+1} : {otherDeaths: m.otherDeaths+1}) : {},
		board: m.board.map((x,a)=>x.map((y,b)=>({
			...y,
			revealed: (newRevealed.get(a)?.has(b)??false)
				? (y.mine ? [true,true] : y.revealed.with(idx,true) as [boolean,boolean])
				: y.revealed
		})))
	};
}

function flag(m: ActiveMineState, idx:0|1, i: number, j: number): ActiveMineState {
	const sq = m.board[i][j];
	return {
		...m,
		board: m.board.with(i,m.board[i].with(
			j, {...sq, flagged: sq.flagged.with(idx, !sq.flagged[idx]) as [boolean, boolean]}
		))
	};
}

function makeActive(m: BaseMineState, mines: boolean[][], start: readonly [number, number], startTime: number): ActiveMineState {
	const board = mines.map((row,i)=>row.map((cell,j)=>({
		mine: cell,
		flagged: [false,false],
		revealed: [false,false],
		number: neighbors(m,i,j).reduce((s,[a,b])=>s+(mines[a][b] ? 1 : 0), 0)
	}))) satisfies ActiveMineState["board"];

	let state: ActiveMineState = {...m, board, startSquare: start, start: startTime};
	state=reveal(state, 0, start[0], start[1]);
	state=reveal(state, 1, start[0], start[1]);

	return state;
}

export function countMineState(m: ActiveMineState, idx: 0|1, which: "flag"|"reveal") {
	return m.board.flat()
		.reduce((sum,cell)=> sum + (
			(which=="flag"
				? (cell.flagged[idx] || (cell.revealed[idx] && cell.mine))
				: (cell.revealed[idx] && !cell.mine)
			) ? 1 : 0
		),0);
}

export function mineStateCellDifference(m: ActiveMineState, i: number, j: number) {
	let d = m.board[i][j].number;
	let unknown=false;
	for (const [a,b] of neighbors(m,i,j)) {
		if (m.board[a][b].flagged[0] || (m.board[a][b].revealed[0] && m.board[a][b].mine))
			d--;
		else if (!m.board[a][b].revealed[0]) unknown=true;
	}
	return unknown ? d : null;
}

function checkEnd(state: ActiveMineState, end: number): MineState {
	const stateWithLeader = {...state, leaderboard: null};
	if (state.otherDeaths>=DEATH_LIMIT) return {
		...stateWithLeader, end, status: "won", why: "death"
	};
	if (state.deaths>=DEATH_LIMIT) return {
		...stateWithLeader, end, status: "lost", why: "death"
	};
	if (countMineState(state, 0, "reveal")==state.size[0]*state.size[1]-state.nMine) return {
		...stateWithLeader, end, status: "won", why: "speed"
	};
	if (countMineState(state, 1, "reveal")==state.size[0]*state.size[1]-state.nMine) return {
		...stateWithLeader, end, status: "lost", why: "speed"
	};
	return {...state, status: "ongoing"};
}

export function reduceMineState(state: MineState, msg: MineMessageToClient, player: Player,
	send: (x: MineMessageToServer)=>void): MineState {

	if (state.status=="idle") {
		if (msg.type=="gameRequest") return {
			...msg, status: "notstarted",
			deaths: 0, otherDeaths: 0
		};
	} else if (state.status=="notstarted") {
		if (msg.type=="gameStart") return {
			...makeActive(state, msg.game.board, msg.game.startSquare, msg.game.startTime),
			status: "ongoing",
		};
	} else if (state.status=="ongoing") {
		if (msg.type=="playerReveal") {
			const newState=checkEnd(reveal(state, msg.player==player ? 0 : 1, msg.square[0], msg.square[1]), msg.time);
			if (newState.status=="won" && newState.why=="speed") send({type: "addTime"});
			return newState;
		} else if (msg.type=="playerFlag") {
			return {...flag(state, msg.player==player ? 0 : 1, msg.square[0], msg.square[1]), status: "ongoing"};
		}
	} else {
		if (msg.type=="timeAdded") {
			return {...state, leaderboard: {idx: msg.idx, name: null}};
		} else if (msg.type=="timeNameSet" && state.leaderboard) {
			return {...state, leaderboard: {...state.leaderboard, name: msg.name}};
		}
	}

	return state;
}
