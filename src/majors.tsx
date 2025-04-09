import { IconHandClick, IconHelpHexagonFilled, IconHexagonFilled, IconInfoHexagonFilled, IconQuoteFilled } from "@tabler/icons-react";
import { motion, useScroll, MotionValue, useTransform, useMotionValueEvent, useSpring, useMotionValue } from "motion/react";
import { useContext, useEffect, useRef, useState } from "react";
import { Card } from "./main";
import { useQuery } from "crossroad";
import { Ctx  } from "./util";
import { Container, Heading, Title  } from "./ui";
import { twMerge } from "tailwind-merge";
import { easeInOut } from "motion";

type SlideShow = {
	slides: ((t: MotionValue<number>)=>React.ReactNode)[]
};

function SlideShow({show}: {show: SlideShow}) {
	const ref = useRef<HTMLDivElement>(null);
	const container = useRef<HTMLDivElement>(null);
	const scroll = useScroll({target: ref});
	const [index, setIndex] = useState(-1);
	const [query, setQuery] = useQuery();

	useEffect(()=>{
		if (index!=-1) setQuery({slide: index.toString()})
	}, [index]);

	useMotionValueEvent(scroll.scrollYProgress, "change", (v)=>{
		if (index==-1) return;
		setIndex(Math.min(Math.floor(v*show.slides.length), show.slides.length-1));
	});

	const part = 0.8;
	const t = useTransform(()=>scroll.scrollYProgress.get()*show.slides.length-Math.max(0,index));

	const [tops, setTops] = useState<[number,number][]>([]);
	const curTop = useTransform(()=>{
		if (index==-1) return 0;
		if (index+1>=tops.length) return -(t.get()*tops[index][1] + (1-t.get())*tops[index][0]);

		if (t.get()>part) {
			const et = easeInOut((t.get()-part)/(1-part));
			return -(tops[index+1][0]*et + (1-et)*tops[index][1]);
		}

		return -(t.get()*tops[index][1] + (part-t.get())*tops[index][0])/part;
	});

	useEffect(()=>{
		const elem = container.current;
		if (elem==null) return;

		const cb = ()=>{
			const h = 1.05*elem.clientHeight;
			const full = elem.scrollHeight;

			const get = (i: number): [number,number] => {
				const offtop = (elem.children.item(i) as HTMLDivElement).offsetTop;
				const h2 = (elem.children.item(i) as HTMLDivElement).offsetHeight;
				let t0: number,t1: number;

				if (h2>0.8*h) {
					t0=offtop-0.2*h; t1=offtop+h2-0.8*h;
				} else {
					t0=offtop-(h-h2)/2; t1=offtop-(h-h2)/2;
				}

				t0=Math.min(Math.max(t0, 0), full-h);
				t1=Math.min(Math.max(t1,t0), full-h);

				return [t0,t1];
			};

			setTops([...new Array(show.slides.length)].map((_,i)=>get(i)));
		};

		const resize = new ResizeObserver(cb);
		cb();

		const i = Number.parseInt(query.slide);
		let tm: number|null = null;
		if (!isNaN(i) && i>0 && i<show.slides.length) {
			tm = setTimeout(()=>window.scrollTo({top: ref.current!.offsetTop+(ref.current!.offsetHeight - window.innerHeight)*i/(show.slides.length-1), behavior: "instant"}), 10);
			setIndex(i);
		} else {
			setIndex(0);
		}

		resize.observe(elem);
		return ()=>{
			resize.disconnect();
			if (tm) clearTimeout(tm);
		};
	}, []);

	const scrollHintY = useSpring(useTransform(()=>t.get()<0.1 && index==0 ? 0 : 500 as number), {bounce: 0});
	const zero = useMotionValue(0), one = useMotionValue(1);

	const ctx = useContext(Ctx);
	return <div style={{height: `${130*show.slides.length}rem`}} className="w-full relative" ref={ref} >
		<div className="w-full sticky overflow-y-clip" style={{
			height: `${window.innerHeight-(ctx.navBarHeight ?? 0)}px`,
			top: `${ctx.navBarHeight ?? 0}px`
		}} >
			<motion.div className="w-1 bg-boilermakerGold absolute left-0 top-0 h-full z-10" style={{scaleY: scroll.scrollYProgress, transformOrigin: "0 0"}} ></motion.div>
			<motion.div className="absolute left-0 right-0 h-full" ref={container} style={{
				top: curTop
			}} >
				{show.slides.map((f,i)=>
					<motion.div className="min-h-[80dvh] w-full flex flex-col items-stretch justify-stretch" key={i} >
						{f(index<i ? zero : index>i ? one : t)}
					</motion.div>
				)}
			</motion.div>
			<motion.div className="h-80 bg-gradient-to-b from-transparent to-black/50 w-full flex flex-col gap-3 justify-center items-center absolute bottom-0"
				style={{y: scrollHintY}} >
				<b>Scroll down to learn more</b>
				<motion.div animate={{
					rotate: [0,0, -30, 10],
					opacity: [0,1,1,0],
					scale: [0,1,0.8,1.2],
					y: [0,0, -15, -70]
				}} transition={{repeat: Infinity, duration: 2, ease: "easeInOut"}} >
					<IconHandClick size={40} />
				</motion.div>
			</motion.div>
		</div>
	</div>
}

type Point = {type: "heading", title?: React.ReactNode}|{type: "bullet", txt?: React.ReactNode, title?: React.ReactNode}|{type: "qa", q: React.ReactNode, a: React.ReactNode};

function Point(p: Point) {
	return p.type=="heading" ? <Heading big >{p.title}</Heading>
	: p.type=="bullet" ? <>
		<div className="flex flex-row gap-2 items-center" >
			<IconHexagonFilled className="mb-1 fill-steel flex-shrink-0" />
			{p.title ? <b className="font-title text-2xl font-extrabold text-white" >{p.title}</b> : p.txt}
		</div>
		{p.title && p.txt && <div className="indent-3 pl-5 text-xl" >{p.txt}</div>}
	</> : <>
		<div className="flex flex-row gap-2 items-center" >
			<IconHelpHexagonFilled className="mb-1 fill-rush flex-shrink-0" />
			<b className="font-title text-2xl font-extrabold text-white" >{p.q}</b>
		</div>
		<div className="flex flex-row gap-2 items-center text-xl" >
			<IconInfoHexagonFilled className="mb-1 fill-steam flex-shrink-0" />
			<div>{p.a}</div>
		</div>
	</>;
}

function SlidePoint({t,i,n,p}: {t: MotionValue<number>,i: number,n:number,p: Point}) {
	const st = useSpring(useTransform(()=>2.0*t.get()*n-i), {
		duration: 0.5, bounce: 0
	});
	const xt = useTransform(()=>Math.min(0,-100+100*st.get()));

	return <motion.div style={{opacity: st, x: xt}} className="flex flex-col gap-2 bg-zinc-900 px-3 rounded-md pt-2 pb-1" >
		<Point {...p} />
	</motion.div>;
}

function Slide({children, title, t, points, img}: {children?: React.ReactNode, title?: React.ReactNode, t: MotionValue<number>, points?: Point[], img?: string}) {
	const f = useTransform(()=>t.get()*2.0);
	const imgRef = useRef<HTMLImageElement>(null);
	const imgPos = useTransform(()=>{
		if (imgRef.current==null) return "0 0";
		return `0 ${-Math.max(0,imgRef.current.clientHeight - imgRef.current.parentElement!.clientHeight)*t.get()/2}px`;
	});

	return <motion.div className="text-2xl font-bold flex flex-col relative items-center py-12 justify-center flex-1 overflow-hidden" >
		<div className="flex flex-col items-center w-full z-10" >
			<h1 className="font-title font-black text-4xl" >{title}</h1>
			<motion.div className="h-1 bg-aged w-full max-w-[65dvw]" style={{scaleX: t}} ></motion.div>
		</div>
		<div className="flex flex-col mt-12 gap-2 w-full max-w-[65dvh] z-10" >
			{points?.map((x,i)=><SlidePoint n={points?.length??0} i={i} key={i} t={t} p={x} >
			</SlidePoint>)}
		</div>
		<motion.div className="w-full max-w-[65dvh] self-center z-10" style={{opacity: f}} >
			{children}
		</motion.div>
		{img && <motion.img src={img} className="absolute min-h-full min-w-full object-cover w-auto opacity-40 z-0" ref={imgRef}
			style={{objectPosition: imgPos}} />}
	</motion.div>;
}

const qaSlide = [
	{
		type: "qa",
		q: "What courses or experiences are needed?",
		a: "None. We have the Bridge Program available to any students new to coding."
	},
	{
		type: "qa",
		q: "Does Purdue accept AP and/or IB credit?",
		a: "Yes!"
	},
	{
		type: "qa",
		q: "Are minors or double majors possible?",
		a: "Yes!"
	},
	{
		type: "qa",
		q: "What do I need to do to prepare?",
		a: "Be Calculus ready (that's it!)"
	},
	{
		type: "bullet",
		title: "Important Deadlines",
		txt: <><p>November 1st - Priority Deadline!</p><p>May 1st</p></>
	}
] satisfies Point[];

const career = [
	{
		type: "bullet",
		title: "Department Corporate Partner Program",
		txt: "Throughout the year, representatives present Tech Talks and Info Sessions about their company in the Lawson commons."
	},
	{
		type: "bullet",
		title: "Career Fair tailored to the CS majors",
		txt: "The Department of Computer Science Career Fair enables students to connect with Purdue's partners. CS students can also attend the Industrial Roundtable, a three-day job fair that annually attracts over 400 companies and over 16,500 students from Purdue."
	},
	{
		type: "bullet",
		title: "Almost 100% placement by graduation",
		txt: "Around 15% go on to graduate school, while others take jobs across various industries, with graduates finding opportunities nationwide and internationally."
	}
] satisfies Point[];

const extras = [
	{
		type: "bullet",
		title: "Research",
		txt: "Students can seek out research opportunities all across Purdue's campus."
	},
	{
		type: "bullet",
		title: "CS Honors Program",
		txt: "The Department of Computer Science awards honors designation to graduating students if they meet the requirements."
	},
	{
		type: "bullet",
		title: "Hackathons",
		txt: "Take part in Hello World or Boilermake, two of the largest hackathons hosted by Purdue student organizations."
	},
	{
		type: "bullet",
		title: "Clubs & Organizations",
		txt: "Join the 1000+ clubs actively at Purdue through BoilerLink. Several clubs and organizations have their home in the CS Department."
	},
	{
		type: "bullet",
		title: "Learning Communities",
		txt: "The Data Mine is a living, learning and research-based community created to introduce students to data science concepts and equip them to create solutions to real-world problems. In the Corporate Parters cohort, students surmount real-world problems posed by our industry partners."
	},
	{
		type: "bullet",
		title: "Study Abroad",
	},
	{
		type: "bullet",
		title: "Prepare for Graduate School"
	}
] satisfies Point[];

const bridge = [
	{
		type: "bullet",
		title: "New to coding? No problem!",
		txt: "The Bridge Program is designed specifically for incoming Computer Science and Data Science students with little to no programming experience."
	},
	{
		type: "bullet",
		txt: "2-week program that takes place just before the fall semester and BGR."
	},
	{
		type: "bullet",
		txt: "Introduces students to basic computer science and programming concepts in a fun and informal environment."
	},
	{
		type: "bullet",
		txt: "Helps students succeed in their first CS class (CS 180)."
	},
	{
		type: "bullet",
		txt: "Come to campus early, make friends, and build your skills and confidence!"
	}
] satisfies Point[];

const department = [
	{
		type: "heading",
		title: "According to US News, the CS department at Purdue is..."
	},
	{
		type: "bullet",
		title: "#16 Overall Undergraduate",
	},
	{
		type: "bullet",
		title: "#7 Cybersecurity",
	},
	{
		type: "bullet",
		title: "#10 Software Engineering",
	},
	{
		type: "bullet",
		title: "#13 Systems Data Analytics",
	},
	{
		type: "bullet",
		title: "#19 Artificial Intelligence",
	}
] satisfies Point[];

function Quote({className, txt, attr}: {txt: React.ReactNode, attr: React.ReactNode, className?: string}) {
	return <div className={twMerge("flex flex-row gap-2 items-start py-3 px-5 bg-zinc-900 rounded-md justify-center", className)} >
		<IconQuoteFilled size={40} className="fill-boilermakerGold" />
		<div className="flex flex-col gap-1" >
			<p>{txt}</p>
			<i className="text-sm font-title font-bold" >{attr}</i>
		</div>
	</div>;
}

export function CSMajor() {
	return <Container >
		<Title text="The Computer Science Major" variant="med" ></Title>

		<Quote txt="Computer Science is no more about computers than astronomy is about telescopes." attr="- Edsger Dijkstra" className="my-3" />

		<Heading>What is Computer Science?</Heading>
		<p>Computer Science involves design and innovation developed from computing principles.</p>

		<b>You will learn to:</b>
		<Point type="bullet" txt="Understand the theoretical foundations of computing" />
		<Point type="bullet" txt="Choose among possible approaches and solutions and assess tradeoffs" />
		<Point type="bullet" txt="Design, build, and test software to solve problems" />
		<Point type="bullet" txt="Analyze the behavior, performance, correctness, and security of new software" />

		<p>You will be prepared to work in a broad range of positions involving tasks from theoretical work to software development.</p>

		<Heading>Degree Requirements</Heading>

		<p>Solve challenging problems and create software systems that impact society, business, government, and more.</p>
		<p>6 Core Courses focus on the foundations and principles of coding and software development.</p>
		<b>Choose at least one of the 9 tracks to complete your degree:</b>

		<Point type="bullet" txt="Computational Science and Engineering" />
		<Point type="bullet" txt="Computer Graphics and Visualization" />
		<Point type="bullet" txt="Database and Information Systems" />
		<Point type="bullet" txt="Algorithmic Foundations" />
		<Point type="bullet" txt="Machine Intelligence" />
		<Point type="bullet" txt="Programming Languages" />
		<Point type="bullet" txt="Security" />
		<Point type="bullet" txt="Software Engineering" />
		<Point type="bullet" txt="Systems Software" />
	</Container>;
}

export function AIMajor() {
	return <Container>
		<Title variant="med" text="Artificial Intelligence Major" ></Title>

		<Heading>What is AI?</Heading>
		<Point type="bullet" txt="Understand the foundations and tools used in building artificial intelligence systems, which reason about data, correct themselves, and make decisions." />
		<Point type="bullet" txt="Explore the link between cognitive psychology, neuroscience, and AI." />
		<Point type="bullet" txt="Grapple with the ethical challenges of data bias, privacy preservation, and human-computer interaction." />
		<Point type="bullet" txt="Learn problem-solving strategies, heuristic searching, representations of knowledge and uncertainty, game playing, computer vision, natural language processing, and expert systems." />
		
		<Heading>Degree Requirements:</Heading>
		<Point type="bullet" txt="Java and Python programming" />
		<Point type="bullet" txt="Data Structures and Algorithms" />
		<Point type="bullet" txt="AI and Machine Learning Core Courses" />
		<Point type="bullet" txt="Probability" />
		<Point type="bullet" txt="Statistical Methods" />
		<Point type="bullet" txt="Ethics of Design, Ethics of Data Science" />
		<Point type="bullet" txt="Philosophy of Science and Technology" />
		<Point type="bullet" txt="Data Mining and Machine Learning" />
		<Point type="bullet" txt="Artificial Intelligence electives" />
		<Point type="bullet" txt="Human Science electives" />
		
		<b>Not to confuse you - There is another similar major at Purdue - a Bachelor of Arts in AI offered by the Philosophy Department. The CS Department offers a Bachelor of Science.</b>
	</Container>;
}

export function DSMajor() {
	return <Container>
		<Title variant="med" text="Data Science Major" ></Title>

		<Heading>What is Data Science?</Heading>

		<p>Data is being generated continuously, from a farmer's combine, to a patient's electronic medical records, to Google searches, to the grocery checkout line. Utilizing technical knowledge and statistical abilities, data scientists act on datasets so large they are not practically observable by humans to</p>
		<Point type="bullet" txt="Analyze, manipulate, and act on emerging data" />
		<Point type="bullet" txt="Communicate their findings to the world" />

		<b>As a data science student, you will</b>
		<Point type="bullet" txt="Learn key computational methods and statistical techniques" />
		<Point type="bullet" txt="Develop the deep analytical thinking skills needed to reason reliably, intelligently, and creatively from data" />

		<p>You will be prepared to work in an application discipline, driving forward novel changes and innovations for a business or scientific discipline.</p>

		<Heading>Degree Requirements</Heading>

		<b>Required courses cover these foundational skills:</b>

		<Point type="bullet" txt="Java and Python Programming" />
		<Point type="bullet" txt="Data Structures & Algorithms" />
		<Point type="bullet" txt="Data Mining and Machine Learning" />
		<Point type="bullet" txt="Data Analytics" />
		<Point type="bullet" txt="Probability" />
		<Point type="bullet" txt="Statistical Theory" />
		<Point type="bullet" txt="Large Scale Data Analytics" />

		<p><b>Computer Science, Statistics, and Ethics electives allow students to customize their major to personal interests.</b> In your journey as a data scientist, you will use tools like <b>R, Python, Java, Hadoop, MapReduce, SQL Databases, Cloud Computing</b> and you may complete a <b>Capstone Senior Project</b>.</p>
	</Container>;
}

export default function Majors() {
	return <SlideShow show={{slides: [
		(t)=><Slide title="Prerequisites and possibilities" t={t} points={qaSlide} img="/mall.jpg" ></Slide>,
		(t)=><Slide title="Internships and Beyond" points={career} t={t} img="/pluggingin.jpg" ></Slide>,
		(t)=><Slide title="Extracurriculars" points={extras} t={t} img="/industrialroundtable.jpeg" ></Slide>,
		(t)=><Slide title="The Bridge Program" points={bridge} t={t} img="/bridge.jpeg" ></Slide>,
		(t)=><Slide title="Our Department" points={department} t={t} img="/lawson.JPG" ></Slide>,
		(t)=><Slide title="Our Majors" points={[
			{type: "bullet", txt: "Our 3 majors propel students to succeed in all varieties of computing."}
		]} t={t} img="/3rdst.jpg" >
			<div className="grid grid-rows-[auto_auto] grid-flow-col gap-x-6 -mx-12 mt-8 grid-cols-3 text-xl text-center gap-y-3" >
				<b>The most popular major at Purdue</b>
				<Card href="/cs" bgImg="/coding.jpg" >Computer Science</Card>
				<b>Our newest major</b>
				<Card href="/ai" bgImg="/ai.jpg" >Artificial Intelligence</Card>
				<b>Our fastest-growing major</b>
				<Card href="/ds" bgImg="/matrixbg.jpeg" >Data Science</Card>
			</div>
		</Slide>,
	]}} >
	</SlideShow>;
}