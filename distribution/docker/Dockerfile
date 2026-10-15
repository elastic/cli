# Copyright Elasticsearch B.V. and contributors
# SPDX-License-Identifier: Apache-2.0
#
# The bun binary needs glibc, so this is chainguard-base rather than wolfi/static.

FROM docker.elastic.co/wolfi/chainguard-base:latest@sha256:568df5fb0e237c3a2139399d4bd8e80994f24321fa8469aec565b8566704e83a

ARG VERSION
ARG REVISION
ARG CREATED

LABEL org.opencontainers.image.created="${CREATED}" \
      org.opencontainers.image.title="elastic-cli" \
      org.opencontainers.image.description="Interact with the Elastic Stack and Elastic Cloud from the command line." \
      org.opencontainers.image.vendor="Elastic" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.licenses="Apache-2.0" \
      org.opencontainers.image.source="https://github.com/elastic/cli" \
      org.opencontainers.image.url="https://github.com/elastic/cli" \
      org.opencontainers.image.documentation="https://github.com/elastic/cli" \
      org.opencontainers.image.revision="${REVISION}" \
      org.label-schema.build-date="${CREATED}" \
      org.label-schema.license="Apache-2.0" \
      org.label-schema.name="elastic-cli" \
      org.label-schema.schema-version="1.0" \
      org.label-schema.url="https://github.com/elastic/cli" \
      org.label-schema.usage="https://github.com/elastic/cli" \
      org.label-schema.vcs-ref="${REVISION}" \
      org.label-schema.vcs-url="https://github.com/elastic/cli" \
      org.label-schema.vendor="Elastic" \
      org.label-schema.version="${VERSION}" \
      maintainer="infra@elastic.co"

ENV ELASTIC_CONTAINER=true

COPY elastic /usr/local/bin/elastic
COPY LICENSE.txt NOTICE.txt /licenses/

USER 65532

# A CLI invocation is not a long-running service.
HEALTHCHECK NONE

ENTRYPOINT ["/usr/local/bin/elastic"]
