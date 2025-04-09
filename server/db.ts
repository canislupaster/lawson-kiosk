import {Migrator, Kysely, MigrationProvider, Migration, GeneratedAlways} from "kysely";
import {DenoSqlite3Dialect} from "@soapbox/kysely-deno-sqlite";
import { Database as Sqlite } from "@db/sqlite";
import { TimeRecord } from "../src/server.d.ts";

type TimeTable = {
	id: GeneratedAlways<number>,
	seconds: number,
	size: string,
	name: string|null
};

type Database = { time: TimeTable };

const db = new Kysely<Database>({
	dialect: new DenoSqlite3Dialect({
		database: new Sqlite("./db.sqlite")
	})
});

const migrator = new Migrator({
	db,
	provider: {
		getMigrations() {
			return Promise.resolve({
				"1_init": {
					async up(db) {
						await db.schema.createTable("time")
							.addColumn("id", "integer", x=>x.primaryKey().notNull())
							.addColumn("seconds", "integer", x=>x.notNull())
							.addColumn("name", "text")
							.addColumn("size", "text", x=>x.notNull())
							.execute();
					},
					async down(db) {
						await db.schema.dropTable("time").execute();
					}
				} satisfies Migration
			});
		}
	} satisfies MigrationProvider
})

console.log("migrating database...");
await migrator.migrateToLatest()
console.log("database ready");

export async function getTimeIdx(sec: number, size: TimeRecord["size"]): Promise<number> {
	return (await db.selectFrom("time")
		.select(({fn})=>[fn.countAll<number>().as("count")])
		.where("size", "=", size.join("x"))
		.where("seconds", "<", sec)
		.executeTakeFirstOrThrow()).count;
}

export async function setTimeName(id: number, name: string) {
	return (await db.updateTable("time").where("id", "=", id).set({name})
		.executeTakeFirstOrThrow()).numUpdatedRows>0;
}

export async function addTime(time: TimeRecord): Promise<number> {
	const sizeStr = time.size.join("x");

	return await db.transaction().execute(async trx=>{
		return (await trx.insertInto("time").values({
			seconds: time.seconds,
			size: sizeStr,
			name: time.name
		}).returning("id").executeTakeFirstOrThrow()).id;
	});
}

export const TIME_PAGE_LIMIT=25;

export async function getTimes(size: TimeRecord["size"]|null, page: number): Promise<{
	npage: number, times: TimeRecord[], offset: number
}> {
	const count = (await db.selectFrom("time").select(({fn})=>fn.countAll<number>().as("count")).executeTakeFirstOrThrow()).count;

	let q=db.selectFrom("time").limit(TIME_PAGE_LIMIT).offset(TIME_PAGE_LIMIT*page).orderBy("seconds asc");
	if (size) q=q.where("size", "=", size.join("x"));
	
	return {
		times: (await q.selectAll().execute()).map(x=>({
			name: x.name, seconds: x.seconds,
			size: x.size.split("x").map(y=>Number.parseInt(y)) as [number,number,number]
		}) satisfies TimeRecord),
		npage: Math.ceil(count/TIME_PAGE_LIMIT),
		offset: TIME_PAGE_LIMIT*page
	};
}