/**
 * Server version utilities for Traccar API compatibility.
 *
 * Traccar v4.4 and v6.x have different API capabilities.
 * This module provides helpers to check which version is running.
 */

/**
 * Parse a semver string like "4.4" or "6.14.5" into numeric parts.
 * Returns [0, 0, 0] for invalid/missing versions.
 */
export function parseVersion(version?: string): [number, number, number] {
  if (!version) return [0, 0, 0];
  const parts = version.split('.').map(Number);
  return [
    parts[0] ?? 0,
    parts[1] ?? 0,
    parts[2] ?? 0,
  ];
}

/**
 * Check if the server version is at least the given minimum.
 * @param current - The server version string (e.g. "4.4", "6.14.5")
 * @param minMajor - Minimum major version
 * @param minMinor - Minimum minor version (default 0)
 * @param minPatch - Minimum patch version (default 0)
 */
export function isVersionAtLeast(
  version: string | undefined,
  minMajor: number,
  minMinor = 0,
  minPatch = 0,
): boolean {
  const [major, minor, patch] = parseVersion(version);
  if (major > minMajor) return true;
  if (major < minMajor) return false;
  if (minor > minMinor) return true;
  if (minor < minMinor) return false;
  return patch >= minPatch;
}

/**
 * Check if the server is Traccar v4.x (the old version with limited API).
 */
export function isV4(version?: string): boolean {
  return parseVersion(version)[0] === 4;
}

/**
 * Check if the server supports the `daily` parameter in summary reports.
 * `daily` was introduced around v5.x.
 */
export function supportsDailySummary(version?: string): boolean {
  return isVersionAtLeast(version, 5);
}

/**
 * Check if the server supports combined reports.
 */
export function supportsCombinedReport(version?: string): boolean {
  return isVersionAtLeast(version, 5);
}

/**
 * Check if the server supports chart report endpoint.
 */
export function supportsChartReport(version?: string): boolean {
  return isVersionAtLeast(version, 5);
}

/**
 * Check if the server supports geofences report endpoint.
 */
export function supportsGeofencesReport(version?: string): boolean {
  return isVersionAtLeast(version, 5);
}

/**
 * Check if the server supports `/notifications/types` endpoint.
 */
export function supportsNotificationTypes(version?: string): boolean {
  return isVersionAtLeast(version, 5);
}

/**
 * Check if the server supports type array filter in events report.
 */
export function supportsEventTypeFilter(version?: string): boolean {
  return isVersionAtLeast(version, 5);
}
