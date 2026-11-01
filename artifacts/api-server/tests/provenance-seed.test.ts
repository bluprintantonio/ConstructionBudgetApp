import assert from "node:assert/strict";
import test from "node:test";
import { pool, db } from "@workspace/db";
import { drizzle } from "drizzle-orm/node-postgres";
import {
  runBudgetSeedPass,
  seedPlannerHouseTypes,
} from "../src/lib/budget-data-seed";
import { seedChapterData } from "../src/lib/chapter-seed";

test("all seeds are insert-only, null-only backfills preserve later edits", async () => {
  const client = await pool.connect();
  try {
    const tables = [
      "budget_meta",
      "sources",
      "budget_quotes",
      "budget_lines",
      "line_markers",
      "extras",
      "house_types",
      "cap_chapters",
      "line_chapter_overrides",
    ];
    for (const table of tables) {
      await client.query(
        `CREATE TEMP TABLE ${table} (LIKE public.${table} INCLUDING ALL)`,
      );
    }
    await client.query(
      "ALTER TABLE pg_temp.line_chapter_overrides ADD FOREIGN KEY (chapter_code) REFERENCES pg_temp.cap_chapters(code)",
    );

    const isolatedDb = drizzle(client) as unknown as typeof db;
    await runBudgetSeedPass(isolatedDb);
    assert.equal(await seedChapterData(isolatedDb), true);
    await seedPlannerHouseTypes(isolatedDb);

    const firstCounts = await client.query(`
      SELECT
        (SELECT count(*)::int FROM pg_temp.sources) AS sources,
        (SELECT count(*)::int FROM pg_temp.budget_quotes) AS quotes,
        (SELECT count(*)::int FROM pg_temp.budget_lines) AS lines,
        (SELECT count(*)::int FROM pg_temp.line_markers) AS markers,
        (SELECT count(*)::int FROM pg_temp.extras) AS extras,
        (SELECT count(*)::int FROM pg_temp.cap_chapters) AS chapters,
        (SELECT count(*)::int FROM pg_temp.line_chapter_overrides) AS overrides,
        (SELECT count(*)::int FROM pg_temp.house_types) AS house_types
    `);
    assert.deepEqual(firstCounts.rows[0], {
      sources: 6,
      quotes: 20,
      lines: 67,
      markers: 67,
      extras: 5,
      chapters: 20,
      overrides: 4,
      house_types: 3,
    });

    await runBudgetSeedPass(isolatedDb);
    assert.equal(await seedChapterData(isolatedDb), true);
    await seedPlannerHouseTypes(isolatedDb);

    await client.query("ALTER TABLE pg_temp.budget_lines ALTER COLUMN origin DROP NOT NULL");
    await client.query(`
      UPDATE pg_temp.budget_lines
      SET item = 'Manual line edit', quantity = 123.456,
          source_id = 'manual-source', origin = 'manual'
      WHERE code = '0.1'
    `);
    await client.query(`
      UPDATE pg_temp.budget_lines
      SET source_id = NULL, origin = NULL
      WHERE code = '0.2'
    `);
    await client.query(`
      UPDATE pg_temp.line_markers
      SET marker = 'systems', decision_reason = 'Manual marker decision',
          decided_on = '2026-10-30'
      WHERE budget_line_code = '0.1'
    `);
    await client.query(`
      UPDATE pg_temp.line_markers
      SET decision_reason = NULL, decided_on = NULL
      WHERE budget_line_code = '0.2'
    `);
    await client.query(`
      UPDATE pg_temp.extras
      SET unit_price = 123.45, price_status = 'estimate',
          decision_reason = 'Manual extra decision', decided_on = '2026-10-30'
      WHERE id = 'solar-panels'
    `);
    await client.query(`
      UPDATE pg_temp.extras
      SET decision_reason = NULL, decided_on = NULL
      WHERE id = 'heat-pump'
    `);
    await client.query(`
      UPDATE pg_temp.sources
      SET name = 'Manual source edit', drive_modified_time = '2026-11-02T10:00:00Z',
          status = 'error', snapshot_verified_on = NULL,
          snapshot_drive_modified_time = NULL
      WHERE id = 'materials-master'
    `);
    await client.query(`
      UPDATE pg_temp.cap_chapters
      SET name = 'Manual chapter edit', decision_reason = 'Manual chapter decision',
          decided_on = '2026-10-30'
      WHERE code = 'CAP. 16'
    `);
    await client.query(`
      UPDATE pg_temp.cap_chapters
      SET decision_reason = NULL, decided_on = NULL
      WHERE code = 'CAP. 17'
    `);
    await client.query(`
      UPDATE pg_temp.line_chapter_overrides
      SET reason = 'Manual override decision', decided_on = '2026-10-30'
      WHERE budget_line_code = '7.1'
    `);
    await client.query(`
      UPDATE pg_temp.line_chapter_overrides
      SET decided_on = NULL
      WHERE budget_line_code = '7.2'
    `);
    await client.query(`
      UPDATE pg_temp.budget_quotes
      SET amount = 4567.89, note = 'Manual quote edit'
      WHERE id = (SELECT id FROM pg_temp.budget_quotes ORDER BY id LIMIT 1)
    `);
    await client.query(`
      UPDATE pg_temp.house_types
      SET name = 'Manual house type edit'
      WHERE id = 'twin-villa'
    `);
    await client.query("DELETE FROM pg_temp.budget_meta");

    await runBudgetSeedPass(isolatedDb);
    assert.equal(await seedChapterData(isolatedDb), true);
    await seedPlannerHouseTypes(isolatedDb);

    const preserved = await client.query(`
      SELECT item, quantity, source_id, origin FROM pg_temp.budget_lines WHERE code = '0.1'
    `);
    assert.deepEqual(preserved.rows[0], {
      item: "Manual line edit",
      quantity: 123.456,
      source_id: "manual-source",
      origin: "manual",
    });

    const filledLine = await client.query(`
      SELECT source_id, origin FROM pg_temp.budget_lines WHERE code = '0.2'
    `);
    assert.deepEqual(filledLine.rows[0], {
      source_id: "materials-master",
      origin: "imported",
    });

    const markerRows = await client.query(`
      SELECT marker, decision_reason, decided_on
      FROM pg_temp.line_markers WHERE budget_line_code IN ('0.1', '0.2')
      ORDER BY budget_line_code
    `);
    assert.deepEqual(markerRows.rows, [
      {
        marker: "systems",
        decision_reason: "Manual marker decision",
        decided_on: "2026-10-30",
      },
      {
        marker: "common",
        decision_reason: "Same in all packs: structure, earthworks, networks and common works",
        decided_on: "2026-11-01",
      },
    ]);

    const extraRows = await client.query(`
      SELECT unit_price, price_status, decision_reason, decided_on
      FROM pg_temp.extras WHERE id IN ('solar-panels', 'heat-pump')
      ORDER BY id
    `);
    assert.deepEqual(extraRows.rows, [
      {
        unit_price: null,
        price_status: "pending",
        decision_reason: "Added at the user's request; fixed one-house-unit item.",
        decided_on: "2026-10-31",
      },
      {
        unit_price: "123.45",
        price_status: "estimate",
        decision_reason: "Manual extra decision",
        decided_on: "2026-10-30",
      },
    ]);

    const source = await client.query(`
      SELECT name, drive_modified_time, status, snapshot_verified_on,
             snapshot_drive_modified_time
      FROM pg_temp.sources WHERE id = 'materials-master'
    `);
    assert.deepEqual(source.rows[0], {
      name: "Manual source edit",
      drive_modified_time: new Date("2026-11-02T10:00:00Z"),
      status: "error",
      snapshot_verified_on: "2026-10-31",
      snapshot_drive_modified_time: new Date("2026-10-31T10:49:23.22Z"),
    });

    const chapters = await client.query(`
      SELECT name, decision_reason, decided_on
      FROM pg_temp.cap_chapters WHERE code IN ('CAP. 16', 'CAP. 17')
      ORDER BY code
    `);
    assert.deepEqual(chapters.rows, [
      {
        name: "Manual chapter edit",
        decision_reason: "Manual chapter decision",
        decided_on: "2026-10-30",
      },
      {
        name: "Impermeabilizações",
        decision_reason: "Added at the user's request.",
        decided_on: "2026-11-01",
      },
    ]);

    const overrides = await client.query(`
      SELECT reason, decided_on
      FROM pg_temp.line_chapter_overrides WHERE budget_line_code IN ('7.1', '7.2')
      ORDER BY budget_line_code
    `);
    assert.deepEqual(overrides.rows, [
      { reason: "Manual override decision", decided_on: "2026-10-30" },
      {
        reason: "Armoured entrance door grouped with 7.1 by user instruction.",
        decided_on: "2026-11-01",
      },
    ]);

    const quote = await client.query(`
      SELECT amount, note FROM pg_temp.budget_quotes
      WHERE note = 'Manual quote edit'
    `);
    assert.deepEqual(quote.rows[0], { amount: "4567.89", note: "Manual quote edit" });
    const houseType = await client.query(`
      SELECT name FROM pg_temp.house_types WHERE id = 'twin-villa'
    `);
    assert.deepEqual(houseType.rows[0], { name: "Manual house type edit" });

    const finalCounts = await client.query(`
      SELECT
        (SELECT count(*)::int FROM pg_temp.sources) AS sources,
        (SELECT count(*)::int FROM pg_temp.budget_quotes) AS quotes,
        (SELECT count(*)::int FROM pg_temp.budget_lines) AS lines,
        (SELECT count(*)::int FROM pg_temp.line_markers) AS markers,
        (SELECT count(*)::int FROM pg_temp.extras) AS extras,
        (SELECT count(*)::int FROM pg_temp.cap_chapters) AS chapters,
        (SELECT count(*)::int FROM pg_temp.line_chapter_overrides) AS overrides,
        (SELECT count(*)::int FROM pg_temp.house_types) AS house_types
    `);
    assert.deepEqual(finalCounts.rows[0], firstCounts.rows[0]);
  } finally {
    await client.query("DISCARD TEMP");
    client.release();
    await pool.end();
  }
});
