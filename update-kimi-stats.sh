#!/bin/bash
# Cron script to generate KIMI CLI stats for ai.lucheestiy.com dashboard
# Run every 5 minutes

cd /home/mlweb/ai.lucheestiy.com
node generate-kimi-stats.js
