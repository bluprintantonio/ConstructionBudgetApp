import assert from "node:assert/strict";
import test from "node:test";
import { getSnapshotDriftStatus } from "../provenance/index.ts";

test("snapshot drift is never checked before a Drive check", () => {
  assert.equal(
    getSnapshotDriftStatus({
      snapshotDriveModifiedTime: "2026-10-31T10:49:23.220Z",
      driveModifiedTime: null,
      lastCheckedAt: null,
    }),
    "never checked",
  );
});

test("snapshot drift is in sync when the Drive modified instant matches", () => {
  assert.equal(
    getSnapshotDriftStatus({
      snapshotDriveModifiedTime: "2026-10-31T10:49:23.220Z",
      driveModifiedTime: "2026-10-31T10:49:23.220Z",
      lastCheckedAt: "2026-11-01T09:00:00.000Z",
    }),
    "in sync",
  );
});

test("snapshot drift reports a changed Drive timestamp", () => {
  assert.equal(
    getSnapshotDriftStatus({
      snapshotDriveModifiedTime: "2026-10-31T10:49:23.220Z",
      driveModifiedTime: "2026-11-02T10:49:23.220Z",
      lastCheckedAt: "2026-11-02T11:00:00.000Z",
    }),
    "changed in Drive",
  );
});
