import { createContext, useEffect, useState } from "react";
import { MessageToClient, MessageToServer, Player } from "./server";

export type Ctx = {
  keyboardTarget: HTMLElement|null,
  setKeyboardTarget: (x: HTMLElement|null)=>void,
  goto: (url: string)=>void,
  handleErr: (err: string)=>void,
  handle: (f: ()=>Promise<void>)=>void,
  back: ()=>void,
  player: Player|null,
  useMessage: (cb: ((x: MessageToClient)=>void))=>void,
  send: ((msg: MessageToServer)=>void)|null,
  navBarHeight: number|null
};

export const Ctx = createContext<Ctx>("uninitialized context" as unknown as Ctx);

export const simp = (x: string) => x.toLowerCase().replace(/[^a-z0-9\n]/g, "");

export function useTimeUntil(when: number|string|Date|null, after: boolean) {
	const [until, setUntil] = useState<number|null>();
	useEffect(() => {
		if (when==null) {
			setUntil(null);
			return;
		}

		const d = new Date(when).getTime();
		let curTimeout: number|null = null;
		const cb = () => {
			const x = after ? Date.now()-d : d-Date.now();
			if (x<0) {
				if (after) curTimeout = setTimeout(cb, -x);
				setUntil(null);
			} else {
				setUntil(after ? Math.floor(x/1000) : Math.ceil(x/1000));
				curTimeout = setTimeout(cb, 1000-x%1000);
			}
		};

		cb();
		return () => {if (curTimeout!=null) clearTimeout(curTimeout);};
	}, [when, after]);

	return until;
}

export const wonStatus = (won: boolean|null) => won==null ? "It was a tie." : won ? "You won!" : "You lost :(";

export const env = (import.meta as unknown as {env: {
	VITE_MAPS_API_KEY: string,
	VITE_CALENDAR_API_KEY: string,
  VITE_FULLSCREEN?: string,
  DEV: boolean
}}).env;

export const INACTIVITY_TIMEOUT = 60*1000*3;