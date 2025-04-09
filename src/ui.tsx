import { IconLoader2, IconX } from "@tabler/icons-react";
import clsx from "clsx";
import { HTMLMotionProps, motion } from "motion/react";
import { twMerge } from "tailwind-merge";
import React, { FocusEvent, PointerEvent, useContext, useEffect, useState } from "react";
import { Ctx, wonStatus } from "./util";

export function Typewriter({text, cursor, delay, speed}: {
  text: string, cursor?: boolean,
  delay?: number, speed?: number
}) {
  const [cur, setCur] = useState("");
  useEffect(()=>{
    if (text==cur) return;

    let common=0;
    for (; common<cur.length; common++) {
      if (common>=text.length || text[common]!=cur[common]) break;
    }

    const tm = setTimeout(() => {
      if (cur.length>common) setCur(cur.slice(0,cur.length-1));
      else setCur(text.slice(0, common+1));
    }, Math.max(1, cur.length==0 ? (delay ?? 100) : 100*cur.length/(text.length+cur.length)/(speed ?? 1)));

    return ()=>clearTimeout(tm);
  }, [text, cur, delay, speed]);

  return <>
    {cur}
    {cursor && <motion.span className="text-dust"
      animate={{opacity: text==cur ? 0 : 1}} layout transition={{duration: 0.1}} >|</motion.span>}
  </>;
}

export function Slashed({children, className}: {children?: React.ReactNode, className?: string}) {
  return <div className={twMerge("relative flex", className)} >
    <motion.div initial={{x: -50, opacity: 0, skewX: -40}} animate={{x: 0, opacity: 1, skewX: -20}} transition={{type: "tween", ease: "circInOut", duration: 1}} className="absolute top-0 bottom-0 -left-10 flex flex-row gap-4" >
      <div className="bg-rush w-4 h-full" />
      <div className="bg-rush w-4 h-full" />
    </motion.div>
    {children}
  </div>
}

export function Input({...props}: JSX.IntrinsicElements["input"]) {
  const ctx = useContext(Ctx);

  const start = (ev: FocusEvent<HTMLInputElement>|PointerEvent<HTMLInputElement>)=>{
    ctx.setKeyboardTarget(ev.target as HTMLElement);
  };

  const end = (ev: FocusEvent|PointerEvent)=>{
    if (ev.target==ctx.keyboardTarget) ctx.setKeyboardTarget(null);
  };

  return <input {...props} onPointerCancel={end} onPointerDown={start} onFocus={start} onBlur={end}
    className="bg-zinc-900 border-none outline outline-field focus:outline-rush focus:outline-4 outline-2 rounded-lg mx-3 p-1 px-2 pb-0" />;
};

export const Highlighted = ({children, className, ...props}: HTMLMotionProps<"span">&{children?: React.ReactNode}) =>
  <motion.span className={twMerge(
    "relative inline-block text-field group font-extrabold px-2 py-1", className
  )} whileInView={{
    scale: 1.1, transition: {duration: 0.5}
  }} {...props} >
    {children}
    <motion.span whileInView={{width: "100%"}} initial={{width: 0}} className="left-0 mx-auto right-0 bg-black top-0 bottom-1 absolute -z-10" />
  </motion.span>

export function Anchor({className, children, onClick, href, noUnderline, ...props}: {
  href?: string, noUnderline?: boolean, children?: React.ReactNode
}&HTMLMotionProps<"div">) {
  const ctx = useContext(Ctx);

  return <motion.div className={twMerge("relative inline-block text-white group font-bold cursor-pointer", className)} onClick={(ev)=>{
    if (href) ctx.goto(href);
    onClick?.(ev);
  }} {...props}
		whileTap="active"
		variants={{active: {scale: 1.1, transition: {duration: 0.1}}}} >
    {children}
    {!noUnderline && <motion.div
			initial={{width: 0}} whileInView={{width: "70%"}} variants={{
				active: {width: "90%", transition: {duration: 0.1}}
			}}
			className="transition-all h-1 absolute -bottom-1 group-hover:-bottom-1.5 group-hover:h-2 left-0 mx-auto right-0 bg-field group-hover:bg-rush" ></motion.div>}
  </motion.div>;
}

export function SmallButton({className, children, onClick, href, ...props}: {
  href?: string, children?: React.ReactNode
}&JSX.IntrinsicElements["button"]) {
  const ctx = useContext(Ctx);

  return <button className={twMerge("relative bg-steel text-white focus:text-black p-1 font-title font-extrabold text-xl transition-all focus:bg-black group", className)} onClick={(ev)=>{
    if (href) ctx.goto(href);
    onClick?.(ev);
  }} {...props} >
    <div className="absolute left-0 duration-300 transition-all top-0 bottom-0 right-0 origin-left bg-field group-focus:scale-x-100 scale-x-0" ></div>
    <div className="relative top-0 left-0 bottom-0 right-0 z-10" >
      {children}
    </div>
  </button>;
}

export function Button({className, children, onClick, href, noUnderline, ...props}: {
  href?: string, noUnderline?: boolean, children?: React.ReactNode
}&HTMLMotionProps<"button">) {
  const ctx = useContext(Ctx);

  return <motion.button className={twMerge("relative bg-steel rounded-md text-white p-2 font-title font-extrabold text-2xl outline outline-field transition-all hover:border-rush hover:outline-2 hover:bg-black group", className)} onClick={(ev)=>{
    if (href) ctx.goto(href);
    onClick?.(ev);
  }} {...props}
		whileTap="active"
		variants={{active: {scale: 1.1, transition: {duration: 0.1}}}} >
    {children}
    {!noUnderline && <motion.div
			initial={{width: "0px"}} whileInView={{width: "70%"}} variants={{
				active: {width: "90%", transition: {duration: 0.1}}
			}}
			className="transition-all group-hover:h-2 h-1 absolute bottom-2 group-hover:bottom-1 left-0 mx-auto right-0 bg-field group-hover:bg-rush" ></motion.div>}
  </motion.button>;
}

export const Title = ({text, variant}: {text: string, variant: "big"|"med"}) => <Slashed>
  <h1 className={clsx("z-10 font-title font-black text-white", variant=="big" ? "text-9xl -mb-5" : "text-5xl -mb-2")} >
    <Typewriter text={text} cursor />
  </h1>
</Slashed>;

export const Spinner = () => <IconLoader2 size={60} className="animate-spin m-2" />;
export const Container = ({className, children, ...props}: JSX.IntrinsicElements["div"]) => <div className={twMerge("flex flex-col items-start max-w-screen-md w-full gap-4 h-full max-h-[70%] justify-start py-5 mt-8", className)} {...props} >
	{children}
</div>;

export function Modal({children, title, red, close, open, className, z}: {
	title?: React.ReactNode, children?: React.ReactNode,
  red?: boolean, close?: ()=>void, open?: boolean,
  className?: string, z?: number
}) {
  return <motion.div className="fixed top-0 bottom-0 right-0 left-0 flex-col items-center justify-center hidden"
    style={{zIndex: z ?? 100}} animate={{display: open ? "flex" : "none"}} >
    <motion.div className="z-[200] max-w-screen-md max-h-[90dvh] relative"
      initial={{y: 100}} animate={{y:open ? 0 : -500}} transition={{ease: "easeInOut"}} >
      {close && <Button className="absolute -right-8 -top-4" onClick={close} noUnderline ><IconX/></Button>}
      <div className={twMerge(clsx("p-4 rounded-md flex flex-col border items-start gap-3 w-full h-full overflow-y-scroll", close && "pr-6 pt-4", red ? "bg-red-900 border-red-400" : "bg-zinc-800 border-boilermakerGold"), className)} >
        {title && <Heading>{title}</Heading>}
        {children}
      </div>
    </motion.div>
    <motion.div className="z-0 fixed top-0 bottom-0 right-0 left-0 bg-black/60"
      initial={{opacity: 0}} animate={{opacity: open ? 1 : 0}} onClick={close} />
  </motion.div>;
}

export function AutoModal({close, value, children, ...props}: React.ComponentProps<typeof Modal>&{value?: unknown}) {
  const [open, setOpen] = useState(false);
  useEffect(()=>setOpen(true), [value]);

  return <Modal {...props} close={()=>{
    close?.();
    setOpen(false);
  }} open={open&&(props.open!=false)} >
    {children}
  </Modal>;
}

export const Heading = ({className, children, big, ...props}: JSX.IntrinsicElements["h1"]&{big?: boolean}) =>
  <h1 className={twMerge(clsx("font-title font-black", big ? "text-3xl" : "text-2xl"),className)} {...props} >{children}</h1>;

export function WinModal({won, open, close, why, children}: {
  won:boolean|null, why?: string, open?: boolean, close: ()=>void, children?: React.ReactNode
}) {
  return <Modal close={close} open={open} >
    {won==false && <motion.div className="fixed bg-red-500 top-0 bottom-0 left-0 right-0"
      initial={{opacity: 1}} animate={{opacity: 0, display: "none"}} transition={{duration: 0.6}} ></motion.div>}
    <img className="w-20 h-auto absolute -top-9 left-1/2 -translate-x-1/2"
      src={won==null ? "/handshake.svg" : won ? "/crown.svg" : "/skull.svg"} />
    <Heading big className="mt-11" >{wonStatus(won)}</Heading>
    <p>{why && `${why[0].toUpperCase()}${why.slice(1)}.`}</p>

    {children}
  </Modal>
}
