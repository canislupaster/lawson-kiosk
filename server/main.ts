import {createHash} from "node:crypto";
import { Hono } from "hono";
import { serveStatic, upgradeWebSocket } from "hono/deno";
import { createMiddleware } from "hono/factory";
import { z } from "zod";
import {MessageToServer, MessageToClient, Player, MineMessageToServer, WikiMessageToServer, WikiPage, WikiGameType} from "../src/server.d.ts";
import { addTime, getTimeIdx, getTimes, setTimeName } from "./db.ts";
import { Buffer } from "node:buffer";
import process from "node:process";

const MineMessageToServerZod = z.union([
  z.object({
    square: z.tuple([z.number(), z.number()]),
  }).and(z.object({
		type: z.literal("flag")
	}).or(z.object({
		type: z.literal("reveal"),
		start: z.boolean()
	}))),
  z.object({
    type: z.literal("startGame"),
    size: z.tuple([z.number(), z.number()]),
    nMine: z.number(),
  }),
	z.object({
		type: z.literal("getTimes"),
		size: z.tuple([z.number(), z.number(), z.number()]).nullable(),
		page: z.number(),
	}),
	z.object({
		type: z.literal("setTimeName"),
		name: z.string(),
	}),
	z.object({
		type: z.literal("addTime")
	})
]) satisfies z.ZodType<MineMessageToServer>;

const WikiMessageToServerZod = z.union([
  z.object({
    type: z.literal("requestStartEnd"),
    game: z.object({
			timeLimit: z.number().optional(),
			timeInterval: z.number().optional(),
			onlyCloser: z.boolean(),
			minDistance: z.number().optional()
		})
  }),
  z.object({
    type: z.literal("startGame")
  }),
  z.object({
    type: z.literal("goto"),
    name: z.string(),
    back: z.boolean(),
    hash: z.string().nullable()
  }),
	z.object({
		type: z.literal("stop")
	}),
	z.object({
		type: z.literal("stopLoading")
	})
]) satisfies z.ZodType<WikiMessageToServer>;

export const MessageToServerZod = z.union([
  z.object({
    type: z.literal("connect"),
    player: z.literal("one").or(z.literal("two")),
    token: z.string().nullable()
  }),
  z.object({
    type: z.literal("closeGame"),
  }),
	z.object({
		type: z.literal("mine"),
		msg: MineMessageToServerZod
	}),
	z.object({
		type: z.literal("wiki"),
		msg: WikiMessageToServerZod
	})
]) satisfies z.ZodType<MessageToServer>;

class AppError extends Error {
	constructor(public msg: string) {super(msg);}
}

const app = new Hono();

type Socket = (x: MessageToClient)=>void;
const sockets = new Map<Player, Socket>();

const GAME_INACTIVITY = 10*60*1000;

let promise: Promise<void>|null=null;
function addQueue(f: ()=>Promise<void>) {
	const newPromise = (promise ?? Promise.resolve()).then(() => 
		f().catch(e=>{
			console.error("error in queue (shouldn't happen...)", e);
		}).then(()=>{
			if (promise==newPromise) promise=null;
		})
	);

	promise=newPromise;
}

let gameInactivity: number|null=null;
let gameState: {
	type: "mine",
	size: readonly [number, number],
	startSquare: readonly [number, number]|null,
	board: boolean[][]|null,
	nMine: number,
	start: number,
	playerTimes: Map<Player, {sec: number, id: number}>
}|{
	type: "wiki",
	// startPage: WikiPage,
	// endPage: WikiPage,
	start: number,
	end: number,
	playerWentTo: Map<Player,string>,
	game: WikiGameType
}|null = null;

function endGame() {
	const g = gameState;
	if (g) addQueue(async ()=>{
		if (gameState!=g) return;
		setGame(null);
	});
}

function refreshGame() {
	if (gameInactivity) clearTimeout(gameInactivity);

	gameInactivity=setTimeout(()=>{
		endGame();
	},GAME_INACTIVITY)
}

function setGame(newGame: typeof gameState) {
	if (gameState!=null) {
		sockets.forEach(x=>x({type: "gameEnd"}));
	}

	gameState=newGame;
	if (newGame!=null) refreshGame();
}

const decoder = new TextDecoder();

async function handleMine(player: Player, msg: MineMessageToServer) {
	if (msg.type=="startGame") {
		if (sockets.size<2) throw new AppError("other kiosk is not connected!");
		if (gameState!=null) sockets.forEach(x=>x({type: "gameEnd"}));

		setGame({
			type: "mine",
			size: msg.size, startSquare: null,
			board: null, nMine: msg.nMine,
			playerTimes: new Map(),
			start: Date.now()
		});

		sockets.forEach(x=>x({type: "mine", msg:{type: "gameRequest", size: msg.size, nMine: msg.nMine}}));

		return;
	} else if (msg.type=="getTimes") {
		sockets.get(player)?.({
			type: "mine",
			msg: {
				...await getTimes(msg.size, msg.page),
				type: "loadTimes"
			}
		});

		return;
	}

	const state = gameState;
	if (state?.type!="mine") throw new AppError("no active game");

	switch (msg.type) {
		case "flag":
		case "reveal": {
			if (msg.type=="reveal" && state.startSquare==null && msg.start) {
				const res = await new Deno.Command("cpp/build/main", {
					args: [state.size[0], state.size[1], state.nMine, msg.square[0], msg.square[1]]
						.map(x=>x.toString())
				}).output();

				if (!res.success) throw new AppError("invalid board parameters");

				const mines = new Set(decoder.decode(res.stdout).trim().split("\n"));

				state.startSquare=msg.square;
				state.board=[...Array(state.size[0])]
					.map((_,i)=>[...new Array(state.size[1])].map((_,j) => mines.has(`${i},${j}`)))

				const startTime = Date.now();
				sockets.forEach(x=>x({type: "mine", msg: {type: "gameStart", game: {
					size: state.size,
					startSquare: msg.square,
					board: state.board!,
					startTime
				}}}));
			} else if (state.board!=null && (msg.type=="flag" || !msg.start)) {
				const time = Date.now();

				sockets.forEach(x=>x({
					type: "mine", msg: {
						type: msg.type=="reveal" ? "playerReveal" : "playerFlag",
						player,
						time,
						square: msg.square
					}
				}));
			}

			break;
		}
		case "addTime": {
			if (state.playerTimes.has(player))
				throw new AppError("invalid state");

			const sec = (Date.now()-state.start)/1000;

			const sz = [...state.size, state.nMine] satisfies [number,number,number];
			const id = await addTime({name: null, seconds: sec, size: sz});
			const idx = await getTimeIdx(sec, sz);
			state.playerTimes.set(player, {sec, id})

			sockets.get(player)?.({type: "mine", msg: {type: "timeAdded", idx}});

			break;
		}
		case "setTimeName": {
			const x = state.playerTimes.get(player);
			if (!x) throw new AppError("invalid state");

			msg.name = msg.name.trim();
			if (msg.name.length==0 || msg.name.length>15) {
				throw new AppError("Name must be between 1 and 15 characters");
			}

			await setTimeName(x.id, msg.name);
			sockets.get(player)?.({type: "mine", msg: {type: "timeNameSet", name: msg.name}});

			break;
		}
	}
}

const WikiParseResponse = z.object({
	parse: z.object({
		title: z.string(),
		pageid: z.number(),
		text: z.string(),
		sections: z.array(z.object({
			toclevel: z.number(),
			anchor: z.string(),
			line: z.string()
		}))
	})
}).or(z.object({
	error: z.object({
		code: z.string(),
		info: z.string().optional()
	})
}));

async function getDistance(from: number, to: number): Promise<number[]|null> {
	const res = await new Deno.Command("build/wiki", {
		args: ["distance", from, to]
			.map(x=>x.toString()),
		cwd: "cpp"
	}).output();

	if (!res.success) return null;

	return decoder.decode(res.stdout).trim().split("\n").slice(1).map(x=>Number.parseInt(x));
}

const toWikiPage = (x: Extract<z.infer<typeof WikiParseResponse>,{parse: object}>, d: number): WikiPage => ({
	name: x.parse.title, distance: d, content: x.parse.text, sections: x.parse.sections
});

async function getWiki(opt: {pageid: number}|{name: string}): Promise<Extract<z.infer<typeof WikiParseResponse>,{parse: object}>|null> {
	const params = new URLSearchParams({
		action: "parse",
		format: "json",
		formatversion: "2",
		useskin: "vector-2022",
		redirects: "1",
		mobileformat: "1",
		sections: "1"
	});

	if ("pageid" in opt) params.set("pageid", opt.pageid.toString());
	else params.set("page", opt.name);

	const resp = WikiParseResponse.parse(await (await fetch(`https://en.wikipedia.org/w/api.php?${params.toString()}`)).json());

	if ("error" in resp) {
		if (["nosuchpageid", "missingtitle", "pagecannotexist"].includes(resp.error.code))
			return null;
		throw new AppError(resp.error.info ?? "Wikipedia API error");
	}

	resp.parse.text = resp.parse.text.replaceAll(/@media\s*\(prefers-color-scheme:\s*dark\)/g, "@media not all");
	return resp;
}

function dispatch(player: Player, f: ()=>Promise<void>) {
	f().catch((e)=>{
		sockets.get(player)?.({type: "error", message: e instanceof AppError ? e.msg : undefined});
		console.log("error", e);
	});
}

async function handleWiki(player: Player, msg: WikiMessageToServer) {
	if (msg.type=="requestStartEnd") {
		sockets.forEach(x=>x({
			type: "wiki",
			msg: { type: "loadingStartEnd" }
		}));

		const res = await new Deno.Command("build/wiki", {
			args: ["select", (msg.game.minDistance ?? 0).toString()],
			cwd: "cpp"
		}).output();

		if (!res.success)
			throw new AppError("Failed to find starting/ending articles");

		const [, start, end] = decoder.decode(res.stdout).split("\n").map(x=>Number.parseInt(x));
		const startPage = await getWiki({pageid: start});
		const endPage = await getWiki({pageid: end});

		if (startPage==null || endPage==null)
			throw new AppError("Start/end articles longer exist");

		const path = await getDistance(startPage.parse.pageid, endPage.parse.pageid);
		if (path==null) throw new AppError("Couldn't process path");

		const pages = await Promise.all(path.slice(1,-1).map(async x=>{
			const res = await getWiki({pageid: x});
			if (res==null) throw new AppError("Articles on path no longer exist");
			return res;
		}));
		
		setGame({
			type: "wiki",
			start,end,
			game: msg.game,
			playerWentTo: new Map()
		});

		sockets.forEach(x=>x({
			type: "wiki",
			msg: {
				type: "setStartEnd",
				start: toWikiPage(startPage, path.length-1),
				end: toWikiPage(endPage, 0),
				game: msg.game,
				path: pages.map((x,i)=>toWikiPage(x,path.length-2-i))
			}
		}));

		return;
	}

	const state = gameState;
	if (state?.type!="wiki") throw new AppError("Invalid state");

	if (msg.type=="startGame") {
		const startTime = Date.now();
		sockets.forEach(x=>x({type: "wiki", msg: {
			type: "gameStart",
			startTime
		}}));

		if (state.game.timeLimit!=undefined) {
			setTimeout(()=>{
				addQueue(async ()=>{
					if (gameState==state) {
						sockets.forEach(x=>x({
							type: "wiki", msg: { type: "stopped", why: "timeout" }
						}));
					}
				});
			}, state.game.timeLimit*1000);
		}

		if (state.game.timeInterval!=undefined) {
			const interval = setInterval(()=>{
				addQueue(async ()=>{
					if (gameState==state) {
						const time = Date.now();
						sockets.forEach(x=>x({
							type: "wiki", msg: { type: "timeInterval", time }
						}));
					} else {
						clearInterval(interval);
					}
				});
			}, state.game.timeInterval*1000);
		}
	} else if (msg.type=="goto") {
		sockets.get(player)?.({type: "wiki", msg: { type: "loadingPage" }});
		state.playerWentTo.set(player, msg.name);

		dispatch(player, async ()=>{
			const page = await getWiki({name: msg.name});
			const dist = page!=null ? await getDistance(page.parse.pageid, state.end) : null;
			const wikiPage = page==null || dist==null ? null : toWikiPage(page, dist.length-1);

			addQueue(async ()=>{
				if (gameState!=state || state.playerWentTo.get(player)!==msg.name) {
					return;
				}

				sockets.get(player)?.({type: "wiki", msg: {
					type: "pageContent", page: wikiPage, hash: msg.hash
				}});

				const time = Date.now();
				sockets.forEach(x=>x({
					type: "wiki", msg: {
						type: "playerChange",
						time,
						name: msg.name,
						back: msg.back,
						player,
						distance: wikiPage?.distance ?? null
					}
				}));
			});
		});
	} else if (msg.type=="stop") {
		const time = Date.now();
		sockets.forEach(x=>x({
			type: "wiki", msg: {
				type: "stopped",
				why: "player",
				time, player
			}
		}));
	} else if (msg.type=="stopLoading") {
		state.playerWentTo.delete(player);
		sockets.get(player)?.({type: "wiki", msg: {type: "loadingStopped"}});
	}
}

//idk how to do secure string comparison in JS and this makes me feel safer :)
const doHash = (pass: string)=>createHash("SHA256").update(Buffer.from(pass)).digest();
const tokenHash = process.env["PASSWORD"] ? doHash(process.env["PASSWORD"]) : null;
if (!tokenHash) console.log("no password set");

app.get('/ws', upgradeWebSocket(()=>{
	let player: Player|null=null;

	return {
		onClose() {
			if (player!=null) sockets.delete(player);
		},
		onError(err) {
			console.error("websocket error", err);
		},
		onMessage(evt, ws) {
			const send = (x: MessageToClient) => {
				ws.send(JSON.stringify(x));
			};

			const err = (e: unknown) => {
				send({type: "error", message: e instanceof AppError ? e.msg : undefined})
				console.log("error", e);
			};

			try {
				const msg = MessageToServerZod.parse(JSON.parse(evt.data.toString()));

				if (msg.type=="connect") {
					if (tokenHash!=null) {
						if (msg.token==null) {
							send({type: "needToken"});
							return;
						} else if (!doHash(msg.token).equals(tokenHash)) {
							send({type: "needToken"});
							throw new AppError("invalid token");
						}
					}

					if (player!=null) throw new AppError("already set a player");
					else if (sockets.get(msg.player)) throw new AppError("player already in use");

					sockets.set(msg.player, send);
					player = msg.player;

					send({type: "connected", player});
				} else if (msg.type=="closeGame") {
					endGame();
				} else if ((msg.type=="mine" || msg.type=="wiki") && player!=null) {
					const p = player;
					addQueue(async ()=>{
						refreshGame();
						try {
							if (msg.type=="mine") await handleMine(p, msg.msg);
							else if (msg.type=="wiki") await handleWiki(p, msg.msg);
						} catch (e) {
							err(e);
						}
					});
				} else {
					throw new AppError("no player set");
				}
			} catch (e) {
				err(e);
			}
		}
	};
}));

app.on("GET", ["/cswnproxy/:path{.+$}", "/cswnproxy/"], async c => {
	const path = c.req.param("path");
	const u = new URL("https://www.cs.purdue.edu/");
	u.pathname = `/cswn/${path??""}`;
	const resp = await fetch(u);

	return new Response(resp.body, {
		headers: new Headers([
			...[...resp.headers.entries()].filter(([k])=>k.toLowerCase()!="x-frame-options"),
			["X-Frame-Options", "SAMEORIGIN"]
		])
	});
});

app.use("*", serveStatic({
	root: "../dist"
}));

const AdminCommand = z.union([
	z.object({
		type: z.literal("reset")
	}),
	z.object({
		type: z.literal("message"),
		msg: z.string().nullable()
	}),
	z.object({
		type: z.literal("status")
	})
]);

export type AdminCommand = z.infer<typeof AdminCommand>;
export type AdminResponse = {
	type: "ok"
}|{
	type: "error", message?: string
}|{
	type: "status",
	players: Player[],
	game: {
		type: "wiki"|"mine",
		start: number
	}|null
};

const adminToken = doHash(process.env["ADMIN_PASSWORD"]!);
const authAdmin = createMiddleware(async (c,next)=>{
	const authHdr = c.req.header("Authorization")?.match(/^Basic (.+)$/);
	if (authHdr==undefined || authHdr.length!=2 || !doHash(authHdr[1]).equals(adminToken)) {
		throw new AppError("Invalid token");
	}

	await next();
});

app.post("/admin", authAdmin, async c=>{
	const cmd = AdminCommand.parse(await c.req.json());
	if (cmd.type=="message") {
		sockets.forEach(x=>x({type: "displayMessage", message: cmd.msg}));
	} else if (cmd.type=="reset") {
		sockets.forEach(x=>x({type: "reset"}));
	} else if (cmd.type=="status") {
		return c.json({
			type: "status",
			players: [...sockets.keys()],
			game: gameState!=null ? {
				type: gameState.type,
				start: gameState.start
			} : null
		} satisfies AdminResponse);
	}

	return c.json({type: "ok"});
});

app.onError((err,c)=>{
	console.error("request error", err);
	if (err instanceof AppError) return c.json({type: "error", message: err.msg});
	else return c.json({type: "error"});
});

app.get("*", async c=>c.body((await Deno.open("../dist/index.html")).readable, 200));

console.log("starting server");
Deno.serve({port: Number.parseInt(process.env["PORT"] ?? "8000")}, app.fetch)
console.log("server started");