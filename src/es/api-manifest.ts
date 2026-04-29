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
  readonly method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD'
  readonly path: string
  readonly responseType?: 'json' | 'text'
  readonly bodyFormat?: 'json' | 'ndjson'
  /** File stem under src/es/apis/ that holds the full EsApiDefinition. */
  readonly namespaceFile: string
}

export const apiManifest: readonly EsApiMeta[] = [
  {
    "name": "delete",
    "namespace": "async-search",
    "description": "Delete an async search.",
    "method": "DELETE",
    "path": "/_async_search/{id}",
    "namespaceFile": "async_search_delete"
  },
  {
    "name": "get",
    "namespace": "async-search",
    "description": "Get async search results.",
    "method": "GET",
    "path": "/_async_search/{id}",
    "namespaceFile": "async_search_get"
  },
  {
    "name": "status",
    "namespace": "async-search",
    "description": "Get the async search status.",
    "method": "GET",
    "path": "/_async_search/status/{id}",
    "namespaceFile": "async_search_status"
  },
  {
    "name": "submit",
    "namespace": "async-search",
    "description": "Run an async search.",
    "method": "POST",
    "path": "/{index}/_async_search",
    "namespaceFile": "async_search_submit"
  },
  {
    "name": "bulk",
    "namespace": null,
    "description": "Bulk index or delete documents.",
    "method": "POST",
    "path": "/{index}/_bulk",
    "namespaceFile": "bulk",
    "bodyFormat": "ndjson"
  },
  {
    "name": "aliases",
    "namespace": "cat",
    "description": "Get aliases.",
    "method": "GET",
    "path": "/_cat/aliases/{name}",
    "namespaceFile": "cat_aliases",
    "responseType": "text"
  },
  {
    "name": "component-templates",
    "namespace": "cat",
    "description": "Get component templates.",
    "method": "GET",
    "path": "/_cat/component_templates/{name}",
    "namespaceFile": "cat_component_templates",
    "responseType": "text"
  },
  {
    "name": "count",
    "namespace": "cat",
    "description": "Get a document count.",
    "method": "POST",
    "path": "/_cat/count/{index}",
    "namespaceFile": "cat_count",
    "responseType": "text"
  },
  {
    "name": "help",
    "namespace": "cat",
    "description": "Get CAT help.",
    "method": "GET",
    "path": "/_cat",
    "namespaceFile": "cat_help",
    "responseType": "text"
  },
  {
    "name": "indices",
    "namespace": "cat",
    "description": "Get index information.",
    "method": "GET",
    "path": "/_cat/indices/{index}",
    "namespaceFile": "cat_indices",
    "responseType": "text"
  },
  {
    "name": "ml-data-frame-analytics",
    "namespace": "cat",
    "description": "Get data frame analytics jobs.",
    "method": "GET",
    "path": "/_cat/ml/data_frame/analytics/{id}",
    "namespaceFile": "cat_ml_data_frame_analytics",
    "responseType": "text"
  },
  {
    "name": "ml-datafeeds",
    "namespace": "cat",
    "description": "Get datafeeds.",
    "method": "GET",
    "path": "/_cat/ml/datafeeds/{datafeed_id}",
    "namespaceFile": "cat_ml_datafeeds",
    "responseType": "text"
  },
  {
    "name": "ml-jobs",
    "namespace": "cat",
    "description": "Get anomaly detection jobs.",
    "method": "GET",
    "path": "/_cat/ml/anomaly_detectors/{job_id}",
    "namespaceFile": "cat_ml_jobs",
    "responseType": "text"
  },
  {
    "name": "ml-trained-models",
    "namespace": "cat",
    "description": "Get trained models.",
    "method": "GET",
    "path": "/_cat/ml/trained_models/{model_id}",
    "namespaceFile": "cat_ml_trained_models",
    "responseType": "text"
  },
  {
    "name": "transforms",
    "namespace": "cat",
    "description": "Get transform information.",
    "method": "GET",
    "path": "/_cat/transforms/{transform_id}",
    "namespaceFile": "cat_transforms",
    "responseType": "text"
  },
  {
    "name": "clear-scroll",
    "namespace": null,
    "description": "Clear a scrolling search.",
    "method": "DELETE",
    "path": "/_search/scroll",
    "namespaceFile": "clear_scroll"
  },
  {
    "name": "close-point-in-time",
    "namespace": null,
    "description": "Close a point in time.",
    "method": "DELETE",
    "path": "/_pit",
    "namespaceFile": "close_point_in_time"
  },
  {
    "name": "delete-component-template",
    "namespace": "cluster",
    "description": "Delete component templates.",
    "method": "DELETE",
    "path": "/_component_template/{name}",
    "namespaceFile": "cluster_delete_component_template"
  },
  {
    "name": "exists-component-template",
    "namespace": "cluster",
    "description": "Check component templates.",
    "method": "HEAD",
    "path": "/_component_template/{name}",
    "namespaceFile": "cluster_exists_component_template"
  },
  {
    "name": "get-component-template",
    "namespace": "cluster",
    "description": "Get component templates.",
    "method": "GET",
    "path": "/_component_template/{name}",
    "namespaceFile": "cluster_get_component_template"
  },
  {
    "name": "info",
    "namespace": "cluster",
    "description": "Get cluster info.",
    "method": "GET",
    "path": "/_info/{target}",
    "namespaceFile": "cluster_info"
  },
  {
    "name": "put-component-template",
    "namespace": "cluster",
    "description": "Create or update a component template.",
    "method": "PUT",
    "path": "/_component_template/{name}",
    "namespaceFile": "cluster_put_component_template"
  },
  {
    "name": "check-in",
    "namespace": "connector",
    "description": "Check in a connector.",
    "method": "PUT",
    "path": "/_connector/{connector_id}/_check_in",
    "namespaceFile": "connector_check_in"
  },
  {
    "name": "delete",
    "namespace": "connector",
    "description": "Delete a connector.",
    "method": "DELETE",
    "path": "/_connector/{connector_id}",
    "namespaceFile": "connector_delete"
  },
  {
    "name": "get",
    "namespace": "connector",
    "description": "Get a connector.",
    "method": "GET",
    "path": "/_connector/{connector_id}",
    "namespaceFile": "connector_get"
  },
  {
    "name": "list",
    "namespace": "connector",
    "description": "Get all connectors.",
    "method": "GET",
    "path": "/_connector",
    "namespaceFile": "connector_list"
  },
  {
    "name": "post",
    "namespace": "connector",
    "description": "Create a connector.",
    "method": "POST",
    "path": "/_connector",
    "namespaceFile": "connector_post"
  },
  {
    "name": "put",
    "namespace": "connector",
    "description": "Create or update a connector.",
    "method": "PUT",
    "path": "/_connector/{connector_id}",
    "namespaceFile": "connector_put"
  },
  {
    "name": "sync-job-cancel",
    "namespace": "connector",
    "description": "Cancel a connector sync job.",
    "method": "PUT",
    "path": "/_connector/_sync_job/{connector_sync_job_id}/_cancel",
    "namespaceFile": "connector_sync_job_cancel"
  },
  {
    "name": "sync-job-delete",
    "namespace": "connector",
    "description": "Delete a connector sync job.",
    "method": "DELETE",
    "path": "/_connector/_sync_job/{connector_sync_job_id}",
    "namespaceFile": "connector_sync_job_delete"
  },
  {
    "name": "sync-job-get",
    "namespace": "connector",
    "description": "Get a connector sync job.",
    "method": "GET",
    "path": "/_connector/_sync_job/{connector_sync_job_id}",
    "namespaceFile": "connector_sync_job_get"
  },
  {
    "name": "sync-job-list",
    "namespace": "connector",
    "description": "Get all connector sync jobs.",
    "method": "GET",
    "path": "/_connector/_sync_job",
    "namespaceFile": "connector_sync_job_list"
  },
  {
    "name": "sync-job-post",
    "namespace": "connector",
    "description": "Create a connector sync job.",
    "method": "POST",
    "path": "/_connector/_sync_job",
    "namespaceFile": "connector_sync_job_post"
  },
  {
    "name": "update-active-filtering",
    "namespace": "connector",
    "description": "Activate the connector draft filter.",
    "method": "PUT",
    "path": "/_connector/{connector_id}/_filtering/_activate",
    "namespaceFile": "connector_update_active_filtering"
  },
  {
    "name": "update-api-key-id",
    "namespace": "connector",
    "description": "Update the connector API key ID.",
    "method": "PUT",
    "path": "/_connector/{connector_id}/_api_key_id",
    "namespaceFile": "connector_update_api_key_id"
  },
  {
    "name": "update-configuration",
    "namespace": "connector",
    "description": "Update the connector configuration.",
    "method": "PUT",
    "path": "/_connector/{connector_id}/_configuration",
    "namespaceFile": "connector_update_configuration"
  },
  {
    "name": "update-error",
    "namespace": "connector",
    "description": "Update the connector error field.",
    "method": "PUT",
    "path": "/_connector/{connector_id}/_error",
    "namespaceFile": "connector_update_error"
  },
  {
    "name": "update-filtering",
    "namespace": "connector",
    "description": "Update the connector filtering.",
    "method": "PUT",
    "path": "/_connector/{connector_id}/_filtering",
    "namespaceFile": "connector_update_filtering"
  },
  {
    "name": "update-filtering-validation",
    "namespace": "connector",
    "description": "Update the connector draft filtering validation.",
    "method": "PUT",
    "path": "/_connector/{connector_id}/_filtering/_validation",
    "namespaceFile": "connector_update_filtering_validation"
  },
  {
    "name": "update-index-name",
    "namespace": "connector",
    "description": "Update the connector index name.",
    "method": "PUT",
    "path": "/_connector/{connector_id}/_index_name",
    "namespaceFile": "connector_update_index_name"
  },
  {
    "name": "update-name",
    "namespace": "connector",
    "description": "Update the connector name and description.",
    "method": "PUT",
    "path": "/_connector/{connector_id}/_name",
    "namespaceFile": "connector_update_name"
  },
  {
    "name": "update-native",
    "namespace": "connector",
    "description": "Update the connector is_native flag.",
    "method": "PUT",
    "path": "/_connector/{connector_id}/_native",
    "namespaceFile": "connector_update_native"
  },
  {
    "name": "update-pipeline",
    "namespace": "connector",
    "description": "Update the connector pipeline.",
    "method": "PUT",
    "path": "/_connector/{connector_id}/_pipeline",
    "namespaceFile": "connector_update_pipeline"
  },
  {
    "name": "update-scheduling",
    "namespace": "connector",
    "description": "Update the connector scheduling.",
    "method": "PUT",
    "path": "/_connector/{connector_id}/_scheduling",
    "namespaceFile": "connector_update_scheduling"
  },
  {
    "name": "update-service-type",
    "namespace": "connector",
    "description": "Update the connector service type.",
    "method": "PUT",
    "path": "/_connector/{connector_id}/_service_type",
    "namespaceFile": "connector_update_service_type"
  },
  {
    "name": "update-status",
    "namespace": "connector",
    "description": "Update the connector status.",
    "method": "PUT",
    "path": "/_connector/{connector_id}/_status",
    "namespaceFile": "connector_update_status"
  },
  {
    "name": "count",
    "namespace": null,
    "description": "Count search results.",
    "method": "POST",
    "path": "/{index}/_count",
    "namespaceFile": "count"
  },
  {
    "name": "create",
    "namespace": null,
    "description": "Create a new document in the index.",
    "method": "PUT",
    "path": "/{index}/_create/{id}",
    "namespaceFile": "create"
  },
  {
    "name": "delete",
    "namespace": null,
    "description": "Delete a document.",
    "method": "DELETE",
    "path": "/{index}/_doc/{id}",
    "namespaceFile": "delete"
  },
  {
    "name": "delete-by-query",
    "namespace": null,
    "description": "Delete documents.",
    "method": "POST",
    "path": "/{index}/_delete_by_query",
    "namespaceFile": "delete_by_query"
  },
  {
    "name": "delete-script",
    "namespace": null,
    "description": "Delete a script or search template.",
    "method": "DELETE",
    "path": "/_scripts/{id}",
    "namespaceFile": "delete_script"
  },
  {
    "name": "delete-policy",
    "namespace": "enrich",
    "description": "Delete an enrich policy.",
    "method": "DELETE",
    "path": "/_enrich/policy/{name}",
    "namespaceFile": "enrich_delete_policy"
  },
  {
    "name": "execute-policy",
    "namespace": "enrich",
    "description": "Run an enrich policy.",
    "method": "PUT",
    "path": "/_enrich/policy/{name}/_execute",
    "namespaceFile": "enrich_execute_policy"
  },
  {
    "name": "get-policy",
    "namespace": "enrich",
    "description": "Get an enrich policy.",
    "method": "GET",
    "path": "/_enrich/policy/{name}",
    "namespaceFile": "enrich_get_policy"
  },
  {
    "name": "put-policy",
    "namespace": "enrich",
    "description": "Create an enrich policy.",
    "method": "PUT",
    "path": "/_enrich/policy/{name}",
    "namespaceFile": "enrich_put_policy"
  },
  {
    "name": "delete",
    "namespace": "eql",
    "description": "Delete an async EQL search.",
    "method": "DELETE",
    "path": "/_eql/search/{id}",
    "namespaceFile": "eql_delete"
  },
  {
    "name": "get",
    "namespace": "eql",
    "description": "Get async EQL search results.",
    "method": "GET",
    "path": "/_eql/search/{id}",
    "namespaceFile": "eql_get"
  },
  {
    "name": "get-status",
    "namespace": "eql",
    "description": "Get the async EQL status.",
    "method": "GET",
    "path": "/_eql/search/status/{id}",
    "namespaceFile": "eql_get_status"
  },
  {
    "name": "search",
    "namespace": "eql",
    "description": "Get EQL search results.",
    "method": "GET",
    "path": "/{index}/_eql/search",
    "namespaceFile": "eql_search"
  },
  {
    "name": "delete-view",
    "namespace": "esql",
    "description": "Delete an ES|QL view.",
    "method": "DELETE",
    "path": "/_query/view/{name}",
    "namespaceFile": "esql_delete_view"
  },
  {
    "name": "get-query",
    "namespace": "esql",
    "description": "Get a specific running ES|QL query information.",
    "method": "GET",
    "path": "/_query/queries/{id}",
    "namespaceFile": "esql_get_query"
  },
  {
    "name": "get-view",
    "namespace": "esql",
    "description": "Get an ES|QL view.",
    "method": "GET",
    "path": "/_query/view/{name}",
    "namespaceFile": "esql_get_view"
  },
  {
    "name": "list-queries",
    "namespace": "esql",
    "description": "Get running ES|QL queries information.",
    "method": "GET",
    "path": "/_query/queries",
    "namespaceFile": "esql_list_queries"
  },
  {
    "name": "put-view",
    "namespace": "esql",
    "description": "Create or update an ES|QL view.",
    "method": "PUT",
    "path": "/_query/view/{name}",
    "namespaceFile": "esql_put_view"
  },
  {
    "name": "query",
    "namespace": "esql",
    "description": "Run an ES|QL query.",
    "method": "POST",
    "path": "/_query",
    "namespaceFile": "esql_query"
  },
  {
    "name": "exists",
    "namespace": null,
    "description": "Check a document.",
    "method": "HEAD",
    "path": "/{index}/_doc/{id}",
    "namespaceFile": "exists"
  },
  {
    "name": "exists-source",
    "namespace": null,
    "description": "Check for a document source.",
    "method": "HEAD",
    "path": "/{index}/_source/{id}",
    "namespaceFile": "exists_source"
  },
  {
    "name": "explain",
    "namespace": null,
    "description": "Explain a document match result.",
    "method": "GET",
    "path": "/{index}/_explain/{id}",
    "namespaceFile": "explain"
  },
  {
    "name": "field-caps",
    "namespace": null,
    "description": "Get the field capabilities.",
    "method": "GET",
    "path": "/{index}/_field_caps",
    "namespaceFile": "field_caps"
  },
  {
    "name": "get",
    "namespace": null,
    "description": "Get a document by its ID.",
    "method": "GET",
    "path": "/{index}/_doc/{id}",
    "namespaceFile": "get"
  },
  {
    "name": "get-script",
    "namespace": null,
    "description": "Get a script or search template.",
    "method": "GET",
    "path": "/_scripts/{id}",
    "namespaceFile": "get_script"
  },
  {
    "name": "get-source",
    "namespace": null,
    "description": "Get a document's source.",
    "method": "GET",
    "path": "/{index}/_source/{id}",
    "namespaceFile": "get_source"
  },
  {
    "name": "index",
    "namespace": null,
    "description": "Create or update a document in an index.",
    "method": "PUT",
    "path": "/{index}/_doc/{id}",
    "namespaceFile": "index"
  },
  {
    "name": "add-block",
    "namespace": "indices",
    "description": "Add an index block.",
    "method": "PUT",
    "path": "/{index}/_block/{block}",
    "namespaceFile": "indices_add_block"
  },
  {
    "name": "analyze",
    "namespace": "indices",
    "description": "Get tokens from text analysis.",
    "method": "GET",
    "path": "/{index}/_analyze",
    "namespaceFile": "indices_analyze"
  },
  {
    "name": "cancel-migrate-reindex",
    "namespace": "indices",
    "description": "Cancel a migration reindex operation.",
    "method": "POST",
    "path": "/_migration/reindex/{index}/_cancel",
    "namespaceFile": "indices_cancel_migrate_reindex"
  },
  {
    "name": "create",
    "namespace": "indices",
    "description": "Create an index.",
    "method": "PUT",
    "path": "/{index}",
    "namespaceFile": "indices_create"
  },
  {
    "name": "create-data-stream",
    "namespace": "indices",
    "description": "Create a data stream.",
    "method": "PUT",
    "path": "/_data_stream/{name}",
    "namespaceFile": "indices_create_data_stream"
  },
  {
    "name": "create-from",
    "namespace": "indices",
    "description": "Create an index from a source index.",
    "method": "PUT",
    "path": "/_create_from/{source}/{dest}",
    "namespaceFile": "indices_create_from"
  },
  {
    "name": "delete",
    "namespace": "indices",
    "description": "Delete indices.",
    "method": "DELETE",
    "path": "/{index}",
    "namespaceFile": "indices_delete"
  },
  {
    "name": "delete-alias",
    "namespace": "indices",
    "description": "Delete an alias.",
    "method": "DELETE",
    "path": "/{index}/_aliases/{name}",
    "namespaceFile": "indices_delete_alias"
  },
  {
    "name": "delete-data-stream",
    "namespace": "indices",
    "description": "Delete data streams.",
    "method": "DELETE",
    "path": "/_data_stream/{name}",
    "namespaceFile": "indices_delete_data_stream"
  },
  {
    "name": "delete-index-template",
    "namespace": "indices",
    "description": "Delete an index template.",
    "method": "DELETE",
    "path": "/_index_template/{name}",
    "namespaceFile": "indices_delete_index_template"
  },
  {
    "name": "exists",
    "namespace": "indices",
    "description": "Check indices.",
    "method": "HEAD",
    "path": "/{index}",
    "namespaceFile": "indices_exists"
  },
  {
    "name": "exists-alias",
    "namespace": "indices",
    "description": "Check aliases.",
    "method": "HEAD",
    "path": "/{index}/_alias/{name}",
    "namespaceFile": "indices_exists_alias"
  },
  {
    "name": "exists-index-template",
    "namespace": "indices",
    "description": "Check index templates.",
    "method": "HEAD",
    "path": "/_index_template/{name}",
    "namespaceFile": "indices_exists_index_template"
  },
  {
    "name": "explain-data-lifecycle",
    "namespace": "indices",
    "description": "Get the status for a data stream lifecycle.",
    "method": "GET",
    "path": "/{index}/_lifecycle/explain",
    "namespaceFile": "indices_explain_data_lifecycle"
  },
  {
    "name": "get",
    "namespace": "indices",
    "description": "Get index information.",
    "method": "GET",
    "path": "/{index}",
    "namespaceFile": "indices_get"
  },
  {
    "name": "get-alias",
    "namespace": "indices",
    "description": "Get aliases.",
    "method": "GET",
    "path": "/{index}/_alias/{name}",
    "namespaceFile": "indices_get_alias"
  },
  {
    "name": "get-data-lifecycle",
    "namespace": "indices",
    "description": "Get data stream lifecycles.",
    "method": "GET",
    "path": "/_data_stream/{name}/_lifecycle",
    "namespaceFile": "indices_get_data_lifecycle"
  },
  {
    "name": "get-data-stream",
    "namespace": "indices",
    "description": "Get data streams.",
    "method": "GET",
    "path": "/_data_stream/{name}",
    "namespaceFile": "indices_get_data_stream"
  },
  {
    "name": "get-data-stream-mappings",
    "namespace": "indices",
    "description": "Get data stream mappings.",
    "method": "GET",
    "path": "/_data_stream/{name}/_mappings",
    "namespaceFile": "indices_get_data_stream_mappings"
  },
  {
    "name": "get-data-stream-options",
    "namespace": "indices",
    "description": "Get data stream options.",
    "method": "GET",
    "path": "/_data_stream/{name}/_options",
    "namespaceFile": "indices_get_data_stream_options"
  },
  {
    "name": "get-data-stream-settings",
    "namespace": "indices",
    "description": "Get data stream settings.",
    "method": "GET",
    "path": "/_data_stream/{name}/_settings",
    "namespaceFile": "indices_get_data_stream_settings"
  },
  {
    "name": "get-index-template",
    "namespace": "indices",
    "description": "Get index templates.",
    "method": "GET",
    "path": "/_index_template/{name}",
    "namespaceFile": "indices_get_index_template"
  },
  {
    "name": "get-mapping",
    "namespace": "indices",
    "description": "Get mapping definitions.",
    "method": "GET",
    "path": "/{index}/_mapping",
    "namespaceFile": "indices_get_mapping"
  },
  {
    "name": "get-migrate-reindex-status",
    "namespace": "indices",
    "description": "Get the migration reindexing status.",
    "method": "GET",
    "path": "/_migration/reindex/{index}/_status",
    "namespaceFile": "indices_get_migrate_reindex_status"
  },
  {
    "name": "get-settings",
    "namespace": "indices",
    "description": "Get index settings.",
    "method": "GET",
    "path": "/{index}/_settings/{name}",
    "namespaceFile": "indices_get_settings"
  },
  {
    "name": "migrate-to-data-stream",
    "namespace": "indices",
    "description": "Convert an index alias to a data stream.",
    "method": "POST",
    "path": "/_data_stream/_migrate/{name}",
    "namespaceFile": "indices_migrate_to_data_stream"
  },
  {
    "name": "modify-data-stream",
    "namespace": "indices",
    "description": "Update data streams.",
    "method": "POST",
    "path": "/_data_stream/_modify",
    "namespaceFile": "indices_modify_data_stream"
  },
  {
    "name": "put-alias",
    "namespace": "indices",
    "description": "Create or update an alias.",
    "method": "PUT",
    "path": "/{index}/_aliases/{name}",
    "namespaceFile": "indices_put_alias"
  },
  {
    "name": "put-data-lifecycle",
    "namespace": "indices",
    "description": "Update data stream lifecycles.",
    "method": "PUT",
    "path": "/_data_stream/{name}/_lifecycle",
    "namespaceFile": "indices_put_data_lifecycle"
  },
  {
    "name": "put-data-stream-mappings",
    "namespace": "indices",
    "description": "Update data stream mappings.",
    "method": "PUT",
    "path": "/_data_stream/{name}/_mappings",
    "namespaceFile": "indices_put_data_stream_mappings"
  },
  {
    "name": "put-data-stream-options",
    "namespace": "indices",
    "description": "Update data stream options.",
    "method": "PUT",
    "path": "/_data_stream/{name}/_options",
    "namespaceFile": "indices_put_data_stream_options"
  },
  {
    "name": "put-data-stream-settings",
    "namespace": "indices",
    "description": "Update data stream settings.",
    "method": "PUT",
    "path": "/_data_stream/{name}/_settings",
    "namespaceFile": "indices_put_data_stream_settings"
  },
  {
    "name": "put-index-template",
    "namespace": "indices",
    "description": "Create or update an index template.",
    "method": "PUT",
    "path": "/_index_template/{name}",
    "namespaceFile": "indices_put_index_template"
  },
  {
    "name": "put-mapping",
    "namespace": "indices",
    "description": "Update field mappings.",
    "method": "PUT",
    "path": "/{index}/_mapping",
    "namespaceFile": "indices_put_mapping"
  },
  {
    "name": "put-settings",
    "namespace": "indices",
    "description": "Update index settings.",
    "method": "PUT",
    "path": "/{index}/_settings",
    "namespaceFile": "indices_put_settings"
  },
  {
    "name": "refresh",
    "namespace": "indices",
    "description": "Refresh an index.",
    "method": "POST",
    "path": "/{index}/_refresh",
    "namespaceFile": "indices_refresh"
  },
  {
    "name": "remove-block",
    "namespace": "indices",
    "description": "Remove an index block.",
    "method": "DELETE",
    "path": "/{index}/_block/{block}",
    "namespaceFile": "indices_remove_block"
  },
  {
    "name": "resolve-index",
    "namespace": "indices",
    "description": "Resolve indices.",
    "method": "GET",
    "path": "/_resolve/index/{name}",
    "namespaceFile": "indices_resolve_index"
  },
  {
    "name": "rollover",
    "namespace": "indices",
    "description": "Roll over to a new index.",
    "method": "POST",
    "path": "/{alias}/_rollover/{new_index}",
    "namespaceFile": "indices_rollover"
  },
  {
    "name": "simulate-index-template",
    "namespace": "indices",
    "description": "Simulate an index.",
    "method": "POST",
    "path": "/_index_template/_simulate_index/{name}",
    "namespaceFile": "indices_simulate_index_template"
  },
  {
    "name": "simulate-template",
    "namespace": "indices",
    "description": "Simulate an index template.",
    "method": "POST",
    "path": "/_index_template/_simulate/{name}",
    "namespaceFile": "indices_simulate_template"
  },
  {
    "name": "update-aliases",
    "namespace": "indices",
    "description": "Create or update an alias.",
    "method": "POST",
    "path": "/_aliases",
    "namespaceFile": "indices_update_aliases"
  },
  {
    "name": "validate-query",
    "namespace": "indices",
    "description": "Validate a query.",
    "method": "GET",
    "path": "/{index}/_validate/query",
    "namespaceFile": "indices_validate_query"
  },
  {
    "name": "chat-completion-unified",
    "namespace": "inference",
    "description": "Perform chat completion inference on the service.",
    "method": "POST",
    "path": "/_inference/chat_completion/{inference_id}/_stream",
    "namespaceFile": "inference_chat_completion_unified"
  },
  {
    "name": "completion",
    "namespace": "inference",
    "description": "Perform completion inference on the service.",
    "method": "POST",
    "path": "/_inference/completion/{inference_id}",
    "namespaceFile": "inference_completion"
  },
  {
    "name": "delete",
    "namespace": "inference",
    "description": "Delete an inference endpoint.",
    "method": "DELETE",
    "path": "/_inference/{task_type}/{inference_id}",
    "namespaceFile": "inference_delete"
  },
  {
    "name": "embedding",
    "namespace": "inference",
    "description": "Perform dense embedding inference on the service.",
    "method": "POST",
    "path": "/_inference/embedding/{inference_id}",
    "namespaceFile": "inference_embedding"
  },
  {
    "name": "get",
    "namespace": "inference",
    "description": "Get an inference endpoint.",
    "method": "GET",
    "path": "/_inference/{task_type}/{inference_id}",
    "namespaceFile": "inference_get"
  },
  {
    "name": "inference",
    "namespace": "inference",
    "description": "Perform inference on the service.",
    "method": "POST",
    "path": "/_inference/{task_type}/{inference_id}",
    "namespaceFile": "inference_inference"
  },
  {
    "name": "put",
    "namespace": "inference",
    "description": "Create an inference endpoint.",
    "method": "PUT",
    "path": "/_inference/{task_type}/{inference_id}",
    "namespaceFile": "inference_put"
  },
  {
    "name": "put-ai21",
    "namespace": "inference",
    "description": "Create a AI21 inference endpoint.",
    "method": "PUT",
    "path": "/_inference/{task_type}/{ai21_inference_id}",
    "namespaceFile": "inference_put_ai21"
  },
  {
    "name": "put-alibabacloud",
    "namespace": "inference",
    "description": "Create an AlibabaCloud AI Search inference endpoint.",
    "method": "PUT",
    "path": "/_inference/{task_type}/{alibabacloud_inference_id}",
    "namespaceFile": "inference_put_alibabacloud"
  },
  {
    "name": "put-amazonbedrock",
    "namespace": "inference",
    "description": "Create an Amazon Bedrock inference endpoint.",
    "method": "PUT",
    "path": "/_inference/{task_type}/{amazonbedrock_inference_id}",
    "namespaceFile": "inference_put_amazonbedrock"
  },
  {
    "name": "put-amazonsagemaker",
    "namespace": "inference",
    "description": "Create an Amazon SageMaker inference endpoint.",
    "method": "PUT",
    "path": "/_inference/{task_type}/{amazonsagemaker_inference_id}",
    "namespaceFile": "inference_put_amazonsagemaker"
  },
  {
    "name": "put-anthropic",
    "namespace": "inference",
    "description": "Create an Anthropic inference endpoint.",
    "method": "PUT",
    "path": "/_inference/{task_type}/{anthropic_inference_id}",
    "namespaceFile": "inference_put_anthropic"
  },
  {
    "name": "put-azureaistudio",
    "namespace": "inference",
    "description": "Create an Azure AI studio inference endpoint.",
    "method": "PUT",
    "path": "/_inference/{task_type}/{azureaistudio_inference_id}",
    "namespaceFile": "inference_put_azureaistudio"
  },
  {
    "name": "put-azureopenai",
    "namespace": "inference",
    "description": "Create an Azure OpenAI inference endpoint.",
    "method": "PUT",
    "path": "/_inference/{task_type}/{azureopenai_inference_id}",
    "namespaceFile": "inference_put_azureopenai"
  },
  {
    "name": "put-cohere",
    "namespace": "inference",
    "description": "Create a Cohere inference endpoint.",
    "method": "PUT",
    "path": "/_inference/{task_type}/{cohere_inference_id}",
    "namespaceFile": "inference_put_cohere"
  },
  {
    "name": "put-contextualai",
    "namespace": "inference",
    "description": "Create an Contextual AI inference endpoint.",
    "method": "PUT",
    "path": "/_inference/{task_type}/{contextualai_inference_id}",
    "namespaceFile": "inference_put_contextualai"
  },
  {
    "name": "put-custom",
    "namespace": "inference",
    "description": "Create a custom inference endpoint.",
    "method": "PUT",
    "path": "/_inference/{task_type}/{custom_inference_id}",
    "namespaceFile": "inference_put_custom"
  },
  {
    "name": "put-deepseek",
    "namespace": "inference",
    "description": "Create a DeepSeek inference endpoint.",
    "method": "PUT",
    "path": "/_inference/{task_type}/{deepseek_inference_id}",
    "namespaceFile": "inference_put_deepseek"
  },
  {
    "name": "put-elasticsearch",
    "namespace": "inference",
    "description": "Create an Elasticsearch inference endpoint.",
    "method": "PUT",
    "path": "/_inference/{task_type}/{elasticsearch_inference_id}",
    "namespaceFile": "inference_put_elasticsearch"
  },
  {
    "name": "put-elser",
    "namespace": "inference",
    "description": "Create an ELSER inference endpoint.",
    "method": "PUT",
    "path": "/_inference/{task_type}/{elser_inference_id}",
    "namespaceFile": "inference_put_elser"
  },
  {
    "name": "put-fireworksai",
    "namespace": "inference",
    "description": "Create a Fireworks AI inference endpoint.",
    "method": "PUT",
    "path": "/_inference/{task_type}/{fireworksai_inference_id}",
    "namespaceFile": "inference_put_fireworksai"
  },
  {
    "name": "put-googleaistudio",
    "namespace": "inference",
    "description": "Create an Google AI Studio inference endpoint.",
    "method": "PUT",
    "path": "/_inference/{task_type}/{googleaistudio_inference_id}",
    "namespaceFile": "inference_put_googleaistudio"
  },
  {
    "name": "put-googlevertexai",
    "namespace": "inference",
    "description": "Create a Google Vertex AI inference endpoint.",
    "method": "PUT",
    "path": "/_inference/{task_type}/{googlevertexai_inference_id}",
    "namespaceFile": "inference_put_googlevertexai"
  },
  {
    "name": "put-groq",
    "namespace": "inference",
    "description": "Create a Groq inference endpoint.",
    "method": "PUT",
    "path": "/_inference/{task_type}/{groq_inference_id}",
    "namespaceFile": "inference_put_groq"
  },
  {
    "name": "put-hugging-face",
    "namespace": "inference",
    "description": "Create a Hugging Face inference endpoint.",
    "method": "PUT",
    "path": "/_inference/{task_type}/{huggingface_inference_id}",
    "namespaceFile": "inference_put_hugging_face"
  },
  {
    "name": "put-jinaai",
    "namespace": "inference",
    "description": "Create an JinaAI inference endpoint.",
    "method": "PUT",
    "path": "/_inference/{task_type}/{jinaai_inference_id}",
    "namespaceFile": "inference_put_jinaai"
  },
  {
    "name": "put-llama",
    "namespace": "inference",
    "description": "Create a Llama inference endpoint.",
    "method": "PUT",
    "path": "/_inference/{task_type}/{llama_inference_id}",
    "namespaceFile": "inference_put_llama"
  },
  {
    "name": "put-mistral",
    "namespace": "inference",
    "description": "Create a Mistral inference endpoint.",
    "method": "PUT",
    "path": "/_inference/{task_type}/{mistral_inference_id}",
    "namespaceFile": "inference_put_mistral"
  },
  {
    "name": "put-nvidia",
    "namespace": "inference",
    "description": "Create an Nvidia inference endpoint.",
    "method": "PUT",
    "path": "/_inference/{task_type}/{nvidia_inference_id}",
    "namespaceFile": "inference_put_nvidia"
  },
  {
    "name": "put-openai",
    "namespace": "inference",
    "description": "Create an OpenAI inference endpoint.",
    "method": "PUT",
    "path": "/_inference/{task_type}/{openai_inference_id}",
    "namespaceFile": "inference_put_openai"
  },
  {
    "name": "put-openshift-ai",
    "namespace": "inference",
    "description": "Create an OpenShift AI inference endpoint.",
    "method": "PUT",
    "path": "/_inference/{task_type}/{openshiftai_inference_id}",
    "namespaceFile": "inference_put_openshift_ai"
  },
  {
    "name": "put-voyageai",
    "namespace": "inference",
    "description": "Create a VoyageAI inference endpoint.",
    "method": "PUT",
    "path": "/_inference/{task_type}/{voyageai_inference_id}",
    "namespaceFile": "inference_put_voyageai"
  },
  {
    "name": "put-watsonx",
    "namespace": "inference",
    "description": "Create a Watsonx inference endpoint.",
    "method": "PUT",
    "path": "/_inference/{task_type}/{watsonx_inference_id}",
    "namespaceFile": "inference_put_watsonx"
  },
  {
    "name": "rerank",
    "namespace": "inference",
    "description": "Perform reranking inference on the service.",
    "method": "POST",
    "path": "/_inference/rerank/{inference_id}",
    "namespaceFile": "inference_rerank"
  },
  {
    "name": "sparse-embedding",
    "namespace": "inference",
    "description": "Perform sparse embedding inference on the service.",
    "method": "POST",
    "path": "/_inference/sparse_embedding/{inference_id}",
    "namespaceFile": "inference_sparse_embedding"
  },
  {
    "name": "stream-completion",
    "namespace": "inference",
    "description": "Perform streaming completion inference on the service.",
    "method": "POST",
    "path": "/_inference/completion/{inference_id}/_stream",
    "namespaceFile": "inference_stream_completion"
  },
  {
    "name": "text-embedding",
    "namespace": "inference",
    "description": "Perform text embedding inference on the service.",
    "method": "POST",
    "path": "/_inference/text_embedding/{inference_id}",
    "namespaceFile": "inference_text_embedding"
  },
  {
    "name": "update",
    "namespace": "inference",
    "description": "Update an inference endpoint.",
    "method": "PUT",
    "path": "/_inference/{task_type}/{inference_id}/_update",
    "namespaceFile": "inference_update"
  },
  {
    "name": "info",
    "namespace": null,
    "description": "Get cluster info.",
    "method": "GET",
    "path": "/",
    "namespaceFile": "info"
  },
  {
    "name": "delete-pipeline",
    "namespace": "ingest",
    "description": "Delete pipelines.",
    "method": "DELETE",
    "path": "/_ingest/pipeline/{id}",
    "namespaceFile": "ingest_delete_pipeline"
  },
  {
    "name": "get-pipeline",
    "namespace": "ingest",
    "description": "Get pipelines.",
    "method": "GET",
    "path": "/_ingest/pipeline/{id}",
    "namespaceFile": "ingest_get_pipeline"
  },
  {
    "name": "processor-grok",
    "namespace": "ingest",
    "description": "Run a grok processor.",
    "method": "GET",
    "path": "/_ingest/processor/grok",
    "namespaceFile": "ingest_processor_grok"
  },
  {
    "name": "put-pipeline",
    "namespace": "ingest",
    "description": "Create or update a pipeline.",
    "method": "PUT",
    "path": "/_ingest/pipeline/{id}",
    "namespaceFile": "ingest_put_pipeline"
  },
  {
    "name": "simulate",
    "namespace": "ingest",
    "description": "Simulate a pipeline.",
    "method": "GET",
    "path": "/_ingest/pipeline/{id}/_simulate",
    "namespaceFile": "ingest_simulate"
  },
  {
    "name": "get",
    "namespace": "license",
    "description": "Get license information.",
    "method": "GET",
    "path": "/_license",
    "namespaceFile": "license_get"
  },
  {
    "name": "delete-pipeline",
    "namespace": "logstash",
    "description": "Delete a Logstash pipeline.",
    "method": "DELETE",
    "path": "/_logstash/pipeline/{id}",
    "namespaceFile": "logstash_delete_pipeline"
  },
  {
    "name": "get-pipeline",
    "namespace": "logstash",
    "description": "Get Logstash pipelines.",
    "method": "GET",
    "path": "/_logstash/pipeline/{id}",
    "namespaceFile": "logstash_get_pipeline"
  },
  {
    "name": "put-pipeline",
    "namespace": "logstash",
    "description": "Create or update a Logstash pipeline.",
    "method": "PUT",
    "path": "/_logstash/pipeline/{id}",
    "namespaceFile": "logstash_put_pipeline"
  },
  {
    "name": "mget",
    "namespace": null,
    "description": "Get multiple documents.",
    "method": "GET",
    "path": "/{index}/_mget",
    "namespaceFile": "mget"
  },
  {
    "name": "close-job",
    "namespace": "ml",
    "description": "Close anomaly detection jobs.",
    "method": "POST",
    "path": "/_ml/anomaly_detectors/{job_id}/_close",
    "namespaceFile": "ml_close_job"
  },
  {
    "name": "delete-calendar",
    "namespace": "ml",
    "description": "Delete a calendar.",
    "method": "DELETE",
    "path": "/_ml/calendars/{calendar_id}",
    "namespaceFile": "ml_delete_calendar"
  },
  {
    "name": "delete-calendar-event",
    "namespace": "ml",
    "description": "Delete events from a calendar.",
    "method": "DELETE",
    "path": "/_ml/calendars/{calendar_id}/events/{event_id}",
    "namespaceFile": "ml_delete_calendar_event"
  },
  {
    "name": "delete-calendar-job",
    "namespace": "ml",
    "description": "Delete anomaly jobs from a calendar.",
    "method": "DELETE",
    "path": "/_ml/calendars/{calendar_id}/jobs/{job_id}",
    "namespaceFile": "ml_delete_calendar_job"
  },
  {
    "name": "delete-data-frame-analytics",
    "namespace": "ml",
    "description": "Delete a data frame analytics job.",
    "method": "DELETE",
    "path": "/_ml/data_frame/analytics/{id}",
    "namespaceFile": "ml_delete_data_frame_analytics"
  },
  {
    "name": "delete-datafeed",
    "namespace": "ml",
    "description": "Delete a datafeed.",
    "method": "DELETE",
    "path": "/_ml/datafeeds/{datafeed_id}",
    "namespaceFile": "ml_delete_datafeed"
  },
  {
    "name": "delete-filter",
    "namespace": "ml",
    "description": "Delete a filter.",
    "method": "DELETE",
    "path": "/_ml/filters/{filter_id}",
    "namespaceFile": "ml_delete_filter"
  },
  {
    "name": "delete-job",
    "namespace": "ml",
    "description": "Delete an anomaly detection job.",
    "method": "DELETE",
    "path": "/_ml/anomaly_detectors/{job_id}",
    "namespaceFile": "ml_delete_job"
  },
  {
    "name": "delete-trained-model",
    "namespace": "ml",
    "description": "Delete an unreferenced trained model.",
    "method": "DELETE",
    "path": "/_ml/trained_models/{model_id}",
    "namespaceFile": "ml_delete_trained_model"
  },
  {
    "name": "delete-trained-model-alias",
    "namespace": "ml",
    "description": "Delete a trained model alias.",
    "method": "DELETE",
    "path": "/_ml/trained_models/{model_id}/model_aliases/{model_alias}",
    "namespaceFile": "ml_delete_trained_model_alias"
  },
  {
    "name": "estimate-model-memory",
    "namespace": "ml",
    "description": "Estimate job model memory usage.",
    "method": "POST",
    "path": "/_ml/anomaly_detectors/_estimate_model_memory",
    "namespaceFile": "ml_estimate_model_memory"
  },
  {
    "name": "evaluate-data-frame",
    "namespace": "ml",
    "description": "Evaluate data frame analytics.",
    "method": "POST",
    "path": "/_ml/data_frame/_evaluate",
    "namespaceFile": "ml_evaluate_data_frame"
  },
  {
    "name": "flush-job",
    "namespace": "ml",
    "description": "Force buffered data to be processed.",
    "method": "POST",
    "path": "/_ml/anomaly_detectors/{job_id}/_flush",
    "namespaceFile": "ml_flush_job"
  },
  {
    "name": "get-calendar-events",
    "namespace": "ml",
    "description": "Get info about events in calendars.",
    "method": "GET",
    "path": "/_ml/calendars/{calendar_id}/events",
    "namespaceFile": "ml_get_calendar_events"
  },
  {
    "name": "get-calendars",
    "namespace": "ml",
    "description": "Get calendar configuration info.",
    "method": "GET",
    "path": "/_ml/calendars/{calendar_id}",
    "namespaceFile": "ml_get_calendars"
  },
  {
    "name": "get-data-frame-analytics",
    "namespace": "ml",
    "description": "Get data frame analytics job configuration info.",
    "method": "GET",
    "path": "/_ml/data_frame/analytics/{id}",
    "namespaceFile": "ml_get_data_frame_analytics"
  },
  {
    "name": "get-data-frame-analytics-stats",
    "namespace": "ml",
    "description": "Get data frame analytics job stats.",
    "method": "GET",
    "path": "/_ml/data_frame/analytics/{id}/_stats",
    "namespaceFile": "ml_get_data_frame_analytics_stats"
  },
  {
    "name": "get-datafeed-stats",
    "namespace": "ml",
    "description": "Get datafeed stats.",
    "method": "GET",
    "path": "/_ml/datafeeds/{datafeed_id}/_stats",
    "namespaceFile": "ml_get_datafeed_stats"
  },
  {
    "name": "get-datafeeds",
    "namespace": "ml",
    "description": "Get datafeeds configuration info.",
    "method": "GET",
    "path": "/_ml/datafeeds/{datafeed_id}",
    "namespaceFile": "ml_get_datafeeds"
  },
  {
    "name": "get-filters",
    "namespace": "ml",
    "description": "Get filters.",
    "method": "GET",
    "path": "/_ml/filters/{filter_id}",
    "namespaceFile": "ml_get_filters"
  },
  {
    "name": "get-job-stats",
    "namespace": "ml",
    "description": "Get anomaly detection job stats.",
    "method": "GET",
    "path": "/_ml/anomaly_detectors/{job_id}/_stats",
    "namespaceFile": "ml_get_job_stats"
  },
  {
    "name": "get-jobs",
    "namespace": "ml",
    "description": "Get anomaly detection jobs configuration info.",
    "method": "GET",
    "path": "/_ml/anomaly_detectors/{job_id}",
    "namespaceFile": "ml_get_jobs"
  },
  {
    "name": "get-overall-buckets",
    "namespace": "ml",
    "description": "Get overall bucket results.",
    "method": "GET",
    "path": "/_ml/anomaly_detectors/{job_id}/results/overall_buckets",
    "namespaceFile": "ml_get_overall_buckets"
  },
  {
    "name": "get-trained-models",
    "namespace": "ml",
    "description": "Get trained model configuration info.",
    "method": "GET",
    "path": "/_ml/trained_models/{model_id}",
    "namespaceFile": "ml_get_trained_models"
  },
  {
    "name": "get-trained-models-stats",
    "namespace": "ml",
    "description": "Get trained models usage info.",
    "method": "GET",
    "path": "/_ml/trained_models/{model_id}/_stats",
    "namespaceFile": "ml_get_trained_models_stats"
  },
  {
    "name": "infer-trained-model",
    "namespace": "ml",
    "description": "Evaluate a trained model.",
    "method": "POST",
    "path": "/_ml/trained_models/{model_id}/_infer",
    "namespaceFile": "ml_infer_trained_model"
  },
  {
    "name": "open-job",
    "namespace": "ml",
    "description": "Open anomaly detection jobs.",
    "method": "POST",
    "path": "/_ml/anomaly_detectors/{job_id}/_open",
    "namespaceFile": "ml_open_job"
  },
  {
    "name": "post-calendar-events",
    "namespace": "ml",
    "description": "Add scheduled events to the calendar.",
    "method": "POST",
    "path": "/_ml/calendars/{calendar_id}/events",
    "namespaceFile": "ml_post_calendar_events"
  },
  {
    "name": "preview-data-frame-analytics",
    "namespace": "ml",
    "description": "Preview features used by data frame analytics.",
    "method": "GET",
    "path": "/_ml/data_frame/analytics/{id}/_preview",
    "namespaceFile": "ml_preview_data_frame_analytics"
  },
  {
    "name": "preview-datafeed",
    "namespace": "ml",
    "description": "Preview a datafeed.",
    "method": "GET",
    "path": "/_ml/datafeeds/{datafeed_id}/_preview",
    "namespaceFile": "ml_preview_datafeed"
  },
  {
    "name": "put-calendar",
    "namespace": "ml",
    "description": "Create a calendar.",
    "method": "PUT",
    "path": "/_ml/calendars/{calendar_id}",
    "namespaceFile": "ml_put_calendar"
  },
  {
    "name": "put-calendar-job",
    "namespace": "ml",
    "description": "Add anomaly detection job to calendar.",
    "method": "PUT",
    "path": "/_ml/calendars/{calendar_id}/jobs/{job_id}",
    "namespaceFile": "ml_put_calendar_job"
  },
  {
    "name": "put-data-frame-analytics",
    "namespace": "ml",
    "description": "Create a data frame analytics job.",
    "method": "PUT",
    "path": "/_ml/data_frame/analytics/{id}",
    "namespaceFile": "ml_put_data_frame_analytics"
  },
  {
    "name": "put-datafeed",
    "namespace": "ml",
    "description": "Create a datafeed.",
    "method": "PUT",
    "path": "/_ml/datafeeds/{datafeed_id}",
    "namespaceFile": "ml_put_datafeed"
  },
  {
    "name": "put-filter",
    "namespace": "ml",
    "description": "Create a filter.",
    "method": "PUT",
    "path": "/_ml/filters/{filter_id}",
    "namespaceFile": "ml_put_filter"
  },
  {
    "name": "put-job",
    "namespace": "ml",
    "description": "Create an anomaly detection job.",
    "method": "PUT",
    "path": "/_ml/anomaly_detectors/{job_id}",
    "namespaceFile": "ml_put_job"
  },
  {
    "name": "put-trained-model",
    "namespace": "ml",
    "description": "Create a trained model.",
    "method": "PUT",
    "path": "/_ml/trained_models/{model_id}",
    "namespaceFile": "ml_put_trained_model"
  },
  {
    "name": "put-trained-model-alias",
    "namespace": "ml",
    "description": "Create or update a trained model alias.",
    "method": "PUT",
    "path": "/_ml/trained_models/{model_id}/model_aliases/{model_alias}",
    "namespaceFile": "ml_put_trained_model_alias"
  },
  {
    "name": "put-trained-model-definition-part",
    "namespace": "ml",
    "description": "Create part of a trained model definition.",
    "method": "PUT",
    "path": "/_ml/trained_models/{model_id}/definition/{part}",
    "namespaceFile": "ml_put_trained_model_definition_part"
  },
  {
    "name": "put-trained-model-vocabulary",
    "namespace": "ml",
    "description": "Create a trained model vocabulary.",
    "method": "PUT",
    "path": "/_ml/trained_models/{model_id}/vocabulary",
    "namespaceFile": "ml_put_trained_model_vocabulary"
  },
  {
    "name": "reset-job",
    "namespace": "ml",
    "description": "Reset an anomaly detection job.",
    "method": "POST",
    "path": "/_ml/anomaly_detectors/{job_id}/_reset",
    "namespaceFile": "ml_reset_job"
  },
  {
    "name": "start-data-frame-analytics",
    "namespace": "ml",
    "description": "Start a data frame analytics job.",
    "method": "POST",
    "path": "/_ml/data_frame/analytics/{id}/_start",
    "namespaceFile": "ml_start_data_frame_analytics"
  },
  {
    "name": "start-datafeed",
    "namespace": "ml",
    "description": "Start datafeeds.",
    "method": "POST",
    "path": "/_ml/datafeeds/{datafeed_id}/_start",
    "namespaceFile": "ml_start_datafeed"
  },
  {
    "name": "start-trained-model-deployment",
    "namespace": "ml",
    "description": "Start a trained model deployment.",
    "method": "POST",
    "path": "/_ml/trained_models/{model_id}/deployment/_start",
    "namespaceFile": "ml_start_trained_model_deployment"
  },
  {
    "name": "stop-data-frame-analytics",
    "namespace": "ml",
    "description": "Stop data frame analytics jobs.",
    "method": "POST",
    "path": "/_ml/data_frame/analytics/{id}/_stop",
    "namespaceFile": "ml_stop_data_frame_analytics"
  },
  {
    "name": "stop-datafeed",
    "namespace": "ml",
    "description": "Stop datafeeds.",
    "method": "POST",
    "path": "/_ml/datafeeds/{datafeed_id}/_stop",
    "namespaceFile": "ml_stop_datafeed"
  },
  {
    "name": "stop-trained-model-deployment",
    "namespace": "ml",
    "description": "Stop a trained model deployment.",
    "method": "POST",
    "path": "/_ml/trained_models/{model_id}/deployment/_stop",
    "namespaceFile": "ml_stop_trained_model_deployment"
  },
  {
    "name": "update-data-frame-analytics",
    "namespace": "ml",
    "description": "Update a data frame analytics job.",
    "method": "POST",
    "path": "/_ml/data_frame/analytics/{id}/_update",
    "namespaceFile": "ml_update_data_frame_analytics"
  },
  {
    "name": "update-datafeed",
    "namespace": "ml",
    "description": "Update a datafeed.",
    "method": "POST",
    "path": "/_ml/datafeeds/{datafeed_id}/_update",
    "namespaceFile": "ml_update_datafeed"
  },
  {
    "name": "update-filter",
    "namespace": "ml",
    "description": "Update a filter.",
    "method": "POST",
    "path": "/_ml/filters/{filter_id}/_update",
    "namespaceFile": "ml_update_filter"
  },
  {
    "name": "update-job",
    "namespace": "ml",
    "description": "Update an anomaly detection job.",
    "method": "POST",
    "path": "/_ml/anomaly_detectors/{job_id}/_update",
    "namespaceFile": "ml_update_job"
  },
  {
    "name": "update-trained-model-deployment",
    "namespace": "ml",
    "description": "Update a trained model deployment.",
    "method": "POST",
    "path": "/_ml/trained_models/{model_id}/deployment/_update",
    "namespaceFile": "ml_update_trained_model_deployment"
  },
  {
    "name": "msearch",
    "namespace": null,
    "description": "Run multiple searches.",
    "method": "GET",
    "path": "/{index}/_msearch",
    "namespaceFile": "msearch",
    "bodyFormat": "ndjson"
  },
  {
    "name": "msearch-template",
    "namespace": null,
    "description": "Run multiple templated searches.",
    "method": "GET",
    "path": "/{index}/_msearch/template",
    "namespaceFile": "msearch_template",
    "bodyFormat": "ndjson"
  },
  {
    "name": "mtermvectors",
    "namespace": null,
    "description": "Get multiple term vectors.",
    "method": "GET",
    "path": "/{index}/_mtermvectors",
    "namespaceFile": "mtermvectors"
  },
  {
    "name": "open-point-in-time",
    "namespace": null,
    "description": "Open a point in time.",
    "method": "POST",
    "path": "/{index}/_pit",
    "namespaceFile": "open_point_in_time"
  },
  {
    "name": "ping",
    "namespace": null,
    "description": "Ping the cluster.",
    "method": "HEAD",
    "path": "/",
    "namespaceFile": "ping"
  },
  {
    "name": "create-many-routing",
    "namespace": "project",
    "description": "Create or update project routing expressions.",
    "method": "PUT",
    "path": "/_project_routing",
    "namespaceFile": "project_create_many_routing"
  },
  {
    "name": "create-routing",
    "namespace": "project",
    "description": "Create or update a project routing expression.",
    "method": "PUT",
    "path": "/_project_routing/{name}",
    "namespaceFile": "project_create_routing"
  },
  {
    "name": "delete-routing",
    "namespace": "project",
    "description": "Delete a project routing expression.",
    "method": "DELETE",
    "path": "/_project_routing/{name}",
    "namespaceFile": "project_delete_routing"
  },
  {
    "name": "get-many-routing",
    "namespace": "project",
    "description": "Get project routing expressions.",
    "method": "GET",
    "path": "/_project_routing",
    "namespaceFile": "project_get_many_routing"
  },
  {
    "name": "get-routing",
    "namespace": "project",
    "description": "Get a project routing expression.",
    "method": "GET",
    "path": "/_project_routing/{name}",
    "namespaceFile": "project_get_routing"
  },
  {
    "name": "tags",
    "namespace": "project",
    "description": "Get tags.",
    "method": "GET",
    "path": "/_project/tags",
    "namespaceFile": "project_tags"
  },
  {
    "name": "put-script",
    "namespace": null,
    "description": "Create or update a script or search template.",
    "method": "PUT",
    "path": "/_scripts/{id}/{context}",
    "namespaceFile": "put_script"
  },
  {
    "name": "delete-rule",
    "namespace": "query-rules",
    "description": "Delete a query rule.",
    "method": "DELETE",
    "path": "/_query_rules/{ruleset_id}/_rule/{rule_id}",
    "namespaceFile": "query_rules_delete_rule"
  },
  {
    "name": "delete-ruleset",
    "namespace": "query-rules",
    "description": "Delete a query ruleset.",
    "method": "DELETE",
    "path": "/_query_rules/{ruleset_id}",
    "namespaceFile": "query_rules_delete_ruleset"
  },
  {
    "name": "get-rule",
    "namespace": "query-rules",
    "description": "Get a query rule.",
    "method": "GET",
    "path": "/_query_rules/{ruleset_id}/_rule/{rule_id}",
    "namespaceFile": "query_rules_get_rule"
  },
  {
    "name": "get-ruleset",
    "namespace": "query-rules",
    "description": "Get a query ruleset.",
    "method": "GET",
    "path": "/_query_rules/{ruleset_id}",
    "namespaceFile": "query_rules_get_ruleset"
  },
  {
    "name": "list-rulesets",
    "namespace": "query-rules",
    "description": "Get all query rulesets.",
    "method": "GET",
    "path": "/_query_rules",
    "namespaceFile": "query_rules_list_rulesets"
  },
  {
    "name": "put-rule",
    "namespace": "query-rules",
    "description": "Create or update a query rule.",
    "method": "PUT",
    "path": "/_query_rules/{ruleset_id}/_rule/{rule_id}",
    "namespaceFile": "query_rules_put_rule"
  },
  {
    "name": "put-ruleset",
    "namespace": "query-rules",
    "description": "Create or update a query ruleset.",
    "method": "PUT",
    "path": "/_query_rules/{ruleset_id}",
    "namespaceFile": "query_rules_put_ruleset"
  },
  {
    "name": "test",
    "namespace": "query-rules",
    "description": "Test a query ruleset.",
    "method": "POST",
    "path": "/_query_rules/{ruleset_id}/_test",
    "namespaceFile": "query_rules_test"
  },
  {
    "name": "rank-eval",
    "namespace": null,
    "description": "Evaluate ranked search results.",
    "method": "GET",
    "path": "/{index}/_rank_eval",
    "namespaceFile": "rank_eval"
  },
  {
    "name": "reindex",
    "namespace": null,
    "description": "Reindex documents.",
    "method": "POST",
    "path": "/_reindex",
    "namespaceFile": "reindex"
  },
  {
    "name": "render-search-template",
    "namespace": null,
    "description": "Render a search template.",
    "method": "GET",
    "path": "/_render/template/{id}",
    "namespaceFile": "render_search_template"
  },
  {
    "name": "scripts-painless-execute",
    "namespace": null,
    "description": "Run a script.",
    "method": "GET",
    "path": "/_scripts/painless/_execute",
    "namespaceFile": "scripts_painless_execute"
  },
  {
    "name": "scroll",
    "namespace": null,
    "description": "Run a scrolling search.",
    "method": "GET",
    "path": "/_search/scroll",
    "namespaceFile": "scroll"
  },
  {
    "name": "search",
    "namespace": null,
    "description": "Run a search.",
    "method": "GET",
    "path": "/{index}/_search",
    "namespaceFile": "search"
  },
  {
    "name": "delete",
    "namespace": "search-application",
    "description": "Delete a search application.",
    "method": "DELETE",
    "path": "/_application/search_application/{name}",
    "namespaceFile": "search_application_delete"
  },
  {
    "name": "delete-behavioral-analytics",
    "namespace": "search-application",
    "description": "Delete a behavioral analytics collection.",
    "method": "DELETE",
    "path": "/_application/analytics/{name}",
    "namespaceFile": "search_application_delete_behavioral_analytics"
  },
  {
    "name": "get",
    "namespace": "search-application",
    "description": "Get search application details.",
    "method": "GET",
    "path": "/_application/search_application/{name}",
    "namespaceFile": "search_application_get"
  },
  {
    "name": "get-behavioral-analytics",
    "namespace": "search-application",
    "description": "Get behavioral analytics collections.",
    "method": "GET",
    "path": "/_application/analytics/{name}",
    "namespaceFile": "search_application_get_behavioral_analytics"
  },
  {
    "name": "list",
    "namespace": "search-application",
    "description": "Get search applications.",
    "method": "GET",
    "path": "/_application/search_application",
    "namespaceFile": "search_application_list"
  },
  {
    "name": "put",
    "namespace": "search-application",
    "description": "Create or update a search application.",
    "method": "PUT",
    "path": "/_application/search_application/{name}",
    "namespaceFile": "search_application_put"
  },
  {
    "name": "put-behavioral-analytics",
    "namespace": "search-application",
    "description": "Create a behavioral analytics collection.",
    "method": "PUT",
    "path": "/_application/analytics/{name}",
    "namespaceFile": "search_application_put_behavioral_analytics"
  },
  {
    "name": "search",
    "namespace": "search-application",
    "description": "Run a search application search.",
    "method": "GET",
    "path": "/_application/search_application/{name}/_search",
    "namespaceFile": "search_application_search"
  },
  {
    "name": "search-mvt",
    "namespace": null,
    "description": "Search a vector tile.",
    "method": "POST",
    "path": "/{index}/_mvt/{field}/{zoom}/{x}/{y}",
    "namespaceFile": "search_mvt"
  },
  {
    "name": "search-template",
    "namespace": null,
    "description": "Run a search with a search template.",
    "method": "GET",
    "path": "/{index}/_search/template",
    "namespaceFile": "search_template"
  },
  {
    "name": "authenticate",
    "namespace": "security",
    "description": "Authenticate a user.",
    "method": "GET",
    "path": "/_security/_authenticate",
    "namespaceFile": "security_authenticate"
  },
  {
    "name": "create-api-key",
    "namespace": "security",
    "description": "Create an API key.",
    "method": "PUT",
    "path": "/_security/api_key",
    "namespaceFile": "security_create_api_key"
  },
  {
    "name": "delete-role",
    "namespace": "security",
    "description": "Delete roles.",
    "method": "DELETE",
    "path": "/_security/role/{name}",
    "namespaceFile": "security_delete_role"
  },
  {
    "name": "get-api-key",
    "namespace": "security",
    "description": "Get API key information.",
    "method": "GET",
    "path": "/_security/api_key",
    "namespaceFile": "security_get_api_key"
  },
  {
    "name": "get-builtin-privileges",
    "namespace": "security",
    "description": "Get builtin privileges.",
    "method": "GET",
    "path": "/_security/privilege/_builtin",
    "namespaceFile": "security_get_builtin_privileges"
  },
  {
    "name": "get-role",
    "namespace": "security",
    "description": "Get roles.",
    "method": "GET",
    "path": "/_security/role/{name}",
    "namespaceFile": "security_get_role"
  },
  {
    "name": "has-privileges",
    "namespace": "security",
    "description": "Check user privileges.",
    "method": "GET",
    "path": "/_security/user/{user}/_has_privileges",
    "namespaceFile": "security_has_privileges"
  },
  {
    "name": "invalidate-api-key",
    "namespace": "security",
    "description": "Invalidate API keys.",
    "method": "DELETE",
    "path": "/_security/api_key",
    "namespaceFile": "security_invalidate_api_key"
  },
  {
    "name": "put-role",
    "namespace": "security",
    "description": "Create or update roles.",
    "method": "PUT",
    "path": "/_security/role/{name}",
    "namespaceFile": "security_put_role"
  },
  {
    "name": "query-api-keys",
    "namespace": "security",
    "description": "Find API keys with a query.",
    "method": "GET",
    "path": "/_security/_query/api_key",
    "namespaceFile": "security_query_api_keys"
  },
  {
    "name": "query-role",
    "namespace": "security",
    "description": "Find roles with a query.",
    "method": "GET",
    "path": "/_security/_query/role",
    "namespaceFile": "security_query_role"
  },
  {
    "name": "update-api-key",
    "namespace": "security",
    "description": "Update an API key.",
    "method": "PUT",
    "path": "/_security/api_key/{id}",
    "namespaceFile": "security_update_api_key"
  },
  {
    "name": "clear-cursor",
    "namespace": "sql",
    "description": "Clear an SQL search cursor.",
    "method": "POST",
    "path": "/_sql/close",
    "namespaceFile": "sql_clear_cursor"
  },
  {
    "name": "delete-async",
    "namespace": "sql",
    "description": "Delete an async SQL search.",
    "method": "DELETE",
    "path": "/_sql/async/delete/{id}",
    "namespaceFile": "sql_delete_async"
  },
  {
    "name": "get-async",
    "namespace": "sql",
    "description": "Get async SQL search results.",
    "method": "GET",
    "path": "/_sql/async/{id}",
    "namespaceFile": "sql_get_async"
  },
  {
    "name": "get-async-status",
    "namespace": "sql",
    "description": "Get the async SQL search status.",
    "method": "GET",
    "path": "/_sql/async/status/{id}",
    "namespaceFile": "sql_get_async_status"
  },
  {
    "name": "query",
    "namespace": "sql",
    "description": "Get SQL search results.",
    "method": "POST",
    "path": "/_sql",
    "namespaceFile": "sql_query"
  },
  {
    "name": "translate",
    "namespace": "sql",
    "description": "Translate SQL into Elasticsearch queries.",
    "method": "POST",
    "path": "/_sql/translate",
    "namespaceFile": "sql_translate"
  },
  {
    "name": "delete-synonym",
    "namespace": "synonyms",
    "description": "Delete a synonym set.",
    "method": "DELETE",
    "path": "/_synonyms/{id}",
    "namespaceFile": "synonyms_delete_synonym"
  },
  {
    "name": "delete-synonym-rule",
    "namespace": "synonyms",
    "description": "Delete a synonym rule.",
    "method": "DELETE",
    "path": "/_synonyms/{set_id}/{rule_id}",
    "namespaceFile": "synonyms_delete_synonym_rule"
  },
  {
    "name": "get-synonym",
    "namespace": "synonyms",
    "description": "Get a synonym set.",
    "method": "GET",
    "path": "/_synonyms/{id}",
    "namespaceFile": "synonyms_get_synonym"
  },
  {
    "name": "get-synonym-rule",
    "namespace": "synonyms",
    "description": "Get a synonym rule.",
    "method": "GET",
    "path": "/_synonyms/{set_id}/{rule_id}",
    "namespaceFile": "synonyms_get_synonym_rule"
  },
  {
    "name": "get-synonyms-sets",
    "namespace": "synonyms",
    "description": "Get all synonym sets.",
    "method": "GET",
    "path": "/_synonyms",
    "namespaceFile": "synonyms_get_synonyms_sets"
  },
  {
    "name": "put-synonym",
    "namespace": "synonyms",
    "description": "Create or update a synonym set.",
    "method": "PUT",
    "path": "/_synonyms/{id}",
    "namespaceFile": "synonyms_put_synonym"
  },
  {
    "name": "put-synonym-rule",
    "namespace": "synonyms",
    "description": "Create or update a synonym rule.",
    "method": "PUT",
    "path": "/_synonyms/{set_id}/{rule_id}",
    "namespaceFile": "synonyms_put_synonym_rule"
  },
  {
    "name": "get",
    "namespace": "tasks",
    "description": "Get task information.",
    "method": "GET",
    "path": "/_tasks/{task_id}",
    "namespaceFile": "tasks_get"
  },
  {
    "name": "terms-enum",
    "namespace": null,
    "description": "Get terms in an index.",
    "method": "GET",
    "path": "/{index}/_terms_enum",
    "namespaceFile": "terms_enum"
  },
  {
    "name": "termvectors",
    "namespace": null,
    "description": "Get term vector information.",
    "method": "GET",
    "path": "/{index}/_termvectors/{id}",
    "namespaceFile": "termvectors"
  },
  {
    "name": "delete-transform",
    "namespace": "transform",
    "description": "Delete a transform.",
    "method": "DELETE",
    "path": "/_transform/{transform_id}",
    "namespaceFile": "transform_delete_transform"
  },
  {
    "name": "get-node-stats",
    "namespace": "transform",
    "description": "Get node stats.",
    "method": "GET",
    "path": "/_transform/_node_stats",
    "namespaceFile": "transform_get_node_stats"
  },
  {
    "name": "get-transform",
    "namespace": "transform",
    "description": "Get transforms.",
    "method": "GET",
    "path": "/_transform/{transform_id}",
    "namespaceFile": "transform_get_transform"
  },
  {
    "name": "get-transform-stats",
    "namespace": "transform",
    "description": "Get transform stats.",
    "method": "GET",
    "path": "/_transform/{transform_id}/_stats",
    "namespaceFile": "transform_get_transform_stats"
  },
  {
    "name": "preview-transform",
    "namespace": "transform",
    "description": "Preview a transform.",
    "method": "GET",
    "path": "/_transform/{transform_id}/_preview",
    "namespaceFile": "transform_preview_transform"
  },
  {
    "name": "put-transform",
    "namespace": "transform",
    "description": "Create a transform.",
    "method": "PUT",
    "path": "/_transform/{transform_id}",
    "namespaceFile": "transform_put_transform"
  },
  {
    "name": "reset-transform",
    "namespace": "transform",
    "description": "Reset a transform.",
    "method": "POST",
    "path": "/_transform/{transform_id}/_reset",
    "namespaceFile": "transform_reset_transform"
  },
  {
    "name": "schedule-now-transform",
    "namespace": "transform",
    "description": "Schedule a transform to start now.",
    "method": "POST",
    "path": "/_transform/{transform_id}/_schedule_now",
    "namespaceFile": "transform_schedule_now_transform"
  },
  {
    "name": "start-transform",
    "namespace": "transform",
    "description": "Start a transform.",
    "method": "POST",
    "path": "/_transform/{transform_id}/_start",
    "namespaceFile": "transform_start_transform"
  },
  {
    "name": "stop-transform",
    "namespace": "transform",
    "description": "Stop transforms.",
    "method": "POST",
    "path": "/_transform/{transform_id}/_stop",
    "namespaceFile": "transform_stop_transform"
  },
  {
    "name": "update-transform",
    "namespace": "transform",
    "description": "Update a transform.",
    "method": "POST",
    "path": "/_transform/{transform_id}/_update",
    "namespaceFile": "transform_update_transform"
  },
  {
    "name": "update",
    "namespace": null,
    "description": "Update a document.",
    "method": "POST",
    "path": "/{index}/_update/{id}",
    "namespaceFile": "update"
  },
  {
    "name": "update-by-query",
    "namespace": null,
    "description": "Update documents.",
    "method": "POST",
    "path": "/{index}/_update_by_query",
    "namespaceFile": "update_by_query"
  }
] as const
