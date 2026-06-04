/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Maps internal Cloud API namespace keys to their short CLI display names.
 * Namespaces in this map are promoted to direct children of `cloud` (rather
 * than nested under `hosted` or `serverless`).
 *
 * Kept in a separate lightweight module so the lazy register path can import
 * it without pulling in allCloudApis / allServerlessApis / Zod schemas.
 */
export const PROMOTED_NAMESPACES: ReadonlyMap<string, string> = new Map([
  ['accounts', 'trust'],
  ['authentication', 'auth'],
  ['organizations', 'orgs'],
  ['user-role-assignments', 'users'],
  ['billing-costs-analysis','billing'],
])
