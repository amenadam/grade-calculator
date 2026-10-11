/**
 * Simple /ids command (Telegraf v4 + Mongoose).
 * Sends ALL saved Telegram IDs to the admin as telegramIds.txt (no checking).
 *
 *   const registerIds = require('./idsCommand');
 *   registerIds(bot, { User, adminId: ADMIN_IDS[0], idField: 'telegramId' });
 */
module.exports = function registerIds(
  bot,
  { User, adminId, idField = "telegramId" },
) {
  bot.command("ids", async (ctx) => {
    if (ctx.from?.id !== Number(adminId)) return; // admin only

    try {
      const users = await User.find({ [idField]: { $ne: null } })
        .select(idField)
        .lean();

      const ids = users.map((u) => u[idField]);
      if (!ids.length) return ctx.reply("No users found in the database.");

      await ctx.replyWithDocument(
        {
          source: Buffer.from(ids.join("\n"), "utf-8"),
          filename: "telegramIds.txt",
        },
        { caption: `👥 Total: ${ids.length}` },
      );
    } catch (err) {
      console.error("/ids error:", err);
      await ctx.reply(`❌ /ids failed: ${err.message}`).catch(() => {});
    }
  });
};
