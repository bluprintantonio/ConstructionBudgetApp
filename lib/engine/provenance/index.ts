export type SnapshotDriftStatus =
  | "never checked"
  | "in sync"
  | "changed in Drive";

export function getSnapshotDriftStatus(input: {
  snapshotDriveModifiedTime: string | null;
  driveModifiedTime: string | null;
  lastCheckedAt: string | null;
}): SnapshotDriftStatus {
  if (!input.lastCheckedAt) return "never checked";

  const snapshotTime = input.snapshotDriveModifiedTime
    ? Date.parse(input.snapshotDriveModifiedTime)
    : Number.NaN;
  const currentDriveTime = input.driveModifiedTime
    ? Date.parse(input.driveModifiedTime)
    : Number.NaN;

  return Number.isFinite(snapshotTime) &&
    Number.isFinite(currentDriveTime) &&
    snapshotTime === currentDriveTime
    ? "in sync"
    : "changed in Drive";
}
