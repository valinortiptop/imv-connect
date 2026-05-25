#!/usr/bin/env bun
/**
 * Apply a SQL file (or all pending migrations) to Supabase via the Management API.
 *
 * Usage:
 *   bun scripts/db-apply.ts db/migrations/0009_modulo_9_roles.sql
 *   bun scripts/db-apply.ts --all     # runs every db/migrations/*.sql in order
 *
 * Env required:
 *   IMV_SUPABASE_PROJECT_REF    Project ref (e.g. abcd1234efgh)
 *   IMV_SUPABASE_ACCESS_TOKEN   Personal Access Token (sbp_...)
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve, basename } from "node:path";

const REF = process.env.IMV_SUPABASE_PROJECT_REF;
const TOKEN = process.env.IMV_SUPABASE_ACCESS_TOKEN;

if (!REF || !TOKEN) {
  console.error("Missing IMV_SUPABASE_PROJECT_REF or IMV_SUPABASE_ACCESS_TOKEN");
  process.exit(1);
}

const API = `https://api.supabase.com/v1/projects/${REF}/database/query`;

async function runSql(sql: string, label: string) {
  const res = await fetch(API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`✗ ${label} — HTTP ${res.status}`);
    console.error(text);
    process.exit(1);
  }
  console.log(`✓ ${label}`);
  if (text && text !== "[]") {
    try {
      const j = JSON.parse(text);
      if (Array.isArray(j) && j.length) console.log(JSON.stringify(j, null, 2));
    } catch {
      console.log(text);
    }
  }
}

async function ensureMigrationsTable() {
  await runSql(
    `create table if not exists public._lovable_migrations (
       filename text primary key,
       applied_at timestamptz not null default now()
     );`,
    "ensure _lovable_migrations table",
  );
}

async function appliedSet(): Promise<Set<string>> {
  const res = await fetch(API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: "select filename from public._lovable_migrations",
    }),
  });
  const j = (await res.json()) as Array<{ filename: string }>;
  return new Set(j.map((r) => r.filename));
}

async function applyFile(path: string) {
  const sql = readFileSync(path, "utf8");
  const fname = basename(path);
  await runSql(sql, `apply ${fname}`);
  await runSql(
    `insert into public._lovable_migrations(filename) values ('${fname.replace(/'/g, "''")}') on conflict do nothing;`,
    `mark ${fname} applied`,
  );
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error("Usage: bun scripts/db-apply.ts <file.sql> | --all");
    process.exit(1);
  }

  await ensureMigrationsTable();

  if (arg === "--all") {
    const dir = resolve("db/migrations");
    const files = readdirSync(dir)
      .filter((f) => /^\d+.*\.sql$/.test(f))
      .sort();
    const done = await appliedSet();
    const pending = files.filter((f) => !done.has(f));
    if (pending.length === 0) {
      console.log("No pending migrations.");
      return;
    }
    console.log(`Pending: ${pending.join(", ")}`);
    for (const f of pending) await applyFile(resolve(dir, f));
  } else {
    await applyFile(resolve(arg));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
