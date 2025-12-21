const BOT_TOKEN = process.env.BOT_TOKEN;
const VERCEL_PUBLIC_URL = process.env.VERCEL_PUBLIC_URL
// Vercel provides the current deployment URL in the VERCEL_PUBLIC_URL environment variable.
// It typically does NOT include the protocol (https://), so we add it.
// We use the path defined in our Elysia app: /webhook/:TOKEN

const host = VERCEL_PUBLIC_URL.replace(/^(\w+):\/\//i,'')
const u_name = host.split('-',1)[0] + '-bay'
const net = host.split('.').slice(1).join('.')
const PUBLIC_URL = `https://${u_name}.${net}`
const WEBHOOK_URL = `${PUBLIC_URL}/webhook`;

if (!BOT_TOKEN || !VERCEL_PUBLIC_URL) {
    console.warn("Skipping Webhook setup: BOT_TOKEN or VERCEL_PUBLIC_URL not found.");
    process.exit(0);
}


async function setTelegramWebhook() {
    console.log(`Attempting to set webhook to: ${WEBHOOK_URL}`);

    try {
        const response = await fetch(`${PUBLIC_URL}/api/set-webhook?user=${process.env.ADMIN||''}`, {
            method: 'Get',
            headers: {
                'Content-Type': 'application/json',
            },
        });

        const data = await response.json();

        if (data.success) {
            console.log('✅ Telegram Webhook set successfully!');
            console.log(`Status: ${data.message}`);
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