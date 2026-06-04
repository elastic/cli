/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * AUTO-GENERATED from src/kb/apis/*.ts via scripts/build-kb-manifest.mts.
 * DO NOT EDIT BY HAND. Regenerate after running the code generator.
 */

/** Cheap metadata for every Kibana API command. No Zod schemas built. */
export interface KbApiMeta {
  readonly name: string
  readonly namespace: string
  readonly description: string
  /** File stem under src/kb/apis/ that holds the full KbApiDefinition. */
  readonly namespaceFile: string
}

export const kbApiManifest: readonly KbApiMeta[] = [
  {
    "name": "post-agent-builder-a2a-agentid",
    "namespace": "agent-builder",
    "description": "Send A2A task",
    "namespaceFile": "agent-builder"
  },
  {
    "name": "get-agent-builder-a2a-agentid-json",
    "namespace": "agent-builder",
    "description": "Get A2A agent card",
    "namespaceFile": "agent-builder"
  },
  {
    "name": "get-agent-builder-agents",
    "namespace": "agent-builder",
    "description": "List agents",
    "namespaceFile": "agent-builder"
  },
  {
    "name": "post-agent-builder-agents",
    "namespace": "agent-builder",
    "description": "Create an agent",
    "namespaceFile": "agent-builder"
  },
  {
    "name": "post-agent-builder-agents-agent-id-consumption",
    "namespace": "agent-builder",
    "description": "Get agent consumption data",
    "namespaceFile": "agent-builder"
  },
  {
    "name": "delete-agent-builder-agents-id",
    "namespace": "agent-builder",
    "description": "Delete an agent",
    "namespaceFile": "agent-builder"
  },
  {
    "name": "get-agent-builder-agents-id",
    "namespace": "agent-builder",
    "description": "Get an agent by ID",
    "namespaceFile": "agent-builder"
  },
  {
    "name": "put-agent-builder-agents-id",
    "namespace": "agent-builder",
    "description": "Update an agent",
    "namespaceFile": "agent-builder"
  },
  {
    "name": "get-agent-builder-conversations",
    "namespace": "agent-builder",
    "description": "List conversations",
    "namespaceFile": "agent-builder"
  },
  {
    "name": "delete-agent-builder-conversations-conversation-id",
    "namespace": "agent-builder",
    "description": "Delete conversation by ID",
    "namespaceFile": "agent-builder"
  },
  {
    "name": "get-agent-builder-conversations-conversation-id",
    "namespace": "agent-builder",
    "description": "Get conversation by ID",
    "namespaceFile": "agent-builder"
  },
  {
    "name": "get-agent-builder-conversations-conversation-id-attachments",
    "namespace": "agent-builder",
    "description": "List conversation attachments",
    "namespaceFile": "agent-builder"
  },
  {
    "name": "post-agent-builder-conversations-conversation-id-attachments",
    "namespace": "agent-builder",
    "description": "Create conversation attachment",
    "namespaceFile": "agent-builder"
  },
  {
    "name": "delete-agent-builder-conversations-conversation-id-attachments-attachment-id",
    "namespace": "agent-builder",
    "description": "Delete conversation attachment",
    "namespaceFile": "agent-builder"
  },
  {
    "name": "patch-agent-builder-conversations-conversation-id-attachments-attachment-id",
    "namespace": "agent-builder",
    "description": "Rename attachment",
    "namespaceFile": "agent-builder"
  },
  {
    "name": "put-agent-builder-conversations-conversation-id-attachments-attachment-id",
    "namespace": "agent-builder",
    "description": "Update conversation attachment",
    "namespaceFile": "agent-builder"
  },
  {
    "name": "post-agent-builder-conversations-conversation-id-attachments-attachment-id-restore",
    "namespace": "agent-builder",
    "description": "Restore deleted attachment",
    "namespaceFile": "agent-builder"
  },
  {
    "name": "put-agent-builder-conversations-conversation-id-attachments-attachment-id-origin",
    "namespace": "agent-builder",
    "description": "Update attachment origin",
    "namespaceFile": "agent-builder"
  },
  {
    "name": "get-agent-builder-conversations-conversation-id-attachments-stale",
    "namespace": "agent-builder",
    "description": "Check attachment staleness",
    "namespaceFile": "agent-builder"
  },
  {
    "name": "post-agent-builder-converse",
    "namespace": "agent-builder",
    "description": "Send chat message",
    "namespaceFile": "agent-builder"
  },
  {
    "name": "post-agent-builder-converse-async",
    "namespace": "agent-builder",
    "description": "Send chat message (streaming)",
    "namespaceFile": "agent-builder"
  },
  {
    "name": "post-agent-builder-mcp",
    "namespace": "agent-builder",
    "description": "MCP server",
    "namespaceFile": "agent-builder"
  },
  {
    "name": "get-agent-builder-plugins",
    "namespace": "agent-builder",
    "description": "List plugins",
    "namespaceFile": "agent-builder"
  },
  {
    "name": "delete-agent-builder-plugins-pluginid",
    "namespace": "agent-builder",
    "description": "Delete a plugin",
    "namespaceFile": "agent-builder"
  },
  {
    "name": "get-agent-builder-plugins-pluginid",
    "namespace": "agent-builder",
    "description": "Get a plugin by id",
    "namespaceFile": "agent-builder"
  },
  {
    "name": "post-agent-builder-plugins-install",
    "namespace": "agent-builder",
    "description": "Install a plugin",
    "namespaceFile": "agent-builder"
  },
  {
    "name": "get-agent-builder-skills",
    "namespace": "agent-builder",
    "description": "List skills",
    "namespaceFile": "agent-builder"
  },
  {
    "name": "post-agent-builder-skills",
    "namespace": "agent-builder",
    "description": "Create a skill",
    "namespaceFile": "agent-builder"
  },
  {
    "name": "delete-agent-builder-skills-skillid",
    "namespace": "agent-builder",
    "description": "Delete a skill",
    "namespaceFile": "agent-builder"
  },
  {
    "name": "get-agent-builder-skills-skillid",
    "namespace": "agent-builder",
    "description": "Get a skill by id",
    "namespaceFile": "agent-builder"
  },
  {
    "name": "put-agent-builder-skills-skillid",
    "namespace": "agent-builder",
    "description": "Update a skill",
    "namespaceFile": "agent-builder"
  },
  {
    "name": "get-agent-builder-tools",
    "namespace": "agent-builder",
    "description": "List tools",
    "namespaceFile": "agent-builder"
  },
  {
    "name": "post-agent-builder-tools",
    "namespace": "agent-builder",
    "description": "Create a tool",
    "namespaceFile": "agent-builder"
  },
  {
    "name": "post-agent-builder-tools-execute",
    "namespace": "agent-builder",
    "description": "Run a tool",
    "namespaceFile": "agent-builder"
  },
  {
    "name": "delete-agent-builder-tools-toolid",
    "namespace": "agent-builder",
    "description": "Delete a tool",
    "namespaceFile": "agent-builder"
  },
  {
    "name": "get-agent-builder-tools-toolid",
    "namespace": "agent-builder",
    "description": "Get a tool by id",
    "namespaceFile": "agent-builder"
  },
  {
    "name": "put-agent-builder-tools-toolid",
    "namespace": "agent-builder",
    "description": "Update a tool",
    "namespaceFile": "agent-builder"
  },
  {
    "name": "delete-alerting-rule-id",
    "namespace": "alerting",
    "description": "Delete a rule",
    "namespaceFile": "alerting"
  },
  {
    "name": "get-alerting-rule-id",
    "namespace": "alerting",
    "description": "Get rule details",
    "namespaceFile": "alerting"
  },
  {
    "name": "post-alerting-rule-id",
    "namespace": "alerting",
    "description": "Create a rule",
    "namespaceFile": "alerting"
  },
  {
    "name": "put-alerting-rule-id",
    "namespace": "alerting",
    "description": "Update a rule",
    "namespaceFile": "alerting"
  },
  {
    "name": "post-alerting-rule-id-disable",
    "namespace": "alerting",
    "description": "Disable a rule",
    "namespaceFile": "alerting"
  },
  {
    "name": "post-alerting-rule-id-enable",
    "namespace": "alerting",
    "description": "Enable a rule",
    "namespaceFile": "alerting"
  },
  {
    "name": "post-alerting-rule-id-mute-all",
    "namespace": "alerting",
    "description": "Mute all alerts",
    "namespaceFile": "alerting"
  },
  {
    "name": "post-alerting-rule-id-unmute-all",
    "namespace": "alerting",
    "description": "Unmute all alerts",
    "namespaceFile": "alerting"
  },
  {
    "name": "post-alerting-rule-id-update-api-key",
    "namespace": "alerting",
    "description": "Update the API key for a rule",
    "namespaceFile": "alerting"
  },
  {
    "name": "post-alerting-rule-id-snooze-schedule",
    "namespace": "alerting",
    "description": "Schedule a snooze for the rule",
    "namespaceFile": "alerting"
  },
  {
    "name": "post-alerting-rule-rule-id-alert-alert-id-mute",
    "namespace": "alerting",
    "description": "Mute an alert",
    "namespaceFile": "alerting"
  },
  {
    "name": "post-alerting-rule-rule-id-alert-alert-id-unmute",
    "namespace": "alerting",
    "description": "Unmute an alert",
    "namespaceFile": "alerting"
  },
  {
    "name": "delete-alerting-rule-ruleid-snooze-schedule-scheduleid",
    "namespace": "alerting",
    "description": "Delete a snooze schedule for a rule",
    "namespaceFile": "alerting"
  },
  {
    "name": "get-alerting-rules-find",
    "namespace": "alerting",
    "description": "Get information about rules",
    "namespaceFile": "alerting"
  },
  {
    "name": "post-alerting-rules-backfill-find",
    "namespace": "alerting",
    "description": "Find backfills for rules",
    "namespaceFile": "alerting"
  },
  {
    "name": "post-alerting-rules-backfill-schedule",
    "namespace": "alerting",
    "description": "Schedule a backfill for rules",
    "namespaceFile": "alerting"
  },
  {
    "name": "delete-alerting-rules-backfill-id",
    "namespace": "alerting",
    "description": "Delete a backfill by ID",
    "namespaceFile": "alerting"
  },
  {
    "name": "get-alerting-rules-backfill-id",
    "namespace": "alerting",
    "description": "Get a backfill by ID",
    "namespaceFile": "alerting"
  },
  {
    "name": "delete-agent-configuration",
    "namespace": "apm-agent-configuration",
    "description": "Delete agent configuration",
    "namespaceFile": "apm-agent-configuration"
  },
  {
    "name": "get-agent-configurations",
    "namespace": "apm-agent-configuration",
    "description": "Get a list of agent configurations",
    "namespaceFile": "apm-agent-configuration"
  },
  {
    "name": "create-update-agent-configuration",
    "namespace": "apm-agent-configuration",
    "description": "Create or update agent configuration",
    "namespaceFile": "apm-agent-configuration"
  },
  {
    "name": "get-agent-name-for-service",
    "namespace": "apm-agent-configuration",
    "description": "Get agent name for service",
    "namespaceFile": "apm-agent-configuration"
  },
  {
    "name": "get-environments-for-service",
    "namespace": "apm-agent-configuration",
    "description": "Get environments for service",
    "namespaceFile": "apm-agent-configuration"
  },
  {
    "name": "search-single-configuration",
    "namespace": "apm-agent-configuration",
    "description": "Lookup single agent configuration",
    "namespaceFile": "apm-agent-configuration"
  },
  {
    "name": "get-single-agent-configuration",
    "namespace": "apm-agent-configuration",
    "description": "Get single agent configuration",
    "namespaceFile": "apm-agent-configuration"
  },
  {
    "name": "create-agent-key",
    "namespace": "apm-agent-keys",
    "description": "Create an APM agent key",
    "namespaceFile": "apm-agent-keys"
  },
  {
    "name": "create-annotation",
    "namespace": "apm-annotations",
    "description": "Create a service annotation",
    "namespaceFile": "apm-annotations"
  },
  {
    "name": "get-annotation",
    "namespace": "apm-annotations",
    "description": "Search for annotations",
    "namespaceFile": "apm-annotations"
  },
  {
    "name": "save-apm-server-schema",
    "namespace": "apm-server-schema",
    "description": "Save APM server schema",
    "namespaceFile": "apm-server-schema"
  },
  {
    "name": "get-source-maps",
    "namespace": "apm-sourcemaps",
    "description": "Get source maps",
    "namespaceFile": "apm-sourcemaps"
  },
  {
    "name": "upload-source-map",
    "namespace": "apm-sourcemaps",
    "description": "Upload a source map",
    "namespaceFile": "apm-sourcemaps"
  },
  {
    "name": "delete-source-map",
    "namespace": "apm-sourcemaps",
    "description": "Delete source map",
    "namespaceFile": "apm-sourcemaps"
  },
  {
    "name": "get-actions-connector-types",
    "namespace": "connectors",
    "description": "Get connector types",
    "namespaceFile": "connectors"
  },
  {
    "name": "get-actions-connector-oauth-callback",
    "namespace": "connectors",
    "description": "Handle OAuth callback",
    "namespaceFile": "connectors"
  },
  {
    "name": "delete-actions-connector-id",
    "namespace": "connectors",
    "description": "Delete a connector",
    "namespaceFile": "connectors"
  },
  {
    "name": "get-actions-connector-id",
    "namespace": "connectors",
    "description": "Get connector information",
    "namespaceFile": "connectors"
  },
  {
    "name": "post-actions-connector-id",
    "namespace": "connectors",
    "description": "Create a connector",
    "namespaceFile": "connectors"
  },
  {
    "name": "put-actions-connector-id",
    "namespace": "connectors",
    "description": "Update a connector",
    "namespaceFile": "connectors"
  },
  {
    "name": "post-actions-connector-id-execute",
    "namespace": "connectors",
    "description": "Run a connector",
    "namespaceFile": "connectors"
  },
  {
    "name": "get-actions-connectors",
    "namespace": "connectors",
    "description": "Get all connectors",
    "namespaceFile": "connectors"
  },
  {
    "name": "get-fleet-data-streams",
    "namespace": "data-streams",
    "description": "Get data streams",
    "namespaceFile": "data-streams"
  },
  {
    "name": "get-fleet-epm-data-streams",
    "namespace": "data-streams",
    "description": "Get data streams",
    "namespaceFile": "data-streams"
  },
  {
    "name": "get-all-data-views-default",
    "namespace": "data-views",
    "description": "Get all data views",
    "namespaceFile": "data-views"
  },
  {
    "name": "create-data-view-defaultw",
    "namespace": "data-views",
    "description": "Create a data view",
    "namespaceFile": "data-views"
  },
  {
    "name": "delete-data-view-default",
    "namespace": "data-views",
    "description": "Delete a data view",
    "namespaceFile": "data-views"
  },
  {
    "name": "get-data-view-default",
    "namespace": "data-views",
    "description": "Get a data view",
    "namespaceFile": "data-views"
  },
  {
    "name": "update-data-view-default",
    "namespace": "data-views",
    "description": "Update a data view",
    "namespaceFile": "data-views"
  },
  {
    "name": "update-fields-metadata-default",
    "namespace": "data-views",
    "description": "Update data view fields metadata",
    "namespaceFile": "data-views"
  },
  {
    "name": "create-runtime-field-default",
    "namespace": "data-views",
    "description": "Create a runtime field",
    "namespaceFile": "data-views"
  },
  {
    "name": "create-update-runtime-field-default",
    "namespace": "data-views",
    "description": "Create or update a runtime field",
    "namespaceFile": "data-views"
  },
  {
    "name": "delete-runtime-field-default",
    "namespace": "data-views",
    "description": "Delete a runtime field from a data view",
    "namespaceFile": "data-views"
  },
  {
    "name": "get-runtime-field-default",
    "namespace": "data-views",
    "description": "Get a runtime field",
    "namespaceFile": "data-views"
  },
  {
    "name": "update-runtime-field-default",
    "namespace": "data-views",
    "description": "Update a runtime field",
    "namespaceFile": "data-views"
  },
  {
    "name": "get-default-data-view-default",
    "namespace": "data-views",
    "description": "Get the default data view",
    "namespaceFile": "data-views"
  },
  {
    "name": "set-default-datail-view-default",
    "namespace": "data-views",
    "description": "Set the default data view",
    "namespaceFile": "data-views"
  },
  {
    "name": "swap-data-views-default",
    "namespace": "data-views",
    "description": "Swap saved object references",
    "namespaceFile": "data-views"
  },
  {
    "name": "preview-swap-data-views-default",
    "namespace": "data-views",
    "description": "Preview a saved object reference swap",
    "namespaceFile": "data-views"
  },
  {
    "name": "post-fleet-agents-agentid-actions",
    "namespace": "elastic-agent-actions",
    "description": "Create an agent action",
    "namespaceFile": "elastic-agent-actions"
  },
  {
    "name": "post-fleet-agents-agentid-reassign",
    "namespace": "elastic-agent-actions",
    "description": "Reassign an agent",
    "namespaceFile": "elastic-agent-actions"
  },
  {
    "name": "post-fleet-agents-agentid-request-diagnostics",
    "namespace": "elastic-agent-actions",
    "description": "Request agent diagnostics",
    "namespaceFile": "elastic-agent-actions"
  },
  {
    "name": "post-fleet-agents-agentid-rollback",
    "namespace": "elastic-agent-actions",
    "description": "Rollback an agent",
    "namespaceFile": "elastic-agent-actions"
  },
  {
    "name": "post-fleet-agents-agentid-unenroll",
    "namespace": "elastic-agent-actions",
    "description": "Unenroll an agent",
    "namespaceFile": "elastic-agent-actions"
  },
  {
    "name": "post-fleet-agents-agentid-upgrade",
    "namespace": "elastic-agent-actions",
    "description": "Upgrade an agent",
    "namespaceFile": "elastic-agent-actions"
  },
  {
    "name": "get-fleet-agents-action-status",
    "namespace": "elastic-agent-actions",
    "description": "Get an agent action status",
    "namespaceFile": "elastic-agent-actions"
  },
  {
    "name": "post-fleet-agents-actions-actionid-cancel",
    "namespace": "elastic-agent-actions",
    "description": "Cancel an agent action",
    "namespaceFile": "elastic-agent-actions"
  },
  {
    "name": "post-fleet-agents-bulk-reassign",
    "namespace": "elastic-agent-actions",
    "description": "Bulk reassign agents",
    "namespaceFile": "elastic-agent-actions"
  },
  {
    "name": "post-fleet-agents-bulk-request-diagnostics",
    "namespace": "elastic-agent-actions",
    "description": "Bulk request diagnostics from agents",
    "namespaceFile": "elastic-agent-actions"
  },
  {
    "name": "post-fleet-agents-bulk-rollback",
    "namespace": "elastic-agent-actions",
    "description": "Bulk rollback agents",
    "namespaceFile": "elastic-agent-actions"
  },
  {
    "name": "post-fleet-agents-bulk-unenroll",
    "namespace": "elastic-agent-actions",
    "description": "Bulk unenroll agents",
    "namespaceFile": "elastic-agent-actions"
  },
  {
    "name": "post-fleet-agents-bulk-update-agent-tags",
    "namespace": "elastic-agent-actions",
    "description": "Bulk update agent tags",
    "namespaceFile": "elastic-agent-actions"
  },
  {
    "name": "post-fleet-agents-bulk-upgrade",
    "namespace": "elastic-agent-actions",
    "description": "Bulk upgrade agents",
    "namespaceFile": "elastic-agent-actions"
  },
  {
    "name": "get-fleet-agent-download-sources",
    "namespace": "elastic-agent-binary-download-sources",
    "description": "Get agent binary download sources",
    "namespaceFile": "elastic-agent-binary-download-sources"
  },
  {
    "name": "post-fleet-agent-download-sources",
    "namespace": "elastic-agent-binary-download-sources",
    "description": "Create an agent binary download source",
    "namespaceFile": "elastic-agent-binary-download-sources"
  },
  {
    "name": "delete-fleet-agent-download-sources-sourceid",
    "namespace": "elastic-agent-binary-download-sources",
    "description": "Delete an agent binary download source",
    "namespaceFile": "elastic-agent-binary-download-sources"
  },
  {
    "name": "get-fleet-agent-download-sources-sourceid",
    "namespace": "elastic-agent-binary-download-sources",
    "description": "Get an agent binary download source",
    "namespaceFile": "elastic-agent-binary-download-sources"
  },
  {
    "name": "put-fleet-agent-download-sources-sourceid",
    "namespace": "elastic-agent-binary-download-sources",
    "description": "Update an agent binary download source",
    "namespaceFile": "elastic-agent-binary-download-sources"
  },
  {
    "name": "get-fleet-agent-policies",
    "namespace": "elastic-agent-policies",
    "description": "Get agent policies",
    "namespaceFile": "elastic-agent-policies"
  },
  {
    "name": "post-fleet-agent-policies",
    "namespace": "elastic-agent-policies",
    "description": "Create an agent policy",
    "namespaceFile": "elastic-agent-policies"
  },
  {
    "name": "post-fleet-agent-policies-bulk-get",
    "namespace": "elastic-agent-policies",
    "description": "Bulk get agent policies",
    "namespaceFile": "elastic-agent-policies"
  },
  {
    "name": "get-fleet-agent-policies-agentpolicyid",
    "namespace": "elastic-agent-policies",
    "description": "Get an agent policy",
    "namespaceFile": "elastic-agent-policies"
  },
  {
    "name": "put-fleet-agent-policies-agentpolicyid",
    "namespace": "elastic-agent-policies",
    "description": "Update an agent policy",
    "namespaceFile": "elastic-agent-policies"
  },
  {
    "name": "get-fleet-agent-policies-agentpolicyid-auto-upgrade-agents-status",
    "namespace": "elastic-agent-policies",
    "description": "Get auto upgrade agent status",
    "namespaceFile": "elastic-agent-policies"
  },
  {
    "name": "post-fleet-agent-policies-agentpolicyid-copy",
    "namespace": "elastic-agent-policies",
    "description": "Copy an agent policy",
    "namespaceFile": "elastic-agent-policies"
  },
  {
    "name": "get-fleet-agent-policies-agentpolicyid-download",
    "namespace": "elastic-agent-policies",
    "description": "Download an agent policy",
    "namespaceFile": "elastic-agent-policies"
  },
  {
    "name": "get-fleet-agent-policies-agentpolicyid-full",
    "namespace": "elastic-agent-policies",
    "description": "Get a full agent policy",
    "namespaceFile": "elastic-agent-policies"
  },
  {
    "name": "get-fleet-agent-policies-agentpolicyid-outputs",
    "namespace": "elastic-agent-policies",
    "description": "Get outputs for an agent policy",
    "namespaceFile": "elastic-agent-policies"
  },
  {
    "name": "post-fleet-agent-policies-delete",
    "namespace": "elastic-agent-policies",
    "description": "Delete an agent policy",
    "namespaceFile": "elastic-agent-policies"
  },
  {
    "name": "post-fleet-agent-policies-outputs",
    "namespace": "elastic-agent-policies",
    "description": "Get outputs for agent policies",
    "namespaceFile": "elastic-agent-policies"
  },
  {
    "name": "get-fleet-kubernetes",
    "namespace": "elastic-agent-policies",
    "description": "Get a full K8s agent manifest",
    "namespaceFile": "elastic-agent-policies"
  },
  {
    "name": "get-fleet-kubernetes-download",
    "namespace": "elastic-agent-policies",
    "description": "Download an agent manifest",
    "namespaceFile": "elastic-agent-policies"
  },
  {
    "name": "get-fleet-agent-status",
    "namespace": "elastic-agent-status",
    "description": "Get an agent status summary",
    "namespaceFile": "elastic-agent-status"
  },
  {
    "name": "get-fleet-agent-status-data",
    "namespace": "elastic-agents",
    "description": "Get incoming agent data",
    "namespaceFile": "elastic-agents"
  },
  {
    "name": "get-fleet-agents",
    "namespace": "elastic-agents",
    "description": "Get agents",
    "namespaceFile": "elastic-agents"
  },
  {
    "name": "post-fleet-agents",
    "namespace": "elastic-agents",
    "description": "Get agents by action ids",
    "namespaceFile": "elastic-agents"
  },
  {
    "name": "delete-fleet-agents-agentid",
    "namespace": "elastic-agents",
    "description": "Delete an agent",
    "namespaceFile": "elastic-agents"
  },
  {
    "name": "get-fleet-agents-agentid",
    "namespace": "elastic-agents",
    "description": "Get an agent",
    "namespaceFile": "elastic-agents"
  },
  {
    "name": "put-fleet-agents-agentid",
    "namespace": "elastic-agents",
    "description": "Update an agent by ID",
    "namespaceFile": "elastic-agents"
  },
  {
    "name": "post-fleet-agents-agentid-migrate",
    "namespace": "elastic-agents",
    "description": "Migrate a single agent",
    "namespaceFile": "elastic-agents"
  },
  {
    "name": "post-fleet-agents-agentid-privilege-level-change",
    "namespace": "elastic-agents",
    "description": "Change agent privilege level",
    "namespaceFile": "elastic-agents"
  },
  {
    "name": "get-fleet-agents-agentid-uploads",
    "namespace": "elastic-agents",
    "description": "Get agent uploads",
    "namespaceFile": "elastic-agents"
  },
  {
    "name": "get-fleet-agents-available-versions",
    "namespace": "elastic-agents",
    "description": "Get available agent versions",
    "namespaceFile": "elastic-agents"
  },
  {
    "name": "post-fleet-agents-bulk-migrate",
    "namespace": "elastic-agents",
    "description": "Migrate multiple agents",
    "namespaceFile": "elastic-agents"
  },
  {
    "name": "post-fleet-agents-bulk-privilege-level-change",
    "namespace": "elastic-agents",
    "description": "Bulk change agent privilege level",
    "namespaceFile": "elastic-agents"
  },
  {
    "name": "delete-fleet-agents-files-fileid",
    "namespace": "elastic-agents",
    "description": "Delete an uploaded file",
    "namespaceFile": "elastic-agents"
  },
  {
    "name": "get-fleet-agents-files-fileid-filename",
    "namespace": "elastic-agents",
    "description": "Get an uploaded file",
    "namespaceFile": "elastic-agents"
  },
  {
    "name": "get-fleet-agents-setup",
    "namespace": "elastic-agents",
    "description": "Get agent setup info",
    "namespaceFile": "elastic-agents"
  },
  {
    "name": "post-fleet-agents-setup",
    "namespace": "elastic-agents",
    "description": "Initiate agent setup",
    "namespaceFile": "elastic-agents"
  },
  {
    "name": "get-fleet-agents-tags",
    "namespace": "elastic-agents",
    "description": "Get agent tags",
    "namespaceFile": "elastic-agents"
  },
  {
    "name": "post-fleet-epm-bulk-assets",
    "namespace": "elastic-package-manager-epm",
    "description": "Bulk get assets",
    "namespaceFile": "elastic-package-manager-epm"
  },
  {
    "name": "get-fleet-epm-categories",
    "namespace": "elastic-package-manager-epm",
    "description": "Get package categories",
    "namespaceFile": "elastic-package-manager-epm"
  },
  {
    "name": "post-fleet-epm-custom-integrations",
    "namespace": "elastic-package-manager-epm",
    "description": "Create a custom integration",
    "namespaceFile": "elastic-package-manager-epm"
  },
  {
    "name": "put-fleet-epm-custom-integrations-pkgname",
    "namespace": "elastic-package-manager-epm",
    "description": "Update a custom integration",
    "namespaceFile": "elastic-package-manager-epm"
  },
  {
    "name": "get-fleet-epm-packages",
    "namespace": "elastic-package-manager-epm",
    "description": "Get packages",
    "namespaceFile": "elastic-package-manager-epm"
  },
  {
    "name": "post-fleet-epm-packages",
    "namespace": "elastic-package-manager-epm",
    "description": "Install a package by upload",
    "namespaceFile": "elastic-package-manager-epm"
  },
  {
    "name": "post-fleet-epm-packages-bulk",
    "namespace": "elastic-package-manager-epm",
    "description": "Bulk install packages",
    "namespaceFile": "elastic-package-manager-epm"
  },
  {
    "name": "post-fleet-epm-packages-bulk-rollback",
    "namespace": "elastic-package-manager-epm",
    "description": "Bulk rollback packages",
    "namespaceFile": "elastic-package-manager-epm"
  },
  {
    "name": "get-fleet-epm-packages-bulk-rollback-taskid",
    "namespace": "elastic-package-manager-epm",
    "description": "Get Bulk rollback packages details",
    "namespaceFile": "elastic-package-manager-epm"
  },
  {
    "name": "post-fleet-epm-packages-bulk-uninstall",
    "namespace": "elastic-package-manager-epm",
    "description": "Bulk uninstall packages",
    "namespaceFile": "elastic-package-manager-epm"
  },
  {
    "name": "get-fleet-epm-packages-bulk-uninstall-taskid",
    "namespace": "elastic-package-manager-epm",
    "description": "Get Bulk uninstall packages details",
    "namespaceFile": "elastic-package-manager-epm"
  },
  {
    "name": "post-fleet-epm-packages-bulk-upgrade",
    "namespace": "elastic-package-manager-epm",
    "description": "Bulk upgrade packages",
    "namespaceFile": "elastic-package-manager-epm"
  },
  {
    "name": "get-fleet-epm-packages-bulk-upgrade-taskid",
    "namespace": "elastic-package-manager-epm",
    "description": "Get Bulk upgrade packages details",
    "namespaceFile": "elastic-package-manager-epm"
  },
  {
    "name": "delete-fleet-epm-packages-pkgname",
    "namespace": "elastic-package-manager-epm",
    "description": "Delete a package",
    "namespaceFile": "elastic-package-manager-epm"
  },
  {
    "name": "get-fleet-epm-packages-pkgname",
    "namespace": "elastic-package-manager-epm",
    "description": "Get a package",
    "namespaceFile": "elastic-package-manager-epm"
  },
  {
    "name": "post-fleet-epm-packages-pkgname",
    "namespace": "elastic-package-manager-epm",
    "description": "Install a package from the registry",
    "namespaceFile": "elastic-package-manager-epm"
  },
  {
    "name": "put-fleet-epm-packages-pkgname",
    "namespace": "elastic-package-manager-epm",
    "description": "Update package settings",
    "namespaceFile": "elastic-package-manager-epm"
  },
  {
    "name": "delete-fleet-epm-packages-pkgname-pkgversion",
    "namespace": "elastic-package-manager-epm",
    "description": "Delete a package",
    "namespaceFile": "elastic-package-manager-epm"
  },
  {
    "name": "get-fleet-epm-packages-pkgname-pkgversion",
    "namespace": "elastic-package-manager-epm",
    "description": "Get a package",
    "namespaceFile": "elastic-package-manager-epm"
  },
  {
    "name": "post-fleet-epm-packages-pkgname-pkgversion",
    "namespace": "elastic-package-manager-epm",
    "description": "Install a package from the registry",
    "namespaceFile": "elastic-package-manager-epm"
  },
  {
    "name": "put-fleet-epm-packages-pkgname-pkgversion",
    "namespace": "elastic-package-manager-epm",
    "description": "Update package settings",
    "namespaceFile": "elastic-package-manager-epm"
  },
  {
    "name": "get-fleet-epm-packages-pkgname-pkgversion-filepath",
    "namespace": "elastic-package-manager-epm",
    "description": "Get a package file",
    "namespaceFile": "elastic-package-manager-epm"
  },
  {
    "name": "delete-fleet-epm-packages-pkgname-pkgversion-datastream-assets",
    "namespace": "elastic-package-manager-epm",
    "description": "Delete assets for an input package",
    "namespaceFile": "elastic-package-manager-epm"
  },
  {
    "name": "delete-fleet-epm-packages-pkgname-pkgversion-kibana-assets",
    "namespace": "elastic-package-manager-epm",
    "description": "Delete Kibana assets for a package",
    "namespaceFile": "elastic-package-manager-epm"
  },
  {
    "name": "post-fleet-epm-packages-pkgname-pkgversion-kibana-assets",
    "namespace": "elastic-package-manager-epm",
    "description": "Install Kibana assets for a package",
    "namespaceFile": "elastic-package-manager-epm"
  },
  {
    "name": "post-fleet-epm-packages-pkgname-pkgversion-rule-assets",
    "namespace": "elastic-package-manager-epm",
    "description": "Install Kibana alert rule for a package",
    "namespaceFile": "elastic-package-manager-epm"
  },
  {
    "name": "post-fleet-epm-packages-pkgname-pkgversion-transforms-authorize",
    "namespace": "elastic-package-manager-epm",
    "description": "Authorize transforms",
    "namespaceFile": "elastic-package-manager-epm"
  },
  {
    "name": "post-fleet-epm-packages-pkgname-review-upgrade",
    "namespace": "elastic-package-manager-epm",
    "description": "Review a pending policy upgrade for a package with deprecations",
    "namespaceFile": "elastic-package-manager-epm"
  },
  {
    "name": "post-fleet-epm-packages-pkgname-rollback",
    "namespace": "elastic-package-manager-epm",
    "description": "Rollback a package to previous version",
    "namespaceFile": "elastic-package-manager-epm"
  },
  {
    "name": "get-fleet-epm-packages-pkgname-stats",
    "namespace": "elastic-package-manager-epm",
    "description": "Get package stats",
    "namespaceFile": "elastic-package-manager-epm"
  },
  {
    "name": "get-fleet-epm-packages-installed",
    "namespace": "elastic-package-manager-epm",
    "description": "Get installed packages",
    "namespaceFile": "elastic-package-manager-epm"
  },
  {
    "name": "get-fleet-epm-packages-limited",
    "namespace": "elastic-package-manager-epm",
    "description": "Get a limited package list",
    "namespaceFile": "elastic-package-manager-epm"
  },
  {
    "name": "get-fleet-epm-templates-pkgname-pkgversion-inputs",
    "namespace": "elastic-package-manager-epm",
    "description": "Get an inputs template",
    "namespaceFile": "elastic-package-manager-epm"
  },
  {
    "name": "get-fleet-epm-verification-key-id",
    "namespace": "elastic-package-manager-epm",
    "description": "Get a package signature verification key ID",
    "namespaceFile": "elastic-package-manager-epm"
  },
  {
    "name": "post-fleet-agentless-policies",
    "namespace": "fleet-agentless-policies",
    "description": "Create an agentless policy",
    "namespaceFile": "fleet-agentless-policies"
  },
  {
    "name": "delete-fleet-agentless-policies-policyid",
    "namespace": "fleet-agentless-policies",
    "description": "Delete an agentless policy",
    "namespaceFile": "fleet-agentless-policies"
  },
  {
    "name": "get-fleet-cloud-connectors",
    "namespace": "fleet-cloud-connectors",
    "description": "Get cloud connectors",
    "namespaceFile": "fleet-cloud-connectors"
  },
  {
    "name": "post-fleet-cloud-connectors",
    "namespace": "fleet-cloud-connectors",
    "description": "Create cloud connector",
    "namespaceFile": "fleet-cloud-connectors"
  },
  {
    "name": "delete-fleet-cloud-connectors-cloudconnectorid",
    "namespace": "fleet-cloud-connectors",
    "description": "Delete cloud connector (supports force deletion)",
    "namespaceFile": "fleet-cloud-connectors"
  },
  {
    "name": "get-fleet-cloud-connectors-cloudconnectorid",
    "namespace": "fleet-cloud-connectors",
    "description": "Get cloud connector",
    "namespaceFile": "fleet-cloud-connectors"
  },
  {
    "name": "put-fleet-cloud-connectors-cloudconnectorid",
    "namespace": "fleet-cloud-connectors",
    "description": "Update cloud connector",
    "namespaceFile": "fleet-cloud-connectors"
  },
  {
    "name": "get-fleet-cloud-connectors-cloudconnectorid-usage",
    "namespace": "fleet-cloud-connectors",
    "description": "Get cloud connector usage (package policies using the connector)",
    "namespaceFile": "fleet-cloud-connectors"
  },
  {
    "name": "get-fleet-enrollment-api-keys",
    "namespace": "fleet-enrollment-api-keys",
    "description": "Get enrollment API keys",
    "namespaceFile": "fleet-enrollment-api-keys"
  },
  {
    "name": "post-fleet-enrollment-api-keys",
    "namespace": "fleet-enrollment-api-keys",
    "description": "Create an enrollment API key",
    "namespaceFile": "fleet-enrollment-api-keys"
  },
  {
    "name": "delete-fleet-enrollment-api-keys-keyid",
    "namespace": "fleet-enrollment-api-keys",
    "description": "Revoke an enrollment API key",
    "namespaceFile": "fleet-enrollment-api-keys"
  },
  {
    "name": "get-fleet-enrollment-api-keys-keyid",
    "namespace": "fleet-enrollment-api-keys",
    "description": "Get an enrollment API key",
    "namespaceFile": "fleet-enrollment-api-keys"
  },
  {
    "name": "get-fleet-check-permissions",
    "namespace": "fleet-internals",
    "description": "Check permissions",
    "namespaceFile": "fleet-internals"
  },
  {
    "name": "post-fleet-health-check",
    "namespace": "fleet-internals",
    "description": "Check Fleet Server health",
    "namespaceFile": "fleet-internals"
  },
  {
    "name": "get-fleet-settings",
    "namespace": "fleet-internals",
    "description": "Get settings",
    "namespaceFile": "fleet-internals"
  },
  {
    "name": "put-fleet-settings",
    "namespace": "fleet-internals",
    "description": "Update settings",
    "namespaceFile": "fleet-internals"
  },
  {
    "name": "post-fleet-setup",
    "namespace": "fleet-internals",
    "description": "Initiate Fleet setup",
    "namespaceFile": "fleet-internals"
  },
  {
    "name": "post-fleet-logstash-api-keys",
    "namespace": "fleet-outputs",
    "description": "Generate a Logstash API key",
    "namespaceFile": "fleet-outputs"
  },
  {
    "name": "get-fleet-outputs",
    "namespace": "fleet-outputs",
    "description": "Get outputs",
    "namespaceFile": "fleet-outputs"
  },
  {
    "name": "post-fleet-outputs",
    "namespace": "fleet-outputs",
    "description": "Create output",
    "namespaceFile": "fleet-outputs"
  },
  {
    "name": "delete-fleet-outputs-outputid",
    "namespace": "fleet-outputs",
    "description": "Delete output",
    "namespaceFile": "fleet-outputs"
  },
  {
    "name": "get-fleet-outputs-outputid",
    "namespace": "fleet-outputs",
    "description": "Get output",
    "namespaceFile": "fleet-outputs"
  },
  {
    "name": "put-fleet-outputs-outputid",
    "namespace": "fleet-outputs",
    "description": "Update output",
    "namespaceFile": "fleet-outputs"
  },
  {
    "name": "get-fleet-outputs-outputid-health",
    "namespace": "fleet-outputs",
    "description": "Get the latest output health",
    "namespaceFile": "fleet-outputs"
  },
  {
    "name": "get-fleet-package-policies",
    "namespace": "fleet-package-policies",
    "description": "Get package policies",
    "namespaceFile": "fleet-package-policies"
  },
  {
    "name": "post-fleet-package-policies",
    "namespace": "fleet-package-policies",
    "description": "Create a package policy",
    "namespaceFile": "fleet-package-policies"
  },
  {
    "name": "post-fleet-package-policies-bulk-get",
    "namespace": "fleet-package-policies",
    "description": "Bulk get package policies",
    "namespaceFile": "fleet-package-policies"
  },
  {
    "name": "delete-fleet-package-policies-packagepolicyid",
    "namespace": "fleet-package-policies",
    "description": "Delete a package policy",
    "namespaceFile": "fleet-package-policies"
  },
  {
    "name": "get-fleet-package-policies-packagepolicyid",
    "namespace": "fleet-package-policies",
    "description": "Get a package policy",
    "namespaceFile": "fleet-package-policies"
  },
  {
    "name": "put-fleet-package-policies-packagepolicyid",
    "namespace": "fleet-package-policies",
    "description": "Update a package policy",
    "namespaceFile": "fleet-package-policies"
  },
  {
    "name": "post-fleet-package-policies-delete",
    "namespace": "fleet-package-policies",
    "description": "Bulk delete package policies",
    "namespaceFile": "fleet-package-policies"
  },
  {
    "name": "post-fleet-package-policies-upgrade",
    "namespace": "fleet-package-policies",
    "description": "Upgrade a package policy",
    "namespaceFile": "fleet-package-policies"
  },
  {
    "name": "post-fleet-package-policies-upgrade-dryrun",
    "namespace": "fleet-package-policies",
    "description": "Dry run a package policy upgrade",
    "namespaceFile": "fleet-package-policies"
  },
  {
    "name": "get-fleet-proxies",
    "namespace": "fleet-proxies",
    "description": "Get proxies",
    "namespaceFile": "fleet-proxies"
  },
  {
    "name": "post-fleet-proxies",
    "namespace": "fleet-proxies",
    "description": "Create a proxy",
    "namespaceFile": "fleet-proxies"
  },
  {
    "name": "delete-fleet-proxies-itemid",
    "namespace": "fleet-proxies",
    "description": "Delete a proxy",
    "namespaceFile": "fleet-proxies"
  },
  {
    "name": "get-fleet-proxies-itemid",
    "namespace": "fleet-proxies",
    "description": "Get a proxy",
    "namespaceFile": "fleet-proxies"
  },
  {
    "name": "put-fleet-proxies-itemid",
    "namespace": "fleet-proxies",
    "description": "Update a proxy",
    "namespaceFile": "fleet-proxies"
  },
  {
    "name": "get-fleet-fleet-server-hosts",
    "namespace": "fleet-server-hosts",
    "description": "Get Fleet Server hosts",
    "namespaceFile": "fleet-server-hosts"
  },
  {
    "name": "post-fleet-fleet-server-hosts",
    "namespace": "fleet-server-hosts",
    "description": "Create a Fleet Server host",
    "namespaceFile": "fleet-server-hosts"
  },
  {
    "name": "delete-fleet-fleet-server-hosts-itemid",
    "namespace": "fleet-server-hosts",
    "description": "Delete a Fleet Server host",
    "namespaceFile": "fleet-server-hosts"
  },
  {
    "name": "get-fleet-fleet-server-hosts-itemid",
    "namespace": "fleet-server-hosts",
    "description": "Get a Fleet Server host",
    "namespaceFile": "fleet-server-hosts"
  },
  {
    "name": "put-fleet-fleet-server-hosts-itemid",
    "namespace": "fleet-server-hosts",
    "description": "Update a Fleet Server host",
    "namespaceFile": "fleet-server-hosts"
  },
  {
    "name": "get-fleet-uninstall-tokens",
    "namespace": "fleet-uninstall-tokens",
    "description": "Get metadata for latest uninstall tokens",
    "namespaceFile": "fleet-uninstall-tokens"
  },
  {
    "name": "get-fleet-uninstall-tokens-uninstalltokenid",
    "namespace": "fleet-uninstall-tokens",
    "description": "Get a decrypted uninstall token",
    "namespaceFile": "fleet-uninstall-tokens"
  },
  {
    "name": "post-maintenance-window",
    "namespace": "maintenance-window",
    "description": "Create a maintenance window.",
    "namespaceFile": "maintenance-window"
  },
  {
    "name": "get-maintenance-window-find",
    "namespace": "maintenance-window",
    "description": "Search for a maintenance window.",
    "namespaceFile": "maintenance-window"
  },
  {
    "name": "delete-maintenance-window-id",
    "namespace": "maintenance-window",
    "description": "Delete a maintenance window.",
    "namespaceFile": "maintenance-window"
  },
  {
    "name": "get-maintenance-window-id",
    "namespace": "maintenance-window",
    "description": "Get maintenance window details.",
    "namespaceFile": "maintenance-window"
  },
  {
    "name": "patch-maintenance-window-id",
    "namespace": "maintenance-window",
    "description": "Update a maintenance window.",
    "namespaceFile": "maintenance-window"
  },
  {
    "name": "post-maintenance-window-id-archive",
    "namespace": "maintenance-window",
    "description": "Archive a maintenance window.",
    "namespaceFile": "maintenance-window"
  },
  {
    "name": "post-maintenance-window-id-unarchive",
    "namespace": "maintenance-window",
    "description": "Unarchive a maintenance window.",
    "namespaceFile": "maintenance-window"
  },
  {
    "name": "post-fleet-message-signing-service-rotate-key-pair",
    "namespace": "message-signing-service",
    "description": "Rotate a Fleet message signing key pair",
    "namespaceFile": "message-signing-service"
  },
  {
    "name": "get-actions-connector-oauth-callback-script",
    "namespace": "misc",
    "description": "",
    "namespaceFile": "misc"
  },
  {
    "name": "get-fleet-space-settings",
    "namespace": "misc",
    "description": "Get space settings",
    "namespaceFile": "misc"
  },
  {
    "name": "put-fleet-space-settings",
    "namespace": "misc",
    "description": "Create space settings",
    "namespaceFile": "misc"
  },
  {
    "name": "post-security-role-query",
    "namespace": "misc",
    "description": "Query roles",
    "namespaceFile": "misc"
  },
  {
    "name": "ml-sync",
    "namespace": "ml",
    "description": "Sync saved objects in the default space",
    "namespaceFile": "ml"
  },
  {
    "name": "ml-update-jobs-spaces",
    "namespace": "ml",
    "description": "Update jobs spaces",
    "namespaceFile": "ml"
  },
  {
    "name": "ml-update-trained-models-spaces",
    "namespace": "ml",
    "description": "Update trained models spaces",
    "namespaceFile": "ml"
  },
  {
    "name": "observability-ai-assistant-chat-complete",
    "namespace": "observabilityaiassistant",
    "description": "Generate a chat completion",
    "namespaceFile": "observabilityaiassistant"
  },
  {
    "name": "get-security-role",
    "namespace": "roles",
    "description": "Get all roles",
    "namespaceFile": "roles"
  },
  {
    "name": "delete-security-role-name",
    "namespace": "roles",
    "description": "Delete a role",
    "namespaceFile": "roles"
  },
  {
    "name": "get-security-role-name",
    "namespace": "roles",
    "description": "Get a role",
    "namespaceFile": "roles"
  },
  {
    "name": "put-security-role-name",
    "namespace": "roles",
    "description": "Create or update a role",
    "namespaceFile": "roles"
  },
  {
    "name": "post-security-roles",
    "namespace": "roles",
    "description": "Create or update roles",
    "namespaceFile": "roles"
  },
  {
    "name": "post-saved-objects-export",
    "namespace": "saved-objects",
    "description": "Export saved objects",
    "namespaceFile": "saved-objects"
  },
  {
    "name": "post-saved-objects-import",
    "namespace": "saved-objects",
    "description": "Import saved objects",
    "namespaceFile": "saved-objects"
  },
  {
    "name": "post-saved-objects-resolve-import-errors",
    "namespace": "saved-objects",
    "description": "Resolve import errors",
    "namespaceFile": "saved-objects"
  },
  {
    "name": "perform-anonymization-fields-bulk-action",
    "namespace": "security-ai-assistant-api",
    "description": "Apply a bulk action to anonymization fields",
    "namespaceFile": "security-ai-assistant-api"
  },
  {
    "name": "find-anonymization-fields",
    "namespace": "security-ai-assistant-api",
    "description": "Get anonymization fields",
    "namespaceFile": "security-ai-assistant-api"
  },
  {
    "name": "chat-complete",
    "namespace": "security-ai-assistant-api",
    "description": "Create a model response",
    "namespaceFile": "security-ai-assistant-api"
  },
  {
    "name": "delete-all-conversations",
    "namespace": "security-ai-assistant-api",
    "description": "Delete conversations",
    "namespaceFile": "security-ai-assistant-api"
  },
  {
    "name": "create-conversation",
    "namespace": "security-ai-assistant-api",
    "description": "Create a conversation",
    "namespaceFile": "security-ai-assistant-api"
  },
  {
    "name": "find-conversations",
    "namespace": "security-ai-assistant-api",
    "description": "Get conversations",
    "namespaceFile": "security-ai-assistant-api"
  },
  {
    "name": "delete-conversation",
    "namespace": "security-ai-assistant-api",
    "description": "Delete a conversation",
    "namespaceFile": "security-ai-assistant-api"
  },
  {
    "name": "read-conversation",
    "namespace": "security-ai-assistant-api",
    "description": "Get a conversation",
    "namespaceFile": "security-ai-assistant-api"
  },
  {
    "name": "update-conversation",
    "namespace": "security-ai-assistant-api",
    "description": "Update a conversation",
    "namespaceFile": "security-ai-assistant-api"
  },
  {
    "name": "get-knowledge-base",
    "namespace": "security-ai-assistant-api",
    "description": "Read a KnowledgeBase",
    "namespaceFile": "security-ai-assistant-api"
  },
  {
    "name": "post-knowledge-base",
    "namespace": "security-ai-assistant-api",
    "description": "Create a KnowledgeBase",
    "namespaceFile": "security-ai-assistant-api"
  },
  {
    "name": "read-knowledge-base",
    "namespace": "security-ai-assistant-api",
    "description": "Read a KnowledgeBase for a resource",
    "namespaceFile": "security-ai-assistant-api"
  },
  {
    "name": "create-knowledge-base",
    "namespace": "security-ai-assistant-api",
    "description": "Create a KnowledgeBase for a resource",
    "namespaceFile": "security-ai-assistant-api"
  },
  {
    "name": "create-knowledge-base-entry",
    "namespace": "security-ai-assistant-api",
    "description": "Create a Knowledge Base Entry",
    "namespaceFile": "security-ai-assistant-api"
  },
  {
    "name": "perform-knowledge-base-entry-bulk-action",
    "namespace": "security-ai-assistant-api",
    "description": "Applies a bulk action to multiple Knowledge Base Entries",
    "namespaceFile": "security-ai-assistant-api"
  },
  {
    "name": "find-knowledge-base-entries",
    "namespace": "security-ai-assistant-api",
    "description": "Finds Knowledge Base Entries that match the given query.",
    "namespaceFile": "security-ai-assistant-api"
  },
  {
    "name": "delete-knowledge-base-entry",
    "namespace": "security-ai-assistant-api",
    "description": "Deletes a single Knowledge Base Entry using the `id` field",
    "namespaceFile": "security-ai-assistant-api"
  },
  {
    "name": "read-knowledge-base-entry",
    "namespace": "security-ai-assistant-api",
    "description": "Read a Knowledge Base Entry",
    "namespaceFile": "security-ai-assistant-api"
  },
  {
    "name": "update-knowledge-base-entry",
    "namespace": "security-ai-assistant-api",
    "description": "Update a Knowledge Base Entry",
    "namespaceFile": "security-ai-assistant-api"
  },
  {
    "name": "perform-prompts-bulk-action",
    "namespace": "security-ai-assistant-api",
    "description": "Apply a bulk action to prompts",
    "namespaceFile": "security-ai-assistant-api"
  },
  {
    "name": "find-prompts",
    "namespace": "security-ai-assistant-api",
    "description": "Get prompts",
    "namespaceFile": "security-ai-assistant-api"
  },
  {
    "name": "post-attack-discovery-bulk",
    "namespace": "security-attack-discovery-api",
    "description": "Bulk update Attack discoveries",
    "namespaceFile": "security-attack-discovery-api"
  },
  {
    "name": "attack-discovery-find",
    "namespace": "security-attack-discovery-api",
    "description": "Find Attack discoveries that match the search criteria",
    "namespaceFile": "security-attack-discovery-api"
  },
  {
    "name": "post-attack-discovery-generate",
    "namespace": "security-attack-discovery-api",
    "description": "Generate attack discoveries from alerts",
    "namespaceFile": "security-attack-discovery-api"
  },
  {
    "name": "get-attack-discovery-generations",
    "namespace": "security-attack-discovery-api",
    "description": "Get the latest attack discovery generations metadata for the current user",
    "namespaceFile": "security-attack-discovery-api"
  },
  {
    "name": "get-attack-discovery-generation",
    "namespace": "security-attack-discovery-api",
    "description": "Get a single Attack discovery generation, including its discoveries and (optional) generation metadata",
    "namespaceFile": "security-attack-discovery-api"
  },
  {
    "name": "post-attack-discovery-generations-dismiss",
    "namespace": "security-attack-discovery-api",
    "description": "Dismiss an attack discovery generation",
    "namespaceFile": "security-attack-discovery-api"
  },
  {
    "name": "create-attack-discovery-schedules",
    "namespace": "security-attack-discovery-api",
    "description": "Create Attack discovery schedule",
    "namespaceFile": "security-attack-discovery-api"
  },
  {
    "name": "find-attack-discovery-schedules",
    "namespace": "security-attack-discovery-api",
    "description": "Finds Attack discovery schedules that match the search criteria",
    "namespaceFile": "security-attack-discovery-api"
  },
  {
    "name": "delete-attack-discovery-schedules",
    "namespace": "security-attack-discovery-api",
    "description": "Delete Attack discovery schedule",
    "namespaceFile": "security-attack-discovery-api"
  },
  {
    "name": "get-attack-discovery-schedules",
    "namespace": "security-attack-discovery-api",
    "description": "Get Attack discovery schedule by ID",
    "namespaceFile": "security-attack-discovery-api"
  },
  {
    "name": "update-attack-discovery-schedules",
    "namespace": "security-attack-discovery-api",
    "description": "Update Attack discovery schedule",
    "namespaceFile": "security-attack-discovery-api"
  },
  {
    "name": "disable-attack-discovery-schedules",
    "namespace": "security-attack-discovery-api",
    "description": "Disable Attack discovery schedule",
    "namespaceFile": "security-attack-discovery-api"
  },
  {
    "name": "enable-attack-discovery-schedules",
    "namespace": "security-attack-discovery-api",
    "description": "Enable Attack discovery schedule",
    "namespaceFile": "security-attack-discovery-api"
  },
  {
    "name": "read-privileges",
    "namespace": "security-detections-api",
    "description": "Returns user privileges for the Kibana space",
    "namespaceFile": "security-detections-api"
  },
  {
    "name": "delete-rule",
    "namespace": "security-detections-api",
    "description": "Delete a detection rule",
    "namespaceFile": "security-detections-api"
  },
  {
    "name": "read-rule",
    "namespace": "security-detections-api",
    "description": "Retrieve a detection rule",
    "namespaceFile": "security-detections-api"
  },
  {
    "name": "patch-rule",
    "namespace": "security-detections-api",
    "description": "Patch a detection rule",
    "namespaceFile": "security-detections-api"
  },
  {
    "name": "create-rule",
    "namespace": "security-detections-api",
    "description": "Create a detection rule",
    "namespaceFile": "security-detections-api"
  },
  {
    "name": "update-rule",
    "namespace": "security-detections-api",
    "description": "Update a detection rule",
    "namespaceFile": "security-detections-api"
  },
  {
    "name": "perform-rules-bulk-action",
    "namespace": "security-detections-api",
    "description": "Apply a bulk action to detection rules",
    "namespaceFile": "security-detections-api"
  },
  {
    "name": "export-rules",
    "namespace": "security-detections-api",
    "description": "Export detection rules",
    "namespaceFile": "security-detections-api"
  },
  {
    "name": "find-rules",
    "namespace": "security-detections-api",
    "description": "List all detection rules",
    "namespaceFile": "security-detections-api"
  },
  {
    "name": "import-rules",
    "namespace": "security-detections-api",
    "description": "Import detection rules",
    "namespaceFile": "security-detections-api"
  },
  {
    "name": "rule-preview",
    "namespace": "security-detections-api",
    "description": "Preview rule alerts generated on specified time range",
    "namespaceFile": "security-detections-api"
  },
  {
    "name": "set-alert-assignees",
    "namespace": "security-detections-api",
    "description": "Assign and unassign users from detection alerts",
    "namespaceFile": "security-detections-api"
  },
  {
    "name": "search-alerts",
    "namespace": "security-detections-api",
    "description": "Find and/or aggregate detection alerts",
    "namespaceFile": "security-detections-api"
  },
  {
    "name": "set-alerts-status",
    "namespace": "security-detections-api",
    "description": "Set a detection alert status",
    "namespaceFile": "security-detections-api"
  },
  {
    "name": "set-alert-tags",
    "namespace": "security-detections-api",
    "description": "Add and remove detection alert tags",
    "namespaceFile": "security-detections-api"
  },
  {
    "name": "read-tags",
    "namespace": "security-detections-api",
    "description": "List all detection rule tags",
    "namespaceFile": "security-detections-api"
  },
  {
    "name": "create-endpoint-list",
    "namespace": "security-endpoint-exceptions-api",
    "description": "Create an Elastic Endpoint rule exception list",
    "namespaceFile": "security-endpoint-exceptions-api"
  },
  {
    "name": "delete-endpoint-list-item",
    "namespace": "security-endpoint-exceptions-api",
    "description": "Delete an Elastic Endpoint exception list item",
    "namespaceFile": "security-endpoint-exceptions-api"
  },
  {
    "name": "read-endpoint-list-item",
    "namespace": "security-endpoint-exceptions-api",
    "description": "Get an Elastic Endpoint rule exception list item",
    "namespaceFile": "security-endpoint-exceptions-api"
  },
  {
    "name": "create-endpoint-list-item",
    "namespace": "security-endpoint-exceptions-api",
    "description": "Create an Elastic Endpoint rule exception list item",
    "namespaceFile": "security-endpoint-exceptions-api"
  },
  {
    "name": "update-endpoint-list-item",
    "namespace": "security-endpoint-exceptions-api",
    "description": "Update an Elastic Endpoint rule exception list item",
    "namespaceFile": "security-endpoint-exceptions-api"
  },
  {
    "name": "find-endpoint-list-items",
    "namespace": "security-endpoint-exceptions-api",
    "description": "Get Elastic Endpoint exception list items",
    "namespaceFile": "security-endpoint-exceptions-api"
  },
  {
    "name": "endpoint-get-actions-list",
    "namespace": "security-endpoint-management-api",
    "description": "Get response actions",
    "namespaceFile": "security-endpoint-management-api"
  },
  {
    "name": "endpoint-get-actions-status",
    "namespace": "security-endpoint-management-api",
    "description": "Get response actions status",
    "namespaceFile": "security-endpoint-management-api"
  },
  {
    "name": "endpoint-get-actions-details",
    "namespace": "security-endpoint-management-api",
    "description": "Get action details",
    "namespaceFile": "security-endpoint-management-api"
  },
  {
    "name": "endpoint-file-info",
    "namespace": "security-endpoint-management-api",
    "description": "Get file information",
    "namespaceFile": "security-endpoint-management-api"
  },
  {
    "name": "endpoint-file-download",
    "namespace": "security-endpoint-management-api",
    "description": "Download a file",
    "namespaceFile": "security-endpoint-management-api"
  },
  {
    "name": "cancel-action",
    "namespace": "security-endpoint-management-api",
    "description": "Cancel a response action",
    "namespaceFile": "security-endpoint-management-api"
  },
  {
    "name": "endpoint-execute-action",
    "namespace": "security-endpoint-management-api",
    "description": "Run a command",
    "namespaceFile": "security-endpoint-management-api"
  },
  {
    "name": "endpoint-get-file-action",
    "namespace": "security-endpoint-management-api",
    "description": "Get a file",
    "namespaceFile": "security-endpoint-management-api"
  },
  {
    "name": "endpoint-isolate-action",
    "namespace": "security-endpoint-management-api",
    "description": "Isolate an endpoint",
    "namespaceFile": "security-endpoint-management-api"
  },
  {
    "name": "endpoint-kill-process-action",
    "namespace": "security-endpoint-management-api",
    "description": "Terminate a process",
    "namespaceFile": "security-endpoint-management-api"
  },
  {
    "name": "endpoint-generate-memory-dump",
    "namespace": "security-endpoint-management-api",
    "description": "Generate a memory dump from the host machine",
    "namespaceFile": "security-endpoint-management-api"
  },
  {
    "name": "endpoint-get-processes-action",
    "namespace": "security-endpoint-management-api",
    "description": "Get running processes",
    "namespaceFile": "security-endpoint-management-api"
  },
  {
    "name": "run-script-action",
    "namespace": "security-endpoint-management-api",
    "description": "Run a script",
    "namespaceFile": "security-endpoint-management-api"
  },
  {
    "name": "endpoint-scan-action",
    "namespace": "security-endpoint-management-api",
    "description": "Scan a file or directory",
    "namespaceFile": "security-endpoint-management-api"
  },
  {
    "name": "endpoint-get-actions-state",
    "namespace": "security-endpoint-management-api",
    "description": "Get actions state",
    "namespaceFile": "security-endpoint-management-api"
  },
  {
    "name": "endpoint-suspend-process-action",
    "namespace": "security-endpoint-management-api",
    "description": "Suspend a process",
    "namespaceFile": "security-endpoint-management-api"
  },
  {
    "name": "endpoint-unisolate-action",
    "namespace": "security-endpoint-management-api",
    "description": "Release an isolated endpoint",
    "namespaceFile": "security-endpoint-management-api"
  },
  {
    "name": "endpoint-upload-action",
    "namespace": "security-endpoint-management-api",
    "description": "Upload a file",
    "namespaceFile": "security-endpoint-management-api"
  },
  {
    "name": "get-endpoint-metadata-list",
    "namespace": "security-endpoint-management-api",
    "description": "Get a metadata list",
    "namespaceFile": "security-endpoint-management-api"
  },
  {
    "name": "get-endpoint-metadata",
    "namespace": "security-endpoint-management-api",
    "description": "Get metadata",
    "namespaceFile": "security-endpoint-management-api"
  },
  {
    "name": "get-policy-response",
    "namespace": "security-endpoint-management-api",
    "description": "Get a policy response",
    "namespaceFile": "security-endpoint-management-api"
  },
  {
    "name": "get-protection-updates-note",
    "namespace": "security-endpoint-management-api",
    "description": "Get a protection updates note",
    "namespaceFile": "security-endpoint-management-api"
  },
  {
    "name": "create-update-protection-updates-note",
    "namespace": "security-endpoint-management-api",
    "description": "Create or update a protection updates note",
    "namespaceFile": "security-endpoint-management-api"
  },
  {
    "name": "delete-asset-criticality-record",
    "namespace": "security-entity-analytics-api",
    "description": "Delete an asset criticality record",
    "namespaceFile": "security-entity-analytics-api"
  },
  {
    "name": "get-asset-criticality-record",
    "namespace": "security-entity-analytics-api",
    "description": "Get an asset criticality record",
    "namespaceFile": "security-entity-analytics-api"
  },
  {
    "name": "create-asset-criticality-record",
    "namespace": "security-entity-analytics-api",
    "description": "Upsert an asset criticality record",
    "namespaceFile": "security-entity-analytics-api"
  },
  {
    "name": "bulk-upsert-asset-criticality-records",
    "namespace": "security-entity-analytics-api",
    "description": "Bulk upsert asset criticality records",
    "namespaceFile": "security-entity-analytics-api"
  },
  {
    "name": "find-asset-criticality-records",
    "namespace": "security-entity-analytics-api",
    "description": "List asset criticality records",
    "namespaceFile": "security-entity-analytics-api"
  },
  {
    "name": "delete-monitoring-engine",
    "namespace": "security-entity-analytics-api",
    "description": "Delete the Privilege Monitoring Engine",
    "namespaceFile": "security-entity-analytics-api"
  },
  {
    "name": "disable-monitoring-engine",
    "namespace": "security-entity-analytics-api",
    "description": "Disable the Privilege Monitoring Engine",
    "namespaceFile": "security-entity-analytics-api"
  },
  {
    "name": "init-monitoring-engine",
    "namespace": "security-entity-analytics-api",
    "description": "Initialize the Privilege Monitoring Engine",
    "namespaceFile": "security-entity-analytics-api"
  },
  {
    "name": "schedule-monitoring-engine",
    "namespace": "security-entity-analytics-api",
    "description": "Schedule the Privilege Monitoring Engine",
    "namespaceFile": "security-entity-analytics-api"
  },
  {
    "name": "priv-mon-health",
    "namespace": "security-entity-analytics-api",
    "description": "Health check on Privilege Monitoring",
    "namespaceFile": "security-entity-analytics-api"
  },
  {
    "name": "priv-mon-privileges",
    "namespace": "security-entity-analytics-api",
    "description": "Run a privileges check on Privilege Monitoring",
    "namespaceFile": "security-entity-analytics-api"
  },
  {
    "name": "create-priv-mon-user",
    "namespace": "security-entity-analytics-api",
    "description": "Create a new monitored user",
    "namespaceFile": "security-entity-analytics-api"
  },
  {
    "name": "privmon-bulk-upload-users-c-s-v",
    "namespace": "security-entity-analytics-api",
    "description": "Upsert multiple monitored users via CSV upload",
    "namespaceFile": "security-entity-analytics-api"
  },
  {
    "name": "delete-priv-mon-user",
    "namespace": "security-entity-analytics-api",
    "description": "Delete a monitored user",
    "namespaceFile": "security-entity-analytics-api"
  },
  {
    "name": "update-priv-mon-user",
    "namespace": "security-entity-analytics-api",
    "description": "Update a monitored user",
    "namespaceFile": "security-entity-analytics-api"
  },
  {
    "name": "list-priv-mon-users",
    "namespace": "security-entity-analytics-api",
    "description": "List all monitored users",
    "namespaceFile": "security-entity-analytics-api"
  },
  {
    "name": "install-privileged-access-detection-package",
    "namespace": "security-entity-analytics-api",
    "description": "Installs the privileged access detection package for the Entity Analytics privileged user monitoring experience",
    "namespaceFile": "security-entity-analytics-api"
  },
  {
    "name": "get-privileged-access-detection-package-status",
    "namespace": "security-entity-analytics-api",
    "description": "Gets the status of the privileged access detection package for the Entity Analytics privileged user monitoring experience",
    "namespaceFile": "security-entity-analytics-api"
  },
  {
    "name": "create-watchlist",
    "namespace": "security-entity-analytics-api",
    "description": "Create a new watchlist",
    "namespaceFile": "security-entity-analytics-api"
  },
  {
    "name": "get-watchlist",
    "namespace": "security-entity-analytics-api",
    "description": "Get a watchlist by ID",
    "namespaceFile": "security-entity-analytics-api"
  },
  {
    "name": "update-watchlist",
    "namespace": "security-entity-analytics-api",
    "description": "Update an existing watchlist",
    "namespaceFile": "security-entity-analytics-api"
  },
  {
    "name": "list-watchlists",
    "namespace": "security-entity-analytics-api",
    "description": "List all watchlists",
    "namespaceFile": "security-entity-analytics-api"
  },
  {
    "name": "init-entity-store",
    "namespace": "security-entity-analytics-api",
    "description": "Initialize the Entity Store",
    "namespaceFile": "security-entity-analytics-api"
  },
  {
    "name": "delete-entity-engines",
    "namespace": "security-entity-analytics-api",
    "description": "Delete Entity Engines",
    "namespaceFile": "security-entity-analytics-api"
  },
  {
    "name": "list-entity-engines",
    "namespace": "security-entity-analytics-api",
    "description": "List the Entity Engines",
    "namespaceFile": "security-entity-analytics-api"
  },
  {
    "name": "delete-entity-engine",
    "namespace": "security-entity-analytics-api",
    "description": "Delete the Entity Engine",
    "namespaceFile": "security-entity-analytics-api"
  },
  {
    "name": "get-entity-engine",
    "namespace": "security-entity-analytics-api",
    "description": "Get an Entity Engine",
    "namespaceFile": "security-entity-analytics-api"
  },
  {
    "name": "init-entity-engine",
    "namespace": "security-entity-analytics-api",
    "description": "Initialize an Entity Engine",
    "namespaceFile": "security-entity-analytics-api"
  },
  {
    "name": "start-entity-engine",
    "namespace": "security-entity-analytics-api",
    "description": "Start an Entity Engine",
    "namespaceFile": "security-entity-analytics-api"
  },
  {
    "name": "stop-entity-engine",
    "namespace": "security-entity-analytics-api",
    "description": "Stop an Entity Engine",
    "namespaceFile": "security-entity-analytics-api"
  },
  {
    "name": "apply-entity-engine-dataview-indices",
    "namespace": "security-entity-analytics-api",
    "description": "Apply DataView indices to all installed engines",
    "namespaceFile": "security-entity-analytics-api"
  },
  {
    "name": "delete-single-entity",
    "namespace": "security-entity-analytics-api",
    "description": "Delete an entity in Entity Store",
    "namespaceFile": "security-entity-analytics-api"
  },
  {
    "name": "upsert-entity",
    "namespace": "security-entity-analytics-api",
    "description": "Upsert an entity in Entity Store",
    "namespaceFile": "security-entity-analytics-api"
  },
  {
    "name": "upsert-entities-bulk",
    "namespace": "security-entity-analytics-api",
    "description": "Upsert many entities in Entity Store",
    "namespaceFile": "security-entity-analytics-api"
  },
  {
    "name": "list-entities",
    "namespace": "security-entity-analytics-api",
    "description": "List Entity Store Entities",
    "namespaceFile": "security-entity-analytics-api"
  },
  {
    "name": "get-entity-store-status",
    "namespace": "security-entity-analytics-api",
    "description": "Get the status of the Entity Store",
    "namespaceFile": "security-entity-analytics-api"
  },
  {
    "name": "clean-up-risk-engine",
    "namespace": "security-entity-analytics-api",
    "description": "Cleanup the Risk Engine",
    "namespaceFile": "security-entity-analytics-api"
  },
  {
    "name": "configure-risk-engine-saved-object",
    "namespace": "security-entity-analytics-api",
    "description": "Configure the Risk Engine Saved Object",
    "namespaceFile": "security-entity-analytics-api"
  },
  {
    "name": "schedule-risk-engine-now",
    "namespace": "security-entity-analytics-api",
    "description": "Run the risk scoring engine",
    "namespaceFile": "security-entity-analytics-api"
  },
  {
    "name": "create-rule-exception-list-items",
    "namespace": "security-exceptions-api",
    "description": "Create rule exception items",
    "namespaceFile": "security-exceptions-api"
  },
  {
    "name": "delete-exception-list",
    "namespace": "security-exceptions-api",
    "description": "Delete an exception list",
    "namespaceFile": "security-exceptions-api"
  },
  {
    "name": "read-exception-list",
    "namespace": "security-exceptions-api",
    "description": "Get exception list details",
    "namespaceFile": "security-exceptions-api"
  },
  {
    "name": "create-exception-list",
    "namespace": "security-exceptions-api",
    "description": "Create an exception list",
    "namespaceFile": "security-exceptions-api"
  },
  {
    "name": "update-exception-list",
    "namespace": "security-exceptions-api",
    "description": "Update an exception list",
    "namespaceFile": "security-exceptions-api"
  },
  {
    "name": "duplicate-exception-list",
    "namespace": "security-exceptions-api",
    "description": "Duplicate an exception list",
    "namespaceFile": "security-exceptions-api"
  },
  {
    "name": "export-exception-list",
    "namespace": "security-exceptions-api",
    "description": "Export an exception list",
    "namespaceFile": "security-exceptions-api"
  },
  {
    "name": "find-exception-lists",
    "namespace": "security-exceptions-api",
    "description": "Get exception lists",
    "namespaceFile": "security-exceptions-api"
  },
  {
    "name": "import-exception-list",
    "namespace": "security-exceptions-api",
    "description": "Import an exception list",
    "namespaceFile": "security-exceptions-api"
  },
  {
    "name": "delete-exception-list-item",
    "namespace": "security-exceptions-api",
    "description": "Delete an exception list item",
    "namespaceFile": "security-exceptions-api"
  },
  {
    "name": "read-exception-list-item",
    "namespace": "security-exceptions-api",
    "description": "Get an exception list item",
    "namespaceFile": "security-exceptions-api"
  },
  {
    "name": "create-exception-list-item",
    "namespace": "security-exceptions-api",
    "description": "Create an exception list item",
    "namespaceFile": "security-exceptions-api"
  },
  {
    "name": "update-exception-list-item",
    "namespace": "security-exceptions-api",
    "description": "Update an exception list item",
    "namespaceFile": "security-exceptions-api"
  },
  {
    "name": "find-exception-list-items",
    "namespace": "security-exceptions-api",
    "description": "Get exception list items",
    "namespaceFile": "security-exceptions-api"
  },
  {
    "name": "read-exception-list-summary",
    "namespace": "security-exceptions-api",
    "description": "Get an exception list summary",
    "namespaceFile": "security-exceptions-api"
  },
  {
    "name": "create-shared-exception-list",
    "namespace": "security-exceptions-api",
    "description": "Create a shared exception list",
    "namespaceFile": "security-exceptions-api"
  },
  {
    "name": "delete-list",
    "namespace": "security-lists-api",
    "description": "Delete a value list",
    "namespaceFile": "security-lists-api"
  },
  {
    "name": "read-list",
    "namespace": "security-lists-api",
    "description": "Get value list details",
    "namespaceFile": "security-lists-api"
  },
  {
    "name": "patch-list",
    "namespace": "security-lists-api",
    "description": "Patch a value list",
    "namespaceFile": "security-lists-api"
  },
  {
    "name": "create-list",
    "namespace": "security-lists-api",
    "description": "Create a value list",
    "namespaceFile": "security-lists-api"
  },
  {
    "name": "update-list",
    "namespace": "security-lists-api",
    "description": "Update a value list",
    "namespaceFile": "security-lists-api"
  },
  {
    "name": "find-lists",
    "namespace": "security-lists-api",
    "description": "Get value lists",
    "namespaceFile": "security-lists-api"
  },
  {
    "name": "delete-list-index",
    "namespace": "security-lists-api",
    "description": "Delete value list data streams",
    "namespaceFile": "security-lists-api"
  },
  {
    "name": "read-list-index",
    "namespace": "security-lists-api",
    "description": "Get status of value list data streams",
    "namespaceFile": "security-lists-api"
  },
  {
    "name": "create-list-index",
    "namespace": "security-lists-api",
    "description": "Create list data streams",
    "namespaceFile": "security-lists-api"
  },
  {
    "name": "delete-list-item",
    "namespace": "security-lists-api",
    "description": "Delete a value list item",
    "namespaceFile": "security-lists-api"
  },
  {
    "name": "read-list-item",
    "namespace": "security-lists-api",
    "description": "Get a value list item",
    "namespaceFile": "security-lists-api"
  },
  {
    "name": "patch-list-item",
    "namespace": "security-lists-api",
    "description": "Patch a value list item",
    "namespaceFile": "security-lists-api"
  },
  {
    "name": "create-list-item",
    "namespace": "security-lists-api",
    "description": "Create a value list item",
    "namespaceFile": "security-lists-api"
  },
  {
    "name": "update-list-item",
    "namespace": "security-lists-api",
    "description": "Update a value list item",
    "namespaceFile": "security-lists-api"
  },
  {
    "name": "export-list-items",
    "namespace": "security-lists-api",
    "description": "Export value list items",
    "namespaceFile": "security-lists-api"
  },
  {
    "name": "find-list-items",
    "namespace": "security-lists-api",
    "description": "Get value list items",
    "namespaceFile": "security-lists-api"
  },
  {
    "name": "import-list-items",
    "namespace": "security-lists-api",
    "description": "Import value list items",
    "namespaceFile": "security-lists-api"
  },
  {
    "name": "read-list-privileges",
    "namespace": "security-lists-api",
    "description": "Get value list privileges",
    "namespaceFile": "security-lists-api"
  },
  {
    "name": "osquery-find-live-queries",
    "namespace": "security-osquery-api",
    "description": "Get live queries",
    "namespaceFile": "security-osquery-api"
  },
  {
    "name": "osquery-create-live-query",
    "namespace": "security-osquery-api",
    "description": "Create a live query",
    "namespaceFile": "security-osquery-api"
  },
  {
    "name": "osquery-get-live-query-details",
    "namespace": "security-osquery-api",
    "description": "Get live query details",
    "namespaceFile": "security-osquery-api"
  },
  {
    "name": "osquery-get-live-query-results",
    "namespace": "security-osquery-api",
    "description": "Get live query results",
    "namespaceFile": "security-osquery-api"
  },
  {
    "name": "osquery-find-packs",
    "namespace": "security-osquery-api",
    "description": "Get packs",
    "namespaceFile": "security-osquery-api"
  },
  {
    "name": "osquery-create-packs",
    "namespace": "security-osquery-api",
    "description": "Create a pack",
    "namespaceFile": "security-osquery-api"
  },
  {
    "name": "osquery-delete-packs",
    "namespace": "security-osquery-api",
    "description": "Delete a pack",
    "namespaceFile": "security-osquery-api"
  },
  {
    "name": "osquery-get-packs-details",
    "namespace": "security-osquery-api",
    "description": "Get pack details",
    "namespaceFile": "security-osquery-api"
  },
  {
    "name": "osquery-update-packs",
    "namespace": "security-osquery-api",
    "description": "Update a pack",
    "namespaceFile": "security-osquery-api"
  },
  {
    "name": "osquery-find-saved-queries",
    "namespace": "security-osquery-api",
    "description": "Get saved queries",
    "namespaceFile": "security-osquery-api"
  },
  {
    "name": "osquery-create-saved-query",
    "namespace": "security-osquery-api",
    "description": "Create a saved query",
    "namespaceFile": "security-osquery-api"
  },
  {
    "name": "osquery-delete-saved-query",
    "namespace": "security-osquery-api",
    "description": "Delete a saved query",
    "namespaceFile": "security-osquery-api"
  },
  {
    "name": "osquery-get-saved-query-details",
    "namespace": "security-osquery-api",
    "description": "Get saved query details",
    "namespaceFile": "security-osquery-api"
  },
  {
    "name": "osquery-update-saved-query",
    "namespace": "security-osquery-api",
    "description": "Update a saved query",
    "namespaceFile": "security-osquery-api"
  },
  {
    "name": "delete-note",
    "namespace": "security-timeline-api",
    "description": "Delete a note",
    "namespaceFile": "security-timeline-api"
  },
  {
    "name": "get-notes",
    "namespace": "security-timeline-api",
    "description": "Get notes",
    "namespaceFile": "security-timeline-api"
  },
  {
    "name": "persist-note-route",
    "namespace": "security-timeline-api",
    "description": "Add or update a note",
    "namespaceFile": "security-timeline-api"
  },
  {
    "name": "persist-pinned-event-route",
    "namespace": "security-timeline-api",
    "description": "Pin/unpin an event",
    "namespaceFile": "security-timeline-api"
  },
  {
    "name": "delete-timelines",
    "namespace": "security-timeline-api",
    "description": "Delete Timelines or Timeline templates",
    "namespaceFile": "security-timeline-api"
  },
  {
    "name": "get-timeline",
    "namespace": "security-timeline-api",
    "description": "Get Timeline or Timeline template details",
    "namespaceFile": "security-timeline-api"
  },
  {
    "name": "patch-timeline",
    "namespace": "security-timeline-api",
    "description": "Update a Timeline",
    "namespaceFile": "security-timeline-api"
  },
  {
    "name": "create-timelines",
    "namespace": "security-timeline-api",
    "description": "Create a Timeline or Timeline template",
    "namespaceFile": "security-timeline-api"
  },
  {
    "name": "copy-timeline",
    "namespace": "security-timeline-api",
    "description": "Copies timeline or timeline template",
    "namespaceFile": "security-timeline-api"
  },
  {
    "name": "get-draft-timelines",
    "namespace": "security-timeline-api",
    "description": "Get draft Timeline or Timeline template details",
    "namespaceFile": "security-timeline-api"
  },
  {
    "name": "clean-draft-timelines",
    "namespace": "security-timeline-api",
    "description": "Create a clean draft Timeline or Timeline template",
    "namespaceFile": "security-timeline-api"
  },
  {
    "name": "export-timelines",
    "namespace": "security-timeline-api",
    "description": "Export Timelines",
    "namespaceFile": "security-timeline-api"
  },
  {
    "name": "persist-favorite-route",
    "namespace": "security-timeline-api",
    "description": "Favorite a Timeline or Timeline template",
    "namespaceFile": "security-timeline-api"
  },
  {
    "name": "import-timelines",
    "namespace": "security-timeline-api",
    "description": "Import Timelines",
    "namespaceFile": "security-timeline-api"
  },
  {
    "name": "install-prepacked-timelines",
    "namespace": "security-timeline-api",
    "description": "Install prepackaged Timelines",
    "namespaceFile": "security-timeline-api"
  },
  {
    "name": "resolve-timeline",
    "namespace": "security-timeline-api",
    "description": "Get an existing saved Timeline or Timeline template",
    "namespaceFile": "security-timeline-api"
  },
  {
    "name": "get-timelines",
    "namespace": "security-timeline-api",
    "description": "Get Timelines or Timeline templates",
    "namespaceFile": "security-timeline-api"
  },
  {
    "name": "find-slos-op",
    "namespace": "slo",
    "description": "Get a paginated list of SLOs",
    "namespaceFile": "slo"
  },
  {
    "name": "create-slo-op",
    "namespace": "slo",
    "description": "Create an SLO",
    "namespaceFile": "slo"
  },
  {
    "name": "bulk-delete-op",
    "namespace": "slo",
    "description": "Bulk delete SLO definitions and their associated summary and rollup data.",
    "namespaceFile": "slo"
  },
  {
    "name": "bulk-delete-status-op",
    "namespace": "slo",
    "description": "Retrieve the status of the bulk deletion",
    "namespaceFile": "slo"
  },
  {
    "name": "delete-rollup-data-op",
    "namespace": "slo",
    "description": "Batch delete rollup and summary data",
    "namespaceFile": "slo"
  },
  {
    "name": "delete-slo-instances-op",
    "namespace": "slo",
    "description": "Batch delete rollup and summary data",
    "namespaceFile": "slo"
  },
  {
    "name": "delete-slo-op",
    "namespace": "slo",
    "description": "Delete an SLO",
    "namespaceFile": "slo"
  },
  {
    "name": "get-slo-op",
    "namespace": "slo",
    "description": "Get an SLO",
    "namespaceFile": "slo"
  },
  {
    "name": "update-slo-op",
    "namespace": "slo",
    "description": "Update an SLO",
    "namespaceFile": "slo"
  },
  {
    "name": "reset-slo-op",
    "namespace": "slo",
    "description": "Reset an SLO",
    "namespaceFile": "slo"
  },
  {
    "name": "disable-slo-op",
    "namespace": "slo",
    "description": "Disable an SLO",
    "namespaceFile": "slo"
  },
  {
    "name": "enable-slo-op",
    "namespace": "slo",
    "description": "Enable an SLO",
    "namespaceFile": "slo"
  },
  {
    "name": "get-definitions-op",
    "namespace": "slo",
    "description": "Get the SLO definitions",
    "namespaceFile": "slo"
  },
  {
    "name": "get-spaces-space",
    "namespace": "spaces",
    "description": "Get all spaces",
    "namespaceFile": "spaces"
  },
  {
    "name": "post-spaces-space",
    "namespace": "spaces",
    "description": "Create a space",
    "namespaceFile": "spaces"
  },
  {
    "name": "delete-spaces-space-id",
    "namespace": "spaces",
    "description": "Delete a space",
    "namespaceFile": "spaces"
  },
  {
    "name": "get-spaces-space-id",
    "namespace": "spaces",
    "description": "Get a space",
    "namespaceFile": "spaces"
  },
  {
    "name": "put-spaces-space-id",
    "namespace": "spaces",
    "description": "Update a space",
    "namespaceFile": "spaces"
  },
  {
    "name": "get-streams",
    "namespace": "streams",
    "description": "Get stream list",
    "namespaceFile": "streams"
  },
  {
    "name": "post-streams-disable",
    "namespace": "streams",
    "description": "Disable streams",
    "namespaceFile": "streams"
  },
  {
    "name": "post-streams-enable",
    "namespace": "streams",
    "description": "Enable streams",
    "namespaceFile": "streams"
  },
  {
    "name": "post-streams-resync",
    "namespace": "streams",
    "description": "Resync streams",
    "namespaceFile": "streams"
  },
  {
    "name": "delete-streams-name",
    "namespace": "streams",
    "description": "Delete a stream",
    "namespaceFile": "streams"
  },
  {
    "name": "get-streams-name",
    "namespace": "streams",
    "description": "Get a stream",
    "namespaceFile": "streams"
  },
  {
    "name": "put-streams-name",
    "namespace": "streams",
    "description": "Create or update a stream",
    "namespaceFile": "streams"
  },
  {
    "name": "post-streams-name-fork",
    "namespace": "streams",
    "description": "Fork a stream",
    "namespaceFile": "streams"
  },
  {
    "name": "get-streams-name-ingest",
    "namespace": "streams",
    "description": "Get ingest stream settings",
    "namespaceFile": "streams"
  },
  {
    "name": "put-streams-name-ingest",
    "namespace": "streams",
    "description": "Update ingest stream settings",
    "namespaceFile": "streams"
  },
  {
    "name": "get-streams-name-query",
    "namespace": "streams",
    "description": "Get query stream settings",
    "namespaceFile": "streams"
  },
  {
    "name": "put-streams-name-query",
    "namespace": "streams",
    "description": "Upsert query stream settings",
    "namespaceFile": "streams"
  },
  {
    "name": "post-streams-name-content-export",
    "namespace": "streams",
    "description": "Export stream content",
    "namespaceFile": "streams"
  },
  {
    "name": "post-streams-name-content-import",
    "namespace": "streams",
    "description": "Import content into a stream",
    "namespaceFile": "streams"
  },
  {
    "name": "get-streams-name-queries",
    "namespace": "streams",
    "description": "Get stream queries",
    "namespaceFile": "streams"
  },
  {
    "name": "post-streams-name-queries-bulk",
    "namespace": "streams",
    "description": "Bulk update queries",
    "namespaceFile": "streams"
  },
  {
    "name": "delete-streams-name-queries-queryid",
    "namespace": "streams",
    "description": "Remove a query from a stream",
    "namespaceFile": "streams"
  },
  {
    "name": "put-streams-name-queries-queryid",
    "namespace": "streams",
    "description": "Upsert a query to a stream",
    "namespaceFile": "streams"
  },
  {
    "name": "get-streams-name-significant-events",
    "namespace": "streams",
    "description": "Read the significant events",
    "namespaceFile": "streams"
  },
  {
    "name": "post-streams-name-significant-events-generate",
    "namespace": "streams",
    "description": "Generate significant events",
    "namespaceFile": "streams"
  },
  {
    "name": "post-streams-name-significant-events-preview",
    "namespace": "streams",
    "description": "Preview significant events",
    "namespaceFile": "streams"
  },
  {
    "name": "get-streams-streamname-attachments",
    "namespace": "streams",
    "description": "Get stream attachments",
    "namespaceFile": "streams"
  },
  {
    "name": "post-streams-streamname-attachments-bulk",
    "namespace": "streams",
    "description": "Bulk update attachments",
    "namespaceFile": "streams"
  },
  {
    "name": "delete-streams-streamname-attachments-attachmenttype-attachmentid",
    "namespace": "streams",
    "description": "Unlink an attachment from a stream",
    "namespaceFile": "streams"
  },
  {
    "name": "put-streams-streamname-attachments-attachmenttype-attachmentid",
    "namespace": "streams",
    "description": "Link an attachment to a stream",
    "namespaceFile": "streams"
  },
  {
    "name": "get-status",
    "namespace": "system",
    "description": "Get Kibana's current status",
    "namespaceFile": "system"
  },
  {
    "name": "task-manager-health",
    "namespace": "task-manager",
    "description": "Get the task manager health",
    "namespaceFile": "task-manager"
  },
  {
    "name": "delete-workflows",
    "namespace": "workflows",
    "description": "Bulk delete workflows",
    "namespaceFile": "workflows"
  },
  {
    "name": "get-workflows",
    "namespace": "workflows",
    "description": "Get workflows",
    "namespaceFile": "workflows"
  },
  {
    "name": "post-workflows",
    "namespace": "workflows",
    "description": "Bulk create workflows",
    "namespaceFile": "workflows"
  },
  {
    "name": "get-workflows-aggs",
    "namespace": "workflows",
    "description": "Get workflow aggregations",
    "namespaceFile": "workflows"
  },
  {
    "name": "get-workflows-connectors",
    "namespace": "workflows",
    "description": "Get available connectors",
    "namespaceFile": "workflows"
  },
  {
    "name": "get-workflows-executions-executionid",
    "namespace": "workflows",
    "description": "Get a workflow execution",
    "namespaceFile": "workflows"
  },
  {
    "name": "post-workflows-executions-executionid-cancel",
    "namespace": "workflows",
    "description": "Cancel a workflow execution",
    "namespaceFile": "workflows"
  },
  {
    "name": "get-workflows-executions-executionid-children",
    "namespace": "workflows",
    "description": "Get child executions",
    "namespaceFile": "workflows"
  },
  {
    "name": "get-workflows-executions-executionid-logs",
    "namespace": "workflows",
    "description": "Get execution logs",
    "namespaceFile": "workflows"
  },
  {
    "name": "post-workflows-executions-executionid-resume",
    "namespace": "workflows",
    "description": "Resume a workflow execution",
    "namespaceFile": "workflows"
  },
  {
    "name": "get-workflows-executions-executionid-step-stepexecutionid",
    "namespace": "workflows",
    "description": "Get a step execution",
    "namespaceFile": "workflows"
  },
  {
    "name": "post-workflows-export",
    "namespace": "workflows",
    "description": "Export workflows",
    "namespaceFile": "workflows"
  },
  {
    "name": "post-workflows-mget",
    "namespace": "workflows",
    "description": "Get workflows by IDs",
    "namespaceFile": "workflows"
  },
  {
    "name": "get-workflows-schema",
    "namespace": "workflows",
    "description": "Get workflow JSON schema",
    "namespaceFile": "workflows"
  },
  {
    "name": "get-workflows-stats",
    "namespace": "workflows",
    "description": "Get workflow statistics",
    "namespaceFile": "workflows"
  },
  {
    "name": "post-workflows-step-test",
    "namespace": "workflows",
    "description": "Test a workflow step",
    "namespaceFile": "workflows"
  },
  {
    "name": "post-workflows-test",
    "namespace": "workflows",
    "description": "Test a workflow",
    "namespaceFile": "workflows"
  },
  {
    "name": "post-workflows-workflow",
    "namespace": "workflows",
    "description": "Create a workflow",
    "namespaceFile": "workflows"
  },
  {
    "name": "delete-workflows-workflow-id",
    "namespace": "workflows",
    "description": "Delete a workflow",
    "namespaceFile": "workflows"
  },
  {
    "name": "get-workflows-workflow-id",
    "namespace": "workflows",
    "description": "Get a workflow",
    "namespaceFile": "workflows"
  },
  {
    "name": "put-workflows-workflow-id",
    "namespace": "workflows",
    "description": "Update a workflow",
    "namespaceFile": "workflows"
  },
  {
    "name": "post-workflows-workflow-id-clone",
    "namespace": "workflows",
    "description": "Clone a workflow",
    "namespaceFile": "workflows"
  },
  {
    "name": "post-workflows-workflow-id-run",
    "namespace": "workflows",
    "description": "Run a workflow",
    "namespaceFile": "workflows"
  },
  {
    "name": "get-workflows-workflow-workflowid-executions",
    "namespace": "workflows",
    "description": "Get workflow executions",
    "namespaceFile": "workflows"
  },
  {
    "name": "get-workflows-workflow-workflowid-executions-steps",
    "namespace": "workflows",
    "description": "Get workflow step executions",
    "namespaceFile": "workflows"
  }
] as const
