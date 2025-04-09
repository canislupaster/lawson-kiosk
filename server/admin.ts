import Enquirer from "enquirer";
import { AdminCommand, AdminResponse } from "./main.ts";
import process, { exit } from "node:process";
const enquirer = new Enquirer();

const addr = Deno.args[0] ?? `http://localhost:${process.env["PORT"] ?? "8000"}`
console.log(`using address ${addr}`);

async function ask(x: AdminCommand) {
	console.log("sending request...");
	const res = await (await fetch(new URL("/admin", addr), {
		method: "POST",
		headers: {
			"Authorization": `Basic ${process.env["ADMIN_PASSWORD"]}`
		},
		body: JSON.stringify(x)
	})).json() as AdminResponse;

	if (res.type=="error") console.error(res.message ?? "Unknown error occurred. Check server logs");
	else if (res.type=="status") {
		console.log(`Status:\n\tPlayers connected: ${res.players.length==0 ? "(none)" : res.players.join(", ")}`
			+ `\n\tActive game: ${res.game==null ? "(none)" : `${res.game.type=="mine" ? "Minesweeper" : "Wikirace"}, started ${new Date(res.game.start).toLocaleString()}`}\n`)
	}
	else console.log("Response ok.");
}

const inputLoop = ()=>(async () => {
	const cmd = await enquirer.prompt({
		type: "select", name: "command",
		choices: ["reset", "send", "status", "exit"],
		message: "enter a command"
	}) as {command: string};

	if (cmd.command=="reset") {
		console.log("resetting...");
		ask({type: "reset"});
	} else if (cmd.command=="send") {
		const msg = await enquirer.prompt({type: "input", name: "text", message: "enter message"}) as {text: string};
		msg.text=msg.text.trim();
		if (!msg.text) {
			console.error("clearing message");
			ask({type: "message", msg: null});
		} else {
			console.log(`sending ${msg.text}`);
			ask({type: "message", msg: msg.text});
		}
	} else if (cmd.command=="status") {
		ask({type: "status"});
	} else if (cmd.command=="exit") {
		console.log("exiting...");
		exit(0);
	} else {
		console.error("unrecognized command");
	}
})().finally(inputLoop);

if (Deno.stdin.isTerminal()) {
	console.log("starting input loop");
	inputLoop();
} else {
	console.warn("not tty, no terminal for you!");
}