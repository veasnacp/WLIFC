import TelegramBot from 'node-telegram-bot-api';

interface ActiveUserData {
  fullnameWithUsername: string;
  id?: number | string;
  username?: string;
  logging?: string[];
  lastActive: Date;
}

/**
 * Broadcasts the specific New Year GIF using its File ID.
 */
export async function broadcastByFileId(
  bot: TelegramBot,
  userMap: Map<number, ActiveUserData>,
  adminIdTesting?: number
) {
  // The specific File ID you provided
  const GIF_FILE_ID =
    'CgACAgQAAxkBAAIrxGlV2-RA1rt6NfKoLkqE8u9oZDneAAIpCgACfRQ9UunT-a_2xitaOAQ';
  const CAPTION =
    '<b>Happy New Year 2026</b>\n<b>រីករាយចូលឆ្នាំថ្មីឆ្នាំសកល២០២៦ 😀</b>\n\nតែនៅធ្វើការធម្មតា🤣🤣';

  if (adminIdTesting) {
    try {
      await bot.sendAnimation(adminIdTesting, GIF_FILE_ID, {
        caption: CAPTION,
        parse_mode: 'HTML',
      });
    } catch (error: any) {
      console.error('Error send notifaction', error.message);
    }
    return;
  }

  if (userMap.size === 0) {
    console.log('⚠️ No users found in your Map.');
    return;
  }

  console.log(
    `🎬 Starting broadcast to ${userMap.size} users using File ID...`
  );

  let successCount = 0;
  let blockedCount = 0;
  let errorCount = 0;

  for (const [userId, userData] of userMap.entries()) {
    try {
      // Sending using the File ID is almost instant
      await bot.sendAnimation(userId, GIF_FILE_ID, {
        caption: CAPTION,
        parse_mode: 'HTML',
      });

      successCount++;

      // Safety Delay: 50ms (allows ~20 messages per second)
      // This ensures you never hit the 30 msg/sec Telegram limit.
      await new Promise((resolve) => setTimeout(resolve, 50));
    } catch (error: any) {
      const errorDesc = error.response?.body?.description || '';

      if (errorDesc.includes('bot was blocked by the user')) {
        blockedCount++;
        // Optional: Remove user from Map so you don't try again next time
        userMap.delete(userId);
      } else {
        console.error(`❌ Could not send to ${userId}: ${errorDesc}`);
        errorCount++;
      }
    }

    // Console progress update every 20 users
    if (successCount % 20 === 0) {
      console.log(`📡 Status: ${successCount}/${userMap.size} sent...`);
    }
  }
}
