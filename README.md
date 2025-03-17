# CSGO Code Checker Discord Bot

A Discord bot that automatically tracks CSGO promotional codes from Discord channels and sends notifications when new codes are found. Designed to use Discord's "Follow Channel" feature to monitor code shares.

## Features

- **CSGO Code Detection**: Automatically detects CSGO codes with configurable regex pattern
- **Regular Checks**: Checks the channel at regular intervals to find new codes
- **Code Management**: Stores found codes in a database and allows marking them as used
- **Commands**: Useful commands for querying codes, viewing statistics, and more
- **Notifications**: Sends notifications to Discord channel when new codes are found

## Installation

1. Create a Discord Bot:
   - Go to the [Discord Developer Portal](https://discord.com/developers/applications)
   - Click the "New Application" button
   - Give your bot a name and go to the "Bot" tab
   - Click "Add Bot"
   - Enable "MESSAGE CONTENT INTENT" permission
   - Click "Reset Token" to get the bot token

2. Add the bot to your server:
   - In the Developer Portal, go to "OAuth2" > "URL Generator"
   - Select "bot" permissions
   - For bot permissions, select:
     - "Read Messages/View Channels"
     - "Send Messages"
     - "Embed Links"
     - "Read Message History"
   - Open the generated URL in your browser and add the bot to your server

3. Set up the channel to track:
   - Use the "Follow" feature on the original channel with CSGO codes
   - Direct it to a channel on your server
   - Get the ID of the followed channel (Developer Mode must be enabled in Discord)

4. Configure the `.env` file:
   ```
   DISCORD_BOT_TOKEN=your_bot_token_here
   DISCORD_GUILD_ID=your_server_id_here
   DISCORD_CHANNEL_ID=your_followed_channel_id_here
   CHECK_INTERVAL=5
   CODE_REGEX=[A-Z0-9]{5,10}
   ```

5. Install required packages:
   ```
   npm install
   ```

6. Start the bot:
   ```
   npm start
   ```

## Commands

The bot supports the following commands:

- `!csgo check` - Check codes immediately
- `!csgo list` - List unused codes
- `!csgo stats` - Show code statistics
- `!csgo use <code>` - Mark specified code as used
- `!csgo about` - Information about this bot
- `!csgo help` - Show help message

## Custom Code Pattern

You can customize the pattern of CSGO codes recognized by the bot in the `.env` file using the `CODE_REGEX` variable. The default pattern detects 5-10 character strings consisting of only uppercase letters and numbers.

## Notes

- The bot checks channel messages every X minutes (value in `.env` file's `CHECK_INTERVAL`)
- When new codes are found, the bot automatically sends notifications
- To avoid performance issues for your server and the Discord API, don't set the check interval too low (5-10 minutes recommended)
- Codes are stored locally in an SQLite database

## License

This project is released under the MIT license. See the `LICENSE` file for details.