import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { Anchor, Button, Container, Heading, Highlighted, Input, Spinner, WinModal } from "./ui";
import { Ctx, useTimeUntil } from "./util";
import { motion } from "motion/react";
import { IconBombFilled, IconEyeFilled, IconFlag2Filled, IconSkull } from "@tabler/icons-react";
import { ActiveMineState, countMineState, DEATH_LIMIT, MineState, mineStateCellDifference } from "./minestate";
import { MineMessageToServer, TimeRecord } from "./server";
import clsx from "clsx";

const emptyCell: ActiveMineState["board"][0][0] = {
	flagged: [false,false],
	revealed: [false,false],
	mine: false,
	number: 0
};

function MinesPagination({npage,page,setPage}: {
	npage: number, page: number, setPage: (page: number)=>void
}) {
	const pageMin = Math.max(0, page-5), pageMax = Math.min(npage-1, page+5);
	return <div className="flex flex-row items-center justify-center gap-3 mt-5" >
		{[...new Array(pageMax-pageMin+1)].map((_,i)=>
			<button key={pageMin+i} className={clsx(
				"px-3 py-0.5 pt-1 rounded-md font-title font-black text-xl",
				i+pageMin==page ? "bg-sky-400 scale-110 text-black" : "bg-zinc-900" 
			)} onClick={()=>setPage(pageMin+i)} >{pageMin+i+1}</button>)}
	</div>
}

const leaderSizes = [
	null,
	[9,9,10],
	[9,9,35],
	[16,16,40],
	[16,16,99]
] as const;

function MinesLanding({choose}: {choose: (params: [number,number,number])=>void}) {
	const [leaderboard, setLeaderboard] = useState<{npage: number, times: TimeRecord[], offset: number}|null>(null);
	const [leaderSize, setLeaderSize] = useState<{page: number, size: readonly [number,number,number]|null}>({
		page: 0, size: null
	});

	const ctx = useContext(Ctx);
	const send = ctx.send;
	useEffect(()=>{
		setLeaderboard(null);
		if (send) {
			send({type: "mine", msg: {type: "getTimes", page: leaderSize.page, size: leaderSize.size}});
		}
	}, [leaderSize, send]);

	ctx.useMessage((x)=>{
		if (x.type=="mine" && x.msg.type=="loadTimes") setLeaderboard(x.msg);
	});

	return <Container>
		<Heading big>Minesweeper</Heading>
		<p>The first player to reveal a square also reveals the starting square for the other player.</p>
		<p><b>The board is guaranteed solvable (without guessing). You get one free death (if you die again, the other player wins).</b></p>
		<div className="flex flex-row mt-10 justify-between w-full" >
			<div className="flex flex-col gap-4" >
				<Heading>Choose a board</Heading>
				<Button onClick={()=>choose([9,9,10])} >9x9, 10 mines</Button>
				<Button onClick={()=>choose([16,16,40])} >16x16, 40 mines</Button>
				<Button className="bg-red-950" onClick={()=>choose([9,9,35])} >9x9, 35 mines</Button>
				<Button className="bg-red-950" onClick={()=>choose([16,16,99])} >16x16, 99 mines</Button>
			</div>

			<div>
				<Heading>Leaderboard</Heading>

				<div className="flex flex-row items-center justify-start gap-2 my-5" >
					<p className="mr-2 font-bold font-title" >Size</p>
					{leaderSizes.map((sz,i) => {
						const name = sz ? sz.join("x") : "All";
						return sz==leaderSize.size
							? <Highlighted key={i} >{name}</Highlighted>
							: <Anchor key={i} onClick={()=>{
								setLeaderSize({page: 0, size: sz})
							}} >{name}</Anchor>
					})}
				</div>

				{!leaderboard ? <div className="h-24 flex flex-col items-center justify-center" >
					<Spinner/>
				</div>
				: <table className="w-full" >
					<thead>
						<tr className="font-title font-bold" >
							<td>#</td>
							<td>Name</td>
							<td>Time</td>
							{leaderSize.size==null && <td>Board size</td>}
						</tr>
					</thead>
					{leaderboard.times.length==0 && <p>No results.</p>}
					<tbody className="overflow-scroll max-h-64 mt-3" >
						{leaderboard.times.map((x,i)=>{
							return <tr key={i} >
								<td className="font-black" >{i + leaderboard.offset + 1}</td>
								<td>{x.name ? <span className="max-w-32 overflow-hidden" >{x.name}</span> : <span className="text-gray-400 italic" >(anonymous)</span>}</td>
								<td>{x.seconds.toFixed(3)} s</td>
								{leaderSize.size==null && <td>
									{x.size.join("x")}
								</td>}
							</tr>
						})}
					</tbody>
				</table>}
				{leaderboard && <MinesPagination npage={leaderboard.npage} page={leaderSize.page}
					setPage={(p)=>setLeaderSize({...leaderSize, page: p})} />}
			</div>
		</div>
	</Container>;
}

const colors = [
	undefined,
	"#38bdf8",
	"#22c55e",
	"#818cf8",
	"#2563eb",
	"#d97706",
	"#2dd4bf",
	"#a855f7",
	"#fcd34d"
] as const;

export function MineCell({cell, flag, end, reveal, delta, active: umActive, setActive, clearActive}: {
	cell: ActiveMineState["board"][0][0],
	end: boolean,
	delta: number,
	flag: ()=>void, reveal: ()=>void,
	active: boolean, setActive: ()=>void, clearActive: ()=>void
}) {
	const show = end || cell.revealed[0];
	const canActivate = (!cell.revealed[0] || delta==0) && !end;
	const active = umActive && canActivate;
	const isMine = cell.mine && show;

	return <motion.td className={clsx(
		"h-10 w-10 rounded-md border-none outline select-none",
			canActivate ? "cursor-pointer" : "cursor-not-allowed",
			isMine ? "bg-white"
			: cell.revealed[0] ? (delta<0 ? "bg-red-800" : cell.revealed[1] ? "bg-rose-900/20" : "bg-zinc-900")
			: "bg-neutral-700"
	)}
		whileTap={canActivate ? {scale: 1.3, outlineWidth: "5px", zIndex: 30} : {}}
		animate={{background: active ? "#3b3f47" : "", outlineColor: active ? "#b0c1d1" : "#3c3c3d", outlineWidth: active ? "2px" : "1px"}}
		onTap={()=>canActivate && !active ? setActive() : clearActive()} >
		<div className="w-full h-full relative font-black font-title flex flex-col items-center justify-center" >
			<span style={{color: show && !isMine ? colors[cell.number] : undefined}} >{
				isMine ? <IconBombFilled className="fill-black" />
				: show ? (cell.number>0 && cell.number)
				: cell.flagged[0] && <IconFlag2Filled className="fill-red-500" />
			}</span> 
			{active && <div className="left-0 right-0 mx-auto flex flex-col items-center absolute z-50 top-0" >
				<motion.div className="flex flex-row opacity-0 absolute top-0 bg-zinc-950/60 p-1 rounded-md border-gray-700 border gap-4 px-2 shadow-sm"
					initial={{opacity: 0, y:-20}}
					animate={{opacity: 1.0, y: -40}}
					transition={{duration: 0.05}} >
					<button onClick={()=>flag()} disabled={cell.revealed[0]} ><IconFlag2Filled className={cell.revealed[0] ? "fill-gray-500" : "fill-red-500"} size={40} /></button>
					<span className="h-9 my-auto w-px bg-gray-500" ></span>
					<button onClick={()=>reveal()} ><IconEyeFilled className="fill-cyan-200" size={40} /></button>
				</motion.div>
			</div>}
		</div>
	</motion.td>;
}

export function ActiveMines({send, state}: {
	send: (x: MineMessageToServer|{type: "closeGame"})=>void,
	state: Extract<MineState,{status: "ongoing"|"won"|"lost"|"notstarted"}>
}) {
	const [activeCell, setActive] = useState<[number,number]|null>(null);

	const table = useRef<HTMLTableElement>(null);
	useEffect(()=>{
		const clk = (ev: MouseEvent) => {
			if (ev.target instanceof HTMLElement && table.current && table.current.contains(ev.target)) return;
			setActive(null);
		};
		document.addEventListener("click", clk);
		return ()=>document.removeEventListener("click", clk);
	}, []);

	const afterStartActive = useTimeUntil(state.status=="ongoing" ? state.start : null, true);
	const afterStart = state.status=="won"||state.status=="lost"
		? Math.ceil((state.end-state.start)/1000) : afterStartActive;
	const active: ActiveMineState|null = state.status!="notstarted" ? state : null;
	const isEnd = state.status=="won" || state.status=="lost";

	const [revealed, flagged] = useMemo(()=>(["reveal","flag"] as const).map((ty) =>
		active ? ([0,1] as const).map(i=>countMineState(active,i,ty)) : [0,0]
	), [active]);

	const [endModal, setEndModal] = useState(false);
	const [leaderName, setLeaderName] = useState<null|string>(null);

	useEffect(()=>{
		if (isEnd) {
			setEndModal(true);
			setLeaderName(null);
		}
	}, [isEnd]);

	const total = state.size[0]*state.size[1]-state.nMine;

	const smX = state.size[0]<=10, smY = state.size[1]<=10;
	return <div className={clsx("flex flex-row justify-between gap-10 self-stretch",
		smX ? "px-40 pr-60" : "pr-14 pl-9",
		smY ? "mt-24" : "mt-5"
	)} >
		<WinModal open={endModal} won={state.status=="won"}
			why={state.status=="lost" ? "better luck next time" : "nice one"}
			close={()=>setEndModal(false)} >
			{state.status=="won" && state.why=="speed" && (state.leaderboard==null ? <Spinner/>
			: <div className="flex flex-col gap-4" >
				<p>You're <b>#{state.leaderboard.idx+1}</b> on the leaderboard{state.leaderboard.name && <>
					{" as"} <b>{state.leaderboard.name}</b>
				</>}!</p>

					{leaderName==null ? <Button onClick={()=>setLeaderName("")} >{state.leaderboard.name ? "Change" : "Set"} name</Button>
				: <form className="flex flex-col gap-2 mx-5" onSubmit={(ev)=>{
					ev.preventDefault();
					send({type: "setTimeName", name: leaderName})
					setLeaderName(null);
				}} >
					<p>Enter name:</p>
					<Input value={leaderName} onChange={(e)=>setLeaderName(e.target.value)} ></Input>
					<Button type="submit" className="mt-2" >Confirm name</Button>
				</form>}
			</div>)}
		</WinModal>

		<div className="flex flex-col items-start font-bold basis-60 gap-5" >
			<h1 className="font-black font-title text-3xl" >Minesweeper</h1>
			{afterStart!=null && <p>
				<Highlighted>
					{Math.floor(afterStart/60)}:{(afterStart%60).toString().padStart(2,"0")}
				</Highlighted> {state.status=="ongoing" ? "elapsed" : "total time"}
			</p>}

			{state.status=="lost" && <p>You lost because {state.why=="death" ? " you died too many times." : "you were too slow."}</p>}
			{state.status=="won" && <p>You won! {state.why=="death" ? "The other person died." : "You were faster than the other person."}</p>}
			
			{state.status=="notstarted" && <p>The first player to click any square starts the clock.</p>}

			<div className="grid grid-cols-2 justify-between w-full font-bold" >
				<span className="text-sky-200" >You</span>
				<span className="text-right text-rose-200" >Opponent</span>
				<div className="flex flex-row text-sky-200 justify-start gap-2" >
					<IconSkull/>{state.deaths}/{DEATH_LIMIT} 
				</div>
				<div className="flex flex-row text-rose-200 justify-end gap-2" >
					{state.otherDeaths}/{DEATH_LIMIT} <IconSkull/>
				</div>
				<div className="flex flex-row text-sky-200 justify-start gap-2" >
					<IconFlag2Filled/>{flagged[0]}/{state.nMine}
				</div>
				<div className="flex flex-row text-rose-200 justify-end gap-2" >
					{flagged[1]}/{state.nMine} <IconFlag2Filled/>
				</div>
				<div className="flex flex-row text-sky-200 justify-start gap-2" >
					<IconEyeFilled/>{revealed[0]}/{total}
				</div>
				<div className="flex flex-row text-rose-200 justify-end gap-2" >
					{revealed[1]}/{total} <IconEyeFilled/>
				</div>
			</div>

			<Button onClick={()=>send({type: "closeGame"})} >{isEnd ? "Play again?" : "End game"}</Button>
		</div>

		<table className="border-separate bg-transparent border-spacing-1 flex flex-col" ref={table} >
			<tbody>
				{[...new Array(state.size[0])].map((_,i) => <tr key={i} className="bg-none" >
					{[...new Array(state.size[1])].map((_,j) => {
						const isActive = activeCell!=null && i==activeCell[0] && j==activeCell[1] && !isEnd;
						return <MineCell key={j} cell={active ? active.board[i][j] : emptyCell}
							end={isEnd}
							delta={active ? mineStateCellDifference(active,i,j) ?? 1 : 1}
							active={isActive}
							setActive={()=>setActive([i,j])} clearActive={()=>setActive(null)}
							flag={()=>{setActive(null); send({type: "flag", square: [i,j]})}}
							reveal={()=>{setActive(null); send({
								type: "reveal", square: [i,j],
								start: state.status=="notstarted"
							})}} />;
					})}
				</tr>)}
			</tbody>
		</table>
	</div>;
}

export default function Mines({state}: {state: MineState}) {
	const ctx = useContext(Ctx);
	const send = (x: MineMessageToServer|{type: "closeGame"}) => {
		if (!ctx.send) ctx.handleErr("client is disconnected");
		else if (x.type=="closeGame") ctx.send({type: "closeGame"});
		else ctx.send({type: "mine", msg: x});
	};

	if (state.status=="idle") return <MinesLanding choose={([h,w,nMine]) => {
		send({type: "startGame", size: [h,w], nMine});
	}} />;

	return <ActiveMines send={send} state={state} />;
}