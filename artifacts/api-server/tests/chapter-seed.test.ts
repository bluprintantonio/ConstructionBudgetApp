import assert from "node:assert/strict";
import test from "node:test";
import { pool, db } from "@workspace/db";
import { drizzle } from "drizzle-orm/node-postgres";
import { getChapterSeedStatus, seedChapterData } from "../src/lib/chapter-seed";

test("chapter seed failure is nonfatal and exposes an unseeded status", async () => {
  const failingDatabase = {
    transaction: async () => { throw new Error("simulated seed failure"); },
  } as unknown as Pick<typeof db, "transaction">;
  assert.equal(await seedChapterData(failingDatabase), false);
  assert.deepEqual(getChapterSeedStatus(), { seeded: false });
});

test("fresh schema seeds atomically to 20 chapters and 4 overrides, retries, and preserves edits", async () => {
  const client = await pool.connect();
  try {
    // Empty session-local tables shadow public tables; no application rows are copied or changed.
    await client.query("CREATE TEMP TABLE budget_meta (LIKE public.budget_meta INCLUDING ALL)");
    await client.query("CREATE TEMP TABLE cap_chapters (LIKE public.cap_chapters INCLUDING ALL)");
    await client.query("CREATE TEMP TABLE line_chapter_overrides (LIKE public.line_chapter_overrides INCLUDING ALL)");
    await client.query("ALTER TABLE pg_temp.line_chapter_overrides ADD FOREIGN KEY (chapter_code) REFERENCES pg_temp.cap_chapters(code)");
    const isolatedDb = drizzle(client) as unknown as Pick<typeof db, "transaction">;
    await client.query("ALTER TABLE pg_temp.line_chapter_overrides ADD CONSTRAINT simulated_failure CHECK (false)");
    assert.equal(await seedChapterData(isolatedDb), false);
    const rolledBack = await client.query("SELECT (SELECT count(*)::int FROM pg_temp.cap_chapters) AS chapters, (SELECT count(*)::int FROM pg_temp.line_chapter_overrides) AS overrides, (SELECT count(*)::int FROM pg_temp.budget_meta) AS markers");
    assert.deepEqual(rolledBack.rows[0], { chapters: 0, overrides: 0, markers: 0 });
    await client.query("ALTER TABLE pg_temp.line_chapter_overrides DROP CONSTRAINT simulated_failure");
    assert.equal(await seedChapterData(isolatedDb), true);
    const seeded = await client.query("SELECT (SELECT count(*)::int FROM pg_temp.cap_chapters) AS chapters, (SELECT count(*)::int FROM pg_temp.line_chapter_overrides) AS overrides");
    assert.deepEqual(seeded.rows[0], { chapters: 20, overrides: 4 });
    assert.deepEqual(getChapterSeedStatus(), { seeded: true });
    assert.equal(await seedChapterData(isolatedDb), true);
    const repeated = await client.query("SELECT (SELECT count(*)::int FROM pg_temp.cap_chapters) AS chapters, (SELECT count(*)::int FROM pg_temp.line_chapter_overrides) AS overrides");
    assert.deepEqual(repeated.rows[0], seeded.rows[0]);
    await client.query("UPDATE pg_temp.line_chapter_overrides SET chapter_code = 'CAP. 17', reason = 'manual test' WHERE budget_line_code = '7.1'");
    await client.query("DELETE FROM pg_temp.line_chapter_overrides WHERE budget_line_code = '7.2'");
    assert.equal(await seedChapterData(isolatedDb), true);
    const manual = await client.query("SELECT chapter_code, reason FROM pg_temp.line_chapter_overrides WHERE budget_line_code = '7.1'");
    assert.deepEqual(manual.rows[0], { chapter_code: "CAP. 17", reason: "manual test" });
    const removed = await client.query("SELECT count(*)::int AS count FROM pg_temp.line_chapter_overrides WHERE budget_line_code = '7.2'");
    assert.equal(removed.rows[0].count, 0);
  } finally {
    await client.query("DISCARD TEMP");
    client.release();
    await pool.end();
  }
});
