#!/bin/bash

# This script runs during building the sandbox template
# and makes sure the Next.js app is (1) running and (2) the `/` page is compiled
function ping_server() {
    counter=0
    max_retries=300  # ~30 seconds with 0.1s sleep
    response=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000")
    while [[ ${response} -ne 200 ]]; do
      counter=$((counter + 1))
      if (( counter >= max_retries )); then
        echo "Server failed to start after ${max_retries} attempts"
        exit 1
      fi
      if (( counter % 20 == 0 )); then
        echo "Waiting for server to start..."
      fi
      sleep 0.1
      response=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000")
    done
}

ping_server &
cd /home/user && npx next dev --turbopack