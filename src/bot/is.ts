import TelegramBot from 'node-telegram-bot-api';

/**
 * Checks if a user is an administrator or the creator of a chat.
 * @param chatId The ID of the chat (group/supergroup)
 * @param userId The ID of the user to check
 */
export async function isAdmin(
  bot: TelegramBot,
  chatId: number | string,
  userId: number
): Promise<boolean> {
  // If it's a private chat, usually you just check against your own ID
  if (chatId === userId) {
    const ADMIN_ID = process.env.ADMIN_ID?.split(',');
    return Boolean(ADMIN_ID?.includes(String(userId)));
  }

  try {
    const member = await bot.getChatMember(chatId, userId);
    return ['creator', 'administrator'].includes(member.status);
  } catch (error: any) {
    console.error('Error checking admin status:', error.message);
    return false;
  }
}
