#!/usr/bin/env node
/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

// Demo elastic CLI extension.
//
// Install it locally for testing:
//   elastic extension create demo --path ./demo/elastic-demo
//   elastic demo               # runs this file, outputs JSON
//   elastic demo --help        # shows usage
//
// The elastic CLI sets these env vars before spawning this process:
//   ELASTIC_ES_URL, ELASTIC_ES_API_KEY
//   ELASTIC_KIBANA_URL, ELASTIC_KIBANA_API_KEY
//   ELASTIC_CLOUD_URL, ELASTIC_CLOUD_API_KEY

const args = process.argv.slice(2)

if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write('Usage: elastic demo [--help]\n')
  process.stdout.write('Outputs the current extension context as JSON.\n')
  process.exit(0)
}

const result = {
  extension: 'demo',
  context: {
    esUrl: process.env.ELASTIC_ES_URL ?? null,
    kibanaUrl: process.env.ELASTIC_KIBANA_URL ?? null,
    cloudUrl: process.env.ELASTIC_CLOUD_URL ?? null,
    hasEsKey: process.env.ELASTIC_ES_API_KEY != null,
    hasKibanaKey: process.env.ELASTIC_KIBANA_API_KEY != null,
  },
  args,
}

process.stdout.write(JSON.stringify(result, null, 2) + '\n')
