#!/usr/bin/env bash
set -euo pipefail

# Cron entrypoint for ai.lucheestiy.com Kimi usage tracking.
# Updates usage, history and stats JSON in one run.

cd /home/mlweb/ai.lucheestiy.com
node collect-kimi-usage.js
