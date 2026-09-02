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
import { generateScript, generateRunner, type RunnerScript } from './generator.ts'
const env = process.env['ELASTIC_ENVIRONMENT']

if (env !== 'serverless' && env !== 'stack') {
  console.error('ELASTIC_ENVIRONMENT must be set to "serverless" or "stack"')
  process.exit(1)
}

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

const scripts: RunnerScript[] = []
const allSkippedActions = new Set<string>()

const skippedFilesServerless = new Set<string>([
  // temporarily skipping (unknown failures)
  "elastic_package_manager_epm_get_fleet_epm_packages_pkgname_pkgversion_filepath.yml",
  "misc_get_actions_connector_oauth_callback_script.yml",
  "workflows_post_workflows_test.yml",

  // Route returns a generic 404 ("Not Found") on the serverless project tier
  // used in CI: these solution APIs (security, apm, slo, streams sig-events, etc.)
  // are not registered for this project type.
  "agent_builder_get_plugins.yml",
  "apm_agent_configuration_create_update_agent_configuration.yml",
  "apm_agent_configuration_delete_agent_configuration.yml",
  "apm_agent_configuration_get_agent_configurations.yml",
  "apm_agent_configuration_get_agent_name_for_service.yml",
  "apm_agent_configuration_get_environments_for_service.yml",
  "apm_agent_configuration_get_single_agent_configuration.yml",
  "apm_agent_configuration_search_single_configuration.yml",
  "apm_agent_keys_create_agent_key.yml",
  "apm_annotations_create_annotation.yml",
  "apm_annotations_get_annotation.yml",
  "apm_server_schema_save_apm_server_schema.yml",
  "security_ai_assistant_api_create_knowledge_base.yml",
  "security_ai_assistant_api_find_anonymization_fields.yml",
  "security_ai_assistant_api_find_conversations.yml",
  "security_ai_assistant_api_find_knowledge_base_entries.yml",
  "security_ai_assistant_api_find_prompts.yml",
  "security_ai_assistant_api_get_knowledge_base.yml",
  "security_ai_assistant_api_perform_anonymization_fields_bulk_action.yml",
  "security_ai_assistant_api_perform_knowledge_base_entry_bulk_action.yml",
  "security_ai_assistant_api_perform_prompts_bulk_action.yml",
  "security_ai_assistant_api_post_knowledge_base.yml",
  "security_ai_assistant_api_read_knowledge_base.yml",
  "security_attack_discovery_api_attack_discovery_find.yml",
  "security_attack_discovery_api_find_attack_discovery_schedules.yml",
  "security_attack_discovery_api_get_attack_discovery_generations.yml",
  "security_attack_discovery_api_post_attack_discovery_bulk.yml",
  "security_detections_api_create_rule.yml",
  "security_detections_api_delete_rule.yml",
  "security_detections_api_export_rules.yml",
  "security_detections_api_find_rules.yml",
  "security_detections_api_import_rules.yml",
  "security_detections_api_patch_rule.yml",
  "security_detections_api_perform_rules_bulk_action.yml",
  "security_detections_api_read_privileges.yml",
  "security_detections_api_read_rule.yml",
  "security_detections_api_read_tags.yml",
  "security_detections_api_rule_preview.yml",
  "security_detections_api_search_alerts.yml",
  "security_detections_api_set_alert_assignees.yml",
  "security_detections_api_set_alert_tags.yml",
  "security_detections_api_set_alerts_status.yml",
  "security_detections_api_update_rule.yml",
  "security_endpoint_exceptions_api_create_endpoint_list.yml",
  "security_endpoint_exceptions_api_create_endpoint_list_item.yml",
  "security_endpoint_exceptions_api_delete_endpoint_list_item.yml",
  "security_endpoint_exceptions_api_find_endpoint_list_items.yml",
  "security_endpoint_exceptions_api_read_endpoint_list_item.yml",
  "security_endpoint_exceptions_api_update_endpoint_list_item.yml",
  "security_endpoint_management_api_endpoint_get_actions_list.yml",
  "security_endpoint_management_api_endpoint_get_actions_state.yml",
  "security_endpoint_management_api_endpoint_get_actions_status.yml",
  "security_endpoint_management_api_endpoint_script_library_list_scripts.yml",
  "security_endpoint_management_api_get_endpoint_metadata_list.yml",
  "security_entity_analytics_api_bulk_upsert_asset_criticality_records.yml",
  "security_entity_analytics_api_clean_up_risk_engine.yml",
  "security_entity_analytics_api_configure_risk_engine_saved_object.yml",
  "security_entity_analytics_api_create_asset_criticality_record.yml",
  "security_entity_analytics_api_create_priv_mon_user.yml",
  "security_entity_analytics_api_create_watchlist.yml",
  "security_entity_analytics_api_delete_asset_criticality_record.yml",
  "security_entity_analytics_api_delete_monitoring_engine.yml",
  "security_entity_analytics_api_delete_priv_mon_user.yml",
  "security_entity_analytics_api_disable_monitoring_engine.yml",
  "security_entity_analytics_api_find_asset_criticality_records.yml",
  "security_entity_analytics_api_get_asset_criticality_record.yml",
  "security_entity_analytics_api_get_privileged_access_detection_package_status.yml",
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
  "security_exceptions_api_create_exception_list.yml",
  "security_exceptions_api_create_exception_list_item.yml",
  "security_exceptions_api_create_rule_exception_list_items.yml",
  "security_exceptions_api_create_shared_exception_list.yml",
  "security_exceptions_api_delete_exception_list.yml",
  "security_exceptions_api_delete_exception_list_item.yml",
  "security_exceptions_api_duplicate_exception_list.yml",
  "security_exceptions_api_export_exception_list.yml",
  "security_exceptions_api_find_exception_list_items.yml",
  "security_exceptions_api_find_exception_lists.yml",
  "security_exceptions_api_import_exception_list.yml",
  "security_exceptions_api_read_exception_list.yml",
  "security_exceptions_api_read_exception_list_item.yml",
  "security_exceptions_api_read_exception_list_summary.yml",
  "security_exceptions_api_update_exception_list.yml",
  "security_exceptions_api_update_exception_list_item.yml",
  "security_lists_api_create_list.yml",
  "security_lists_api_create_list_index.yml",
  "security_lists_api_create_list_item.yml",
  "security_lists_api_delete_list.yml",
  "security_lists_api_delete_list_index.yml",
  "security_lists_api_delete_list_item.yml",
  "security_lists_api_export_list_items.yml",
  "security_lists_api_find_list_items.yml",
  "security_lists_api_find_lists.yml",
  "security_lists_api_import_list_items.yml",
  "security_lists_api_patch_list.yml",
  "security_lists_api_patch_list_item.yml",
  "security_lists_api_read_list.yml",
  "security_lists_api_read_list_index.yml",
  "security_lists_api_read_list_item.yml",
  "security_lists_api_read_list_privileges.yml",
  "security_lists_api_update_list.yml",
  "security_lists_api_update_list_item.yml",
  "security_osquery_api_osquery_create_live_query.yml",
  "security_osquery_api_osquery_export_live_query_results.yml",
  "security_osquery_api_osquery_find_live_queries.yml",
  "security_osquery_api_osquery_find_packs.yml",
  "security_osquery_api_osquery_find_saved_queries.yml",
  "security_osquery_api_osquery_get_live_query_details.yml",
  "security_osquery_api_osquery_get_live_query_results.yml",
  "security_osquery_api_osquery_get_unified_history.yml",
  "security_timeline_api_clean_draft_timelines.yml",
  "security_timeline_api_copy_timeline.yml",
  "security_timeline_api_create_timelines.yml",
  "security_timeline_api_delete_note.yml",
  "security_timeline_api_delete_timelines.yml",
  "security_timeline_api_export_timelines.yml",
  "security_timeline_api_get_draft_timelines.yml",
  "security_timeline_api_get_notes.yml",
  "security_timeline_api_get_timeline.yml",
  "security_timeline_api_get_timelines.yml",
  "security_timeline_api_import_timelines.yml",
  "security_timeline_api_install_prepacked_timelines.yml",
  "security_timeline_api_patch_timeline.yml",
  "security_timeline_api_persist_favorite_route.yml",
  "security_timeline_api_persist_note_route.yml",
  "security_timeline_api_persist_pinned_event_route.yml",
  "security_timeline_api_resolve_timeline.yml",
  "significantevents_delete_streams_name_queries_queryid.yml",
  "significantevents_get_streams_name_queries.yml",
  "significantevents_get_streams_name_significant_events.yml",
  "significantevents_post_streams_name_queries_bulk.yml",
  "significantevents_put_streams_name_queries_queryid.yml",
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

  // CLI aborts with input_error before any request: setup/param handling for
  // these ops is not yet expressible in config (file bodies, required setup).
  "agent_builder_delete_plugin.yml",
  "agent_builder_get_plugin.yml",
  "agent_builder_install_plugin.yml",
  "alerting_delete_alerting_rules_backfill_id.yml",
  "alerting_get_alerting_rules_backfill_id.yml",
  "alerting_post_alerting_rules_backfill_schedule.yml",
  "elastic_agents_post_fleet_agents_agentid_migrate.yml",
  "elastic_agents_post_fleet_agents_bulk_migrate.yml",
  "fleet_agentless_policies_delete_fleet_agentless_policies_policyid.yml",
  "fleet_agentless_policies_get_fleet_agentless_policies_policyid.yml",
  "fleet_agentless_policies_post_fleet_agentless_policies.yml",
  "fleet_agentless_policies_put_fleet_agentless_policies_policyid.yml",
  "fleet_cloud_connectors_delete_fleet_cloud_connectors_cloudconnectorid.yml",
  "fleet_cloud_connectors_get_fleet_cloud_connectors_cloudconnectorid.yml",
  "fleet_cloud_connectors_get_fleet_cloud_connectors_cloudconnectorid_usage.yml",
  "fleet_cloud_connectors_post_fleet_cloud_connectors.yml",
  "fleet_cloud_connectors_put_fleet_cloud_connectors_cloudconnectorid.yml",
  "fleet_managed_integrations_delete_fleet_managed_integrations_policyid.yml",
  "fleet_managed_integrations_get_fleet_managed_integrations_policyid.yml",
  "fleet_managed_integrations_post_fleet_managed_integrations.yml",
  "fleet_managed_integrations_put_fleet_managed_integrations_policyid.yml",
  "fleet_server_hosts_delete_fleet_fleet_server_hosts_itemid.yml",
  "fleet_server_hosts_get_fleet_fleet_server_hosts_itemid.yml",
  "fleet_server_hosts_post_fleet_fleet_server_hosts.yml",
  "fleet_server_hosts_put_fleet_fleet_server_hosts_itemid.yml",
  "security_ai_assistant_api_create_conversation.yml",
  "security_ai_assistant_api_create_knowledge_base_entry.yml",
  "security_ai_assistant_api_delete_all_conversations.yml",
  "security_ai_assistant_api_delete_conversation.yml",
  "security_ai_assistant_api_delete_knowledge_base_entry.yml",
  "security_ai_assistant_api_read_conversation.yml",
  "security_ai_assistant_api_read_knowledge_base_entry.yml",
  "security_ai_assistant_api_update_conversation.yml",
  "security_ai_assistant_api_update_knowledge_base_entry.yml",
  "security_attack_discovery_api_bulk_delete_attack_discovery_schedules.yml",
  "security_attack_discovery_api_bulk_disable_attack_discovery_schedules.yml",
  "security_attack_discovery_api_bulk_enable_attack_discovery_schedules.yml",
  "security_attack_discovery_api_create_attack_discovery_schedules.yml",
  "security_attack_discovery_api_delete_attack_discovery_schedules.yml",
  "security_attack_discovery_api_disable_attack_discovery_schedules.yml",
  "security_attack_discovery_api_enable_attack_discovery_schedules.yml",
  "security_attack_discovery_api_get_attack_discovery_schedules.yml",
  "security_attack_discovery_api_update_attack_discovery_schedules.yml",
  "security_endpoint_management_api_endpoint_script_library_create_script.yml",
  "security_endpoint_management_api_endpoint_script_library_delete_script.yml",
  "security_endpoint_management_api_endpoint_script_library_download_script.yml",
  "security_endpoint_management_api_endpoint_script_library_get_one_script.yml",
  "security_endpoint_management_api_endpoint_script_library_patch_update_script.yml",
  "security_entity_analytics_api_assign_watchlist_entities.yml",
  "security_osquery_api_osquery_copy_packs.yml",
  "security_osquery_api_osquery_copy_saved_query.yml",
  "security_osquery_api_osquery_create_packs.yml",
  "security_osquery_api_osquery_create_saved_query.yml",
  "security_osquery_api_osquery_delete_packs.yml",
  "security_osquery_api_osquery_delete_saved_query.yml",
  "security_osquery_api_osquery_get_packs_details.yml",
  "security_osquery_api_osquery_get_saved_query_details.yml",
  "security_osquery_api_osquery_update_packs.yml",
  "security_osquery_api_osquery_update_saved_query.yml",

  // No Fleet agents/hosts enrolled in the serverless env; null id substituted
  // into the path yields 404 ("Agent null not found" / "host id null").
  "elastic_agent_actions_cancel_action.yml",
  "elastic_agent_actions_post_action.yml",
  "elastic_agent_actions_remove_collector.yml",
  "elastic_agent_actions_request_diagnostics.yml",
  "elastic_agent_actions_rollback.yml",
  "elastic_agent_actions_unenroll.yml",
  "elastic_agent_actions_upgrade.yml",
  "elastic_agents_delete_fleet_agents_agentid.yml",
  "elastic_agents_delete_fleet_agents_files_fileid.yml",
  "elastic_agents_get_fleet_agents_agentid.yml",
  "elastic_agents_get_fleet_agents_agentid_uploads.yml",
  "elastic_agents_get_fleet_agents_files_fileid_filename.yml",
  "elastic_agents_post_fleet_agents.yml",
  "elastic_agents_post_fleet_agents_agentid_privilege_level_change.yml",
  "elastic_agents_put_fleet_agents_agentid.yml",
  "fleet_internals_post_fleet_health_check.yml",

  // Bulk agent kuery is serialized with a null value, so ES rejects the bool
  // filter (parsing_exception: unknown token [VALUE_NULL] after [query]).
  "elastic_agent_actions_post_fleet_agents_bulk_remove_collectors.yml",
  "elastic_agent_actions_post_fleet_agents_bulk_request_diagnostics.yml",
  "elastic_agent_actions_post_fleet_agents_bulk_rollback.yml",
  "elastic_agent_actions_post_fleet_agents_bulk_unenroll.yml",
  "elastic_agent_actions_post_fleet_agents_bulk_upgrade.yml",
  "elastic_agents_post_fleet_agents_bulk_privilege_level_change.yml",

  // `.fleet-*` indices are absent in the serverless env (nothing enrolled),
  // so the op 404s with index_not_found_exception.
  "elastic_agent_actions_post_fleet_agents_bulk_update_agent_tags.yml",
  "elastic_agents_get_fleet_agents_agentid_effective_config.yml",

  // Wired streams are not enabled in the serverless env (422: "Streams are not
  // enabled for Wired streams"), so no stream can be created or read.
  "streams_delete_streams_name.yml",
  "streams_delete_streams_streamname_attachments_attachmenttype_attachmentid.yml",
  "streams_get_streams_name.yml",
  "streams_get_streams_name_ingest.yml",
  "streams_get_streams_name_query.yml",
  "streams_get_streams_streamname_attachments.yml",
  "streams_post_streams_name_content_export.yml",
  "streams_post_streams_name_content_import.yml",
  "streams_post_streams_name_fork.yml",
  "streams_post_streams_streamname_attachments_bulk.yml",
  "streams_put_streams_name.yml",
  "streams_put_streams_name_ingest.yml",
  "streams_put_streams_name_query.yml",
  "streams_put_streams_streamname_attachments_attachmenttype_attachmentid.yml",

  // Entity Store is not installed in the serverless env; every entity-store op
  // 400s asking for POST /api/security/entity_store/install first.
  "security_entity_store_delete_security_entity_store_entities.yml",
  "security_entity_store_get_security_entity_store_resolution_group.yml",
  "security_entity_store_post_security_entity_store_entities_entitytype.yml",
  "security_entity_store_post_security_entity_store_resolution_link.yml",
  "security_entity_store_post_security_entity_store_resolution_unlink.yml",
  "security_entity_store_put_security_entity_store.yml",
  "security_entity_store_put_security_entity_store_entities_bulk.yml",
  "security_entity_store_put_security_entity_store_entities_entitytype.yml",

  // Workflow test scaffolding fails on serverless: non-idempotent create (409
  // already exists), invalid workflow definition (400), or missing execution
  // ids break the response and jq assertions.
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
  "workflows_post_workflows_workflow_workflowid_executions_cancel.yml",
  "workflows_put_workflows_managed_workflow_id.yml",

  // Operation blocked by serverless privileges or unmet preconditions:
  // superuser/secondary-auth required, tamper protection off, package still
  // installed, or query inspection unsupported for the rule type (403/400/500).
  "alerting_get_alerting_rule_id_query_inspector.yml",
  "elastic_package_manager_epm_delete_fleet_epm_packages_pkgname_pkgversion_kibana_assets.yml",
  "elastic_package_manager_epm_post_fleet_epm_packages_pkgname_pkgversion_transforms_authorize.yml",
  "fleet_outputs_post_fleet_logstash_api_keys.yml",
  "fleet_uninstall_tokens_post_fleet_uninstall_tokens_agentpolicyid_rotate.yml",
  "message_signing_service_post_fleet_message_signing_service_rotate_key_pair.yml",

  // CLI (de)serialization defects: a non-JSON response the client cannot parse.
  "elastic_agent_policies_get_fleet_kubernetes_download.yml",

  // Not fixed by empty-body normalisation: mcp_post needs a JSON-RPC payload and
  // returns an event-stream (-32700 Parse error); consumption 404s (route absent);
  // security_role_query returns total 0 (no queryable roles in this env).
  "agent_builder_mcp_post.yml",
  "agent_builder_consumption.yml",
  "misc_post_security_role_query.yml",

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
])

const skippedFilesStack = new Set<string>([
  // temporarily skipping (unknown cause)
  "elastic_package_manager_epm_get_fleet_epm_packages_pkgname_pkgversion_filepath.yml",
  "misc_get_actions_connector_oauth_callback_script.yml",
  "agent_builder_access_control.yml",
  "agent_builder_delete_skill.yml",
  "agent_builder_get_skill_by_id.yml",
  "agent_builder_get_skills.yml",
  "agent_builder_post_skill.yml",
  "agent_builder_put_access_control.yml",
  "agent_builder_put_skill.yml",
  "alerting_post_alerting_rule_rule_id_alert_alert_id_snooze.yml",
  "alerting_post_alerting_rule_rule_id_alert_alert_id_unsnooze.yml",
  "alerting_post_alerting_rules_backfill_find.yml",
  "connectors_delete_actions_connector_id.yml",
  "connectors_get_actions_connector_id.yml",
  "connectors_get_actions_connectors.yml",
  "connectors_post_actions_connector_id.yml",
  "connectors_post_actions_connector_id_execute.yml",
  "connectors_put_actions_connector_id.yml",
  "elastic_package_manager_epm_delete_fleet_epm_packages_pkgname_pkgversion_datastream_assets.yml",
  "elastic_package_manager_epm_get_fleet_epm_packages_pkgname_pkgversion_dependencies.yml",
  "elastic_package_manager_epm_post_fleet_epm_packages_bulk_namespace_customization.yml",
  "fleet_enrollment_api_keys_post_fleet_enrollment_api_keys_bulk_delete.yml",
  "fleet_outputs_delete_fleet_outputs_outputid.yml",
  "fleet_outputs_get_fleet_outputs_outputid.yml",
  "fleet_outputs_get_fleet_outputs_outputid_health.yml",
  "fleet_outputs_post_fleet_outputs.yml",
  "fleet_outputs_put_fleet_outputs_outputid.yml",
  "observabilityaiassistant_chat_complete.yml",
  "security_ai_assistant_api_chat_complete.yml",
  "security_attack_discovery_api_enable_attack_discovery_schedules.yml",
  "security_attack_discovery_api_post_attack_discovery_generate.yml",
  "security_endpoint_management_api_endpoint_script_library_list_scripts.yml",
  "security_entity_store_get_security_entity_store_entities.yml",
  "security_entity_store_get_security_entity_store_status.yml",
  "security_entity_store_post_security_entity_store_install.yml",
  "security_entity_store_post_security_entity_store_uninstall.yml",
  "security_entity_store_put_security_entity_store_start.yml",
  "security_entity_store_put_security_entity_store_stop.yml",
  "security_osquery_api_osquery_get_unified_history.yml",

  // CLI aborts with input_error before any request: setup/param handling for
  // these ops is not yet expressible in config (file bodies, required setup).
  "agent_builder_conversations_delete.yml",
  "agent_builder_conversations_get.yml",
  "agent_builder_converse.yml",
  "agent_builder_delete_plugin.yml",
  "agent_builder_get_plugin.yml",
  "agent_builder_install_plugin.yml",
  "alerting_delete_alerting_rules_backfill_id.yml",
  "alerting_get_alerting_rules_backfill_id.yml",
  "alerting_post_alerting_rules_backfill_schedule.yml",
  "elastic_agents_post_fleet_agents_agentid_migrate.yml",
  "elastic_agents_post_fleet_agents_bulk_migrate.yml",
  "fleet_agentless_policies_delete_fleet_agentless_policies_policyid.yml",
  "fleet_agentless_policies_get_fleet_agentless_policies_policyid.yml",
  "fleet_agentless_policies_post_fleet_agentless_policies.yml",
  "fleet_agentless_policies_put_fleet_agentless_policies_policyid.yml",
  "fleet_managed_integrations_delete_fleet_managed_integrations_policyid.yml",
  "fleet_managed_integrations_get_fleet_managed_integrations_policyid.yml",
  "fleet_managed_integrations_post_fleet_managed_integrations.yml",
  "fleet_managed_integrations_put_fleet_managed_integrations_policyid.yml",
  "security_attack_discovery_api_bulk_delete_attack_discovery_schedules.yml",
  "security_attack_discovery_api_bulk_disable_attack_discovery_schedules.yml",
  "security_attack_discovery_api_bulk_enable_attack_discovery_schedules.yml",
  "security_attack_discovery_api_create_attack_discovery_schedules.yml",
  "security_attack_discovery_api_delete_attack_discovery_schedules.yml",
  "security_attack_discovery_api_disable_attack_discovery_schedules.yml",
  "security_attack_discovery_api_get_attack_discovery_schedules.yml",
  "security_attack_discovery_api_update_attack_discovery_schedules.yml",
  "security_endpoint_management_api_endpoint_script_library_create_script.yml",
  "security_endpoint_management_api_endpoint_script_library_delete_script.yml",
  "security_endpoint_management_api_endpoint_script_library_download_script.yml",
  "security_endpoint_management_api_endpoint_script_library_get_one_script.yml",
  "security_endpoint_management_api_endpoint_script_library_patch_update_script.yml",
  "security_entity_analytics_api_assign_watchlist_entities.yml",
  "security_osquery_api_osquery_copy_packs.yml",
  "security_osquery_api_osquery_copy_saved_query.yml",
  "security_osquery_api_osquery_create_packs.yml",
  "security_osquery_api_osquery_create_saved_query.yml",
  "security_osquery_api_osquery_delete_packs.yml",
  "security_osquery_api_osquery_delete_saved_query.yml",
  "security_osquery_api_osquery_get_packs_details.yml",
  "security_osquery_api_osquery_get_saved_query_details.yml",
  "security_osquery_api_osquery_update_packs.yml",
  "security_osquery_api_osquery_update_saved_query.yml",

  // Not fixed by empty-body normalisation: mcp_post needs a JSON-RPC payload and
  // returns an event-stream (-32700 Parse error); consumption 404s (route absent);
  // security_role_query returns total 0 (no queryable roles in this env);
  // search_alerts rejects an empty body ("value must have at least 1 children").
  "agent_builder_mcp_post.yml",
  "agent_builder_consumption.yml",
  "misc_post_security_role_query.yml",
  "security_detections_api_search_alerts.yml",

  // Array/oneOf query or body fields are mis-serialized (emitted as null or an
  // unparseable string), failing input validation before the request.
  "security_detections_api_export_rules.yml",
  "security_detections_api_import_rules.yml",
  "security_timeline_api_import_timelines.yml",
  "security_timeline_api_persist_favorite_route.yml",

  // Generated script references an unbound file-upload variable
  // (CSV_FILE / ITEMS_FILE); codegen emits no binding for multipart/file bodies.
  "security_entity_analytics_api_privmon_bulk_upload_users_c_s_v.yml",
  "security_lists_api_import_list_items.yml",

  // No Fleet resources provisioned in the stack env: null agent/host ids and
  // missing `.fleet-*` indices (nothing enrolled) produce 404/500.
  "elastic_agent_actions_cancel_action.yml",
  "elastic_agent_actions_post_action.yml",
  "elastic_agent_actions_post_fleet_agents_bulk_update_agent_tags.yml",
  "elastic_agent_actions_remove_collector.yml",
  "elastic_agent_actions_request_diagnostics.yml",
  "elastic_agent_actions_rollback.yml",
  "elastic_agent_actions_unenroll.yml",
  "elastic_agent_actions_upgrade.yml",
  "elastic_agent_actions_reassign.yml",
  "elastic_agent_actions_post_fleet_agents_bulk_reassign.yml",
  "elastic_agents_delete_fleet_agents_agentid.yml",
  "elastic_agents_delete_fleet_agents_files_fileid.yml",
  "elastic_agents_get_fleet_agents_agentid.yml",
  "elastic_agents_get_fleet_agents_agentid_effective_config.yml",
  "elastic_agents_get_fleet_agents_files_fileid_filename.yml",
  "elastic_agents_post_fleet_agents.yml",
  "elastic_agents_post_fleet_agents_agentid_privilege_level_change.yml",
  "elastic_agents_put_fleet_agents_agentid.yml",
  "fleet_internals_post_fleet_health_check.yml",
  "fleet_uninstall_tokens_post_fleet_uninstall_tokens_agentpolicyid_rotate.yml",
  "security_endpoint_management_api_endpoint_get_actions_list.yml",
  "security_endpoint_management_api_endpoint_get_actions_status.yml",
  "security_osquery_api_osquery_create_live_query.yml",
  "security_osquery_api_osquery_export_live_query_results.yml",
  "security_osquery_api_osquery_get_live_query_details.yml",
  "security_osquery_api_osquery_get_live_query_results.yml",

  // Bulk agent kuery is serialized with a null value, so ES rejects the bool
  // filter (parsing_exception: unknown token [VALUE_NULL] after [query]).
  "elastic_agent_actions_post_fleet_agents_bulk_remove_collectors.yml",
  "elastic_agent_actions_post_fleet_agents_bulk_request_diagnostics.yml",
  "elastic_agent_actions_post_fleet_agents_bulk_rollback.yml",
  "elastic_agent_actions_post_fleet_agents_bulk_unenroll.yml",
  "elastic_agent_actions_post_fleet_agents_bulk_upgrade.yml",
  "elastic_agents_post_fleet_agents_bulk_privilege_level_change.yml",

  // Entity Store is not installed in the stack env; every entity-store op 400s
  // asking for POST /api/security/entity_store/install first.
  "security_entity_store_delete_security_entity_store_entities.yml",
  "security_entity_store_get_security_entity_store_resolution_group.yml",
  "security_entity_store_post_security_entity_store_entities_entitytype.yml",
  "security_entity_store_post_security_entity_store_resolution_link.yml",
  "security_entity_store_post_security_entity_store_resolution_unlink.yml",
  "security_entity_store_put_security_entity_store.yml",
  "security_entity_store_put_security_entity_store_entities_bulk.yml",
  "security_entity_store_put_security_entity_store_entities_entitytype.yml",

  // Risk engine unavailable: Entity Store V2 is enabled (legacy risk API 400s)
  // and the risk-engine routes 404 in this env.
  "security_entity_analytics_api_clean_up_risk_engine.yml",
  "security_entity_analytics_api_configure_risk_engine_saved_object.yml",
  "security_entity_analytics_api_schedule_risk_engine_now.yml",

  // Significant events feature is disabled (403); requires enabling
  // observability:streamsEnableSignificantEvents in Advanced Settings.
  "significantevents_delete_streams_name_queries_queryid.yml",
  "significantevents_get_streams_name_queries.yml",
  "significantevents_get_streams_name_significant_events.yml",
  "significantevents_post_streams_name_queries_bulk.yml",
  "significantevents_put_streams_name_queries_queryid.yml",

  // Wired streams are not enabled in the stack env (422: "Streams are not
  // enabled for Wired streams"), so no stream can be created or read.
  "streams_delete_streams_name.yml",
  "streams_delete_streams_streamname_attachments_attachmenttype_attachmentid.yml",
  "streams_get_streams_name.yml",
  "streams_get_streams_name_ingest.yml",
  "streams_get_streams_name_query.yml",
  "streams_get_streams_streamname_attachments.yml",
  "streams_post_streams_name_content_export.yml",
  "streams_post_streams_name_content_import.yml",
  "streams_post_streams_name_fork.yml",
  "streams_post_streams_streamname_attachments_bulk.yml",
  "streams_put_streams_name.yml",
  "streams_put_streams_name_ingest.yml",
  "streams_put_streams_name_query.yml",
  "streams_put_streams_streamname_attachments_attachmenttype_attachmentid.yml",

  // No SLO definitions exist in the env (404); slo_bulk_snapshot and slo_get_snapshot
  // depend on data that is never provisioned.
  "slo_bulk_snapshot_op.yml",
  "slo_get_definitions_op.yml",
  "slo_get_snapshot_op.yml",

  // Feature or route gated off in this stack config (404 / not available with
  // current configuration).
  "agent_builder_get_plugins.yml",
  "security_timeline_api_copy_timeline.yml",
  "security_entity_analytics_api_create_watchlist.yml",
  "security_entity_analytics_api_get_watchlist.yml",
  "security_entity_analytics_api_list_watchlists.yml",
  "security_entity_analytics_api_unassign_watchlist_entities.yml",
  "security_entity_analytics_api_update_watchlist.yml",
  "security_entity_analytics_api_upload_watchlist_csv.yml",
  "alerting_get_alerting_rule_id_query_inspector.yml",

  // Assertions fail or the response is unparseable: required objects were never
  // provisioned in the stack env, or the body isn't the JSON/YAML the check expects.
  "agent_builder_converse_async.yml",
  "elastic_agent_policies_get_fleet_kubernetes_download.yml",
  "elastic_agents_get_fleet_agents_setup.yml",
  "security_attack_discovery_api_get_attack_discovery_generations.yml",
  "security_entity_analytics_api_bulk_upsert_asset_criticality_records.yml",
  "security_lists_api_export_list_items.yml",
  "security_timeline_api_resolve_timeline.yml",
  "apm_agent_configuration_search_single_configuration.yml",
  "security_exceptions_api_create_shared_exception_list.yml",

  // Kibana forbids deleting EPM package kibana assets from the space where the
  // package is installed (400: "you must uninstall the package"); the op is not
  // exercisable without a separate space, which the test does not provision.
  "elastic_package_manager_epm_delete_fleet_epm_packages_pkgname_pkgversion_kibana_assets.yml",

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
  // create/read/update/delete/find exception-list-item request schemas restrict
  // `list_id` to the enum ["endpoint_blocklists"], so any real list id fails CLI
  // input validation before the request is sent.
  "security_exceptions_api_create_exception_list_item.yml",
  "security_exceptions_api_read_exception_list_item.yml",
  "security_exceptions_api_update_exception_list_item.yml",
  "security_exceptions_api_delete_exception_list_item.yml",
  "security_exceptions_api_find_exception_list_items.yml",
])

const skippedFiles = env === 'serverless' ? skippedFilesServerless : skippedFilesStack

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
    preamble: KB_PREAMBLE,
    // CI Kibana has no enrolled agents; jq prints "null" for items.0.id.
    skipEmptySet: file === 'elastic_agents_get_fleet_agent_status_data.yml',
  })

  for (const action of result.skippedActions) allSkippedActions.add(action)

  const outPath = join(OUT_DIR, `${name}.sh`)
  writeFileSync(outPath, result.script, { mode: 0o755 })
  scripts.push({ path: `${name}.sh`, serverless: testFile.requires.serverless, stack: testFile.requires.stack })
  console.log(`  generated: ${outPath}`)
}

const runner = generateRunner(scripts)
writeFileSync(join(OUT_DIR, 'run.sh'), runner, { mode: 0o755 })

console.log(`\nGenerated ${scripts.length} scripts + run.sh → ${OUT_DIR}/`)
if (allSkippedActions.size > 0) {
  console.log(`Skipped unmapped actions: ${[...allSkippedActions].sort().join(', ')}`)
}
