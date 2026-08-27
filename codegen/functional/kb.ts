/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Codegen for Kibana functional tests.
 *
 * Reads client-agnostic YAML test definitions from
 * `test/functional/kb/definitions/` — authored in the same format as
 * elastic/elasticsearch-clients-tests (requires / setup / teardown / named
 * test sections, `do` blocks referencing `namespace.action` operations, and
 * `match` / `set` / `is_true` / `length` / `gt` … assertions) — and emits
 * bash scripts that exercise those Kibana APIs through the CLI.
 *
 * The definitions never mention the CLI: they describe Kibana API operations
 * and expected responses. This generator is the only place that knows the
 * client is the CLI. It maps each `namespace.action` to `stack kb <namespace>
 * <command>` and routes params/body to flags, reusing the shared mapper and
 * generator that also drive the Elasticsearch functional tests.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { join, basename } from 'node:path'
import { loadAllKbApis } from '../../src/kb/apis.ts'
import { parseTestFile } from './parser.ts'
import { generateScript, generateRunner } from './generator.ts'

const DEFS_DIR = 'test/functional/kb/definitions'
const OUT_DIR = 'test/functional/kb/generated'

// The KB test-runner container builds the CLI but does not install it on PATH,
// so scripts invoke the built entry point directly (unlike the ES tests, which
// call the globally-installed `elastic` binary).
const KB_PREAMBLE = [
  'exec < /dev/null',
  'SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"',
  'REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"',
  'ELASTIC="node $REPO_ROOT/dist/cli.js --json"',
  'RESPONSE=""'
]

const apis = await loadAllKbApis()

mkdirSync(OUT_DIR, { recursive: true })

const yamlFiles = readdirSync(DEFS_DIR)
  .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
  .sort()

const scriptNames: string[] = []
const allSkippedActions = new Set<string>()

const skippedFiles = new Set<string>([
  // environment defect:
  // significant events APIs not available in provided environment
  "significantevents_delete_streams_name_queries_queryid.yml",
  "significantevents_get_streams_name_queries.yml",
  "significantevents_get_streams_name_significant_events.yml",
  "significantevents_post_streams_name_queries_bulk.yml",
  "significantevents_put_streams_name_queries_queryid.yml",

  // environment defect:
  // most workflows APIs not available on provided environment
  "workflows_get_workflows.yml",
  "workflows_get_workflows_executions_executionid.yml",
  "workflows_get_workflows_executions_executionid_children.yml",
  "workflows_get_workflows_executions_executionid_logs.yml",
  "workflows_get_workflows_executions_executionid_step_stepexecutionid.yml",
  "workflows_get_workflows_executions_executionid_steps_stepid_resume_external.yml",
  "workflows_get_workflows_executions_executionid_steps_stepid_resume_external_form.yml",
  "workflows_get_workflows_workflow_executions.yml",
  "workflows_get_workflows_workflow_workflowid_executions.yml",
  "workflows_get_workflows_workflow_workflowid_executions_steps.yml",
  "workflows_post_workflows_executions_executionid_cancel.yml",
  "workflows_post_workflows_executions_executionid_resume.yml",
  "workflows_post_workflows_executions_executionid_steps_stepid_resume_external.yml",
  "workflows_post_workflows_step_test.yml",
  "workflows_post_workflows_workflow_id_run.yml",
  "workflows_put_workflows_managed_workflow_id.yml",

  // Environment defect:
  // Many APM APIs not available in provided environment
  "apm_agent_configuration_get_environments_for_service.yml",
  'apm_agent_configuration_search_single_configuration.yml',
  'apm_annotations_create_annotation.yml',
  'apm_annotations_get_annotation.yml',


  // Environment defect:
  // many security and security-related APIs not available in this environment
  "security_detections_api_export_rules.yml",
  "security_detections_api_import_rules.yml",
  "security_detections_api_patch_rule.yml",
  "security_detections_api_search_alerts.yml",
  "security_detections_api_search_attacks.yml",
  "security_detections_api_set_attacks_assignees.yml",
  "security_detections_api_set_attacks_status.yml",
  "security_detections_api_set_attacks_tags.yml",
  "security_detections_api_update_rule.yml",
  "security_attack_discovery_api_attack_discovery_find.yml",
  "security_attack_discovery_api_bulk_delete_attack_discovery_schedules.yml",
  "security_attack_discovery_api_bulk_disable_attack_discovery_schedules.yml",
  "security_attack_discovery_api_bulk_enable_attack_discovery_schedules.yml",
  "security_attack_discovery_api_create_attack_discovery_schedules.yml",
  "security_attack_discovery_api_delete_attack_discovery_schedules.yml",
  "security_attack_discovery_api_disable_attack_discovery_schedules.yml",
  "security_attack_discovery_api_enable_attack_discovery_schedules.yml",
  "security_attack_discovery_api_find_attack_discovery_schedules.yml",
  "security_attack_discovery_api_get_attack_discovery_generations.yml",
  "security_attack_discovery_api_get_attack_discovery_schedules.yml",
  "security_attack_discovery_api_post_attack_discovery_bulk.yml",
  "security_attack_discovery_api_update_attack_discovery_schedules.yml",
  "security_endpoint_management_api_endpoint_get_actions_list.yml",
  "security_endpoint_management_api_endpoint_get_actions_status.yml",
  "security_endpoint_management_api_endpoint_script_library_create_script.yml",
  "security_endpoint_management_api_endpoint_script_library_delete_script.yml",
  "security_endpoint_management_api_endpoint_script_library_get_one_script.yml",
  "security_endpoint_management_api_endpoint_script_library_list_scripts.yml",
  "security_endpoint_management_api_endpoint_script_library_patch_update_script.yml",
  "security_endpoint_management_api_get_endpoint_metadata_list.yml",
  "security_entity_analytics_api_assign_watchlist_entities.yml",
  "security_entity_analytics_api_bulk_upsert_asset_criticality_records.yml",
  "security_entity_analytics_api_configure_risk_engine_saved_object.yml",
  "security_entity_analytics_api_create_priv_mon_user.yml",
  "security_entity_analytics_api_create_watchlist.yml",
  "security_entity_analytics_api_delete_monitoring_engine.yml",
  "security_entity_analytics_api_delete_priv_mon_user.yml",
  "security_entity_analytics_api_disable_monitoring_engine.yml",
  "security_entity_analytics_api_get_privileged_access_detection_package_status.yml",
  "security_entity_analytics_api_get_risk_score_history.yml",
  "security_entity_analytics_api_get_watchlist.yml",
  "security_entity_analytics_api_init_monitoring_engine.yml",
  "security_entity_analytics_api_install_privileged_access_detection_package.yml",
  "security_entity_analytics_api_list_priv_mon_users.yml",
  "security_entity_analytics_api_list_watchlists.yml",
  "security_entity_analytics_api_priv_mon_health.yml",
  "security_entity_analytics_api_priv_mon_privileges.yml",
  "security_entity_analytics_api_privmon_bulk_upload_users_c_s_v.yml",
  "security_entity_analytics_api_schedule_monitoring_engine.yml",
  "security_entity_analytics_api_schedule_risk_engine_now.yml",
  "security_entity_analytics_api_unassign_watchlist_entities.yml",
  "security_entity_analytics_api_update_priv_mon_user.yml",
  "security_entity_analytics_api_update_watchlist.yml",
  "security_entity_analytics_api_upload_watchlist_csv.yml",
  "security_entity_store_delete_security_entity_store_entities.yml",
  "security_entity_store_get_security_entity_store_resolution_group.yml",
  "security_entity_store_post_security_entity_store_entities_entitytype.yml",
  "security_entity_store_post_security_entity_store_install.yml",
  "security_entity_store_post_security_entity_store_resolution_link.yml",
  "security_entity_store_post_security_entity_store_resolution_unlink.yml",
  "security_entity_store_post_security_entity_store_uninstall.yml",
  "security_entity_store_put_security_entity_store.yml",
  "security_entity_store_put_security_entity_store_entities_bulk.yml",
  "security_entity_store_put_security_entity_store_entities_entitytype.yml",
  "security_entity_store_put_security_entity_store_start.yml",
  "security_entity_store_put_security_entity_store_stop.yml",
  "security_exceptions_api_create_exception_list_item.yml",
  "security_exceptions_api_create_rule_exception_list_items.yml",
  "security_exceptions_api_create_shared_exception_list.yml",
  "security_exceptions_api_delete_exception_list_item.yml",
  "security_exceptions_api_find_exception_list_items.yml",
  "security_exceptions_api_read_exception_list_item.yml",
  "security_exceptions_api_update_exception_list_item.yml",
  "security_lists_api_export_list_items.yml",
  "security_lists_api_import_list_items.yml",
  "security_osquery_api_osquery_copy_packs.yml",
  "security_osquery_api_osquery_copy_saved_query.yml",
  "security_osquery_api_osquery_create_live_query.yml",
  "security_osquery_api_osquery_create_packs.yml",
  "security_osquery_api_osquery_create_saved_query.yml",
  "security_osquery_api_osquery_delete_packs.yml",
  "security_osquery_api_osquery_delete_saved_query.yml",
  "security_osquery_api_osquery_export_live_query_results.yml",
  "security_osquery_api_osquery_get_live_query_details.yml",
  "security_osquery_api_osquery_get_live_query_results.yml",
  "security_osquery_api_osquery_get_packs_details.yml",
  "security_osquery_api_osquery_get_saved_query_details.yml",
  "security_osquery_api_osquery_get_unified_history.yml",
  "security_osquery_api_osquery_update_packs.yml",
  "security_osquery_api_osquery_update_saved_query.yml",
  "security_solution_initialization_api_initialize_security_solution.yml",
  "security_timeline_api_copy_timeline.yml",
  "security_timeline_api_export_timelines.yml",
  "security_timeline_api_import_timelines.yml",
  "security_timeline_api_persist_favorite_route.yml",
  "security_timeline_api_resolve_timeline.yml",
  'alerting_post_alerting_rules_backfill_schedule.yml',
  'alerting_get_alerting_rules_backfill_id.yml',
  'alerting_delete_alerting_rules_backfill_id.yml',
  'alerting_get_alerting_rule_id_query_inspector.yml',

  // Agent-invoking endpoints. The A2A send-task POST (/api/agent_builder/a2a/{agentId},
  // method tasks/send) previously surfaced as `kibana_api_error: fetch failed` with no
  // status_code: the route answers with a same-host 3xx and the client's `redirect: 'error'`
  // turned that into an opaque transport rejection before any HTTP status was seen. Fixed in
  // src/lib/kibana-client.ts by following redirects with a same-origin guard, so
  // `agent_builder.yml` is no longer skipped. The two below invoke/stream through separate
  // routes (consumption, MCP) and stay skipped until verified against a live environment.
  // CLI defect, not a test defect: the agent-builder consumption endpoint has an
  // all-optional request body, but the CLI omits the body entirely when no body
  // flags are passed (collectBody returns undefined), so Kibana rejects the request
  // with "[request body]: expected a plain object value, but found [null] instead."
  // Any agent invoking this command with only --agent-id hits the same error. The
  // agent-builder MCP endpoint (post_agent_builder_mcp) has the same all-optional
  // body and fails identically when called with no body flags. The security-role
  // query endpoint (misc.post_security_role_query, POST /api/security/role/_query)
  // is a third instance: its body is an all-optional object, the test invokes it
  // with `{}`, so the CLI sends no body and Kibana rejects the null with the same
  // "expected a plain object value, but found [null] instead" 400. Skip all three
  // until the CLI sends {} for endpoints that require an object body.
  'agent_builder.yml',
  'agent_builder_consumption.yml',
  'agent_builder_mcp_post.yml',
  'misc_post_security_role_query.yml',

  // Not a CLI defect: these three tests schedule a backfill (POST
  // /api/alerting/rules/_backfill/_schedule) and read the returned backfill id, but
  // backfill scheduling is only supported for rule types explicitly registered with
  // backfill support (security detection rules). On the target serverless project the
  // only available stack rule type, `.es-query`, is rejected with `Rule type
  // ".es-query" ... is not supported`, and security rule types like `siem.queryRule`
  // are `not registered`, so scheduling always returns an error with no id — no test
  // data change can produce one. (The out-of-window `2024-01-01` range compounds this:
  // it trips `Backfill cannot look back more than 90 days`, whose top-level error object
  // makes `jq '.[0].id'` abort the script and surfaces as an `input_error` crash in
  // teardown.) The `_backfill/_find` test needs no scheduled backfill and is unaffected.

  // @elastic/schemas defect:
  // Upstream bugs tracked at:
  // https://github.com/elastic/schemas-js/issues/77
  // https://github.com/elastic/schemas-js/issues/78
  'dashboards_create.yml',
  'dashboards_delete.yml',
  'dashboards_get.yml',
  'dashboards_upsert.yml',
  'dashboards_search.yml',
  'ml_ml_update_jobs_spaces.yml',
  'ml_ml_update_trained_models_spaces.yml',
  'visualizations_create_visualization.yml',

  // visualizations upsert/get/delete/search all depend on upsert_visualization,
  // which has no input schema and hits the same null-body rejection (see issue 77
  // linked above). get/delete/search create their fixture via upsert in setup.
  'visualizations_upsert_visualization.yml',
  'visualizations_get_visualization.yml',
  'visualizations_delete_visualization.yml',
  'visualizations_search_visualizations.yml',

  // Environment defect, not a test defect: these tests derive an agent id from
  // `elastic-agents.get_fleet_agents` in setup (`items.0.id`) and feed it to a
  // request that requires a live, enrolled Fleet agent. The stack/serverless test
  // environment has no enrolled agents, so `get_fleet_agents` returns `items: []`,
  // `items.0.id` resolves to null, and every downstream call fails (e.g. 404
  // "Agent null not found"). No test-data, YAML, or codegen change can enroll a
  // real agent (enrollment requires a running Elastic Agent process connecting to
  // Fleet Server). Skip until the test environment provides an enrolled agent.
  'elastic_agent_actions_cancel_action.yml',
  'elastic_agent_actions_post_action.yml',
  'elastic_agent_actions_post_fleet_agents_bulk_reassign.yml',
  'elastic_agent_actions_post_fleet_agents_bulk_remove_collectors.yml',
  'elastic_agent_actions_post_fleet_agents_bulk_request_diagnostics.yml',
  'elastic_agent_actions_post_fleet_agents_bulk_rollback.yml',
  'elastic_agent_actions_post_fleet_agents_bulk_unenroll.yml',
  'elastic_agent_actions_post_fleet_agents_bulk_update_agent_tags.yml',
  'elastic_agent_actions_reassign.yml',
  'elastic_agent_actions_request_diagnostics.yml',
  'elastic_agent_actions_rollback.yml',
  'elastic_agent_actions_unenroll.yml',
  'elastic_agent_actions_upgrade.yml',
  'elastic_agents_delete_fleet_agents_agentid.yml',
  'elastic_agents_delete_fleet_agents_files_fileid.yml',
  'elastic_agents_get_fleet_agent_status_data.yml',
  'elastic_agents_get_fleet_agents_agentid.yml',
  'elastic_agents_get_fleet_agents_agentid_effective_config.yml',
  'elastic_agents_get_fleet_agents_agentid_uploads.yml',
  'elastic_agents_get_fleet_agents_files_fileid_filename.yml',
  'elastic_agents_post_fleet_agents.yml',
  'elastic_agents_post_fleet_agents_agentid_migrate.yml',
  'elastic_agents_post_fleet_agents_agentid_privilege_level_change.yml',
  'elastic_agents_post_fleet_agents_bulk_migrate.yml',
  'elastic_agents_post_fleet_agents_bulk_privilege_level_change.yml',
  'elastic_agents_put_fleet_agents_agentid.yml',
  'fleet_internals_post_fleet_health_check.yml',

  // test defect:
  // multi-space fixture required to run
  'elastic_package_manager_epm_delete_fleet_epm_packages_pkgname_pkgversion_kibana_assets.yml',

  // Environment defect:
  // requested file missing on EPR
  'elastic_package_manager_epm_get_fleet_epm_packages_pkgname_pkgversion_filepath.yml',

  // Environment defect:
  // Kibana SLO APIs not available in provided environment
  "slo_bulk_delete_op.yml",
  "slo_bulk_snapshot_op.yml",
  "slo_create_slo_op.yml",
  "slo_delete_rollup_data_op.yml",
  "slo_delete_slo_instances_op.yml",
  "slo_delete_slo_op.yml",
  "slo_disable_slo_op.yml",
  "slo_enable_slo_op.yml",
  "slo_find_slos_op.yml",
  "slo_get_definitions_op.yml",
  "slo_get_slo_op.yml",
  "slo_get_snapshot_op.yml",
  "slo_reset_slo_op.yml",
  "slo_update_slo_op.yml",

  // Environment defect:
  // provided serverless test environment has needed security APIs disabled
  'elastic_package_manager_epm_post_fleet_epm_packages_pkgname_pkgversion_transforms_authorize.yml',

  // Environment defect:
  //`cloud_security_posture` can't be installed in provided serverless environment
  'fleet_agentless_policies_delete_fleet_agentless_policies_policyid.yml',
  'fleet_agentless_policies_get_fleet_agentless_policies_policyid.yml',
  'fleet_agentless_policies_post_fleet_agentless_policies.yml',
  'fleet_agentless_policies_put_fleet_agentless_policies_policyid.yml',

  // Environment defect:
  // managed integrations are not provisioned in provided serverless environment
  'fleet_managed_integrations_delete_fleet_managed_integrations_policyid.yml',
  'fleet_managed_integrations_get_fleet_managed_integrations_policyid.yml',
  'fleet_managed_integrations_post_fleet_managed_integrations.yml',
  'fleet_managed_integrations_put_fleet_managed_integrations_policyid.yml',

  // Environment defect:
  // these tests create a cloud connector in setup (POST /api/fleet/cloud_connectors),
  // which provisions a Fleet package policy using the `default` namespace. The target
  // serverless test deployment restricts policy namespaces to the `testprefix` prefix.
  'fleet_cloud_connectors_post_fleet_cloud_connectors.yml',
  'fleet_cloud_connectors_delete_fleet_cloud_connectors_cloudconnectorid.yml',
  'fleet_cloud_connectors_get_fleet_cloud_connectors_cloudconnectorid.yml',
  'fleet_cloud_connectors_get_fleet_cloud_connectors_cloudconnectorid_usage.yml',
  'fleet_cloud_connectors_put_fleet_cloud_connectors_cloudconnectorid.yml',

  // Environment defect:
  // `400 illegal_argument_exception: creating derived api keys requires an explicit role descriptor that is empty (has no privileges)`
  'fleet_outputs_post_fleet_logstash_api_keys.yml',

  // Environment defect:
  // `403 Forbidden: Fleet server host must have default URL in serverless:
  // https://<deployment-id>.fleet.<region>.<csp>.elastic.cloud:443`.
  // That URL is deployment-specific and unknown at authoring time.
  'fleet_server_hosts_post_fleet_fleet_server_hosts.yml',
  'fleet_server_hosts_delete_fleet_fleet_server_hosts_itemid.yml',
  'fleet_server_hosts_get_fleet_fleet_server_hosts_itemid.yml',
  'fleet_server_hosts_put_fleet_fleet_server_hosts_itemid.yml',

  // Environment defect:
  // rotating an uninstall token (POST /api/fleet/uninstall_tokens/{policyId}/rotate)
  // is only allowed for agent policies with tamper protection enabled.
  'fleet_uninstall_tokens_post_fleet_uninstall_tokens_agentpolicyid_rotate.yml',

  // Environment defect:
  // rotating the Fleet message signing key pair
  // (POST /api/fleet/message_signing_service/rotate_key_pair)
  // requires superuser privileges.
  'message_signing_service_post_fleet_message_signing_service_rotate_key_pair.yml',

  // Environment defect:
  // Security AI Assistant API is unregistered on the target deployment
  'security_ai_assistant_api_create_conversation.yml',
  'security_ai_assistant_api_delete_all_conversations.yml',
  'security_ai_assistant_api_delete_conversation.yml',
  'security_ai_assistant_api_read_conversation.yml',
  'security_ai_assistant_api_update_conversation.yml',
  'security_ai_assistant_api_create_knowledge_base.yml',
  'security_ai_assistant_api_post_knowledge_base.yml',
  'security_ai_assistant_api_get_knowledge_base.yml',
  'security_ai_assistant_api_read_knowledge_base.yml',
  'security_ai_assistant_api_create_knowledge_base_entry.yml',
  'security_ai_assistant_api_read_knowledge_base_entry.yml',
  'security_ai_assistant_api_update_knowledge_base_entry.yml',
  'security_ai_assistant_api_delete_knowledge_base_entry.yml',
  'security_ai_assistant_api_find_knowledge_base_entries.yml',
  'security_ai_assistant_api_perform_knowledge_base_entry_bulk_action.yml',
  'security_ai_assistant_api_find_anonymization_fields.yml',
  'security_ai_assistant_api_perform_anonymization_fields_bulk_action.yml',
  'security_ai_assistant_api_find_prompts.yml',
  'security_ai_assistant_api_perform_prompts_bulk_action.yml',
  'security_ai_assistant_api_find_conversations.yml'
])

for (const file of yamlFiles) {
  const name = basename(file).replace(/\.ya?ml$/, '')

  if (skippedFiles.has(file)) {
    console.log(`  skipped (known-broken definition): ${file}`)
    continue
  }
  const content = readFileSync(join(DEFS_DIR, file), 'utf-8')
  const testFile = parseTestFile(content, file)

  // Serverless-only tests cannot run against the stack Kibana used in CI.
  if (testFile.requires.stack === false) {
    console.log(`  skipped (stack: false): ${file}`)
    continue
  }

  const result = generateScript(testFile, apis, {
    clientArgs: ['stack', 'kb'],
    preamble: KB_PREAMBLE
  })

  for (const action of result.skippedActions) allSkippedActions.add(action)

  const outPath = join(OUT_DIR, `${name}.sh`)
  writeFileSync(outPath, result.script, { mode: 0o755 })
  scriptNames.push(name)
  console.log(`  generated: ${outPath}`)
}

const runner = generateRunner(scriptNames.map((n) => `${n}.sh`))
writeFileSync(join(OUT_DIR, 'run.sh'), runner, { mode: 0o755 })

console.log(`\nGenerated ${scriptNames.length} scripts + run.sh → ${OUT_DIR}/`)
if (allSkippedActions.size > 0) {
  console.log(`Skipped unmapped actions: ${[...allSkippedActions].sort().join(', ')}`)
}
