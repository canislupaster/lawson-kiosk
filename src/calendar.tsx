import FullCalendar from "@fullcalendar/react";
import { useContext, useEffect, useMemo, useState } from "react";
import dayGridPlugin from '@fullcalendar/daygrid';
import { AutoModal, Button, Container, Heading, Spinner, Title } from "./ui";
import { Ctx, env } from "./util";
import { IconCalendar, IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import clsx from "clsx";
import { motion } from "motion/react";
import DOMPurify from "dompurify";

type EventDateTime = { date: string; } | { dateTime: string; timeZone: string; };

type CalendarEvent = {
  kind: string;
  etag: string;
  id: string;
  status: string;
  htmlLink: string;
  created: string;
  updated: string;
  summary: string;
  description?: string;
  location?: string;
  creator: {
    email: string;
  };
  organizer: {
    email: string;
    displayName?: string;
    self: boolean;
  };
  start: EventDateTime;
  end: EventDateTime;
  iCalUID: string;
  sequence: number;
  eventType: string;
};

type CalendarEvents = {
  kind: string;
  summary: string;
  description: string;
  updated: string;
  timeZone: string;
  accessRole: string;
  items: CalendarEvent[];
};

type CalendarView = {type: "month", start: Date} | {type: "week", start: Date} | {type: "upcoming"};
type Organizer = "Student Orgs"|"Corporate"|"Departmental"|"Colloquia";
const organizerUrl: [Organizer,string][] = [
	["Student Orgs", "scb3djhueh9j0dlhaa9i153l3g%40group.calendar.google.com"],
	["Corporate", "7sehoe8o6e82k0ni0qee9ofojk%40group.calendar.google.com"],
	["Departmental", "256h9v68bnbnponkp0upmfq07s%40group.calendar.google.com"],
	["Colloquia", "t3gdpe5uft0cbfsq9bipl7ofq0%40group.calendar.google.com"]
];

const organizerBg: Record<Organizer,string> = {
	"Student Orgs": "bg-green-600 hover:bg-green-700",
	"Corporate": "bg-rose-600 hover:bg-rose-700",
	"Departmental": "bg-gray-600 hover:bg-gray-700",
	"Colloquia": "bg-orange-600 hover:bg-orange-700",
	// "Other": "bg-sky-400 hover:bg-sky-500"
};

const getTime = (x: Date) => {
	const hr = x.getHours();
	const twelvehr = (hr+11)%12 + 1;
	const ampm = hr<12 ? "a" : "p";
	return x.getMinutes()==0 ? `${twelvehr}${ampm}` : `${twelvehr}:${x.getMinutes().toString().padStart(2,"0")}${ampm}`
};

const getDate = (x: Date) => `${x.getMonth()+1}/${x.getDate().toString().padStart(2,"0")}`;

const conv = (x: EventDateTime): string => "date" in x ? getDate(new Date(x.date)) : getTime(new Date(x.dateTime));

function Calendar({view, openEvent}: {view: CalendarView, openEvent: (evt: CalendarEvent&{org: Organizer})=>void}) {
	const [evts, setEvts] = useState<(CalendarEvents["items"][0]&{org: Organizer})[]|null>(null);
	const ctx = useContext(Ctx);

	useEffect(()=>{
		ctx.handle(async ()=>{
			setEvts(null);

			const start = view.type=="upcoming" ? new Date() : view.start;
			const end = view.type=="upcoming" ? null : view.type=="month" ? new Date(start.getFullYear(), start.getMonth()+1, 1) : new Date(start.getFullYear(), start.getMonth(), start.getDate()+7-start.getDay());

			const evts = (await Promise.all(organizerUrl.map(async ([org, url]) => {
				const u = new URL(`https://content.googleapis.com/calendar/v3/calendars/${url}/events`);

				const params: Record<string,string> = {
					orderBy: "startTime",
					showDeleted: "false",
					singleEvents: "true",
					timeMin: start.toISOString(),
					key: env.VITE_CALENDAR_API_KEY
				};

				if (end) params.timeMax = end.toISOString();
				u.search = new URLSearchParams(params).toString();

				return (await (await fetch(u)).json() as CalendarEvents).items.map(it=>({...it, org}));
			}))).flat();

			setEvts(evts);
		});
	}, [view]);

	const evtsById = new Map(evts?.map(ev=>[ev.id, ev]) ?? []);

	return evts==null ? <div className="flex flex-col items-center h-dvh" >
			<Spinner/>
		</div>
		: view.type=="upcoming" ? <div className="flex flex-col items-start gap-2" >
		
		{evts
			.map(evt=>({...evt,
				startE: "dateTime" in evt.start ? Date.parse(evt.start.dateTime) : Date.parse(evt.start.date)
			}))
			.toSorted((a,b)=>a.startE-b.startE)
			.map(ev=><motion.div key={ev.id} className="flex flex-row flex-wrap gap-x-2 items-center gap-1 w-full p-3 bg-zinc-900/50 rounded-md cursor-pointer" onClick={()=>openEvent(ev)}
				initial={{x: -50, opacity: 0}}
				whileInView={{x: 0, opacity: 1}}
				whileTap={{scale: 1.05, skewY: -10, rotate: 10}} >
				<h1 className="font-bold w-full" >{ev.summary}</h1>
				<p className="text-sm" ><span className={clsx("inline-block h-3 w-3 align-baseline mr-1 rounded-full", organizerBg[ev.org])} ></span> {ev.org}</p>
				<div className="h-4 w-px bg-gray-500" />
				<p className="text-sm" >{conv(ev.start)} - {conv(ev.end)}{"dateTime" in ev.start && ` on ${getDate(new Date(ev.start.dateTime))}/${new Date(ev.start.dateTime).getFullYear()}`}</p>
			</motion.div>)}

	</div> : <FullCalendar plugins={[ dayGridPlugin ]}
		key={`${view.type}${view.start}`}
		initialView={view.type=="month" ? "dayGridMonth" : "dayGridWeek"}
		initialDate={view.start}
		navLinks={false} headerToolbar={false}
		viewClassNames="bg-black/30"
		height="auto"
		dayHeaderClassNames="bg-zinc-900 [&.fc-day-today]:bg-yellow-800"
		dayCellClassNames="!border-gray-500 [&.fc-daygrid-day.fc-day-today]:bg-yellow-700/40"
		eventClick={(ev) => openEvent(evtsById.get(ev.event.id)!)}
		eventClassNames="rounded-md"
		eventContent={(evt) => {
			const ev = evtsById.get(evt.event.id);
			if (!ev) return <></>;

			return <div className={clsx("whitespace-normal flex flex-col gap-0.5 px-1 p-1 overflow-hidden rounded-md cursor-pointer", organizerBg[ev.org])} >
				<b className="text-lg max-h-20 overflow-hidden" >{ev.summary}</b>
				<i className="text-sm text-gray-300" >{conv(ev.start)} - {conv(ev.end)}</i>
			</div>
		}}
		events={evts.map(x=>({
			id: x.id,
			title: x.summary,
			start: "date" in x.start ? x.start.date : x.start.dateTime,
			end: "date" in x.end ? x.end.date : x.end.dateTime,
			allDay: "date" in x.start,
			interactive: true
		}))} >
	</FullCalendar>;
}

export function CalendarApp() {
	const [view, setView] = useState<CalendarView>({type: "upcoming"});
	const curStart = view.type=="upcoming" ? new Date() : view.start;
	const [open, setOpen] = useState<CalendarEvent&{org: Organizer}|null>(null);

	const shift = (add: boolean) => {
		if (view.type=="month") setView({
			type: "month", start: new Date(curStart.getFullYear(), curStart.getMonth() + (add ? 1 : -1), 1)
		});
		else if (view.type=="week") setView({
			type: "week", start: new Date(curStart.getFullYear(), curStart.getMonth(), curStart.getDate()-curStart.getDay() + (add ? 7 : -7))
		});
	};

	const sanitized = useMemo(()=>
		open?.description && DOMPurify.sanitize(open.description, {
			ALLOWED_URI_REGEXP: /^$/
		}), [open?.description]);

	return <Container className="max-w-[85dvw]" >
		<div className="flex flex-col items-stretch w-full gap-4 -mt-20 z-20 pb-10" >
			<div className="bg-zinc-800 p-4 self-start pl-16 -ml-16 rounded-full" >
				<Title variant="med" text="Events" ></Title>
			</div>

			{open!=null && <AutoModal value={open} title={open.summary} className="gap-1" >
				{sanitized && <p className="text-base" dangerouslySetInnerHTML={{__html: sanitized}} />}

				<b>{conv(open.start)} - {conv(open.end)}{"dateTime" in open.start && ` on ${getDate(new Date(open.start.dateTime))}/${new Date(open.start.dateTime).getFullYear()}`}{open.location && ` in ${open.location}`}</b>
				<p className="text-sm" ><span className={clsx("inline-block h-3 w-3 align-baseline mr-1 rounded-full", organizerBg[open.org])} ></span> {open.org}</p>
			</AutoModal>}

			<div className="flex flex-row gap-2 justify-between items-center" >
				{view.type!="upcoming" && <div className="flex flex-row gap-2" >
					<Button noUnderline onClick={()=>shift(false)} > <IconChevronLeft/> </Button>
					<Button noUnderline onClick={()=>{
						const now = new Date();
						if (view.type=="month") setView({type: "month", start: new Date(now.getFullYear(), now.getMonth(), 1)});
						else setView({type: "week", start: new Date(now.getFullYear(), now.getMonth(), now.getDate()-now.getDay())});
					}} > <IconCalendar/> </Button>
					<Button noUnderline onClick={()=>shift(true)} > <IconChevronRight/> </Button>
				</div>}

				<Heading>
					{view.type=="month" ? curStart.toLocaleString("en-us", {month: "long"})
						: view.type=="week" ? `${curStart.toLocaleDateString()} - ${new Date(
							curStart.getFullYear(), curStart.getMonth(), curStart.getDate()+6-curStart.getDay()
						).toLocaleDateString()}`
						: "Upcoming events"}
				</Heading>

				<div className="flex flex-row gap-2" >
					<Button onClick={()=>setView({
						type: "month", start: new Date(curStart.getFullYear(), curStart.getMonth(), 1)
					})} >Month</Button>
					<Button onClick={()=>setView({
						type: "week",
						start: new Date(curStart.getFullYear(), curStart.getMonth(), Math.max(1,curStart.getDate() - curStart.getDay()))
					})} >Week</Button>
					<Button onClick={()=>setView({type: "upcoming"})} >Upcoming</Button>
				</div>
			</div>

			<Calendar view={view} openEvent={setOpen} />
		</div>
	</Container>;
}