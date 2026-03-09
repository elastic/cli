#!/usr/bin/bash

# Wait for Elasticsearch to become ready
until curl -s --fail-with-body -u elastic:${ELASTIC_PASSWORD} http://elasticsearch:9200; do
  echo "Waiting for Elasticsearch to be ready..."
  sleep 2
done

# Update the password for the kibana_system user
curl -s --fail-with-body \
     -u elastic:${ELASTIC_PASSWORD} -H "Content-Type: application/json" \
     http://elasticsearch:9200/_security/user/kibana_system/_password \
     -d "{\"password\":\"${ELASTIC_PASSWORD}\"}"
