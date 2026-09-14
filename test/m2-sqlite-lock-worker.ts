import { DatabaseSync } from "node:sqlite";

const [filename, holdMillisecondsText] = process.argv.slice(2);
if (filename === undefined || holdMillisecondsText === undefined) throw new Error("filename and hold duration are required");
const holdMilliseconds = Number(holdMillisecondsText);
const database = new DatabaseSync(filename, { timeout: 5_000 });
database.exec("PRAGMA foreign_keys = ON; BEGIN IMMEDIATE");
process.stdout.write("LOCKED\n");
setTimeout(() => {
  database.exec("COMMIT");
  database.close();
}, holdMilliseconds);
