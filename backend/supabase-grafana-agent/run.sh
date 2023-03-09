#!/bin/bash -e

exec /bin/agent                                             \
  --config.file=/etc/agent/agent.yaml                       \
  --metrics.wal-directory=/etc/agent/data                   \
  --config.expand-env
