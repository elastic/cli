/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Describes the detected coding-agent harness, or null if none was found.
 */
export interface AgentInfo {
    name: string;
}
/**
 * Detect the coding-agent harness that spawned this process by inspecting
 * well-known environment variables.
 *
 * Returns an {@link AgentInfo} object when a known agent is detected, or
 * `null` when the process was not spawned by a recognised harness.
 */
export declare function detectAgent(): AgentInfo | null;
