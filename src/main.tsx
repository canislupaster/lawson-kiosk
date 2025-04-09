import Router, { Route, Switch, useUrl } from "crossroad";
import { createElement, CSSProperties, Fragment, lazy, StrictMode, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import "./main.css";
import faculty from "./faculty.json";
import { twMerge } from "tailwind-merge";
import { motion } from "motion/react";
import Keyboard, { SimpleKeyboard } from 'react-simple-keyboard';
import "react-simple-keyboard/build/css/index.css";
import { Icon, IconAddressBook, IconBombFilled, IconBrandWikipedia, IconBroadcastOff, IconCalendarFilled, IconHelpCircleFilled, IconInfoSquareRoundedFilled, IconMapPin, IconMovie, IconVersionsFilled, IconX } from "@tabler/icons-react";
import clsx from "clsx";
import { Anchor, AutoModal, Button, Container, Heading, Input, Modal, Spinner, Title, Typewriter } from "./ui";
import { simp, Ctx, env, INACTIVITY_TIMEOUT } from "./util";
import { CalendarApp } from "./calendar";
import { MessageToClient, MessageToServer, Player } from "./server";
import { MineState, reduceMineState } from "./minestate";
import { reduceWikiState, WikiState } from "./wikistate";

export function Card({className, children, activate, href, bgImg, bgStyle, bgClassName}: {
	className?: string, bgStyle?: CSSProperties, children?: React.ReactNode, bgImg?: string,
	activate?: ()=>void, href?: string, background?: string, bgClassName?: string
}) {
	const [tap, setTap] = useState<"yes"|"no"|"going">("no");
	const ctx = useContext(Ctx);

	return <motion.div
		animate={tap=="no" ? {scale: 1} : {scale: 1.3, paddingTop: 30, paddingBottom: 30}}
		variants={{hidden: {rotateX: 90}, show: {rotateX: 0, transition: {duration: 0.5}}}}
		onTapStart={()=>setTap("yes")}
		onTapCancel={()=>setTap(tap=="going" ? "going" : "no")}
		onTap={()=>{
			setTap("going");
			setTimeout(()=>{
				activate?.();
				if (href) ctx.goto(href);
				setTap("no");
			}, 300);
		}}
		className={twMerge("relative cursor-pointer py-6 px-8 rounded-md bg-coolGray flex justify-center items-center border-4 border-boilermakerGold drop-shadow-sm", className)} >

		<span className="flex flex-row gap-2 items-baseline z-40 uppercase" >
			{children}
		</span>
		
		<motion.div className={twMerge("absolute left-0 right-0 top-0 bottom-0 rounded-md z-30", bgClassName)} initial={{opacity: 0}} animate={{opacity: tap!="no" ? 1 : 0.3}}
			style={{background: bgImg ? `center / cover url(${bgImg})` : undefined, ...bgStyle}} />
		<motion.div className="absolute left-0 right-0 top-0 bottom-0 animatedbg z-10 rounded-md" initial={{scaleY: 0}} animate={{scaleX: tap!="no" ? 1.07 : 1, scaleY: tap!="no" ? 1.2 : 0}} />
	</motion.div>;
}

export function Landing() {
	const vid = useRef<HTMLVideoElement>(null);
	useEffect(()=>void vid.current?.play(), []);

	return <div className="flex flex-col items-center w-full min-h-dvh" >
		<div className="relative flex flex-col items-center min-h-[90dvh] w-full justify-center z-10" >
			<div className="drop-shadow-xl flex flex-col items-center" >
				<h1 className="font-black text-white text-3xl" >
					Welcome to
				</h1>
				<div className="ml-10" >
					<Title text="LAWSON" variant="big" />
				</div>
				<h1 className="font-bold italic" >The home of computer science at Purdue</h1>
				
				<motion.div className="grid gap-x-20 gap-y-9 grid-cols-2 m-5 mt-10 text-3xl font-extrabold font-title text-white" initial="hidden" animate="show" variants={{
					show: {transition: {staggerChildren: 0.1}}
				}} >
					<Card bgImg={"/mapbg.png"} href="/map" >
						<IconMapPin/>
						Campus Map
					</Card>

					<Card bgImg={"/directory.png"} href="/directory" >
						<IconAddressBook/>
						Directory
					</Card>

					<Card bgImg={"/tour.png"} href="/tour" >
						<IconMovie/>
						Tour Video
					</Card>

					<Card bgImg={"/lostfound.png"} href="/lost" >
						<IconInfoSquareRoundedFilled/>
						Lost and Found
					</Card>

					<Card bgImg={"/pluggingin.jpg"} href="/majors" >
						<IconVersionsFilled/>
						Our Majors
					</Card>

					<Card bgImg={"/studentorgs.png"} href="/orgs" >
						<IconCalendarFilled/>
						Student Orgs
					</Card>
				</motion.div>
			</div>

			<div className="-z-10 absolute left-0 right-0 top-0 bottom-0" >
			<video ref={vid} src="/bg.mp4" className="object-cover h-full w-full" muted loop
				style={{filter: "opacity(60%)"}} ></video>
			</div>
		</div>

		<CalendarApp/>
	</div>
};

export function NavBar({setHeight}: {setHeight?: (h: number)=>void}) {
	const ctx = useContext(Ctx);
	return <div className="flex sticky z-50 flex-row w-full top-0 gap-6 items-center justify-between px-10 bg-zinc-900 py-3 left-0 right-0" ref={(x)=>{
		if (x) setHeight?.(x.clientHeight);
	}} >
		<div className="flex flex-row gap-2 items-center" >
			<Button onClick={ctx.back} >BACK</Button>
			<Button href="/" >HOME</Button>
		</div>
		<div className="flex flex-row gap-4 items-end" >
			{ctx.send==null && <IconBroadcastOff className="text-red-500 animate-pulse self-center" />}
			<Button href="/wikirace" noUnderline ><IconBrandWikipedia/></Button>
			<Button href="/mines" noUnderline ><IconBombFilled/></Button>
			<Button href="/info" noUnderline ><img className="h-6 invert" src="/hacker.svg" /></Button>
			<Heading>The Lawson Kiosk</Heading>
		</div>
	</div>;
};

export function Directory() {
	const [search, setSearch] = useState("");

	const found = useMemo(()=>{
		const ssearch = simp(search);
		const f = faculty.filter(x=>ssearch=="" || simp(x.Name).includes(ssearch));
		const catIndex = new Map<string, number>();

		const foundByCat = new Map<string, (typeof f[0])[]>();
		for (const x of f) {
			if (!catIndex.has(x.Category!)) catIndex.set(x.Category!, catIndex.size);
			foundByCat.set(x.Category!, [...foundByCat.get(x.Category!) ?? [], x]);
		}

		return [...foundByCat.entries()].sort(([c1], [c2]) => {
			return catIndex.get(c1)! - catIndex.get(c2)!;
		});
	}, [search]);


	return <Container>
		<Title text="DIRECTORY" variant="med" />

		<p className="font-bold text-xl" >Welcome to the CS faculty directory</p>

		<div className="flex flex-row gap-2 items-center" >
			<p>Search</p>
			<Input value={search} onChange={x=>setSearch(x.target.value)} ></Input>
		</div>
		
		{found.map(([catName, members])=> <Fragment key={catName} >
			<Heading>{catName}</Heading>

			<div className="grid grid-cols-3 gap-3" >
				{members.map(x=><motion.div key={x.Name} style={{
					background: [
						"linear-gradient(to bottom, rgba(0, 0, 0, 0.3) 0%, rgba(0, 0, 0, 0.65) 100%)",
						...x.Photo ? [`center / cover url("${x.Photo}")`] : [],
						"#222324"
					].join(", "),
				}}
					initial={{x: -50, opacity: 0}}
					whileInView={{x: 0, opacity: 1}}
					layout
					className={clsx("p-3 rounded-md shadow-md bg-zinc-900 flex flex-col justify-end", x.Photo && "pt-28")} >
					<h2 className="font-bold text-2xl" >{x.Name}</h2>

					<div className="text-sm" >
						<p className="font-bold" >{x.Title}</p>
						{x.Office && <p>{x.Office}</p>}
					</div>
				</motion.div>)}
			</div>
		</Fragment>)}
	</Container>;
}

// eslint-disable-next-line @typescript-eslint/no-namespace
declare namespace YT {
	class Player {
		constructor(el: string|HTMLElement, opts: {
				width: string;
				height: string;
				videoId: string;
				events?: {
					onReady?: (event: { target: YT.Player }) => void;
					onStateChange?: (event: { data: number; target: YT.Player }) => void;
					onError?: (event: { data: number; target: YT.Player }) => void;
					onPlaybackQualityChange?: (event: { data: string; target: YT.Player }) => void;
					onPlaybackRateChange?: (event: { data: number; target: YT.Player }) => void;
					onApiChange?: (event: { target: YT.Player }) => void;
				};
			}
		);

		playVideo(): void;
		pauseVideo(): void;
		stopVideo(): void;
		getIframe: ()=>HTMLIFrameElement;
	}
}

const enum PlayerState {
	UNSTARTED = -1,
	ENDED = 0,
	PLAYING = 1,
	PAUSED = 2,
	BUFFERING = 3,
	CUED = 5,
}

export function Tour() {
	const ctx = useContext(Ctx);
	const ref = useRef<HTMLDivElement>(null);

	useEffect(()=>{
		const realDiv = document.createElement("div");;
		ref.current!.appendChild(realDiv);
		realDiv.style.width="100%";
		realDiv.style.height="100%";

		const player = new YT.Player(realDiv, {
			height: "913", width: "1623",
			videoId: "E8x-5oSm1_s",
			events: {
				onStateChange(ev) {
					if (ev.data==PlayerState.ENDED) ctx.goto("/");
				},
				onError() { ctx.handleErr("Error playing Youtube video"); },
				onReady() {
					setTimeout(()=>player.playVideo(), 300);
				}
			}
		});

		const ifr = player.getIframe();
		ifr.allowFullscreen=false;
		ifr.sandbox.value = "allow-scripts allow-same-origin";
		ifr.src+=`&modestbranding=1`;

		return ()=>ifr.remove();
	}, [ctx]);

	return <div ref={ref} className="w-dvw h-dvh" onClick={(ev)=>{
		ev.preventDefault();
		ctx.goto("/");
	}} >
		<Button className="fixed right-2 top-2" onClick={()=>ctx.goto("/")} noUnderline ><IconX/></Button>
	</div>;
}

const FactCard = ({className,children,title,icon}: {
	className?: string, children?: React.ReactNode, title?: React.ReactNode, icon?: Icon
}) =>
	<div className={twMerge("flex flex-row gap-3 items-start py-3 px-5 bg-zinc-900 rounded-md justify-center", className)} >
		{createElement(icon ?? IconHelpCircleFilled, {size: 40, className:"fill-boilermakerGold shrink-0 mt-2"})}
		<div className="flex flex-col gap-1" >
			<Heading>{title ?? "Did you know?"}</Heading>
			<p>
				{children}
			</p>
		</div>
	</div>;

export function Information() {
	return <Container>
		<Title text="This kiosk was hacked!" variant="med" />
		<img src="/hackedkiosk.jpeg" className="max-h-72" />
		<p>By me. 🤓 I hope you like the new kiosk -- I spent a lot of time on it! We managed to break out of the old one through very primitive means, so I thought replacing the software would be the ultimate punchline.</p>
		<Anchor href="/mines" >Maybe try a game of minesweeper?</Anchor>
		<FactCard className="mt-4" >
			As a CS major, it's easy to forget about personal hygiene. Remember to take a shower -- the Stewart basement is open during normal business hours!
		</FactCard>
	</Container>;
}

export function LostFound() {
	return <Container>
		<Title text="Lost and Found" variant="med" />
		<p>Found items are held in Lawson (if the finder brought them here) for one week. Afterwards, all unclaimed items are sent to Central Lost and Found in the Purdue Surplus Store, and will be kept there for a month. If the owner has not claimed their items by then, they will be sold through the Surplus Store.</p>

		<p>Within a week after being found, lost items will be in <b>LWSN 1151 during business hours, which is the mailroom at the end of the hallway.</b> Good luck!</p>

		<p>The LWSN office can be reached at <b>765-494-6380</b>. The Central Lost and Found is located at the Materials Management and Distribution Center (MMDC) on <b>700 Ahlers Dr</b> and can be contacted through <b>(765) 494-2125</b>.</p>
	</Container>;
}

const externalSites = {
	"courses": "https://boiler.courses/?query=&subjects=CS",
	"cpu": "https://purduecpu.com/",
	"hackers": "https://www.purduehackers.com/",
	"usb": "https://purdueusb.com/",
	"cswn": "/cswnproxy/",
	"amcs": "https://amcspurdue.weebly.com/",
	"acm": "https://acm.cs.purdue.edu/"
} as const;

export function Site({which}: {which: keyof typeof externalSites}) {
	return <iframe src={externalSites[which]} allowFullScreen={false} sandbox="allow-scripts allow-same-origin" className="flex-grow w-full" />;
}

export function StudentOrgs() {
	return <Container>
		<Title variant="med" text="Student organizations" ></Title>
		<p><Typewriter text="These six CS-focused student organizations provide a glimpse into Purdue's active and welcoming environment, home to more than a thousand clubs." delay={600} speed={3} ></Typewriter></p>
		<p><b>Tap on each to learn more!</b></p>
		<motion.div className="grid grid-cols-3 gap-8 text-xl font-title font-extrabold contrast-150" initial="hidden" animate="show" variants={{
			show: {transition: {staggerChildren: 0.1}}
		}} >
			<Card href="/hackers" bgImg={"/hackers.png"} bgClassName="brightness-50" >Purdue Hackers</Card>
			<Card href="/usb" bgImg={"/usb.png"} bgClassName="brightness-50" >Computer Science Undergraduate Board</Card>
			<Card href="/cswn" bgImg={"/cswn.png"} bgClassName="brightness-50" >Computer Science Women's Network</Card>
			<Card href="/amcs" bgImg={"/amcs.png"} bgClassName="brightness-50" >Association of Multicultural Computer Scientists</Card>
			<Card href="/acm" bgImg={"/acm.png"} bgClassName="brightness-50" >Association for Computing Machinery at Purdue</Card>
			<Card href="/cpu" bgImg={"/cpu.png"} bgClassName="brightness-50" >Competitive Programmers Union</Card>
		</motion.div>
	</Container>;
}

function TokenModal({setToken, open}: {setToken: (tok: string)=>void, open?: boolean}) {
	const [v, setV] = useState("");
	return <Modal z={145} title="Enter token" open={open} >
		<form onSubmit={e=>{
			e.preventDefault();
			setToken(v);
		}} >
			<p>To finish setup, please enter the token:</p>
			<Input required value={v} type="password" onChange={e=>setV(e.target.value)} ></Input>
			<Button type="submit" >Submit</Button>
		</form>
	</Modal>;
}

export function Video() {
	const vid = useRef<HTMLVideoElement>(null);
	const ctx = useContext(Ctx);

	useEffect(()=>{
		const x = vid.current!;
		void x.play();
		const cb = ()=>ctx.goto("/");
		x.addEventListener("click", cb);
		return ()=>x.removeEventListener("click", cb);
	}, [ctx]);

	return <video ref={vid} src="/screensaver.mp4" className="object-cover absolute h-full w-full" muted loop ></video>
}

const LazyMines = lazy(()=>import("./mines"));
const LazyWiki = lazy(()=>import("./wiki"));
const LazyCSMajor = lazy(async ()=>({default: (await import("./majors")).CSMajor}));
const LazyDSMajor = lazy(async ()=>({default: (await import("./majors")).DSMajor}));
const LazyAIMajor = lazy(async ()=>({default: (await import("./majors")).AIMajor}));
const LazyMap = lazy(()=>import("./map"));
const LazyMajors = lazy(()=>import("./majors"));

export function App() {
	const [keyboardTarget, setKeyboardTarget] = useState<HTMLElement|null>(null);
	const keyboardDiv = useRef<HTMLDivElement>(null);

	// eslint-disable-next-line react-hooks/exhaustive-deps
	useEffect(()=>{
		if (keyboardTarget!=null && !document.contains(keyboardTarget)) {
			setKeyboardTarget(null);
		}
	})

	const [url, setUrl] = useUrl();
	const [backs, setBacks] = useState<typeof url[]>([]);
	const oldPath = useRef<typeof url|null>(null);
	const keyboardRef = useRef<SimpleKeyboard|null>();

	const [err, setErr] = useState<string|null>(null);
	const [msg, setMsg] = useState<string|null>(null);

	useEffect(()=>{
		if (oldPath.current!=null && oldPath.current.path!=url.path) {
			setBacks([...backs, oldPath.current]);
		}

		oldPath.current=url;
	}, [url, backs])

	useEffect(()=>window.scrollTo({top: 0, behavior: "instant"}), [url.path])

	const [socket, setSocket] = useState<[WebSocket, Player]|null>(null);
	const [token, setToken] = useState<string|null>(()=>{
		return window.localStorage.getItem("token");
	});

	const [needToken, setNeedToken] = useState(false);

	useEffect(()=>{
		const player = (new URLSearchParams(window.location.search).get("player")
			?? localStorage.getItem("player")) as Player|null|undefined;
		if (!player) {
			setErr("No player found, client offline");
			return;
		}

		let sock: WebSocket|null=null;
		let tm: number|null=null;

		const tryOpen = () => {
			console.log("opening socket");
			const mysock = new WebSocket("/ws");
			sock=mysock;

			mysock.onopen = () => {
				mysock.send(JSON.stringify({
					type: "connect", player: player as Player, token
				} satisfies MessageToServer));
			};

			mysock.addEventListener("message", msg=>{
				const x = JSON.parse(msg.data as string) as MessageToClient;
				if (x.type=="connected") {
					setSocket([mysock, player]);
					localStorage.setItem("player", player);
				} else if (x.type=="needToken") {
					setNeedToken(true);
				} else if (x.type=="error") {
					setErr(x.message ?? "An unknown error occurred.");
				}
			});

			mysock.onerror = (ev) => {
				if (sock!=mysock) return;
				console.error(ev);
				setErr("Websocket error");
			};

			mysock.onclose=(ev)=>{
				if (sock!=mysock) return;
				console.error("socket closed", ev);

				sock=null;
				setSocket(null);
				setErr("Websocket disconnected, reconnecting in 10s");

				tm=setTimeout(()=>{
					console.log("retrying websocket");
					tryOpen();
				}, 10*1000);
			};
		};

		tryOpen();

		return ()=>{
			if (tm!=null) clearTimeout(tm);
			const oldsock = sock;
			sock=null;
			oldsock?.close();
		};
	}, [token]);

	const navBarActive = !["/", "/tour", "/video"].includes(url.path);
	const [navH, setNavH] = useState(0);
	const activeNavH = navBarActive ? navH : null;

	const playerSend = useMemo<Pick<Ctx, "player"|"send">>(()=>({
		player: socket ? socket[1] : null,
		send: socket==null ? null : (msg) => {
			socket[0].send(JSON.stringify(msg));
		}
	}), [socket]);
	
	const ctx = useMemo<Ctx>(()=>({
		setKeyboardTarget, keyboardTarget,
		goto(url) {
			setUrl(url);
		},
		handle(f) {
			f().catch(err=>{
				if (err instanceof Error) setErr(err.message);
				else setErr("Unknown error occurred");
			});
		},
		handleErr: setErr,
		back() {
			if (backs.length==0) {
				setUrl("/");
			} else {
				setUrl(backs[backs.length-1]);
				setBacks(backs.slice(0,backs.length-1));
				oldPath.current=null;
			}
		},
		useMessage(cb) {
			useEffect(()=>{
				if (socket==null) return;
				const evcb = (ev: MessageEvent<string>) => {
					cb(JSON.parse(ev.data) as MessageToClient);
				};
				socket[0].addEventListener("message", evcb);
				return ()=>socket[0].removeEventListener("message",evcb);
			//wtf man
			// eslint-disable-next-line react-hooks/exhaustive-deps
			}, [cb, socket]);
		},
		...playerSend,
		navBarHeight: activeNavH
	}), [keyboardTarget, setUrl, backs, socket, activeNavH, playerSend]);

	const [mineState, setMineState] = useState<MineState>({status: "idle"});
	const [wikiState, setWikiState] = useState<WikiState>({status: "idle"});

	ctx.useMessage(useCallback((msg)=>{
		if (msg.type=="reset") window.open("/", "_self");
		else if (msg.type=="displayMessage") {
			setMsg(msg.message);
		} else if (msg.type=="wiki") {
			setWikiState((old)=>reduceWikiState(old, msg.msg, ctx.player!));
		} else if (msg.type=="mine") {
			setMineState((old)=>reduceMineState(old, msg.msg, ctx.player!, x=>ctx.send!({type: "mine", msg: x})));
		} else if (msg.type=="gameEnd") {
			setMineState({status: "idle"});
			setWikiState({status: "idle"});
		}
	}, [ctx.player, ctx.send]));

	const activeGame = mineState.status!="idle" ? "mines" : wikiState.status!="idle" ? "wikirace" : null;
	useEffect(()=>{
		if (activeGame!=null && url.path!=`/${activeGame}`) {
			setUrl(activeGame);
		}
	}, [activeGame]);

	useEffect(()=>{
		const html = document.querySelector("html")!;
		const cb = ()=>{
			if (document.fullscreenElement!=html && env.VITE_FULLSCREEN=="true" && !env.DEV) {
				console.log("not fullscreen, requesting");
				html.requestFullscreen({navigationUI: "hide"});
			}
		}

		document.addEventListener("click", cb);
		return ()=>{
			document.removeEventListener("click", cb);
		};
	}, []);

	useEffect(()=>{
		if (url.path=="/video") return;

		let tm: number|null=null;
		const interact = ()=>{
			if (tm!=null) clearTimeout(tm);

			tm=setTimeout(()=>{
				ctx.goto("/video");
			}, INACTIVITY_TIMEOUT);
		};

		interact();

		document.addEventListener("pointerdown", interact);
		return ()=>{
			document.removeEventListener("pointerdown", interact);
			if (tm!=null) clearTimeout(tm);
		}
	}, [url,ctx])

	return <Ctx.Provider value={ctx} >
		<div className="min-h-dvh min-w-dvh flex items-center text-neutral-100 font-body text-xl bg-zinc-800 flex-col" >
			{/* sorry */}
			{msg && <AutoModal value={msg} title="Looks like you just got a secret message!" >
				<p>{msg}</p>
			</AutoModal>}
			{err && <AutoModal value={err} z={150} red title="Sorry, an abhorrent event has just transpired" >
				<p>{err}</p>
			</AutoModal>}
			<TokenModal open={needToken} setToken={(t)=>{
				window.localStorage.setItem("token", t);
				setToken(t);
				setNeedToken(false);
			}} />
			<motion.div ref={keyboardDiv} className="fixed bottom-0 left-0 right-0 z-[500]" initial={false}
				style={{zIndex: 200}}
				animate={keyboardTarget ? {y: 0, opacity: 1, scaleY: 1} : {y: 500, scaleY: 0, opacity: 0}} transition={{type: "tween", ease: "easeOut"}}
				key="keyboardDiv" onPointerDown={(ev)=>{
					keyboardTarget?.focus();
					ev.preventDefault();
				}} >
				<Keyboard theme="hg-theme-default dark" inputName="keyboard-input"
					onKeyPress={(key)=>{
						const keyMap: Record<string,string> = {
							"{tab}": "\t",
							"{enter}": "\n",
							"{space}": " "
						};

						if (key=="{shift}" || key=="{lock}") {
							const layoutName = keyboardRef.current!.options.layoutName=="default" ? "shift" : "default";
							keyboardRef.current!.setOptions({ layoutName });
						} else if (key=="{bksp}") {
							document.execCommand("delete", false);
						} else if (key=="{enter}") {
							keyboardTarget?.closest("form")?.requestSubmit(null);
							keyboardTarget?.blur();
							setKeyboardTarget(null);
						} else if (keyboardTarget!=null) {
							document.execCommand("insertText", false, keyMap[key] ?? key); //hehe
						}
					}}
					keyboardRef={(keyboard: SimpleKeyboard)=>keyboardRef.current=keyboard} />
			</motion.div>

			{navBarActive && <NavBar setHeight={setNavH} />}

			<Suspense fallback={
				<div className="h-[60dvh] w-full flex flex-col items-center justify-center gap-2" >
					<Spinner/>
					<b>Loading page</b>
				</div>
			} >
				<Switch>
					<Route path="/" component={Landing} />
					<Route path="/video" component={Video} />
					<Route path="/map" component={LazyMap} />
					<Route path="/directory" component={Directory} />
					<Route path="/tour" component={Tour} />
					<Route path="/lost" component={LostFound} />
					<Route path="/orgs" component={StudentOrgs} />
					<Route path="/info" component={Information} />
					<Route path="/majors" component={LazyMajors} />
					<Route path="/cs" component={LazyCSMajor} />
					<Route path="/ds" component={LazyDSMajor} />
					<Route path="/ai" component={LazyAIMajor} />
					<Route path="/mines" render={()=><LazyMines state={mineState} />} />
					<Route path="/wikirace" render={()=><LazyWiki state={wikiState} />} />
					<Route path={`/:site`} render={({site}: {site: string})=>
						<Site which={site as keyof typeof externalSites} />} />
				</Switch>
			</Suspense>
		</div>
	</Ctx.Provider>;
};

document.addEventListener("DOMContentLoaded", ()=>
	createRoot(document.getElementById('root')!).render(
		<StrictMode><Router>
			<App/>
		</Router></StrictMode>)
);
