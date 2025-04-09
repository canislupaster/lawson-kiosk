export type Game = {
	size: readonly [number, number],
	board: boolean[][],
	startSquare: readonly [number, number],
	startTime: number
};

export type Player = "one"|"two";

export type TimeRecord = {
	name: string|null, seconds: number,
	size: readonly [number, number, number]
};

export type WikiPage = {
	name: string,
	distance: number,
	content: string,
	sections: {
		toclevel: number,
		line: string,
		anchor: string
	}[]
};

export type WikiGameType = {
	timeLimit?: number,
	timeInterval?: number,
	onlyCloser: boolean,
	minDistance?: number
};

export type WikiMessageToClient = {
	type: "playerChange",
	player: Player,
	name: string,
	back: boolean,
	distance: number|null,
	time: number
} | {
	type: "pageContent",
	page: WikiPage|null,
	hash: string|null
} | {
	type: "gameStart",
	startTime: number
} | {
	type: "setStartEnd",
	start: WikiPage,
	end: WikiPage,
	path: WikiPage[],
	game: WikiGameType
} | ({
	type: "stopped",
}&({
	why: "timeout"
}|{
	why: "player",
	player: Player,
	time: number
})) | {
	type: "loadingStartEnd"
} | {
	type: "loadingPage"
} | {
	type: "timeInterval",
	time: number
} | {
	type: "loadingStopped"
};

export type WikiMessageToServer = {
	type: "requestStartEnd",
	game: WikiGameType
} | {
	type: "startGame"
} | {
	type: "goto",
	name: string,
	back: boolean,
	hash: string|null
} | {
	type: "stop"
} | {
	type: "stopLoading"
};

export type MineMessageToClient = {
	type: "gameStart",
	game: Game
} | {
	type: "gameRequest",
	size: readonly [number, number],
	nMine: number
} | {
	type: "playerReveal"|"playerFlag",
	player: Player,
	time: number,
	square: readonly [number, number]
} | {
	type: "loadTimes",
	times: TimeRecord[],
	npage: number,
	offset: number
} | {
	type: "timeAdded",
	idx: number
} | {
	type: "timeNameSet",
	name: string
};

export type MineMessageToServer = ({
	square: readonly [number, number],
}&(
	{type: "flag"}|{ type: "reveal", start: boolean }
)) | {
	type: "startGame",
	size: readonly [number, number],
	nMine: number
} | {
	type: "getTimes",
	size: readonly [number, number, number]|null,
	page: number
} | {
	type: "setTimeName",
	name: string
} | {
	type: "addTime"
};

export type MessageToClient = {
	type: "mine", msg: MineMessageToClient
} | {
	type: "wiki", msg: WikiMessageToClient
} | {
	type: "reset"
} | {
	type: "displayMessage",
	message: string|null
} | {
	type: "error",
	message?: string
} | {
	type: "needToken"
} | {
	type: "connected", player: Player
} | {
	type: "gameEnd",
};

export type MessageToServer = {
	type: "connect",
	player: Player,
	token: string|null
} | {
	type: "wiki", msg: WikiMessageToServer
}| {
	type: "mine",
	msg: MineMessageToServer
} | {
	type: "closeGame"
};