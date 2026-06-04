/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * AUTO-GENERATED from src/es/apis/*.ts via scripts/build-api-manifest.mjs.
 * DO NOT EDIT BY HAND. Regenerate after running the code generator.
 */

/** Cheap metadata for every Elasticsearch API command. No Zod schemas loaded. */
export interface EsApiMeta {
  readonly name: string
  readonly namespace: string | null
  readonly description: string
  /** File stem under src/es/apis/ that holds the full EsApiDefinition. */
  readonly namespaceFile: string
}

export const apiManifest: readonly EsApiMeta[] = [
  {
    "name": "delete",
    "namespace": "async-search",
    "description": "Delete an async search.",
    "namespaceFile": "async_search_delete"
  },
  {
    "name": "get",
    "namespace": "async-search",
    "description": "Get async search results.",
    "namespaceFile": "async_search_get"
  },
  {
    "name": "status",
    "namespace": "async-search",
    "description": "Get the async search status.",
    "namespaceFile": "async_search_status"
  },
  {
    "name": "submit",
    "namespace": "async-search",
    "description": "Run an async search.",
    "namespaceFile": "async_search_submit"
  },
  {
    "name": "bulk",
    "namespace": null,
    "description": "Bulk index or delete documents.",
    "namespaceFile": "bulk"
  },
  {
    "name": "aliases",
    "namespace": "cat",
    "description": "Get aliases.",
    "namespaceFile": "cat_aliases"
  },
  {
    "name": "allocation",
    "namespace": "cat",
    "description": "Get shard allocation information.",
    "namespaceFile": "cat_allocation"
  },
  {
    "name": "circuit-breaker",
    "namespace": "cat",
    "description": "Get circuit breakers statistics.",
    "namespaceFile": "cat_circuit_breaker"
  },
  {
    "name": "component-templates",
    "namespace": "cat",
    "description": "Get component templates.",
    "namespaceFile": "cat_component_templates"
  },
  {
    "name": "count",
    "namespace": "cat",
    "description": "Get a document count.",
    "namespaceFile": "cat_count"
  },
  {
    "name": "fielddata",
    "namespace": "cat",
    "description": "Get field data cache information.",
    "namespaceFile": "cat_fielddata"
  },
  {
    "name": "health",
    "namespace": "cat",
    "description": "Get the cluster health status.",
    "namespaceFile": "cat_health"
  },
  {
    "name": "help",
    "namespace": "cat",
    "description": "Get CAT help.",
    "namespaceFile": "cat_help"
  },
  {
    "name": "indices",
    "namespace": "cat",
    "description": "Get index information.",
    "namespaceFile": "cat_indices"
  },
  {
    "name": "master",
    "namespace": "cat",
    "description": "Get master node information.",
    "namespaceFile": "cat_master"
  },
  {
    "name": "ml-data-frame-analytics",
    "namespace": "cat",
    "description": "Get data frame analytics jobs.",
    "namespaceFile": "cat_ml_data_frame_analytics"
  },
  {
    "name": "ml-datafeeds",
    "namespace": "cat",
    "description": "Get datafeeds.",
    "namespaceFile": "cat_ml_datafeeds"
  },
  {
    "name": "ml-jobs",
    "namespace": "cat",
    "description": "Get anomaly detection jobs.",
    "namespaceFile": "cat_ml_jobs"
  },
  {
    "name": "ml-trained-models",
    "namespace": "cat",
    "description": "Get trained models.",
    "namespaceFile": "cat_ml_trained_models"
  },
  {
    "name": "nodeattrs",
    "namespace": "cat",
    "description": "Get node attribute information.",
    "namespaceFile": "cat_nodeattrs"
  },
  {
    "name": "nodes",
    "namespace": "cat",
    "description": "Get node information.",
    "namespaceFile": "cat_nodes"
  },
  {
    "name": "pending-tasks",
    "namespace": "cat",
    "description": "Get pending task information.",
    "namespaceFile": "cat_pending_tasks"
  },
  {
    "name": "plugins",
    "namespace": "cat",
    "description": "Get plugin information.",
    "namespaceFile": "cat_plugins"
  },
  {
    "name": "recovery",
    "namespace": "cat",
    "description": "Get shard recovery information.",
    "namespaceFile": "cat_recovery"
  },
  {
    "name": "repositories",
    "namespace": "cat",
    "description": "Get snapshot repository information.",
    "namespaceFile": "cat_repositories"
  },
  {
    "name": "segments",
    "namespace": "cat",
    "description": "Get segment information.",
    "namespaceFile": "cat_segments"
  },
  {
    "name": "shards",
    "namespace": "cat",
    "description": "Get shard information.",
    "namespaceFile": "cat_shards"
  },
  {
    "name": "snapshots",
    "namespace": "cat",
    "description": "Get snapshot information.",
    "namespaceFile": "cat_snapshots"
  },
  {
    "name": "tasks",
    "namespace": "cat",
    "description": "Get task information.",
    "namespaceFile": "cat_tasks"
  },
  {
    "name": "templates",
    "namespace": "cat",
    "description": "Get index template information.",
    "namespaceFile": "cat_templates"
  },
  {
    "name": "thread-pool",
    "namespace": "cat",
    "description": "Get thread pool statistics.",
    "namespaceFile": "cat_thread_pool"
  },
  {
    "name": "transforms",
    "namespace": "cat",
    "description": "Get transform information.",
    "namespaceFile": "cat_transforms"
  },
  {
    "name": "delete-auto-follow-pattern",
    "namespace": "ccr",
    "description": "Delete auto-follow patterns.",
    "namespaceFile": "ccr_delete_auto_follow_pattern"
  },
  {
    "name": "follow",
    "namespace": "ccr",
    "description": "Create a follower.",
    "namespaceFile": "ccr_follow"
  },
  {
    "name": "follow-info",
    "namespace": "ccr",
    "description": "Get follower information.",
    "namespaceFile": "ccr_follow_info"
  },
  {
    "name": "follow-stats",
    "namespace": "ccr",
    "description": "Get follower stats.",
    "namespaceFile": "ccr_follow_stats"
  },
  {
    "name": "forget-follower",
    "namespace": "ccr",
    "description": "Forget a follower.",
    "namespaceFile": "ccr_forget_follower"
  },
  {
    "name": "get-auto-follow-pattern",
    "namespace": "ccr",
    "description": "Get auto-follow patterns.",
    "namespaceFile": "ccr_get_auto_follow_pattern"
  },
  {
    "name": "pause-auto-follow-pattern",
    "namespace": "ccr",
    "description": "Pause an auto-follow pattern.",
    "namespaceFile": "ccr_pause_auto_follow_pattern"
  },
  {
    "name": "pause-follow",
    "namespace": "ccr",
    "description": "Pause a follower.",
    "namespaceFile": "ccr_pause_follow"
  },
  {
    "name": "put-auto-follow-pattern",
    "namespace": "ccr",
    "description": "Create or update auto-follow patterns.",
    "namespaceFile": "ccr_put_auto_follow_pattern"
  },
  {
    "name": "resume-auto-follow-pattern",
    "namespace": "ccr",
    "description": "Resume an auto-follow pattern.",
    "namespaceFile": "ccr_resume_auto_follow_pattern"
  },
  {
    "name": "resume-follow",
    "namespace": "ccr",
    "description": "Resume a follower.",
    "namespaceFile": "ccr_resume_follow"
  },
  {
    "name": "stats",
    "namespace": "ccr",
    "description": "Get cross-cluster replication stats.",
    "namespaceFile": "ccr_stats"
  },
  {
    "name": "unfollow",
    "namespace": "ccr",
    "description": "Unfollow an index.",
    "namespaceFile": "ccr_unfollow"
  },
  {
    "name": "clear-scroll",
    "namespace": null,
    "description": "Clear a scrolling search.",
    "namespaceFile": "clear_scroll"
  },
  {
    "name": "close-point-in-time",
    "namespace": null,
    "description": "Close a point in time.",
    "namespaceFile": "close_point_in_time"
  },
  {
    "name": "allocation-explain",
    "namespace": "cluster",
    "description": "Explain the shard allocations.",
    "namespaceFile": "cluster_allocation_explain"
  },
  {
    "name": "delete-component-template",
    "namespace": "cluster",
    "description": "Delete component templates.",
    "namespaceFile": "cluster_delete_component_template"
  },
  {
    "name": "delete-voting-config-exclusions",
    "namespace": "cluster",
    "description": "Clear cluster voting config exclusions.",
    "namespaceFile": "cluster_delete_voting_config_exclusions"
  },
  {
    "name": "exists-component-template",
    "namespace": "cluster",
    "description": "Check component templates.",
    "namespaceFile": "cluster_exists_component_template"
  },
  {
    "name": "get-component-template",
    "namespace": "cluster",
    "description": "Get component templates.",
    "namespaceFile": "cluster_get_component_template"
  },
  {
    "name": "get-settings",
    "namespace": "cluster",
    "description": "Get cluster-wide settings.",
    "namespaceFile": "cluster_get_settings"
  },
  {
    "name": "health",
    "namespace": "cluster",
    "description": "Get the cluster health status.",
    "namespaceFile": "cluster_health"
  },
  {
    "name": "info",
    "namespace": "cluster",
    "description": "Get cluster info.",
    "namespaceFile": "cluster_info"
  },
  {
    "name": "pending-tasks",
    "namespace": "cluster",
    "description": "Get the pending cluster tasks.",
    "namespaceFile": "cluster_pending_tasks"
  },
  {
    "name": "post-voting-config-exclusions",
    "namespace": "cluster",
    "description": "Update voting configuration exclusions.",
    "namespaceFile": "cluster_post_voting_config_exclusions"
  },
  {
    "name": "put-component-template",
    "namespace": "cluster",
    "description": "Create or update a component template.",
    "namespaceFile": "cluster_put_component_template"
  },
  {
    "name": "put-settings",
    "namespace": "cluster",
    "description": "Update the cluster settings.",
    "namespaceFile": "cluster_put_settings"
  },
  {
    "name": "remote-info",
    "namespace": "cluster",
    "description": "Get remote cluster information.",
    "namespaceFile": "cluster_remote_info"
  },
  {
    "name": "reroute",
    "namespace": "cluster",
    "description": "Reroute the cluster.",
    "namespaceFile": "cluster_reroute"
  },
  {
    "name": "state",
    "namespace": "cluster",
    "description": "Get the cluster state.",
    "namespaceFile": "cluster_state"
  },
  {
    "name": "stats",
    "namespace": "cluster",
    "description": "Get cluster statistics.",
    "namespaceFile": "cluster_stats"
  },
  {
    "name": "check-in",
    "namespace": "connector",
    "description": "Check in a connector.",
    "namespaceFile": "connector_check_in"
  },
  {
    "name": "delete",
    "namespace": "connector",
    "description": "Delete a connector.",
    "namespaceFile": "connector_delete"
  },
  {
    "name": "get",
    "namespace": "connector",
    "description": "Get a connector.",
    "namespaceFile": "connector_get"
  },
  {
    "name": "list",
    "namespace": "connector",
    "description": "Get all connectors.",
    "namespaceFile": "connector_list"
  },
  {
    "name": "post",
    "namespace": "connector",
    "description": "Create a connector.",
    "namespaceFile": "connector_post"
  },
  {
    "name": "put",
    "namespace": "connector",
    "description": "Create or update a connector.",
    "namespaceFile": "connector_put"
  },
  {
    "name": "sync-job-cancel",
    "namespace": "connector",
    "description": "Cancel a connector sync job.",
    "namespaceFile": "connector_sync_job_cancel"
  },
  {
    "name": "sync-job-check-in",
    "namespace": "connector",
    "description": "Check in a connector sync job.",
    "namespaceFile": "connector_sync_job_check_in"
  },
  {
    "name": "sync-job-claim",
    "namespace": "connector",
    "description": "Claim a connector sync job.",
    "namespaceFile": "connector_sync_job_claim"
  },
  {
    "name": "sync-job-delete",
    "namespace": "connector",
    "description": "Delete a connector sync job.",
    "namespaceFile": "connector_sync_job_delete"
  },
  {
    "name": "sync-job-error",
    "namespace": "connector",
    "description": "Set a connector sync job error.",
    "namespaceFile": "connector_sync_job_error"
  },
  {
    "name": "sync-job-get",
    "namespace": "connector",
    "description": "Get a connector sync job.",
    "namespaceFile": "connector_sync_job_get"
  },
  {
    "name": "sync-job-list",
    "namespace": "connector",
    "description": "Get all connector sync jobs.",
    "namespaceFile": "connector_sync_job_list"
  },
  {
    "name": "sync-job-post",
    "namespace": "connector",
    "description": "Create a connector sync job.",
    "namespaceFile": "connector_sync_job_post"
  },
  {
    "name": "sync-job-update-stats",
    "namespace": "connector",
    "description": "Set the connector sync job stats.",
    "namespaceFile": "connector_sync_job_update_stats"
  },
  {
    "name": "update-active-filtering",
    "namespace": "connector",
    "description": "Activate the connector draft filter.",
    "namespaceFile": "connector_update_active_filtering"
  },
  {
    "name": "update-api-key-id",
    "namespace": "connector",
    "description": "Update the connector API key ID.",
    "namespaceFile": "connector_update_api_key_id"
  },
  {
    "name": "update-configuration",
    "namespace": "connector",
    "description": "Update the connector configuration.",
    "namespaceFile": "connector_update_configuration"
  },
  {
    "name": "update-error",
    "namespace": "connector",
    "description": "Update the connector error field.",
    "namespaceFile": "connector_update_error"
  },
  {
    "name": "update-features",
    "namespace": "connector",
    "description": "Update the connector features.",
    "namespaceFile": "connector_update_features"
  },
  {
    "name": "update-filtering",
    "namespace": "connector",
    "description": "Update the connector filtering.",
    "namespaceFile": "connector_update_filtering"
  },
  {
    "name": "update-filtering-validation",
    "namespace": "connector",
    "description": "Update the connector draft filtering validation.",
    "namespaceFile": "connector_update_filtering_validation"
  },
  {
    "name": "update-index-name",
    "namespace": "connector",
    "description": "Update the connector index name.",
    "namespaceFile": "connector_update_index_name"
  },
  {
    "name": "update-name",
    "namespace": "connector",
    "description": "Update the connector name and description.",
    "namespaceFile": "connector_update_name"
  },
  {
    "name": "update-native",
    "namespace": "connector",
    "description": "Update the connector is_native flag.",
    "namespaceFile": "connector_update_native"
  },
  {
    "name": "update-pipeline",
    "namespace": "connector",
    "description": "Update the connector pipeline.",
    "namespaceFile": "connector_update_pipeline"
  },
  {
    "name": "update-scheduling",
    "namespace": "connector",
    "description": "Update the connector scheduling.",
    "namespaceFile": "connector_update_scheduling"
  },
  {
    "name": "update-service-type",
    "namespace": "connector",
    "description": "Update the connector service type.",
    "namespaceFile": "connector_update_service_type"
  },
  {
    "name": "update-status",
    "namespace": "connector",
    "description": "Update the connector status.",
    "namespaceFile": "connector_update_status"
  },
  {
    "name": "count",
    "namespace": null,
    "description": "Count search results.",
    "namespaceFile": "count"
  },
  {
    "name": "create",
    "namespace": null,
    "description": "Create a new document in the index.",
    "namespaceFile": "create"
  },
  {
    "name": "delete-dangling-index",
    "namespace": "dangling-indices",
    "description": "Delete a dangling index.",
    "namespaceFile": "dangling_indices_delete_dangling_index"
  },
  {
    "name": "import-dangling-index",
    "namespace": "dangling-indices",
    "description": "Import a dangling index.",
    "namespaceFile": "dangling_indices_import_dangling_index"
  },
  {
    "name": "list-dangling-indices",
    "namespace": "dangling-indices",
    "description": "Get the dangling indices.",
    "namespaceFile": "dangling_indices_list_dangling_indices"
  },
  {
    "name": "delete",
    "namespace": null,
    "description": "Delete a document.",
    "namespaceFile": "delete"
  },
  {
    "name": "delete-by-query",
    "namespace": null,
    "description": "Delete documents.",
    "namespaceFile": "delete_by_query"
  },
  {
    "name": "delete-by-query-rethrottle",
    "namespace": null,
    "description": "Throttle a delete by query operation.",
    "namespaceFile": "delete_by_query_rethrottle"
  },
  {
    "name": "delete-script",
    "namespace": null,
    "description": "Delete a script or search template.",
    "namespaceFile": "delete_script"
  },
  {
    "name": "delete-policy",
    "namespace": "enrich",
    "description": "Delete an enrich policy.",
    "namespaceFile": "enrich_delete_policy"
  },
  {
    "name": "execute-policy",
    "namespace": "enrich",
    "description": "Run an enrich policy.",
    "namespaceFile": "enrich_execute_policy"
  },
  {
    "name": "get-policy",
    "namespace": "enrich",
    "description": "Get an enrich policy.",
    "namespaceFile": "enrich_get_policy"
  },
  {
    "name": "put-policy",
    "namespace": "enrich",
    "description": "Create an enrich policy.",
    "namespaceFile": "enrich_put_policy"
  },
  {
    "name": "stats",
    "namespace": "enrich",
    "description": "Get enrich stats.",
    "namespaceFile": "enrich_stats"
  },
  {
    "name": "delete",
    "namespace": "eql",
    "description": "Delete an async EQL search.",
    "namespaceFile": "eql_delete"
  },
  {
    "name": "get",
    "namespace": "eql",
    "description": "Get async EQL search results.",
    "namespaceFile": "eql_get"
  },
  {
    "name": "get-status",
    "namespace": "eql",
    "description": "Get the async EQL status.",
    "namespaceFile": "eql_get_status"
  },
  {
    "name": "search",
    "namespace": "eql",
    "description": "Get EQL search results.",
    "namespaceFile": "eql_search"
  },
  {
    "name": "async-query",
    "namespace": "esql",
    "description": "Run an async ES|QL query.",
    "namespaceFile": "esql_async_query"
  },
  {
    "name": "async-query-delete",
    "namespace": "esql",
    "description": "Delete an async ES|QL query.",
    "namespaceFile": "esql_async_query_delete"
  },
  {
    "name": "async-query-get",
    "namespace": "esql",
    "description": "Get async ES|QL query results.",
    "namespaceFile": "esql_async_query_get"
  },
  {
    "name": "async-query-stop",
    "namespace": "esql",
    "description": "Stop async ES|QL query.",
    "namespaceFile": "esql_async_query_stop"
  },
  {
    "name": "delete-view",
    "namespace": "esql",
    "description": "Delete an ES|QL view.",
    "namespaceFile": "esql_delete_view"
  },
  {
    "name": "get-query",
    "namespace": "esql",
    "description": "Get a specific running ES|QL query information.",
    "namespaceFile": "esql_get_query"
  },
  {
    "name": "get-view",
    "namespace": "esql",
    "description": "Get an ES|QL view.",
    "namespaceFile": "esql_get_view"
  },
  {
    "name": "list-queries",
    "namespace": "esql",
    "description": "Get running ES|QL queries information.",
    "namespaceFile": "esql_list_queries"
  },
  {
    "name": "put-view",
    "namespace": "esql",
    "description": "Create or update an ES|QL view.",
    "namespaceFile": "esql_put_view"
  },
  {
    "name": "query",
    "namespace": "esql",
    "description": "Run an ES|QL query.",
    "namespaceFile": "esql_query"
  },
  {
    "name": "exists",
    "namespace": null,
    "description": "Check a document.",
    "namespaceFile": "exists"
  },
  {
    "name": "exists-source",
    "namespace": null,
    "description": "Check for a document source.",
    "namespaceFile": "exists_source"
  },
  {
    "name": "explain",
    "namespace": null,
    "description": "Explain a document match result.",
    "namespaceFile": "explain"
  },
  {
    "name": "get-features",
    "namespace": "features",
    "description": "Get the features.",
    "namespaceFile": "features_get_features"
  },
  {
    "name": "reset-features",
    "namespace": "features",
    "description": "Reset the features.",
    "namespaceFile": "features_reset_features"
  },
  {
    "name": "field-caps",
    "namespace": null,
    "description": "Get the field capabilities.",
    "namespaceFile": "field_caps"
  },
  {
    "name": "global-checkpoints",
    "namespace": "fleet",
    "description": "Get global checkpoints.",
    "namespaceFile": "fleet_global_checkpoints"
  },
  {
    "name": "msearch",
    "namespace": "fleet",
    "description": "Run multiple Fleet searches.",
    "namespaceFile": "fleet_msearch"
  },
  {
    "name": "search",
    "namespace": "fleet",
    "description": "Run a Fleet search.",
    "namespaceFile": "fleet_search"
  },
  {
    "name": "get",
    "namespace": null,
    "description": "Get a document by its ID.",
    "namespaceFile": "get"
  },
  {
    "name": "get-script",
    "namespace": null,
    "description": "Get a script or search template.",
    "namespaceFile": "get_script"
  },
  {
    "name": "get-script-context",
    "namespace": null,
    "description": "Get script contexts.",
    "namespaceFile": "get_script_context"
  },
  {
    "name": "get-script-languages",
    "namespace": null,
    "description": "Get script languages.",
    "namespaceFile": "get_script_languages"
  },
  {
    "name": "get-source",
    "namespace": null,
    "description": "Get a document's source.",
    "namespaceFile": "get_source"
  },
  {
    "name": "explore",
    "namespace": "graph",
    "description": "Explore graph analytics.",
    "namespaceFile": "graph_explore"
  },
  {
    "name": "health-report",
    "namespace": null,
    "description": "Get the cluster health.",
    "namespaceFile": "health_report"
  },
  {
    "name": "delete-lifecycle",
    "namespace": "ilm",
    "description": "Delete a lifecycle policy.",
    "namespaceFile": "ilm_delete_lifecycle"
  },
  {
    "name": "explain-lifecycle",
    "namespace": "ilm",
    "description": "Explain the lifecycle state.",
    "namespaceFile": "ilm_explain_lifecycle"
  },
  {
    "name": "get-lifecycle",
    "namespace": "ilm",
    "description": "Get lifecycle policies.",
    "namespaceFile": "ilm_get_lifecycle"
  },
  {
    "name": "get-status",
    "namespace": "ilm",
    "description": "Get the ILM status.",
    "namespaceFile": "ilm_get_status"
  },
  {
    "name": "migrate-to-data-tiers",
    "namespace": "ilm",
    "description": "Migrate to data tiers routing.",
    "namespaceFile": "ilm_migrate_to_data_tiers"
  },
  {
    "name": "move-to-step",
    "namespace": "ilm",
    "description": "Move to a lifecycle step.",
    "namespaceFile": "ilm_move_to_step"
  },
  {
    "name": "put-lifecycle",
    "namespace": "ilm",
    "description": "Create or update a lifecycle policy.",
    "namespaceFile": "ilm_put_lifecycle"
  },
  {
    "name": "remove-policy",
    "namespace": "ilm",
    "description": "Remove policies from an index.",
    "namespaceFile": "ilm_remove_policy"
  },
  {
    "name": "retry",
    "namespace": "ilm",
    "description": "Retry a policy.",
    "namespaceFile": "ilm_retry"
  },
  {
    "name": "start",
    "namespace": "ilm",
    "description": "Start the ILM plugin.",
    "namespaceFile": "ilm_start"
  },
  {
    "name": "stop",
    "namespace": "ilm",
    "description": "Stop the ILM plugin.",
    "namespaceFile": "ilm_stop"
  },
  {
    "name": "index",
    "namespace": null,
    "description": "Create or update a document in an index.",
    "namespaceFile": "index"
  },
  {
    "name": "add-block",
    "namespace": "indices",
    "description": "Add an index block.",
    "namespaceFile": "indices_add_block"
  },
  {
    "name": "analyze",
    "namespace": "indices",
    "description": "Get tokens from text analysis.",
    "namespaceFile": "indices_analyze"
  },
  {
    "name": "cancel-migrate-reindex",
    "namespace": "indices",
    "description": "Cancel a migration reindex operation.",
    "namespaceFile": "indices_cancel_migrate_reindex"
  },
  {
    "name": "clear-cache",
    "namespace": "indices",
    "description": "Clear the cache.",
    "namespaceFile": "indices_clear_cache"
  },
  {
    "name": "clone",
    "namespace": "indices",
    "description": "Clone an index.",
    "namespaceFile": "indices_clone"
  },
  {
    "name": "close",
    "namespace": "indices",
    "description": "Close an index.",
    "namespaceFile": "indices_close"
  },
  {
    "name": "create",
    "namespace": "indices",
    "description": "Create an index.",
    "namespaceFile": "indices_create"
  },
  {
    "name": "create-data-stream",
    "namespace": "indices",
    "description": "Create a data stream.",
    "namespaceFile": "indices_create_data_stream"
  },
  {
    "name": "create-from",
    "namespace": "indices",
    "description": "Create an index from a source index.",
    "namespaceFile": "indices_create_from"
  },
  {
    "name": "data-streams-stats",
    "namespace": "indices",
    "description": "Get data stream stats.",
    "namespaceFile": "indices_data_streams_stats"
  },
  {
    "name": "delete",
    "namespace": "indices",
    "description": "Delete indices.",
    "namespaceFile": "indices_delete"
  },
  {
    "name": "delete-alias",
    "namespace": "indices",
    "description": "Delete an alias.",
    "namespaceFile": "indices_delete_alias"
  },
  {
    "name": "delete-data-lifecycle",
    "namespace": "indices",
    "description": "Delete data stream lifecycles.",
    "namespaceFile": "indices_delete_data_lifecycle"
  },
  {
    "name": "delete-data-stream",
    "namespace": "indices",
    "description": "Delete data streams.",
    "namespaceFile": "indices_delete_data_stream"
  },
  {
    "name": "delete-data-stream-options",
    "namespace": "indices",
    "description": "Delete data stream options.",
    "namespaceFile": "indices_delete_data_stream_options"
  },
  {
    "name": "delete-index-template",
    "namespace": "indices",
    "description": "Delete an index template.",
    "namespaceFile": "indices_delete_index_template"
  },
  {
    "name": "delete-template",
    "namespace": "indices",
    "description": "Delete a legacy index template.",
    "namespaceFile": "indices_delete_template"
  },
  {
    "name": "disk-usage",
    "namespace": "indices",
    "description": "Analyze the index disk usage.",
    "namespaceFile": "indices_disk_usage"
  },
  {
    "name": "downsample",
    "namespace": "indices",
    "description": "Downsample an index.",
    "namespaceFile": "indices_downsample"
  },
  {
    "name": "exists",
    "namespace": "indices",
    "description": "Check indices.",
    "namespaceFile": "indices_exists"
  },
  {
    "name": "exists-alias",
    "namespace": "indices",
    "description": "Check aliases.",
    "namespaceFile": "indices_exists_alias"
  },
  {
    "name": "exists-index-template",
    "namespace": "indices",
    "description": "Check index templates.",
    "namespaceFile": "indices_exists_index_template"
  },
  {
    "name": "exists-template",
    "namespace": "indices",
    "description": "Check existence of index templates.",
    "namespaceFile": "indices_exists_template"
  },
  {
    "name": "explain-data-lifecycle",
    "namespace": "indices",
    "description": "Get the status for a data stream lifecycle.",
    "namespaceFile": "indices_explain_data_lifecycle"
  },
  {
    "name": "field-usage-stats",
    "namespace": "indices",
    "description": "Get field usage stats.",
    "namespaceFile": "indices_field_usage_stats"
  },
  {
    "name": "flush",
    "namespace": "indices",
    "description": "Flush data streams or indices.",
    "namespaceFile": "indices_flush"
  },
  {
    "name": "forcemerge",
    "namespace": "indices",
    "description": "Force a merge.",
    "namespaceFile": "indices_forcemerge"
  },
  {
    "name": "get",
    "namespace": "indices",
    "description": "Get index information.",
    "namespaceFile": "indices_get"
  },
  {
    "name": "get-alias",
    "namespace": "indices",
    "description": "Get aliases.",
    "namespaceFile": "indices_get_alias"
  },
  {
    "name": "get-data-lifecycle",
    "namespace": "indices",
    "description": "Get data stream lifecycles.",
    "namespaceFile": "indices_get_data_lifecycle"
  },
  {
    "name": "get-data-lifecycle-stats",
    "namespace": "indices",
    "description": "Get data stream lifecycle stats.",
    "namespaceFile": "indices_get_data_lifecycle_stats"
  },
  {
    "name": "get-data-stream",
    "namespace": "indices",
    "description": "Get data streams.",
    "namespaceFile": "indices_get_data_stream"
  },
  {
    "name": "get-data-stream-mappings",
    "namespace": "indices",
    "description": "Get data stream mappings.",
    "namespaceFile": "indices_get_data_stream_mappings"
  },
  {
    "name": "get-data-stream-options",
    "namespace": "indices",
    "description": "Get data stream options.",
    "namespaceFile": "indices_get_data_stream_options"
  },
  {
    "name": "get-data-stream-settings",
    "namespace": "indices",
    "description": "Get data stream settings.",
    "namespaceFile": "indices_get_data_stream_settings"
  },
  {
    "name": "get-field-mapping",
    "namespace": "indices",
    "description": "Get mapping definitions.",
    "namespaceFile": "indices_get_field_mapping"
  },
  {
    "name": "get-index-template",
    "namespace": "indices",
    "description": "Get index templates.",
    "namespaceFile": "indices_get_index_template"
  },
  {
    "name": "get-mapping",
    "namespace": "indices",
    "description": "Get mapping definitions.",
    "namespaceFile": "indices_get_mapping"
  },
  {
    "name": "get-migrate-reindex-status",
    "namespace": "indices",
    "description": "Get the migration reindexing status.",
    "namespaceFile": "indices_get_migrate_reindex_status"
  },
  {
    "name": "get-settings",
    "namespace": "indices",
    "description": "Get index settings.",
    "namespaceFile": "indices_get_settings"
  },
  {
    "name": "get-template",
    "namespace": "indices",
    "description": "Get legacy index templates.",
    "namespaceFile": "indices_get_template"
  },
  {
    "name": "migrate-reindex",
    "namespace": "indices",
    "description": "Reindex legacy backing indices.",
    "namespaceFile": "indices_migrate_reindex"
  },
  {
    "name": "migrate-to-data-stream",
    "namespace": "indices",
    "description": "Convert an index alias to a data stream.",
    "namespaceFile": "indices_migrate_to_data_stream"
  },
  {
    "name": "modify-data-stream",
    "namespace": "indices",
    "description": "Update data streams.",
    "namespaceFile": "indices_modify_data_stream"
  },
  {
    "name": "open",
    "namespace": "indices",
    "description": "Open a closed index.",
    "namespaceFile": "indices_open"
  },
  {
    "name": "promote-data-stream",
    "namespace": "indices",
    "description": "Promote a data stream.",
    "namespaceFile": "indices_promote_data_stream"
  },
  {
    "name": "put-alias",
    "namespace": "indices",
    "description": "Create or update an alias.",
    "namespaceFile": "indices_put_alias"
  },
  {
    "name": "put-data-lifecycle",
    "namespace": "indices",
    "description": "Update data stream lifecycles.",
    "namespaceFile": "indices_put_data_lifecycle"
  },
  {
    "name": "put-data-stream-mappings",
    "namespace": "indices",
    "description": "Update data stream mappings.",
    "namespaceFile": "indices_put_data_stream_mappings"
  },
  {
    "name": "put-data-stream-options",
    "namespace": "indices",
    "description": "Update data stream options.",
    "namespaceFile": "indices_put_data_stream_options"
  },
  {
    "name": "put-data-stream-settings",
    "namespace": "indices",
    "description": "Update data stream settings.",
    "namespaceFile": "indices_put_data_stream_settings"
  },
  {
    "name": "put-index-template",
    "namespace": "indices",
    "description": "Create or update an index template.",
    "namespaceFile": "indices_put_index_template"
  },
  {
    "name": "put-mapping",
    "namespace": "indices",
    "description": "Update field mappings.",
    "namespaceFile": "indices_put_mapping"
  },
  {
    "name": "put-settings",
    "namespace": "indices",
    "description": "Update index settings.",
    "namespaceFile": "indices_put_settings"
  },
  {
    "name": "put-template",
    "namespace": "indices",
    "description": "Create or update a legacy index template.",
    "namespaceFile": "indices_put_template"
  },
  {
    "name": "recovery",
    "namespace": "indices",
    "description": "Get index recovery information.",
    "namespaceFile": "indices_recovery"
  },
  {
    "name": "refresh",
    "namespace": "indices",
    "description": "Refresh an index.",
    "namespaceFile": "indices_refresh"
  },
  {
    "name": "reload-search-analyzers",
    "namespace": "indices",
    "description": "Reload search analyzers.",
    "namespaceFile": "indices_reload_search_analyzers"
  },
  {
    "name": "remove-block",
    "namespace": "indices",
    "description": "Remove an index block.",
    "namespaceFile": "indices_remove_block"
  },
  {
    "name": "resolve-cluster",
    "namespace": "indices",
    "description": "Resolve the cluster.",
    "namespaceFile": "indices_resolve_cluster"
  },
  {
    "name": "resolve-index",
    "namespace": "indices",
    "description": "Resolve indices.",
    "namespaceFile": "indices_resolve_index"
  },
  {
    "name": "rollover",
    "namespace": "indices",
    "description": "Roll over to a new index.",
    "namespaceFile": "indices_rollover"
  },
  {
    "name": "segments",
    "namespace": "indices",
    "description": "Get index segments.",
    "namespaceFile": "indices_segments"
  },
  {
    "name": "shard-stores",
    "namespace": "indices",
    "description": "Get index shard stores.",
    "namespaceFile": "indices_shard_stores"
  },
  {
    "name": "shrink",
    "namespace": "indices",
    "description": "Shrink an index.",
    "namespaceFile": "indices_shrink"
  },
  {
    "name": "simulate-index-template",
    "namespace": "indices",
    "description": "Simulate an index.",
    "namespaceFile": "indices_simulate_index_template"
  },
  {
    "name": "simulate-template",
    "namespace": "indices",
    "description": "Simulate an index template.",
    "namespaceFile": "indices_simulate_template"
  },
  {
    "name": "split",
    "namespace": "indices",
    "description": "Split an index.",
    "namespaceFile": "indices_split"
  },
  {
    "name": "stats",
    "namespace": "indices",
    "description": "Get index statistics.",
    "namespaceFile": "indices_stats"
  },
  {
    "name": "update-aliases",
    "namespace": "indices",
    "description": "Create or update an alias.",
    "namespaceFile": "indices_update_aliases"
  },
  {
    "name": "validate-query",
    "namespace": "indices",
    "description": "Validate a query.",
    "namespaceFile": "indices_validate_query"
  },
  {
    "name": "chat-completion-unified",
    "namespace": "inference",
    "description": "Perform chat completion inference on the service.",
    "namespaceFile": "inference_chat_completion_unified"
  },
  {
    "name": "completion",
    "namespace": "inference",
    "description": "Perform completion inference on the service.",
    "namespaceFile": "inference_completion"
  },
  {
    "name": "delete",
    "namespace": "inference",
    "description": "Delete an inference endpoint.",
    "namespaceFile": "inference_delete"
  },
  {
    "name": "embedding",
    "namespace": "inference",
    "description": "Perform dense embedding inference on the service.",
    "namespaceFile": "inference_embedding"
  },
  {
    "name": "get",
    "namespace": "inference",
    "description": "Get an inference endpoint.",
    "namespaceFile": "inference_get"
  },
  {
    "name": "inference",
    "namespace": "inference",
    "description": "Perform inference on the service.",
    "namespaceFile": "inference_inference"
  },
  {
    "name": "put",
    "namespace": "inference",
    "description": "Create an inference endpoint.",
    "namespaceFile": "inference_put"
  },
  {
    "name": "put-ai21",
    "namespace": "inference",
    "description": "Create a AI21 inference endpoint.",
    "namespaceFile": "inference_put_ai21"
  },
  {
    "name": "put-alibabacloud",
    "namespace": "inference",
    "description": "Create an AlibabaCloud AI Search inference endpoint.",
    "namespaceFile": "inference_put_alibabacloud"
  },
  {
    "name": "put-amazonbedrock",
    "namespace": "inference",
    "description": "Create an Amazon Bedrock inference endpoint.",
    "namespaceFile": "inference_put_amazonbedrock"
  },
  {
    "name": "put-amazonsagemaker",
    "namespace": "inference",
    "description": "Create an Amazon SageMaker inference endpoint.",
    "namespaceFile": "inference_put_amazonsagemaker"
  },
  {
    "name": "put-anthropic",
    "namespace": "inference",
    "description": "Create an Anthropic inference endpoint.",
    "namespaceFile": "inference_put_anthropic"
  },
  {
    "name": "put-azureaistudio",
    "namespace": "inference",
    "description": "Create an Azure AI studio inference endpoint.",
    "namespaceFile": "inference_put_azureaistudio"
  },
  {
    "name": "put-azureopenai",
    "namespace": "inference",
    "description": "Create an Azure OpenAI inference endpoint.",
    "namespaceFile": "inference_put_azureopenai"
  },
  {
    "name": "put-cohere",
    "namespace": "inference",
    "description": "Create a Cohere inference endpoint.",
    "namespaceFile": "inference_put_cohere"
  },
  {
    "name": "put-contextualai",
    "namespace": "inference",
    "description": "Create an Contextual AI inference endpoint.",
    "namespaceFile": "inference_put_contextualai"
  },
  {
    "name": "put-custom",
    "namespace": "inference",
    "description": "Create a custom inference endpoint.",
    "namespaceFile": "inference_put_custom"
  },
  {
    "name": "put-deepseek",
    "namespace": "inference",
    "description": "Create a DeepSeek inference endpoint.",
    "namespaceFile": "inference_put_deepseek"
  },
  {
    "name": "put-elasticsearch",
    "namespace": "inference",
    "description": "Create an Elasticsearch inference endpoint.",
    "namespaceFile": "inference_put_elasticsearch"
  },
  {
    "name": "put-elser",
    "namespace": "inference",
    "description": "Create an ELSER inference endpoint.",
    "namespaceFile": "inference_put_elser"
  },
  {
    "name": "put-fireworksai",
    "namespace": "inference",
    "description": "Create a Fireworks AI inference endpoint.",
    "namespaceFile": "inference_put_fireworksai"
  },
  {
    "name": "put-googleaistudio",
    "namespace": "inference",
    "description": "Create an Google AI Studio inference endpoint.",
    "namespaceFile": "inference_put_googleaistudio"
  },
  {
    "name": "put-googlevertexai",
    "namespace": "inference",
    "description": "Create a Google Vertex AI inference endpoint.",
    "namespaceFile": "inference_put_googlevertexai"
  },
  {
    "name": "put-groq",
    "namespace": "inference",
    "description": "Create a Groq inference endpoint.",
    "namespaceFile": "inference_put_groq"
  },
  {
    "name": "put-hugging-face",
    "namespace": "inference",
    "description": "Create a Hugging Face inference endpoint.",
    "namespaceFile": "inference_put_hugging_face"
  },
  {
    "name": "put-jinaai",
    "namespace": "inference",
    "description": "Create an JinaAI inference endpoint.",
    "namespaceFile": "inference_put_jinaai"
  },
  {
    "name": "put-llama",
    "namespace": "inference",
    "description": "Create a Llama inference endpoint.",
    "namespaceFile": "inference_put_llama"
  },
  {
    "name": "put-mistral",
    "namespace": "inference",
    "description": "Create a Mistral inference endpoint.",
    "namespaceFile": "inference_put_mistral"
  },
  {
    "name": "put-nvidia",
    "namespace": "inference",
    "description": "Create an Nvidia inference endpoint.",
    "namespaceFile": "inference_put_nvidia"
  },
  {
    "name": "put-openai",
    "namespace": "inference",
    "description": "Create an OpenAI inference endpoint.",
    "namespaceFile": "inference_put_openai"
  },
  {
    "name": "put-openshift-ai",
    "namespace": "inference",
    "description": "Create an OpenShift AI inference endpoint.",
    "namespaceFile": "inference_put_openshift_ai"
  },
  {
    "name": "put-voyageai",
    "namespace": "inference",
    "description": "Create a VoyageAI inference endpoint.",
    "namespaceFile": "inference_put_voyageai"
  },
  {
    "name": "put-watsonx",
    "namespace": "inference",
    "description": "Create a Watsonx inference endpoint.",
    "namespaceFile": "inference_put_watsonx"
  },
  {
    "name": "rerank",
    "namespace": "inference",
    "description": "Perform reranking inference on the service.",
    "namespaceFile": "inference_rerank"
  },
  {
    "name": "sparse-embedding",
    "namespace": "inference",
    "description": "Perform sparse embedding inference on the service.",
    "namespaceFile": "inference_sparse_embedding"
  },
  {
    "name": "stream-completion",
    "namespace": "inference",
    "description": "Perform streaming completion inference on the service.",
    "namespaceFile": "inference_stream_completion"
  },
  {
    "name": "text-embedding",
    "namespace": "inference",
    "description": "Perform text embedding inference on the service.",
    "namespaceFile": "inference_text_embedding"
  },
  {
    "name": "update",
    "namespace": "inference",
    "description": "Update an inference endpoint.",
    "namespaceFile": "inference_update"
  },
  {
    "name": "info",
    "namespace": null,
    "description": "Get cluster info.",
    "namespaceFile": "info"
  },
  {
    "name": "delete-geoip-database",
    "namespace": "ingest",
    "description": "Delete GeoIP database configurations.",
    "namespaceFile": "ingest_delete_geoip_database"
  },
  {
    "name": "delete-ip-location-database",
    "namespace": "ingest",
    "description": "Delete IP geolocation database configurations.",
    "namespaceFile": "ingest_delete_ip_location_database"
  },
  {
    "name": "delete-pipeline",
    "namespace": "ingest",
    "description": "Delete pipelines.",
    "namespaceFile": "ingest_delete_pipeline"
  },
  {
    "name": "geo-ip-stats",
    "namespace": "ingest",
    "description": "Get GeoIP statistics.",
    "namespaceFile": "ingest_geo_ip_stats"
  },
  {
    "name": "get-geoip-database",
    "namespace": "ingest",
    "description": "Get GeoIP database configurations.",
    "namespaceFile": "ingest_get_geoip_database"
  },
  {
    "name": "get-ip-location-database",
    "namespace": "ingest",
    "description": "Get IP geolocation database configurations.",
    "namespaceFile": "ingest_get_ip_location_database"
  },
  {
    "name": "get-pipeline",
    "namespace": "ingest",
    "description": "Get pipelines.",
    "namespaceFile": "ingest_get_pipeline"
  },
  {
    "name": "processor-grok",
    "namespace": "ingest",
    "description": "Run a grok processor.",
    "namespaceFile": "ingest_processor_grok"
  },
  {
    "name": "put-geoip-database",
    "namespace": "ingest",
    "description": "Create or update a GeoIP database configuration.",
    "namespaceFile": "ingest_put_geoip_database"
  },
  {
    "name": "put-ip-location-database",
    "namespace": "ingest",
    "description": "Create or update an IP geolocation database configuration.",
    "namespaceFile": "ingest_put_ip_location_database"
  },
  {
    "name": "put-pipeline",
    "namespace": "ingest",
    "description": "Create or update a pipeline.",
    "namespaceFile": "ingest_put_pipeline"
  },
  {
    "name": "simulate",
    "namespace": "ingest",
    "description": "Simulate a pipeline.",
    "namespaceFile": "ingest_simulate"
  },
  {
    "name": "delete",
    "namespace": "license",
    "description": "Delete the license.",
    "namespaceFile": "license_delete"
  },
  {
    "name": "get",
    "namespace": "license",
    "description": "Get license information.",
    "namespaceFile": "license_get"
  },
  {
    "name": "get-basic-status",
    "namespace": "license",
    "description": "Get the basic license status.",
    "namespaceFile": "license_get_basic_status"
  },
  {
    "name": "get-trial-status",
    "namespace": "license",
    "description": "Get the trial status.",
    "namespaceFile": "license_get_trial_status"
  },
  {
    "name": "post",
    "namespace": "license",
    "description": "Update the license.",
    "namespaceFile": "license_post"
  },
  {
    "name": "post-start-basic",
    "namespace": "license",
    "description": "Start a basic license.",
    "namespaceFile": "license_post_start_basic"
  },
  {
    "name": "post-start-trial",
    "namespace": "license",
    "description": "Start a trial.",
    "namespaceFile": "license_post_start_trial"
  },
  {
    "name": "delete-pipeline",
    "namespace": "logstash",
    "description": "Delete a Logstash pipeline.",
    "namespaceFile": "logstash_delete_pipeline"
  },
  {
    "name": "get-pipeline",
    "namespace": "logstash",
    "description": "Get Logstash pipelines.",
    "namespaceFile": "logstash_get_pipeline"
  },
  {
    "name": "put-pipeline",
    "namespace": "logstash",
    "description": "Create or update a Logstash pipeline.",
    "namespaceFile": "logstash_put_pipeline"
  },
  {
    "name": "mget",
    "namespace": null,
    "description": "Get multiple documents.",
    "namespaceFile": "mget"
  },
  {
    "name": "deprecations",
    "namespace": "migration",
    "description": "Get deprecation information.",
    "namespaceFile": "migration_deprecations"
  },
  {
    "name": "get-feature-upgrade-status",
    "namespace": "migration",
    "description": "Get feature migration information.",
    "namespaceFile": "migration_get_feature_upgrade_status"
  },
  {
    "name": "post-feature-upgrade",
    "namespace": "migration",
    "description": "Start the feature migration.",
    "namespaceFile": "migration_post_feature_upgrade"
  },
  {
    "name": "clear-trained-model-deployment-cache",
    "namespace": "ml",
    "description": "Clear trained model deployment cache.",
    "namespaceFile": "ml_clear_trained_model_deployment_cache"
  },
  {
    "name": "close-job",
    "namespace": "ml",
    "description": "Close anomaly detection jobs.",
    "namespaceFile": "ml_close_job"
  },
  {
    "name": "delete-calendar",
    "namespace": "ml",
    "description": "Delete a calendar.",
    "namespaceFile": "ml_delete_calendar"
  },
  {
    "name": "delete-calendar-event",
    "namespace": "ml",
    "description": "Delete events from a calendar.",
    "namespaceFile": "ml_delete_calendar_event"
  },
  {
    "name": "delete-calendar-job",
    "namespace": "ml",
    "description": "Delete anomaly jobs from a calendar.",
    "namespaceFile": "ml_delete_calendar_job"
  },
  {
    "name": "delete-data-frame-analytics",
    "namespace": "ml",
    "description": "Delete a data frame analytics job.",
    "namespaceFile": "ml_delete_data_frame_analytics"
  },
  {
    "name": "delete-datafeed",
    "namespace": "ml",
    "description": "Delete a datafeed.",
    "namespaceFile": "ml_delete_datafeed"
  },
  {
    "name": "delete-expired-data",
    "namespace": "ml",
    "description": "Delete expired ML data.",
    "namespaceFile": "ml_delete_expired_data"
  },
  {
    "name": "delete-filter",
    "namespace": "ml",
    "description": "Delete a filter.",
    "namespaceFile": "ml_delete_filter"
  },
  {
    "name": "delete-forecast",
    "namespace": "ml",
    "description": "Delete forecasts from a job.",
    "namespaceFile": "ml_delete_forecast"
  },
  {
    "name": "delete-job",
    "namespace": "ml",
    "description": "Delete an anomaly detection job.",
    "namespaceFile": "ml_delete_job"
  },
  {
    "name": "delete-model-snapshot",
    "namespace": "ml",
    "description": "Delete a model snapshot.",
    "namespaceFile": "ml_delete_model_snapshot"
  },
  {
    "name": "delete-trained-model",
    "namespace": "ml",
    "description": "Delete an unreferenced trained model.",
    "namespaceFile": "ml_delete_trained_model"
  },
  {
    "name": "delete-trained-model-alias",
    "namespace": "ml",
    "description": "Delete a trained model alias.",
    "namespaceFile": "ml_delete_trained_model_alias"
  },
  {
    "name": "estimate-model-memory",
    "namespace": "ml",
    "description": "Estimate job model memory usage.",
    "namespaceFile": "ml_estimate_model_memory"
  },
  {
    "name": "evaluate-data-frame",
    "namespace": "ml",
    "description": "Evaluate data frame analytics.",
    "namespaceFile": "ml_evaluate_data_frame"
  },
  {
    "name": "explain-data-frame-analytics",
    "namespace": "ml",
    "description": "Explain data frame analytics config.",
    "namespaceFile": "ml_explain_data_frame_analytics"
  },
  {
    "name": "flush-job",
    "namespace": "ml",
    "description": "Force buffered data to be processed.",
    "namespaceFile": "ml_flush_job"
  },
  {
    "name": "forecast",
    "namespace": "ml",
    "description": "Predict future behavior of a time series.",
    "namespaceFile": "ml_forecast"
  },
  {
    "name": "get-buckets",
    "namespace": "ml",
    "description": "Get anomaly detection job results for buckets.",
    "namespaceFile": "ml_get_buckets"
  },
  {
    "name": "get-calendar-events",
    "namespace": "ml",
    "description": "Get info about events in calendars.",
    "namespaceFile": "ml_get_calendar_events"
  },
  {
    "name": "get-calendars",
    "namespace": "ml",
    "description": "Get calendar configuration info.",
    "namespaceFile": "ml_get_calendars"
  },
  {
    "name": "get-categories",
    "namespace": "ml",
    "description": "Get anomaly detection job results for categories.",
    "namespaceFile": "ml_get_categories"
  },
  {
    "name": "get-data-frame-analytics",
    "namespace": "ml",
    "description": "Get data frame analytics job configuration info.",
    "namespaceFile": "ml_get_data_frame_analytics"
  },
  {
    "name": "get-data-frame-analytics-stats",
    "namespace": "ml",
    "description": "Get data frame analytics job stats.",
    "namespaceFile": "ml_get_data_frame_analytics_stats"
  },
  {
    "name": "get-datafeed-stats",
    "namespace": "ml",
    "description": "Get datafeed stats.",
    "namespaceFile": "ml_get_datafeed_stats"
  },
  {
    "name": "get-datafeeds",
    "namespace": "ml",
    "description": "Get datafeeds configuration info.",
    "namespaceFile": "ml_get_datafeeds"
  },
  {
    "name": "get-filters",
    "namespace": "ml",
    "description": "Get filters.",
    "namespaceFile": "ml_get_filters"
  },
  {
    "name": "get-influencers",
    "namespace": "ml",
    "description": "Get anomaly detection job results for influencers.",
    "namespaceFile": "ml_get_influencers"
  },
  {
    "name": "get-job-stats",
    "namespace": "ml",
    "description": "Get anomaly detection job stats.",
    "namespaceFile": "ml_get_job_stats"
  },
  {
    "name": "get-jobs",
    "namespace": "ml",
    "description": "Get anomaly detection jobs configuration info.",
    "namespaceFile": "ml_get_jobs"
  },
  {
    "name": "get-memory-stats",
    "namespace": "ml",
    "description": "Get machine learning memory usage info.",
    "namespaceFile": "ml_get_memory_stats"
  },
  {
    "name": "get-model-snapshot-upgrade-stats",
    "namespace": "ml",
    "description": "Get anomaly detection job model snapshot upgrade usage info.",
    "namespaceFile": "ml_get_model_snapshot_upgrade_stats"
  },
  {
    "name": "get-model-snapshots",
    "namespace": "ml",
    "description": "Get model snapshots info.",
    "namespaceFile": "ml_get_model_snapshots"
  },
  {
    "name": "get-overall-buckets",
    "namespace": "ml",
    "description": "Get overall bucket results.",
    "namespaceFile": "ml_get_overall_buckets"
  },
  {
    "name": "get-records",
    "namespace": "ml",
    "description": "Get anomaly records for an anomaly detection job.",
    "namespaceFile": "ml_get_records"
  },
  {
    "name": "get-trained-models",
    "namespace": "ml",
    "description": "Get trained model configuration info.",
    "namespaceFile": "ml_get_trained_models"
  },
  {
    "name": "get-trained-models-stats",
    "namespace": "ml",
    "description": "Get trained models usage info.",
    "namespaceFile": "ml_get_trained_models_stats"
  },
  {
    "name": "infer-trained-model",
    "namespace": "ml",
    "description": "Evaluate a trained model.",
    "namespaceFile": "ml_infer_trained_model"
  },
  {
    "name": "info",
    "namespace": "ml",
    "description": "Get machine learning information.",
    "namespaceFile": "ml_info"
  },
  {
    "name": "open-job",
    "namespace": "ml",
    "description": "Open anomaly detection jobs.",
    "namespaceFile": "ml_open_job"
  },
  {
    "name": "post-calendar-events",
    "namespace": "ml",
    "description": "Add scheduled events to the calendar.",
    "namespaceFile": "ml_post_calendar_events"
  },
  {
    "name": "post-data",
    "namespace": "ml",
    "description": "Send data to an anomaly detection job for analysis.",
    "namespaceFile": "ml_post_data"
  },
  {
    "name": "preview-data-frame-analytics",
    "namespace": "ml",
    "description": "Preview features used by data frame analytics.",
    "namespaceFile": "ml_preview_data_frame_analytics"
  },
  {
    "name": "preview-datafeed",
    "namespace": "ml",
    "description": "Preview a datafeed.",
    "namespaceFile": "ml_preview_datafeed"
  },
  {
    "name": "put-calendar",
    "namespace": "ml",
    "description": "Create a calendar.",
    "namespaceFile": "ml_put_calendar"
  },
  {
    "name": "put-calendar-job",
    "namespace": "ml",
    "description": "Add anomaly detection job to calendar.",
    "namespaceFile": "ml_put_calendar_job"
  },
  {
    "name": "put-data-frame-analytics",
    "namespace": "ml",
    "description": "Create a data frame analytics job.",
    "namespaceFile": "ml_put_data_frame_analytics"
  },
  {
    "name": "put-datafeed",
    "namespace": "ml",
    "description": "Create a datafeed.",
    "namespaceFile": "ml_put_datafeed"
  },
  {
    "name": "put-filter",
    "namespace": "ml",
    "description": "Create a filter.",
    "namespaceFile": "ml_put_filter"
  },
  {
    "name": "put-job",
    "namespace": "ml",
    "description": "Create an anomaly detection job.",
    "namespaceFile": "ml_put_job"
  },
  {
    "name": "put-trained-model",
    "namespace": "ml",
    "description": "Create a trained model.",
    "namespaceFile": "ml_put_trained_model"
  },
  {
    "name": "put-trained-model-alias",
    "namespace": "ml",
    "description": "Create or update a trained model alias.",
    "namespaceFile": "ml_put_trained_model_alias"
  },
  {
    "name": "put-trained-model-definition-part",
    "namespace": "ml",
    "description": "Create part of a trained model definition.",
    "namespaceFile": "ml_put_trained_model_definition_part"
  },
  {
    "name": "put-trained-model-vocabulary",
    "namespace": "ml",
    "description": "Create a trained model vocabulary.",
    "namespaceFile": "ml_put_trained_model_vocabulary"
  },
  {
    "name": "reset-job",
    "namespace": "ml",
    "description": "Reset an anomaly detection job.",
    "namespaceFile": "ml_reset_job"
  },
  {
    "name": "revert-model-snapshot",
    "namespace": "ml",
    "description": "Revert to a snapshot.",
    "namespaceFile": "ml_revert_model_snapshot"
  },
  {
    "name": "set-upgrade-mode",
    "namespace": "ml",
    "description": "Set upgrade_mode for ML indices.",
    "namespaceFile": "ml_set_upgrade_mode"
  },
  {
    "name": "start-data-frame-analytics",
    "namespace": "ml",
    "description": "Start a data frame analytics job.",
    "namespaceFile": "ml_start_data_frame_analytics"
  },
  {
    "name": "start-datafeed",
    "namespace": "ml",
    "description": "Start datafeeds.",
    "namespaceFile": "ml_start_datafeed"
  },
  {
    "name": "start-trained-model-deployment",
    "namespace": "ml",
    "description": "Start a trained model deployment.",
    "namespaceFile": "ml_start_trained_model_deployment"
  },
  {
    "name": "stop-data-frame-analytics",
    "namespace": "ml",
    "description": "Stop data frame analytics jobs.",
    "namespaceFile": "ml_stop_data_frame_analytics"
  },
  {
    "name": "stop-datafeed",
    "namespace": "ml",
    "description": "Stop datafeeds.",
    "namespaceFile": "ml_stop_datafeed"
  },
  {
    "name": "stop-trained-model-deployment",
    "namespace": "ml",
    "description": "Stop a trained model deployment.",
    "namespaceFile": "ml_stop_trained_model_deployment"
  },
  {
    "name": "update-data-frame-analytics",
    "namespace": "ml",
    "description": "Update a data frame analytics job.",
    "namespaceFile": "ml_update_data_frame_analytics"
  },
  {
    "name": "update-datafeed",
    "namespace": "ml",
    "description": "Update a datafeed.",
    "namespaceFile": "ml_update_datafeed"
  },
  {
    "name": "update-filter",
    "namespace": "ml",
    "description": "Update a filter.",
    "namespaceFile": "ml_update_filter"
  },
  {
    "name": "update-job",
    "namespace": "ml",
    "description": "Update an anomaly detection job.",
    "namespaceFile": "ml_update_job"
  },
  {
    "name": "update-model-snapshot",
    "namespace": "ml",
    "description": "Update a snapshot.",
    "namespaceFile": "ml_update_model_snapshot"
  },
  {
    "name": "update-trained-model-deployment",
    "namespace": "ml",
    "description": "Update a trained model deployment.",
    "namespaceFile": "ml_update_trained_model_deployment"
  },
  {
    "name": "upgrade-job-snapshot",
    "namespace": "ml",
    "description": "Upgrade a snapshot.",
    "namespaceFile": "ml_upgrade_job_snapshot"
  },
  {
    "name": "msearch",
    "namespace": null,
    "description": "Run multiple searches.",
    "namespaceFile": "msearch"
  },
  {
    "name": "msearch-template",
    "namespace": null,
    "description": "Run multiple templated searches.",
    "namespaceFile": "msearch_template"
  },
  {
    "name": "mtermvectors",
    "namespace": null,
    "description": "Get multiple term vectors.",
    "namespaceFile": "mtermvectors"
  },
  {
    "name": "clear-repositories-metering-archive",
    "namespace": "nodes",
    "description": "Clear the archived repositories metering.",
    "namespaceFile": "nodes_clear_repositories_metering_archive"
  },
  {
    "name": "get-repositories-metering-info",
    "namespace": "nodes",
    "description": "Get cluster repositories metering.",
    "namespaceFile": "nodes_get_repositories_metering_info"
  },
  {
    "name": "hot-threads",
    "namespace": "nodes",
    "description": "Get the hot threads for nodes.",
    "namespaceFile": "nodes_hot_threads"
  },
  {
    "name": "info",
    "namespace": "nodes",
    "description": "Get node information.",
    "namespaceFile": "nodes_info"
  },
  {
    "name": "reload-secure-settings",
    "namespace": "nodes",
    "description": "Reload the keystore on nodes in the cluster.",
    "namespaceFile": "nodes_reload_secure_settings"
  },
  {
    "name": "stats",
    "namespace": "nodes",
    "description": "Get node statistics.",
    "namespaceFile": "nodes_stats"
  },
  {
    "name": "usage",
    "namespace": "nodes",
    "description": "Get feature usage information.",
    "namespaceFile": "nodes_usage"
  },
  {
    "name": "open-point-in-time",
    "namespace": null,
    "description": "Open a point in time.",
    "namespaceFile": "open_point_in_time"
  },
  {
    "name": "ping",
    "namespace": null,
    "description": "Ping the cluster.",
    "namespaceFile": "ping"
  },
  {
    "name": "create-many-routing",
    "namespace": "project",
    "description": "Create or update project routing expressions.",
    "namespaceFile": "project_create_many_routing"
  },
  {
    "name": "create-routing",
    "namespace": "project",
    "description": "Create or update a project routing expression.",
    "namespaceFile": "project_create_routing"
  },
  {
    "name": "delete-routing",
    "namespace": "project",
    "description": "Delete a project routing expression.",
    "namespaceFile": "project_delete_routing"
  },
  {
    "name": "get-many-routing",
    "namespace": "project",
    "description": "Get project routing expressions.",
    "namespaceFile": "project_get_many_routing"
  },
  {
    "name": "get-routing",
    "namespace": "project",
    "description": "Get a project routing expression.",
    "namespaceFile": "project_get_routing"
  },
  {
    "name": "tags",
    "namespace": "project",
    "description": "Get tags.",
    "namespaceFile": "project_tags"
  },
  {
    "name": "put-script",
    "namespace": null,
    "description": "Create or update a script or search template.",
    "namespaceFile": "put_script"
  },
  {
    "name": "delete-rule",
    "namespace": "query-rules",
    "description": "Delete a query rule.",
    "namespaceFile": "query_rules_delete_rule"
  },
  {
    "name": "delete-ruleset",
    "namespace": "query-rules",
    "description": "Delete a query ruleset.",
    "namespaceFile": "query_rules_delete_ruleset"
  },
  {
    "name": "get-rule",
    "namespace": "query-rules",
    "description": "Get a query rule.",
    "namespaceFile": "query_rules_get_rule"
  },
  {
    "name": "get-ruleset",
    "namespace": "query-rules",
    "description": "Get a query ruleset.",
    "namespaceFile": "query_rules_get_ruleset"
  },
  {
    "name": "list-rulesets",
    "namespace": "query-rules",
    "description": "Get all query rulesets.",
    "namespaceFile": "query_rules_list_rulesets"
  },
  {
    "name": "put-rule",
    "namespace": "query-rules",
    "description": "Create or update a query rule.",
    "namespaceFile": "query_rules_put_rule"
  },
  {
    "name": "put-ruleset",
    "namespace": "query-rules",
    "description": "Create or update a query ruleset.",
    "namespaceFile": "query_rules_put_ruleset"
  },
  {
    "name": "test",
    "namespace": "query-rules",
    "description": "Test a query ruleset.",
    "namespaceFile": "query_rules_test"
  },
  {
    "name": "rank-eval",
    "namespace": null,
    "description": "Evaluate ranked search results.",
    "namespaceFile": "rank_eval"
  },
  {
    "name": "reindex",
    "namespace": null,
    "description": "Reindex documents.",
    "namespaceFile": "reindex"
  },
  {
    "name": "reindex-rethrottle",
    "namespace": null,
    "description": "Throttle a reindex operation.",
    "namespaceFile": "reindex_rethrottle"
  },
  {
    "name": "render-search-template",
    "namespace": null,
    "description": "Render a search template.",
    "namespaceFile": "render_search_template"
  },
  {
    "name": "delete-job",
    "namespace": "rollup",
    "description": "Delete a rollup job.",
    "namespaceFile": "rollup_delete_job"
  },
  {
    "name": "get-jobs",
    "namespace": "rollup",
    "description": "Get rollup job information.",
    "namespaceFile": "rollup_get_jobs"
  },
  {
    "name": "get-rollup-caps",
    "namespace": "rollup",
    "description": "Get the rollup job capabilities.",
    "namespaceFile": "rollup_get_rollup_caps"
  },
  {
    "name": "get-rollup-index-caps",
    "namespace": "rollup",
    "description": "Get the rollup index capabilities.",
    "namespaceFile": "rollup_get_rollup_index_caps"
  },
  {
    "name": "put-job",
    "namespace": "rollup",
    "description": "Create a rollup job.",
    "namespaceFile": "rollup_put_job"
  },
  {
    "name": "rollup-search",
    "namespace": "rollup",
    "description": "Search rolled-up data.",
    "namespaceFile": "rollup_rollup_search"
  },
  {
    "name": "start-job",
    "namespace": "rollup",
    "description": "Start rollup jobs.",
    "namespaceFile": "rollup_start_job"
  },
  {
    "name": "stop-job",
    "namespace": "rollup",
    "description": "Stop rollup jobs.",
    "namespaceFile": "rollup_stop_job"
  },
  {
    "name": "scripts-painless-execute",
    "namespace": null,
    "description": "Run a script.",
    "namespaceFile": "scripts_painless_execute"
  },
  {
    "name": "scroll",
    "namespace": null,
    "description": "Run a scrolling search.",
    "namespaceFile": "scroll"
  },
  {
    "name": "search",
    "namespace": null,
    "description": "Run a search.",
    "namespaceFile": "search"
  },
  {
    "name": "delete",
    "namespace": "search-application",
    "description": "Delete a search application.",
    "namespaceFile": "search_application_delete"
  },
  {
    "name": "delete-behavioral-analytics",
    "namespace": "search-application",
    "description": "Delete a behavioral analytics collection.",
    "namespaceFile": "search_application_delete_behavioral_analytics"
  },
  {
    "name": "get",
    "namespace": "search-application",
    "description": "Get search application details.",
    "namespaceFile": "search_application_get"
  },
  {
    "name": "get-behavioral-analytics",
    "namespace": "search-application",
    "description": "Get behavioral analytics collections.",
    "namespaceFile": "search_application_get_behavioral_analytics"
  },
  {
    "name": "list",
    "namespace": "search-application",
    "description": "Get search applications.",
    "namespaceFile": "search_application_list"
  },
  {
    "name": "post-behavioral-analytics-event",
    "namespace": "search-application",
    "description": "Create a behavioral analytics collection event.",
    "namespaceFile": "search_application_post_behavioral_analytics_event"
  },
  {
    "name": "put",
    "namespace": "search-application",
    "description": "Create or update a search application.",
    "namespaceFile": "search_application_put"
  },
  {
    "name": "put-behavioral-analytics",
    "namespace": "search-application",
    "description": "Create a behavioral analytics collection.",
    "namespaceFile": "search_application_put_behavioral_analytics"
  },
  {
    "name": "render-query",
    "namespace": "search-application",
    "description": "Render a search application query.",
    "namespaceFile": "search_application_render_query"
  },
  {
    "name": "search",
    "namespace": "search-application",
    "description": "Run a search application search.",
    "namespaceFile": "search_application_search"
  },
  {
    "name": "search-mvt",
    "namespace": null,
    "description": "Search a vector tile.",
    "namespaceFile": "search_mvt"
  },
  {
    "name": "search-shards",
    "namespace": null,
    "description": "Get the search shards.",
    "namespaceFile": "search_shards"
  },
  {
    "name": "search-template",
    "namespace": null,
    "description": "Run a search with a search template.",
    "namespaceFile": "search_template"
  },
  {
    "name": "cache-stats",
    "namespace": "searchable-snapshots",
    "description": "Get cache statistics.",
    "namespaceFile": "searchable_snapshots_cache_stats"
  },
  {
    "name": "clear-cache",
    "namespace": "searchable-snapshots",
    "description": "Clear the cache.",
    "namespaceFile": "searchable_snapshots_clear_cache"
  },
  {
    "name": "mount",
    "namespace": "searchable-snapshots",
    "description": "Mount a snapshot.",
    "namespaceFile": "searchable_snapshots_mount"
  },
  {
    "name": "stats",
    "namespace": "searchable-snapshots",
    "description": "Get searchable snapshot statistics.",
    "namespaceFile": "searchable_snapshots_stats"
  },
  {
    "name": "activate-user-profile",
    "namespace": "security",
    "description": "Activate a user profile.",
    "namespaceFile": "security_activate_user_profile"
  },
  {
    "name": "authenticate",
    "namespace": "security",
    "description": "Authenticate a user.",
    "namespaceFile": "security_authenticate"
  },
  {
    "name": "bulk-delete-role",
    "namespace": "security",
    "description": "Bulk delete roles.",
    "namespaceFile": "security_bulk_delete_role"
  },
  {
    "name": "bulk-put-role",
    "namespace": "security",
    "description": "Bulk create or update roles.",
    "namespaceFile": "security_bulk_put_role"
  },
  {
    "name": "bulk-update-api-keys",
    "namespace": "security",
    "description": "Bulk update API keys.",
    "namespaceFile": "security_bulk_update_api_keys"
  },
  {
    "name": "change-password",
    "namespace": "security",
    "description": "Change passwords.",
    "namespaceFile": "security_change_password"
  },
  {
    "name": "clear-api-key-cache",
    "namespace": "security",
    "description": "Clear the API key cache.",
    "namespaceFile": "security_clear_api_key_cache"
  },
  {
    "name": "clear-cached-privileges",
    "namespace": "security",
    "description": "Clear the privileges cache.",
    "namespaceFile": "security_clear_cached_privileges"
  },
  {
    "name": "clear-cached-realms",
    "namespace": "security",
    "description": "Clear the user cache.",
    "namespaceFile": "security_clear_cached_realms"
  },
  {
    "name": "clear-cached-roles",
    "namespace": "security",
    "description": "Clear the roles cache.",
    "namespaceFile": "security_clear_cached_roles"
  },
  {
    "name": "clear-cached-service-tokens",
    "namespace": "security",
    "description": "Clear service account token caches.",
    "namespaceFile": "security_clear_cached_service_tokens"
  },
  {
    "name": "clone-api-key",
    "namespace": "security",
    "description": "Clone an API key.",
    "namespaceFile": "security_clone_api_key"
  },
  {
    "name": "create-api-key",
    "namespace": "security",
    "description": "Create an API key.",
    "namespaceFile": "security_create_api_key"
  },
  {
    "name": "create-cross-cluster-api-key",
    "namespace": "security",
    "description": "Create a cross-cluster API key.",
    "namespaceFile": "security_create_cross_cluster_api_key"
  },
  {
    "name": "create-service-token",
    "namespace": "security",
    "description": "Create a service account token.",
    "namespaceFile": "security_create_service_token"
  },
  {
    "name": "delegate-pki",
    "namespace": "security",
    "description": "Delegate PKI authentication.",
    "namespaceFile": "security_delegate_pki"
  },
  {
    "name": "delete-privileges",
    "namespace": "security",
    "description": "Delete application privileges.",
    "namespaceFile": "security_delete_privileges"
  },
  {
    "name": "delete-role",
    "namespace": "security",
    "description": "Delete roles.",
    "namespaceFile": "security_delete_role"
  },
  {
    "name": "delete-role-mapping",
    "namespace": "security",
    "description": "Delete role mappings.",
    "namespaceFile": "security_delete_role_mapping"
  },
  {
    "name": "delete-service-token",
    "namespace": "security",
    "description": "Delete service account tokens.",
    "namespaceFile": "security_delete_service_token"
  },
  {
    "name": "delete-user",
    "namespace": "security",
    "description": "Delete users.",
    "namespaceFile": "security_delete_user"
  },
  {
    "name": "disable-user",
    "namespace": "security",
    "description": "Disable users.",
    "namespaceFile": "security_disable_user"
  },
  {
    "name": "disable-user-profile",
    "namespace": "security",
    "description": "Disable a user profile.",
    "namespaceFile": "security_disable_user_profile"
  },
  {
    "name": "enable-user",
    "namespace": "security",
    "description": "Enable users.",
    "namespaceFile": "security_enable_user"
  },
  {
    "name": "enable-user-profile",
    "namespace": "security",
    "description": "Enable a user profile.",
    "namespaceFile": "security_enable_user_profile"
  },
  {
    "name": "enroll-kibana",
    "namespace": "security",
    "description": "Enroll Kibana.",
    "namespaceFile": "security_enroll_kibana"
  },
  {
    "name": "enroll-node",
    "namespace": "security",
    "description": "Enroll a node.",
    "namespaceFile": "security_enroll_node"
  },
  {
    "name": "get-api-key",
    "namespace": "security",
    "description": "Get API key information.",
    "namespaceFile": "security_get_api_key"
  },
  {
    "name": "get-builtin-privileges",
    "namespace": "security",
    "description": "Get builtin privileges.",
    "namespaceFile": "security_get_builtin_privileges"
  },
  {
    "name": "get-privileges",
    "namespace": "security",
    "description": "Get application privileges.",
    "namespaceFile": "security_get_privileges"
  },
  {
    "name": "get-role",
    "namespace": "security",
    "description": "Get roles.",
    "namespaceFile": "security_get_role"
  },
  {
    "name": "get-role-mapping",
    "namespace": "security",
    "description": "Get role mappings.",
    "namespaceFile": "security_get_role_mapping"
  },
  {
    "name": "get-service-accounts",
    "namespace": "security",
    "description": "Get service accounts.",
    "namespaceFile": "security_get_service_accounts"
  },
  {
    "name": "get-service-credentials",
    "namespace": "security",
    "description": "Get service account credentials.",
    "namespaceFile": "security_get_service_credentials"
  },
  {
    "name": "get-settings",
    "namespace": "security",
    "description": "Get security index settings.",
    "namespaceFile": "security_get_settings"
  },
  {
    "name": "get-stats",
    "namespace": "security",
    "description": "Get security stats.",
    "namespaceFile": "security_get_stats"
  },
  {
    "name": "get-token",
    "namespace": "security",
    "description": "Get a token.",
    "namespaceFile": "security_get_token"
  },
  {
    "name": "get-user",
    "namespace": "security",
    "description": "Get users.",
    "namespaceFile": "security_get_user"
  },
  {
    "name": "get-user-privileges",
    "namespace": "security",
    "description": "Get user privileges.",
    "namespaceFile": "security_get_user_privileges"
  },
  {
    "name": "get-user-profile",
    "namespace": "security",
    "description": "Get a user profile.",
    "namespaceFile": "security_get_user_profile"
  },
  {
    "name": "grant-api-key",
    "namespace": "security",
    "description": "Grant an API key.",
    "namespaceFile": "security_grant_api_key"
  },
  {
    "name": "has-privileges",
    "namespace": "security",
    "description": "Check user privileges.",
    "namespaceFile": "security_has_privileges"
  },
  {
    "name": "has-privileges-user-profile",
    "namespace": "security",
    "description": "Check user profile privileges.",
    "namespaceFile": "security_has_privileges_user_profile"
  },
  {
    "name": "invalidate-api-key",
    "namespace": "security",
    "description": "Invalidate API keys.",
    "namespaceFile": "security_invalidate_api_key"
  },
  {
    "name": "invalidate-token",
    "namespace": "security",
    "description": "Invalidate a token.",
    "namespaceFile": "security_invalidate_token"
  },
  {
    "name": "oidc-authenticate",
    "namespace": "security",
    "description": "Authenticate OpenID Connect.",
    "namespaceFile": "security_oidc_authenticate"
  },
  {
    "name": "oidc-logout",
    "namespace": "security",
    "description": "Logout of OpenID Connect.",
    "namespaceFile": "security_oidc_logout"
  },
  {
    "name": "oidc-prepare-authentication",
    "namespace": "security",
    "description": "Prepare OpenID connect authentication.",
    "namespaceFile": "security_oidc_prepare_authentication"
  },
  {
    "name": "put-privileges",
    "namespace": "security",
    "description": "Create or update application privileges.",
    "namespaceFile": "security_put_privileges"
  },
  {
    "name": "put-role",
    "namespace": "security",
    "description": "Create or update roles.",
    "namespaceFile": "security_put_role"
  },
  {
    "name": "put-role-mapping",
    "namespace": "security",
    "description": "Create or update role mappings.",
    "namespaceFile": "security_put_role_mapping"
  },
  {
    "name": "put-user",
    "namespace": "security",
    "description": "Create or update users.",
    "namespaceFile": "security_put_user"
  },
  {
    "name": "query-api-keys",
    "namespace": "security",
    "description": "Find API keys with a query.",
    "namespaceFile": "security_query_api_keys"
  },
  {
    "name": "query-role",
    "namespace": "security",
    "description": "Find roles with a query.",
    "namespaceFile": "security_query_role"
  },
  {
    "name": "query-user",
    "namespace": "security",
    "description": "Find users with a query.",
    "namespaceFile": "security_query_user"
  },
  {
    "name": "saml-authenticate",
    "namespace": "security",
    "description": "Authenticate SAML.",
    "namespaceFile": "security_saml_authenticate"
  },
  {
    "name": "saml-complete-logout",
    "namespace": "security",
    "description": "Logout of SAML completely.",
    "namespaceFile": "security_saml_complete_logout"
  },
  {
    "name": "saml-invalidate",
    "namespace": "security",
    "description": "Invalidate SAML.",
    "namespaceFile": "security_saml_invalidate"
  },
  {
    "name": "saml-logout",
    "namespace": "security",
    "description": "Logout of SAML.",
    "namespaceFile": "security_saml_logout"
  },
  {
    "name": "saml-prepare-authentication",
    "namespace": "security",
    "description": "Prepare SAML authentication.",
    "namespaceFile": "security_saml_prepare_authentication"
  },
  {
    "name": "saml-service-provider-metadata",
    "namespace": "security",
    "description": "Create SAML service provider metadata.",
    "namespaceFile": "security_saml_service_provider_metadata"
  },
  {
    "name": "suggest-user-profiles",
    "namespace": "security",
    "description": "Suggest a user profile.",
    "namespaceFile": "security_suggest_user_profiles"
  },
  {
    "name": "update-api-key",
    "namespace": "security",
    "description": "Update an API key.",
    "namespaceFile": "security_update_api_key"
  },
  {
    "name": "update-cross-cluster-api-key",
    "namespace": "security",
    "description": "Update a cross-cluster API key.",
    "namespaceFile": "security_update_cross_cluster_api_key"
  },
  {
    "name": "update-settings",
    "namespace": "security",
    "description": "Update security index settings.",
    "namespaceFile": "security_update_settings"
  },
  {
    "name": "update-user-profile-data",
    "namespace": "security",
    "description": "Update user profile data.",
    "namespaceFile": "security_update_user_profile_data"
  },
  {
    "name": "ingest",
    "namespace": "simulate",
    "description": "Simulate data ingestion.",
    "namespaceFile": "simulate_ingest"
  },
  {
    "name": "delete-lifecycle",
    "namespace": "slm",
    "description": "Delete a policy.",
    "namespaceFile": "slm_delete_lifecycle"
  },
  {
    "name": "execute-lifecycle",
    "namespace": "slm",
    "description": "Run a policy.",
    "namespaceFile": "slm_execute_lifecycle"
  },
  {
    "name": "execute-retention",
    "namespace": "slm",
    "description": "Run a retention policy.",
    "namespaceFile": "slm_execute_retention"
  },
  {
    "name": "get-lifecycle",
    "namespace": "slm",
    "description": "Get policy information.",
    "namespaceFile": "slm_get_lifecycle"
  },
  {
    "name": "get-stats",
    "namespace": "slm",
    "description": "Get snapshot lifecycle management statistics.",
    "namespaceFile": "slm_get_stats"
  },
  {
    "name": "get-status",
    "namespace": "slm",
    "description": "Get the snapshot lifecycle management status.",
    "namespaceFile": "slm_get_status"
  },
  {
    "name": "put-lifecycle",
    "namespace": "slm",
    "description": "Create or update a policy.",
    "namespaceFile": "slm_put_lifecycle"
  },
  {
    "name": "start",
    "namespace": "slm",
    "description": "Start snapshot lifecycle management.",
    "namespaceFile": "slm_start"
  },
  {
    "name": "stop",
    "namespace": "slm",
    "description": "Stop snapshot lifecycle management.",
    "namespaceFile": "slm_stop"
  },
  {
    "name": "cleanup-repository",
    "namespace": "snapshot",
    "description": "Clean up the snapshot repository.",
    "namespaceFile": "snapshot_cleanup_repository"
  },
  {
    "name": "clone",
    "namespace": "snapshot",
    "description": "Clone a snapshot.",
    "namespaceFile": "snapshot_clone"
  },
  {
    "name": "create",
    "namespace": "snapshot",
    "description": "Create a snapshot.",
    "namespaceFile": "snapshot_create"
  },
  {
    "name": "create-repository",
    "namespace": "snapshot",
    "description": "Create or update a snapshot repository.",
    "namespaceFile": "snapshot_create_repository"
  },
  {
    "name": "delete",
    "namespace": "snapshot",
    "description": "Delete snapshots.",
    "namespaceFile": "snapshot_delete"
  },
  {
    "name": "delete-repository",
    "namespace": "snapshot",
    "description": "Delete snapshot repositories.",
    "namespaceFile": "snapshot_delete_repository"
  },
  {
    "name": "get",
    "namespace": "snapshot",
    "description": "Get snapshot information.",
    "namespaceFile": "snapshot_get"
  },
  {
    "name": "get-repository",
    "namespace": "snapshot",
    "description": "Get snapshot repository information.",
    "namespaceFile": "snapshot_get_repository"
  },
  {
    "name": "repository-analyze",
    "namespace": "snapshot",
    "description": "Analyze a snapshot repository.",
    "namespaceFile": "snapshot_repository_analyze"
  },
  {
    "name": "repository-verify-integrity",
    "namespace": "snapshot",
    "description": "Verify the repository integrity.",
    "namespaceFile": "snapshot_repository_verify_integrity"
  },
  {
    "name": "restore",
    "namespace": "snapshot",
    "description": "Restore a snapshot.",
    "namespaceFile": "snapshot_restore"
  },
  {
    "name": "status",
    "namespace": "snapshot",
    "description": "Get the snapshot status.",
    "namespaceFile": "snapshot_status"
  },
  {
    "name": "verify-repository",
    "namespace": "snapshot",
    "description": "Verify a snapshot repository.",
    "namespaceFile": "snapshot_verify_repository"
  },
  {
    "name": "clear-cursor",
    "namespace": "sql",
    "description": "Clear an SQL search cursor.",
    "namespaceFile": "sql_clear_cursor"
  },
  {
    "name": "delete-async",
    "namespace": "sql",
    "description": "Delete an async SQL search.",
    "namespaceFile": "sql_delete_async"
  },
  {
    "name": "get-async",
    "namespace": "sql",
    "description": "Get async SQL search results.",
    "namespaceFile": "sql_get_async"
  },
  {
    "name": "get-async-status",
    "namespace": "sql",
    "description": "Get the async SQL search status.",
    "namespaceFile": "sql_get_async_status"
  },
  {
    "name": "query",
    "namespace": "sql",
    "description": "Get SQL search results.",
    "namespaceFile": "sql_query"
  },
  {
    "name": "translate",
    "namespace": "sql",
    "description": "Translate SQL into Elasticsearch queries.",
    "namespaceFile": "sql_translate"
  },
  {
    "name": "certificates",
    "namespace": "ssl",
    "description": "Get SSL certificates.",
    "namespaceFile": "ssl_certificates"
  },
  {
    "name": "logs-disable",
    "namespace": "streams",
    "description": "Disable a named stream.",
    "namespaceFile": "streams_logs_disable"
  },
  {
    "name": "logs-enable",
    "namespace": "streams",
    "description": "Enable a named stream.",
    "namespaceFile": "streams_logs_enable"
  },
  {
    "name": "status",
    "namespace": "streams",
    "description": "Get the status of streams.",
    "namespaceFile": "streams_status"
  },
  {
    "name": "delete-synonym",
    "namespace": "synonyms",
    "description": "Delete a synonym set.",
    "namespaceFile": "synonyms_delete_synonym"
  },
  {
    "name": "delete-synonym-rule",
    "namespace": "synonyms",
    "description": "Delete a synonym rule.",
    "namespaceFile": "synonyms_delete_synonym_rule"
  },
  {
    "name": "get-synonym",
    "namespace": "synonyms",
    "description": "Get a synonym set.",
    "namespaceFile": "synonyms_get_synonym"
  },
  {
    "name": "get-synonym-rule",
    "namespace": "synonyms",
    "description": "Get a synonym rule.",
    "namespaceFile": "synonyms_get_synonym_rule"
  },
  {
    "name": "get-synonyms-sets",
    "namespace": "synonyms",
    "description": "Get all synonym sets.",
    "namespaceFile": "synonyms_get_synonyms_sets"
  },
  {
    "name": "put-synonym",
    "namespace": "synonyms",
    "description": "Create or update a synonym set.",
    "namespaceFile": "synonyms_put_synonym"
  },
  {
    "name": "put-synonym-rule",
    "namespace": "synonyms",
    "description": "Create or update a synonym rule.",
    "namespaceFile": "synonyms_put_synonym_rule"
  },
  {
    "name": "cancel",
    "namespace": "tasks",
    "description": "Cancel a task.",
    "namespaceFile": "tasks_cancel"
  },
  {
    "name": "get",
    "namespace": "tasks",
    "description": "Get task information.",
    "namespaceFile": "tasks_get"
  },
  {
    "name": "list",
    "namespace": "tasks",
    "description": "Get all tasks.",
    "namespaceFile": "tasks_list"
  },
  {
    "name": "terms-enum",
    "namespace": null,
    "description": "Get terms in an index.",
    "namespaceFile": "terms_enum"
  },
  {
    "name": "termvectors",
    "namespace": null,
    "description": "Get term vector information.",
    "namespaceFile": "termvectors"
  },
  {
    "name": "find-field-structure",
    "namespace": "text-structure",
    "description": "Find the structure of a text field.",
    "namespaceFile": "text_structure_find_field_structure"
  },
  {
    "name": "find-message-structure",
    "namespace": "text-structure",
    "description": "Find the structure of text messages.",
    "namespaceFile": "text_structure_find_message_structure"
  },
  {
    "name": "find-structure",
    "namespace": "text-structure",
    "description": "Find the structure of a text file.",
    "namespaceFile": "text_structure_find_structure"
  },
  {
    "name": "test-grok-pattern",
    "namespace": "text-structure",
    "description": "Test a Grok pattern.",
    "namespaceFile": "text_structure_test_grok_pattern"
  },
  {
    "name": "delete-transform",
    "namespace": "transform",
    "description": "Delete a transform.",
    "namespaceFile": "transform_delete_transform"
  },
  {
    "name": "get-node-stats",
    "namespace": "transform",
    "description": "Get node stats.",
    "namespaceFile": "transform_get_node_stats"
  },
  {
    "name": "get-transform",
    "namespace": "transform",
    "description": "Get transforms.",
    "namespaceFile": "transform_get_transform"
  },
  {
    "name": "get-transform-stats",
    "namespace": "transform",
    "description": "Get transform stats.",
    "namespaceFile": "transform_get_transform_stats"
  },
  {
    "name": "preview-transform",
    "namespace": "transform",
    "description": "Preview a transform.",
    "namespaceFile": "transform_preview_transform"
  },
  {
    "name": "put-transform",
    "namespace": "transform",
    "description": "Create a transform.",
    "namespaceFile": "transform_put_transform"
  },
  {
    "name": "reset-transform",
    "namespace": "transform",
    "description": "Reset a transform.",
    "namespaceFile": "transform_reset_transform"
  },
  {
    "name": "schedule-now-transform",
    "namespace": "transform",
    "description": "Schedule a transform to start now.",
    "namespaceFile": "transform_schedule_now_transform"
  },
  {
    "name": "set-upgrade-mode",
    "namespace": "transform",
    "description": "Set upgrade_mode for transform indices.",
    "namespaceFile": "transform_set_upgrade_mode"
  },
  {
    "name": "start-transform",
    "namespace": "transform",
    "description": "Start a transform.",
    "namespaceFile": "transform_start_transform"
  },
  {
    "name": "stop-transform",
    "namespace": "transform",
    "description": "Stop transforms.",
    "namespaceFile": "transform_stop_transform"
  },
  {
    "name": "update-transform",
    "namespace": "transform",
    "description": "Update a transform.",
    "namespaceFile": "transform_update_transform"
  },
  {
    "name": "upgrade-transforms",
    "namespace": "transform",
    "description": "Upgrade all transforms.",
    "namespaceFile": "transform_upgrade_transforms"
  },
  {
    "name": "update",
    "namespace": null,
    "description": "Update a document.",
    "namespaceFile": "update"
  },
  {
    "name": "update-by-query",
    "namespace": null,
    "description": "Update documents.",
    "namespaceFile": "update_by_query"
  },
  {
    "name": "update-by-query-rethrottle",
    "namespace": null,
    "description": "Throttle an update by query operation.",
    "namespaceFile": "update_by_query_rethrottle"
  },
  {
    "name": "ack-watch",
    "namespace": "watcher",
    "description": "Acknowledge a watch.",
    "namespaceFile": "watcher_ack_watch"
  },
  {
    "name": "activate-watch",
    "namespace": "watcher",
    "description": "Activate a watch.",
    "namespaceFile": "watcher_activate_watch"
  },
  {
    "name": "deactivate-watch",
    "namespace": "watcher",
    "description": "Deactivate a watch.",
    "namespaceFile": "watcher_deactivate_watch"
  },
  {
    "name": "delete-watch",
    "namespace": "watcher",
    "description": "Delete a watch.",
    "namespaceFile": "watcher_delete_watch"
  },
  {
    "name": "execute-watch",
    "namespace": "watcher",
    "description": "Run a watch.",
    "namespaceFile": "watcher_execute_watch"
  },
  {
    "name": "get-settings",
    "namespace": "watcher",
    "description": "Get Watcher index settings.",
    "namespaceFile": "watcher_get_settings"
  },
  {
    "name": "get-watch",
    "namespace": "watcher",
    "description": "Get a watch.",
    "namespaceFile": "watcher_get_watch"
  },
  {
    "name": "put-watch",
    "namespace": "watcher",
    "description": "Create or update a watch.",
    "namespaceFile": "watcher_put_watch"
  },
  {
    "name": "query-watches",
    "namespace": "watcher",
    "description": "Query watches.",
    "namespaceFile": "watcher_query_watches"
  },
  {
    "name": "start",
    "namespace": "watcher",
    "description": "Start the watch service.",
    "namespaceFile": "watcher_start"
  },
  {
    "name": "stats",
    "namespace": "watcher",
    "description": "Get Watcher statistics.",
    "namespaceFile": "watcher_stats"
  },
  {
    "name": "stop",
    "namespace": "watcher",
    "description": "Stop the watch service.",
    "namespaceFile": "watcher_stop"
  },
  {
    "name": "update-settings",
    "namespace": "watcher",
    "description": "Update Watcher index settings.",
    "namespaceFile": "watcher_update_settings"
  },
  {
    "name": "info",
    "namespace": "xpack",
    "description": "Get information.",
    "namespaceFile": "xpack_info"
  },
  {
    "name": "usage",
    "namespace": "xpack",
    "description": "Get usage information.",
    "namespaceFile": "xpack_usage"
  }
] as const
