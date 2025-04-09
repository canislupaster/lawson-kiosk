import { Player, WikiGameType, WikiMessageToClient, WikiPage } from "./server";

type WikiPlayerState = Readonly<{
	stack: readonly string[],
	pages: readonly string[],
	distance: number|null,
	movedInInterval: boolean
}>;

type CurrentPage = {
	type: "ok",
	page: WikiPage,
	hash: string|null
} | {
	type: "bad"
};

export type ActiveWikiState = Readonly<{
	playerState: readonly [WikiPlayerState, WikiPlayerState],
	current: CurrentPage | {
		type: "loading"
		old: CurrentPage
	},
	startTime: number,
	intervalStart: number,
}>;

export type BaseWikiState = {
	game: WikiGameType,
	start: WikiPage, end: WikiPage,
	path: WikiPage[]
};

export type WikiState = Readonly<{status: "idle"}|{status: "loading"}|(BaseWikiState&(
	{
		status: "ready",
	} | (ActiveWikiState&({
		status: "ongoing"
	} | {
		status: "end", won: boolean|null, why: "time"|"died"|"target"|"noMove", endTime: number
	} | {
		status: "end", won: null, endTime: number, why: "player", you: boolean
	}))
))>;

export function reduceWikiState(state: WikiState, msg: WikiMessageToClient, who: Player): WikiState {
	if (msg.type=="setStartEnd") {
		return {
			...msg,
			status: "ready"
		};
	} else if (msg.type=="loadingStartEnd") {
		return {status: "loading"};
	} else if (msg.type=="gameStart" && state.status=="ready") {
		const basePlayerState: WikiPlayerState = {
			pages: [state.start.name],
			stack: [state.start.name],
			distance: state.start.distance,
			movedInInterval: false
		};

		return {
			...state,
			status: "ongoing",
			playerState: [basePlayerState, basePlayerState],
			current: {type: "ok", page: state.start, hash: null},
			startTime: msg.startTime,
			intervalStart: msg.startTime
		};
	} else if (msg.type=="loadingPage" && (state.status=="ongoing" || state.status=="end") && state.current.type!="loading") {
		return {
			...state, current: {type: "loading", old: state.current}
		};
	} else if (msg.type=="pageContent" && (state.status=="ongoing" || state.status=="end")) {
		return {
			...state,
			current: msg.page!=null ? {type: "ok", page: msg.page, hash: msg.hash} : {type: "bad"},
		};
	} else if (state.status=="ongoing" && msg.type=="playerChange") {
		const i = msg.player==who ? 0 : 1;

		const pdist = state.playerState[i].distance??0;

		const ps = {
			pages: [...state.playerState[i].pages, msg.name],
			stack: [...state.playerState[i].stack],
			distance: msg.distance,
			movedInInterval: !state.playerState[i].pages.includes(msg.name)
		};

		if (msg.back) ps.stack.pop();
		else ps.stack.push(msg.name);

		const nstate = {...state,
			playerState: state.playerState.with(i, ps) as [WikiPlayerState, WikiPlayerState],
		} satisfies typeof state;

		if (ps.pages[ps.pages.length-1]==state.end.name) {
			return {...nstate, status: "end", won: i==0, why: "target", endTime: msg.time};
		} else if (state.game.onlyCloser && msg.distance && msg.distance > pdist) {
			return {...nstate, status: "end", won: i==1, why: "died", endTime: msg.time};
		}

		return nstate;
	} else if (msg.type=="stopped" && state.status=="ongoing") {
		if (msg.why=="timeout" && state.game.timeLimit!=undefined) {
			const endTime = state.startTime + state.game.timeLimit*1000;
			const tie = state.playerState[0].distance==state.playerState[1].distance;
			const won = state.playerState[0].distance!=null
				&& (state.playerState[1].distance==null || state.playerState[0].distance<state.playerState[1].distance);

			return {
				...state, status: "end", won: tie ? null : won, why: "time", endTime
			};
		} else if (msg.why=="player") {
			return {
				...state, status: "end", won: null, why: "player",
				you: msg.player==who, endTime: msg.time
			};
		}
	} else if (msg.type=="timeInterval" && state.status=="ongoing") {
		if (!state.playerState.some(x=>x.movedInInterval)) {
			return {...state, status: "end", won: null, why: "noMove", endTime: msg.time};
		}

		const i = state.playerState.findIndex(x=>!x.movedInInterval);
		if (i!=-1) {
			return {...state, status: "end", won: i==1, why: "noMove", endTime: msg.time};
		}

		return {
			...state,
			playerState: state.playerState.map(x=>({...x, movedInInterval: false})) as [WikiPlayerState, WikiPlayerState],
			intervalStart: msg.time
		};
	} else if (msg.type=="loadingStopped" && (state.status=="ongoing" || state.status=="end") && state.current.type=="loading") {
		return {...state, current: state.current.old};
	}

	return state;
}
