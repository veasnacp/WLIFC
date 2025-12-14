const BOT_TOKEN = process.env.BOT_TOKEN;
const VERCEL_URL = process.env.VERCEL_URL
// Vercel provides the current deployment URL in the VERCEL_URL environment variable.
// It typically does NOT include the protocol (https://), so we add it.
// We use the path defined in our Elysia app: /webhook/:TOKEN

const host = VERCEL_URL.replace(/^(\w+):\/\//i,'')
const u_name = host.split('-',1)[0] + '-bar'
const net = host.split('.').slice(1).join('.')
const PUBLIC_URL = `https://${u_name}.${net}`
const WEBHOOK_URL = `${PUBLIC_URL}/webhook/${BOT_TOKEN}`;

if (!BOT_TOKEN || !VERCEL_URL) {
    console.warn("Skipping Webhook setup: BOT_TOKEN or VERCEL_URL not found.");
    process.exit(0);
}

const telegramApiUrl = `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`;

async function setTelegramWebhook() {
    console.log(`Attempting to set webhook to: ${WEBHOOK_URL}`);

    try {
        const response = await fetch(telegramApiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                url: WEBHOOK_URL,
                // Optional: set a maximum number of concurrent updates
                max_connections: 40,
                drop_pending_updates: true
            }),
        });

        const data = await response.json();

        if (data.ok) {
            console.log('✅ Telegram Webhook set successfully!');
            console.log(`Status: ${data.description}`);
        } else {
            console.error('❌ Failed to set Telegram Webhook.', data.description);
            // Optionally, exit with an error code if failure is critical
            // process.exit(1);
        }

    } catch (error) {
        console.error('Network or unknown error during Webhook setup:', error.message);
        // process.exit(1);
    }
}

setTelegramWebhook();