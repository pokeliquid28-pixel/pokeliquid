#!/bin/bash
# Deploy PL500 module to keeper server
set -e

SERVER="root@157.180.67.25"
KEEPER_DIR="/root/keeper"

echo "=== Deploying PL500 to keeper ==="

# 1. Upload PL500 module and product IDs
echo "Uploading pl500.js and product IDs..."
scp scripts/keeper-pl500-patch.js ${SERVER}:${KEEPER_DIR}/pl500.js
scp scripts/pl500-product-ids.json ${SERVER}:${KEEPER_DIR}/pl500-product-ids.json

echo "Files uploaded. Now patch keeper.js on the server."
echo ""
echo "SSH into the server and:"
echo "  1. Add 'const { fetchPL500Price } = require(\"./pl500\");' near the top requires"
echo "  2. Add PL500 to MARKET_CONFIGS array"
echo "  3. In scrapeAllMarkets, skip PL500 (it uses fetchPL500Price instead)"
echo "  4. In runCycle, handle PL500 specially"
echo "  5. pm2 restart keeper"
echo ""
echo "Done uploading."
