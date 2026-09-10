#!/bin/bash
# Copyright Elasticsearch B.V. and contributors
# SPDX-License-Identifier: Apache-2.0
#
# Builds a content-pack zip for the import test. CLI export cannot hold a zip
# (the Kibana client reads the body as text), so the pack is written here.

CONTENT_PACK=$(mktemp "${TMPDIR:-/tmp}/cli-ft-content-pack.XXXXXX")
python3 - "$CONTENT_PACK" <<'PY'
import json, sys, zipfile

path = sys.argv[1]
root = "cli-ft-content-pack-1.0.0"
name = "logs.otel.cli-ft-streams-content-import"
request = {
    "dashboards": [],
    "rules": [],
    "stream": {
        "description": "",
        "type": "wired",
        "ingest": {
            "lifecycle": {"inherit": {}},
            "processing": {"steps": []},
            "settings": {},
            "failure_store": {"inherit": {}},
            "wired": {"fields": {}, "routing": []},
        },
    },
}
with zipfile.ZipFile(path, "w") as z:
    z.writestr(f"{root}/manifest.yml", "name: cli-ft-content-pack\ndescription: test\nversion: 1.0.0\n")
    z.writestr(f"{root}/stream/{name}.json", json.dumps({"name": name, "request": request}))
PY
