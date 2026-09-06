import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Run } from "./types.ts";
function db() {
  const dir = process.env.REHEARSAL_DATA_DIR || join(process.cwd(), ".rehearsal");
  mkdirSync(dir, { recursive: true });
  const database = new DatabaseSync(join(dir, "runs.sqlite"));
  database.exec(
    "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, started TEXT NOT NULL, body TEXT NOT NULL)",
  );
  const columns = database.prepare("PRAGMA table_info(runs)").all();
  if (!columns.some(column => column.name === "workspace")) {
    database.exec("ALTER TABLE runs ADD COLUMN workspace TEXT NOT NULL DEFAULT 'local'");
  }
  database.exec("CREATE INDEX IF NOT EXISTS runs_workspace_started ON runs(workspace, started DESC)");
  return database;
}
export function saveRun(run: Run, workspace = "local") {
  const d = db();
  try {
    d.prepare("INSERT INTO runs (id,started,body,workspace) VALUES (?,?,?,?)").run(
      run.id,
      run.startedAt,
      JSON.stringify(run),
      workspace,
    );
  } finally {
    d.close();
  }
}
export function listRuns(workspace = "local"): Run[] {
  const d = db();
  try {
    return d
      .prepare("SELECT body FROM runs WHERE workspace = ? ORDER BY started DESC LIMIT 100")
      .all(workspace)
      .map((r) => JSON.parse(r.body as string));
  } finally {
    d.close();
  }
}
