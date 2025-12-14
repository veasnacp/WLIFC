BOT_TOKEN="8033680712:AAGka1mJfZ7t7-RhbZ7rH2_Gc0jT6nvnAus"
VERCEL_DOMAIN="https://wlchecker-bay.vercel.app"

WEBHOOK_URL="https://${VERCEL_DOMAIN}/webhook/${BOT_TOKEN}"

curl -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
     -H "Content-Type: application/json" \
     -d "{\"url\": \"${WEBHOOK_URL}\", \"drop_pending_updates\": true}"