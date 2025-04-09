import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { WikiGameType, WikiMessageToServer, WikiPage } from "./server";
import { Ctx, useTimeUntil, wonStatus } from "./util";
import { Button, Container, Heading, Highlighted, Modal, SmallButton, Spinner, WinModal } from "./ui";
import { WikiState } from "./wikistate";
import { IconArrowBigRightFilled, IconClockFilled, IconMoodSmileFilled } from "@tabler/icons-react";

import DOMPurify from "dompurify";
import parse, { attributesToProps, DOMNode, domToReact, Element, HTMLReactParserOptions } from 'html-react-parser';

import clsx from "clsx";
import { twMerge } from "tailwind-merge";
import { motion, useMotionValue, useTransform } from "motion/react";

const Degs = ({x, desc}: {x: number|null, desc?: string}) => <div className="flex flex-col items-center w-full my-4" >
	<p className="flex flex-row gap-3 items-center" >
		<Highlighted className="font-black font-title text-3xl" >{x ?? "?"}</Highlighted>
		<b className="uppercase font-title font-bold" >degrees</b>
	</p>
	{desc && <p className="uppercase font-title" >{desc}</p>}
</div>;

function WikiLanding({start}: {start: (x: WikiGameType)=>void}) {
	return <Container>
		<Heading big>WikiRace</Heading>
		<p>
			Who can click through wikilinks the fastest? Race each other to find a path between Wikipedia pages.
		</p>

		<Heading>Game modes</Heading>
		<div className="grid grid-cols-[auto_1fr_1fr_1fr] gap-5 gap-y-6 items-center text-center" >
			<IconMoodSmileFilled size={40} />
			<Button onClick={()=>start({onlyCloser: false})} >Random</Button>
			<Button onClick={()=>start({minDistance: 5, onlyCloser: false})} >Degree 5+</Button>
			<Button onClick={()=>start({minDistance: 7, onlyCloser: false})} >Degree 7+</Button>

			<IconClockFilled size={40}/>
			<Button onClick={()=>start({timeLimit: 60, onlyCloser: false})} >(60 s) Random</Button>
			<Button onClick={()=>start({minDistance: 5, timeLimit: 45, onlyCloser: false})} >(45 s) Degree 5+</Button>
			<Button onClick={()=>start({minDistance: 7, timeLimit: 30, onlyCloser: false})} >(30 s) Degree 7+</Button>

			<p className="col-span-4" >
				After the timer runs out, the player closest to the goal page wins.
			</p>

			<IconArrowBigRightFilled size={40}/>
			<Button onClick={()=>start({timeInterval: 10, onlyCloser: true})} >(Direct) Random</Button>
			<Button onClick={()=>start({minDistance: 5, timeInterval: 10, onlyCloser: true})} >(Direct) Degree 5+</Button>
			<Button onClick={()=>start({minDistance: 7, timeInterval: 10, onlyCloser: true})} >(Direct) Degree 7+</Button>

			<p className="col-span-4" >
				In this variant, you immediately lose when you go to a page further from the goal, and you must move to a previously unvisited page every 10 seconds.
			</p>
		</div>
	</Container>;
}

function WikiPageContent({page, navigate, big, initialHash, className, back, scrollHash, ...props}: {
	page: WikiPage, navigate?: (title: string, hash: string|null)=>void
	big?: boolean, initialHash?: string, back?: ()=>void, scrollHash?: (x: string)=>void
}&JSX.IntrinsicElements["div"]) {
	const [hash, setHash] = useState("");
	useEffect(()=>{if (initialHash) setHash(initialHash)}, [initialHash]); //lmao

	const content = useMemo<{type: "error"}|{type: "ok", out: React.ReactNode}>(()=>{
		const contentLink = ({href, children, title, className, ...props}: JSX.IntrinsicElements["a"]) => {
			const good = (navigate && title!=undefined && (href?.startsWith("/wiki") ?? false)) || href?.startsWith("#");
			const hash = href ? new URL(href, window.location.href).hash.replace(/^#/, "") : null;
			return <a {...props} href={undefined} onClick={()=>{
				if (good) {
					if (title) navigate?.(title, hash);
					else if (hash) setHash(hash);
				}
			}} className={twMerge(clsx(good ? "!text-sky-700 !underline" : "!text-gray-500"), "inline", className)} >{children}</a>;
		};

		try {
			const opts: HTMLReactParserOptions = {
				replace(node) {
					if (node instanceof Element && node.tagName=="a") {
						return contentLink({
							...attributesToProps(node.attribs, "a"),
							children: domToReact(node.children as DOMNode[], opts)
						});
					}
				}
			};

			return {type: "ok", out: parse(DOMPurify.sanitize(page.content), opts)};
		} catch (e) {
			console.error(e);
			return {type: "error"};
		}
	}, [page.content, navigate, setHash]);

	const ref = useRef<HTMLDivElement>(null);
	useEffect(()=>{
		if (!ref.current || !hash) return;

		[...ref.current.querySelectorAll("h1,h2,h3,h4,h5,h6")]
			.find(x=>x.id==hash)?.scrollIntoView({ block: "start" });
	}, [content, hash]);

	useEffect(()=>{
		if (!ref.current || !scrollHash) return;

		let el: HTMLElement|null = ref.current;
		while (el) {
			if (el.scrollHeight>el.clientHeight) break;
			el=el.parentElement;
		}

		el ??= document.body;
		let last="";

		const xs = [...ref.current.querySelectorAll("h1,h2,h3,h4,h5,h6")];
		const cb = ()=>{
			const h = xs.findLast(x=>(x as HTMLHeadingElement).offsetTop<el.scrollTop+100);
			if (h?.id && h.id!=last) {
				scrollHash(h.id);
				last=h.id;
			}
		};

		el.addEventListener("scroll", cb);
		return ()=>{
			el.removeEventListener("scroll", cb);
		};
	}, [content, scrollHash]);

	return <div ref={ref} className={twMerge("wiki text-black bg-neutral-100 max-w-full relative", className)} {...props} >
		<Heading big={big} >{page.name}</Heading>
		<div className="h-0.5 bg-neutral-300 w-auto mb-2" />
		{content?.type=="error" ? <div className="bg-red-200 rounded-md p-3 text-xl text-black flex flex-col gap-3 items-start" >
			An error occurred while rendering this page.
			{back && <Button onClick={back} >Go back</Button>}
		</div> : content.out}
	</div>;
}

function WikiStartEnd({state, reroll, start, exit}: {
	state: Extract<WikiState, {status: "ready"}>,
	reroll: ()=>void, start: ()=>void, exit: ()=>void
}) {
	return <Container>
		<Heading big>Confirm articles</Heading>

		<div className="grid grid-cols-2 grid-flow-col grid-rows-[auto_auto] gap-x-1 gap-y-2 w-auto -mx-14" >
			<Heading big>Start</Heading>
			<WikiPageContent className="max-h-96 overflow-auto flex-1 p-4 py-2" page={state.start} ></WikiPageContent>

			<Heading big>Goal</Heading>
			<WikiPageContent page={state.end} className="max-h-96 overflow-auto flex-1 p-4 py-2" ></WikiPageContent>
		</div>

		<Degs x={state.start.distance} desc="of separation" ></Degs>

		<div className="flex flex-row items-center gap-5 mb-24 justify-center w-full" >
			<Button onClick={exit} >Choose another mode</Button>
			<Button onClick={reroll} >Reroll</Button>
			<Button onClick={start} >Start game</Button>
		</div>
	</Container>;
}

function TableOfContents({open, sections, selected}: {
	open: (x: string)=>void, sections: WikiPage["sections"], selected: string
}) {
	const {level, at} = useMemo(()=>{
		const level = sections.reduce((a,b)=>Math.min(a,b.toclevel),Infinity);
		const at = sections.map((x,i)=>({x,i})).filter(x=>x.x.toclevel==level)
			.map(({x,i})=>({
				x,i,inner: DOMPurify.sanitize(x.line)
			}))

		return {level,at};
	}, [sections]);

	const selectedI = sections.findIndex(x=>x.anchor==selected);

	return <div className="flex flex-col p-2" >
		{at.map((o,i)=>{
			const subs = o.i<=selectedI && (i==at.length-1 || at[i+1].i>selectedI)
				? sections.slice(o.i+1, i==at.length-1 ? sections.length : at[i+1].i)
				: null;
			return <div key={o.x.anchor} >
				<a className={clsx(
					"cursor-pointer p-2",
					level==1 ? "text-xl font-title font-bold" : "text-base",
					subs!=null && "bg-rush text-black",
					subs==null && (level==1 ? "text-white" : "text-blue-300")
				 )} onClick={()=>open(o.x.anchor)}
					dangerouslySetInnerHTML={{__html: o.inner}} >
				</a>
				<div>
					{subs && subs.length>0 && <TableOfContents open={open} sections={subs} selected={selected} ></TableOfContents>}
				</div>
			</div>;
		})}
	</div>;
}

type Send = (x: WikiMessageToServer|{type: "closeGame"})=>void;
function WikiGame({state, send}: {
	state: Extract<WikiState, {status: "end"|"ongoing"}>, send: Send
}) {
	const afterStart = useTimeUntil(state.startTime, true);
	const time = state.status=="end" ? Math.floor((state.endTime-state.startTime)/1000) : afterStart;

	const deadline = state.game.timeInterval ? state.intervalStart+state.game.timeInterval*1000
		: state.game.timeLimit ? state.startTime + state.game.timeLimit*1000 : null;
	const deadlineTime = state.game.timeInterval ?? state.game.timeLimit;
	const untilDeadline = useMotionValue<number|null>(0);
	const untilDeadlineStr = useTransform(()=>untilDeadline.get()?.toFixed(1))
	const untilDeadlineScale = useTransform(()=>deadlineTime ? untilDeadline.get()/deadlineTime : 1);
	const showDeadline = deadline!=null && state.status=="ongoing" && (state.game.timeInterval ? !state.playerState[0].movedInInterval : true);

	useEffect(()=>{
		if (deadline==null) return;
		const int = setInterval(()=>{
			const d = deadline-Date.now();
			if (d<0) clearInterval(int);
			else untilDeadline.set(d/1000);
		}, 50);
		return ()=>clearInterval(int);
	}, [deadline, untilDeadline]);

	const showDegs = state.status=="end" || state.game.onlyCloser;

	const nav = useCallback((name: string, hash: string|null)=>{
		setOverride(null);
		send({type: "goto", name, back: false, hash});
	}, [send]);

	const hist = (i: 0|1|"path") => {
		const pages: (WikiPage|{name: string})[] = i=="path" ? [state.start, ...state.path, state.end]
			: state.playerState[i].pages.toReversed().map(x=>({name: x}));

		return <div className="max-h-56 overflow-y-auto font-title p-2 rounded-md bg-zinc-900 text-md flex flex-col gap-1 shrink-0" >
			{pages.map((x,j)=>
				<SmallButton disabled={state.status!="end"} key={j} onClick={()=>{
					if (state.status!="end") return;
					if ("content" in x) setOverride(x);
					else nav(x.name, null);
				}} >{x.name}</SmallButton>
			)}
		</div>;
	};

	const [overrideCurrent, setOverride] = useState<WikiPage|null>(null);
	const cur = overrideCurrent ?? (state.current.type=="ok" ? state.current.page : null);

	const ref = useRef<HTMLDivElement>(null);
	useEffect(()=>{
		setOpenHash(null);
		if (state.current.type!="ok" || state.current.hash==null) {
			setScrollHash("");
			ref.current?.scrollTo({top: 0});
		}
	}, [cur]);

	const back = ()=>send({
		type: "goto",
		name: state.playerState[0].stack[state.playerState[0].stack.length-2],
		back: true, hash: null
	});

	const [scrollHash, setScrollHash] = useState("");
	const [openHash, setOpenHash] = useState<string|null>();

	const [preview, setPreview] = useState(false);
	const who = state.status=="end" && state.won ? "you" : "your opponent";
	const notWho = state.status=="end" && state.won ? "your opponent" : "you";
	const ctx = useContext(Ctx);

	const [endModal, setEndModal] = useState(false);
	useEffect(()=>{
		if (state.status=="end") setEndModal(true);
	}, [state.status=="end"]);

	const fullWhy = state.status!="end" ? null
		: state.why=="target" ? `${who} reached the goal first`
		: state.why=="died" ? `${notWho} accidentally went further from the goal`
		: state.why=="time" ? `both players ran out of time${state.won!=null ? ` but ${who} ${state.won ? "were" : "was"} closer to the goal` : ""}`
		: state.why=="noMove" ? `${state.won!=null ? notWho : "both players"} didn't make a move in time`
		: state.why=="player" ? "someone decided it had gone on long enough" : null;
	
	const timeFormatted = time==null ? null : time>60 ? `${Math.floor(time/60)}m ${time%60}s` : `${time}s`

	return <div className="absolute flex flex-row w-full justify-between items-start bottom-0"
		style={{top: `${ctx.navBarHeight}px`}} >
		<div className="pl-5 pr-5 flex flex-col gap-2 py-24 basis-1/4 shrink-0 max-h-full overflow-y-auto" >
			<Heading big >WikiRace</Heading>

			<p className="flex flex-row items-end gap-4 text-4xl self-center" >
				<Highlighted>{state.game.timeLimit==undefined ? timeFormatted : `${time ?? 0}/${state.game.timeLimit}`}</Highlighted> {state.game.timeLimit && <b className="text-2xl" >seconds</b>}
			</p>
			
			{state.status=="end" && <p>
				<b>{wonStatus(state.won)}</b>
				{" "}Game ended when <b>{fullWhy}</b>.
			</p>}

			<b>
				Goal <span className="text-gray-200 font-normal" >(click to show)</span>
			</b>
			<SmallButton onClick={()=>setPreview(true)} className="font-title" >
				{state.end.name}
			</SmallButton>

			{showDegs && <Degs x={cur?.distance??null} desc={cur?.name==state.playerState[0].stack[state.playerState[0].stack.length-1] ? "you" : "current"} />}

			<b>Page history</b>
			{hist(0)}

			<b>Opponent page history</b>
			{hist(1)}

			{showDegs && <Degs x={state.playerState[1].distance} desc="your opponent" />}

			{state.status=="end" && <>
				<b>Optimal path</b>
				{hist("path")}
			</>}

			<Button onClick={()=>send({type: state.status=="end" ? "closeGame" : "stop"})} className="mt-6" >
				{state.status=="end" ? "Game menu" : "End game"}
			</Button>
		</div>

		<Modal open={preview} className="bg-neutral-100 text-black" close={()=>setPreview(false)} >
			<Heading big >Goal page</Heading>
			<WikiPageContent page={state.end} ></WikiPageContent>
		</Modal>

		<WinModal open={endModal && state.status=="end"} won={state.status=="end" && state.won}
			why={fullWhy??undefined} close={()=>setEndModal(false)} />

		<div className="flex flex-col flex-1 h-full overflow-auto" ref={ref} >
			{cur!=null ? <WikiPageContent className="px-10 py-5 border-2 border-steam flex-1" big
				page={cur} navigate={nav}
				initialHash={state.current.type=="ok" ? (openHash ?? state.current.hash ?? undefined) : undefined}
				back={back} scrollHash={setScrollHash} />
			: state.current.type=="loading" ? <div className="flex flex-col gap-2 w-full h-full justify-center items-center min-h-96" >
				<Spinner/>
				<Heading>Loading your precious page...</Heading>
				<Button onClick={()=>send({
					type: "stopLoading"
				})} >Cancel request</Button>
			</div>
			: state.current.type=="bad" && <div className="flex flex-col gap-2 p-10 items-start" >
				<Heading big >Uh oh.</Heading>
				<b>That page doesn't lead to the goal, or it wasn't found.</b>
				<Button onClick={back} >Go back</Button>
			</div>}
		</div>

		{cur && <motion.div className="h-full w-1/6 flex flex-col pt-5 overflow-y-auto" animate={cur==null || cur.sections.length==0 ? {scaleX: 0} : {scaleX: 1}} >
			<Heading className="px-4" >Table of Contents</Heading>
			<TableOfContents open={setOpenHash} sections={cur.sections} selected={scrollHash} ></TableOfContents>
		</motion.div>}

		<motion.div className="absolute bottom-0 w-full h-24 overflow-hidden"
			initial={{y: 100}} key="timer" animate={{y: showDeadline ? 0 : 100, display: showDeadline ? "block" : "none"}} >
			<div className="rounded-full bottom-0 translate-y-1/2 w-28 h-28 absolute left-1/2 -translate-x-1/2 bg-rush" >
			</div>
			<motion.h1 className="bottom-0 font-title text-3xl font-black absolute left-1/2 -translate-x-1/2" >{untilDeadlineStr}</motion.h1>
			<div className="absolute bottom-0 left-0 right-0 h-2 bg-black" />
			<motion.div className="absolute bottom-0 left-0 right-0 h-2 bg-rush" style={{
				scaleX: untilDeadlineScale
			}} ></motion.div>
		</motion.div>
	</div>;
}

export default function WikiRace({state}: {state: WikiState}) {
	const ctx = useContext(Ctx);
	const send: Send = useCallback((x) => {
		if (!ctx.send) ctx.handleErr("client is disconnected");
		else if (x.type=="closeGame") ctx.send({type: "closeGame"});
		else ctx.send({type: "wiki", msg: x});
	}, [ctx.send, ctx.handleErr]);

	return state.status=="loading" ? <div className="w-full h-full my-24 flex flex-col items-center justify-center" >
		<Spinner/>
		<Heading>Choosing two articles...</Heading>
	</div> : state.status=="idle" ? <WikiLanding start={
		(game) => send({type: "requestStartEnd", game})
	} />
	: state.status=="ready" ? <WikiStartEnd state={state} reroll={()=>{
		send({type: "requestStartEnd", game: state.game})
	}} start={()=>{
		send({type: "startGame"});
	}} exit={()=>send({type: "closeGame"})} />
	: ((state.status=="end" || state.status=="ongoing") && <WikiGame state={state} send={send} />);
}