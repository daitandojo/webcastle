#!/bin/bash
set -e

API_KEY="scraping-key-1"
BASE_URL="http://localhost:3052"

echo "Testing Scraping Service endpoints..."
echo "====================================="

# Health check
echo -n "Health check... "
curl -s -f "$BASE_URL/health" | grep -q '"status":"healthy"' && echo "OK" || (echo "FAILED" && exit 1)

# Capabilities
echo -n "Capabilities... "
curl -s -f -H "X-API-Key: $API_KEY" "$BASE_URL/v1/capabilities" | grep -q '"service":"Scraping Service"' && echo "OK" || (echo "FAILED" && exit 1)

# Single scrape (CLEAN_TEXT)
echo -n "Single scrape (CLEAN_TEXT)... "
curl -s -f -H "X-API-Key: $API_KEY" -H "Content-Type: application/json" -d '{"url":"https://example.com","mode":"CLEAN_TEXT","fidelity":"FAST"}' "$BASE_URL/v1/scrape" | grep -q '"success":true' && echo "OK" || (echo "FAILED" && exit 1)

# Single scrape (HYPERLINKS)
echo -n "Single scrape (HYPERLINKS)... "
curl -s -f -H "X-API-Key: $API_KEY" -H "Content-Type: application/json" -d '{"url":"https://example.com","mode":"HYPERLINKS","fidelity":"FAST"}' "$BASE_URL/v1/scrape" | grep -q '"success":true' && echo "OK" || (echo "FAILED" && exit 1)

# Single scrape (METADATA)
echo -n "Single scrape (METADATA)... "
curl -s -f -H "X-API-Key: $API_KEY" -H "Content-Type: application/json" -d '{"url":"https://example.com","mode":"METADATA","fidelity":"FAST"}' "$BASE_URL/v1/scrape" | grep -q '"success":true' && echo "OK" || (echo "FAILED" && exit 1)

# Hyperlinks endpoint
echo -n "Hyperlinks endpoint... "
curl -s -f -H "X-API-Key: $API_KEY" -H "Content-Type: application/json" -d '{"url":"https://example.com"}' "$BASE_URL/v1/scrape/links" | grep -q '"success":true' && echo "OK" || (echo "FAILED" && exit 1)

# Batch scrape
echo -n "Batch scrape... "
curl -s -f -H "X-API-Key: $API_KEY" -H "Content-Type: application/json" -d '{"urls":[{"url":"https://example.com","mode":"CLEAN_TEXT"},{"url":"https://example.com","mode":"HYPERLINKS"}]}' "$BASE_URL/v1/scrape/batch" | grep -q '"success":true' && echo "OK" || (echo "FAILED" && exit 1)

echo "====================================="
echo "All endpoints tested successfully!"