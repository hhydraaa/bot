// Discord bot - CSGO Code Checker
require('dotenv').config(); // Load environment variables

// SSL Sertifika hatasını düzeltmek için (Sadece geliştirme ortamında!)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const { Client, GatewayIntentBits, EmbedBuilder, ActivityType, Events, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { initializeDatabase, findCodes, saveCodesIfNew, getUnusedCodes, markCodeAsUsed, getStats } = require('./database');
const { initializeOCR, terminateOCR, processMessageForImageCodes, processImageFromUrl } = require('./image-processor');

// Create bot with necessary permissions and improved configuration
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  // Discord bağlantı hatalarını azaltmak için eklenen ayarlar
  rest: {
    timeout: 60000, // 60 saniye timeout
    retries: 5 // Bağlantı kesilirse 5 kez yeniden dene
  }
});

// CSGO code regex pattern
const CODE_REGEX = new RegExp(process.env.CODE_REGEX || '[A-Z0-9]{5,10}', 'g');

// Check interval (minutes)
const CHECK_INTERVAL = parseInt(process.env.CHECK_INTERVAL || '5', 10);

// Last check time
let lastCheckTime = null;

// Bot login with retry mechanism
async function loginWithRetry(maxRetries = 3, retryDelay = 5000) {
  let retries = 0;
  
  while (retries < maxRetries) {
    try {
      console.log(`Discord'a bağlanmaya çalışılıyor... (Deneme ${retries + 1}/${maxRetries})`);
      await client.login(process.env.DISCORD_BOT_TOKEN);
      console.log('Discord bağlantısı başarılı!');
      return true;
    } catch (error) {
      retries++;
      console.error(`Giriş hatası (${retries}/${maxRetries}):`, error.message);
      
      if (error.message.includes('DISALLOWED_INTENTS') || error.message.includes('TOKEN_INVALID')) {
        console.error('❌ KRITIK HATA: Bot token geçersiz veya gerekli izinler eksik!');
        console.error('Lütfen Discord Developer Portal\'dan bot token\'ını yenileyin.');
        console.error('Ve MESSAGE_CONTENT intent\'inin etkin olduğundan emin olun.');
        return false;
      }
      
      if (retries >= maxRetries) {
        console.error('⚠️ Maksimum deneme sayısına ulaşıldı. Bot başlatılamadı.');
        return false;
      }
      
      console.log(`${retryDelay/1000} saniye sonra tekrar denenecek...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
  
  return false;
}

// Start the bot
(async () => {
  // Önce veritabanını başlat
  await initializeDatabase();
  
  // OCR'ı başlat
  await initializeOCR();
  
  // Discord'a bağlan
  const loginSuccess = await loginWithRetry();
  if (!loginSuccess) {
    console.error('Discord bağlantısı kurulamadı. Bot kapatılıyor.');
    process.exit(1);
  }
})();

// Bot ready event
client.once('ready', async () => {
  console.log(`Bot is ready! Logged in as ${client.user.tag}`);
  
  // Set bot status
  client.user.setPresence({
    activities: [{ 
      name: 'CSGO Codes', 
      type: ActivityType.Watching
    }],
    status: 'online'
  });
  
  // Scheduled check
  console.log(`Codes will be checked every ${CHECK_INTERVAL} minutes`);
  
  // Run initial check
  await checkForCodes();
  
  // Set interval for regular checks
  setInterval(async () => {
    await checkForCodes();
  }, CHECK_INTERVAL * 60 * 1000); // Convert minutes to milliseconds
});

// Handle slash commands
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  try {
    switch (commandName) {
      case 'check':
        await handleSlashCheckCommand(interaction);
        break;
      case 'list':
        await handleSlashListCommand(interaction);
        break;
      case 'stats':
        await handleSlashStatsCommand(interaction);
        break;
      case 'use':
        await handleSlashUseCommand(interaction);
        break;
      case 'about':
        await handleSlashAboutCommand(interaction);
        break;
      case 'help':
        await handleSlashHelpCommand(interaction);
        break;
      case 'testocr':
        await handleSlashTestOCRCommand(interaction);
        break;
      default:
        await interaction.reply({ content: 'Unknown command!', ephemeral: true });
    }
  } catch (error) {
    console.error('Error handling slash command:', error);
    await interaction.reply({ content: 'An error occurred while processing this command.', ephemeral: true });
  }
});

// /check - Check codes immediately
async function handleSlashCheckCommand(interaction) {
  await interaction.deferReply();
  
  const { newCodes } = await checkForCodes();
  
  if (newCodes.length > 0) {
    await interaction.editReply(`Found ${newCodes.length} new codes!`);
    
    // List new codes
    const embed = new EmbedBuilder()
      .setTitle('Found New CSGO Codes')
      .setColor('#0099ff')
      .setTimestamp();
    
    newCodes.forEach((code, index) => {
      embed.addFields({ 
        name: `Code #${index + 1}`, 
        value: `\`${code.code}\`` 
      });
    });
    
    await interaction.followUp({ embeds: [embed] });
  } else {
    await interaction.editReply('No new codes found.');
  }
}

// /list - List unused codes
async function handleSlashListCommand(interaction) {
  await interaction.deferReply();
  const unusedCodes = await getUnusedCodes();
  
  if (unusedCodes.length > 0) {
    const embed = new EmbedBuilder()
      .setTitle('Unused CSGO Codes')
      .setColor('#00cc44')
      .setTimestamp();
    
    unusedCodes.forEach((code, index) => {
      if (index < 25) { // Discord field limit
        embed.addFields({ 
          name: `Code #${index + 1}`, 
          value: `\`${code.code}\` (${formatDate(code.date_found)})` 
        });
      }
    });
    
    if (unusedCodes.length > 25) {
      embed.setFooter({ text: `... and ${unusedCodes.length - 25} more codes` });
    }
    
    await interaction.editReply({ embeds: [embed] });
  } else {
    await interaction.editReply('No unused codes found.');
  }
}

// /stats - Show statistics
async function handleSlashStatsCommand(interaction) {
  await interaction.deferReply();
  const stats = await getStats();
  
  const embed = new EmbedBuilder()
    .setTitle('CSGO Codes Statistics')
    .setColor('#ff9900')
    .addFields(
      { name: 'Total Codes Found', value: stats.totalCodes.toString() },
      { name: 'Unused Codes', value: stats.unusedCodes.toString() },
      { name: 'Used Codes', value: stats.usedCodes.toString() },
      { name: 'Codes Found Today', value: stats.todayCodes.toString() },
      { name: 'Last Check', value: lastCheckTime ? formatDate(lastCheckTime) : 'No checks yet' }
    )
    .setTimestamp();
  
  await interaction.editReply({ embeds: [embed] });
}

// /use - Mark code as used
async function handleSlashUseCommand(interaction) {
  const codeToMark = interaction.options.getString('code').toUpperCase();
  await interaction.deferReply();
  
  const success = await markCodeAsUsed(codeToMark);
  
  if (success) {
    await interaction.editReply(`Code \`${codeToMark}\` has been marked as used.`);
  } else {
    await interaction.editReply(`Code \`${codeToMark}\` not found or already used.`);
  }
}

// /about - Show information about the bot
async function handleSlashAboutCommand(interaction) {
  const embed = new EmbedBuilder()
    .setTitle('About CSGO Code Checker Bot')
    .setDescription('A Discord bot that automatically tracks CSGO promotional codes from followed channels.')
    .setColor('#5865F2')
    .addFields(
      { 
        name: 'Features', 
        value: '• Automatic code detection\n• Code management database\n• Notifications for new codes\n• Easy-to-use commands' 
      },
      { 
        name: 'How It Works', 
        value: 'This bot monitors messages in the specified channel for CSGO promo codes using Discord\'s "Follow Channel" feature. When found, codes are stored and notifications are sent.'
      },
      { 
        name: 'Version', 
        value: '1.0.0' 
      },
      { 
        name: 'Developer', 
        value: 'Created by Hydra for the CSGO community (contact me on discord: hydra.artz)'
      }
    )
    .setTimestamp()
    .setFooter({ text: 'Type /help for a list of commands' });
  
  await interaction.reply({ embeds: [embed] });
}

// /help - Show help message
async function handleSlashHelpCommand(interaction) {
  const embed = new EmbedBuilder()
    .setTitle('CSGO Code Checker Bot Help')
    .setDescription('Commands available to track CSGO promotional codes:')
    .setColor('#3498db')
    .addFields(
      { name: '/check', value: 'Check for codes immediately' },
      { name: '/list', value: 'List all unused codes' },
      { name: '/stats', value: 'Show code statistics' },
      { name: '/use', value: 'Mark a specific code as used' },
      { name: '/about', value: 'Information about this bot' },
      { name: '/help', value: 'Show this help message' },
      { name: '/testocr', value: 'Test OCR on an image URL' }
    )
    .setFooter({ text: `Bot checks for codes automatically every ${CHECK_INTERVAL} minutes.` });
  
  await interaction.reply({ embeds: [embed] });
}

// /testocr - Test OCR on an image URL
async function handleSlashTestOCRCommand(interaction) {
  try {
    const imageUrl = interaction.options.getString('url');
    if (!imageUrl) {
      return await interaction.reply({ content: 'Lütfen bir görüntü URL\'si belirtin.', ephemeral: true });
    }
    
    // İlk olarak geciktir
    await interaction.deferReply();
    
    // Kod regex'i al
    const codeRegex = new RegExp(process.env.CODE_REGEX || '[A-Z0-9]{5,10}', 'g');
    
    // OCR işle
    const result = await processImageFromUrl(imageUrl, codeRegex);
    
    if (result.error) {
      return await interaction.editReply(`OCR işlemi başarısız: ${result.error}`);
    }
    
    // İşleme süresi
    const processingTime = `${(result.processingTimeMs / 1000).toFixed(2)} saniye`;
    
    // Embed rengi
    const color = result.codes && result.codes.length > 0 ? 0x57F287 : 0xED4245;
    
    // Embed oluştur
    const resultEmbed = new EmbedBuilder()
      .setTitle('OCR Test Sonucu')
      .setDescription(`Görüntü URL: [Link](${imageUrl})`)
      .setColor(color)
      .addFields([
        {
          name: 'Görüntü İşleme',
          value: 'Görüntünün ORTASI kırpılarak sadece kod içeren bölge işlendi.',
          inline: false
        },
        {
          name: 'OCR Sonucu',
          value: result.text ? `\`\`\`\n${result.text.substring(0, 1000)}\n\`\`\`` : '*Metin bulunamadı*',
          inline: false
        },
        {
          name: 'Bulunan Kodlar',
          value: result.codes && result.codes.length > 0 
            ? result.codes.map(code => `\`${code}\``).join(', ')
            : '*Kod bulunamadı*',
          inline: false
        }
      ])
      .setFooter({ 
        text: `İşleme süresi: ${processingTime}`
      })
      .setTimestamp();
    
    // Ek bilgi olarak görüntüyü ekle
    if (imageUrl.match(/\.(jpeg|jpg|gif|png)$/)) {
      resultEmbed.setImage(imageUrl);
    }
    
    await interaction.editReply({ embeds: [resultEmbed] });
  } catch (error) {
    console.error('OCR test komutu hatası:', error);
    
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply('OCR test işlemi sırasında bir hata oluştu.');
    } else {
      await interaction.reply({ 
        content: 'OCR test işlemi sırasında bir hata oluştu.',
        ephemeral: true 
      });
    }
  }
}

// Listen for commands (legacy prefix commands)
client.on('messageCreate', async (message) => {
  // Ignore bot messages and DMs
  if (message.author.bot || !message.guild) return;
  
  // Command format: !csgo command
  if (!message.content.startsWith('!csgo')) return;
  
  const args = message.content.slice(6).trim().split(/ +/);
  const command = args.shift().toLowerCase();
  
  // Handle commands
  try {
    switch (command) {
      case 'check':
        await handleCheckCommand(message);
        break;
      case 'list':
        await handleListCommand(message);
        break;
      case 'stats':
        await handleStatsCommand(message);
        break;
      case 'use':
        await handleUseCommand(message, args);
        break;
      case 'about':
        await handleAboutCommand(message);
        break;
      case 'help':
        await handleHelpCommand(message);
        break;
      default:
        await message.reply('Unknown command. Type `!csgo help` for a list of available commands.');
    }
  } catch (error) {
    console.error('Error processing command:', error);
    await message.reply('An error occurred while processing this command.');
  }
});

// !csgo check - Check codes immediately
async function handleCheckCommand(message) {
  await message.reply('Checking for codes, please wait...');
  
  const { newCodes } = await checkForCodes();
  
  if (newCodes.length > 0) {
    await message.reply(`Found ${newCodes.length} new codes!`);
    
    // List new codes
    const embed = new EmbedBuilder()
      .setTitle('Found New CSGO Codes')
      .setColor('#0099ff')
      .setTimestamp();
    
    newCodes.forEach((code, index) => {
      embed.addFields({ 
        name: `Code #${index + 1}`, 
        value: `\`${code.code}\`` 
      });
    });
    
    await message.channel.send({ embeds: [embed] });
  } else {
    await message.reply('No new codes found.');
  }
}

// !csgo list - List unused codes
async function handleListCommand(message) {
  const unusedCodes = await getUnusedCodes();
  
  if (unusedCodes.length > 0) {
    const embed = new EmbedBuilder()
      .setTitle('Unused CSGO Codes')
      .setColor('#00cc44')
      .setTimestamp();
    
    unusedCodes.forEach((code, index) => {
      if (index < 25) { // Discord field limit
        embed.addFields({ 
          name: `Code #${index + 1}`, 
          value: `\`${code.code}\` (${formatDate(code.date_found)})` 
        });
      }
    });
    
    if (unusedCodes.length > 25) {
      embed.setFooter({ text: `... and ${unusedCodes.length - 25} more codes` });
    }
    
    await message.channel.send({ embeds: [embed] });
  } else {
    await message.reply('No unused codes found.');
  }
}

// !csgo stats - Show statistics
async function handleStatsCommand(message) {
  const stats = await getStats();
  
  const embed = new EmbedBuilder()
    .setTitle('CSGO Codes Statistics')
    .setColor('#ff9900')
    .addFields(
      { name: 'Total Codes Found', value: stats.totalCodes.toString() },
      { name: 'Unused Codes', value: stats.unusedCodes.toString() },
      { name: 'Used Codes', value: stats.usedCodes.toString() },
      { name: 'Codes Found Today', value: stats.todayCodes.toString() },
      { name: 'Last Check', value: lastCheckTime ? formatDate(lastCheckTime) : 'No checks yet' }
    )
    .setTimestamp();
  
  await message.channel.send({ embeds: [embed] });
}

// !csgo use <code> - Mark code as used
async function handleUseCommand(message, args) {
  if (!args.length) {
    return message.reply('Please specify a code. Example: `!csgo use ABC123`');
  }
  
  const codeToMark = args[0].toUpperCase();
  const success = await markCodeAsUsed(codeToMark);
  
  if (success) {
    await message.reply(`Code \`${codeToMark}\` has been marked as used.`);
  } else {
    await message.reply(`Code \`${codeToMark}\` not found or already used.`);
  }
}

// !csgo about - Show information about the bot
async function handleAboutCommand(message) {
  const embed = new EmbedBuilder()
    .setTitle('About CSGO Code Checker Bot')
    .setDescription('A Discord bot that automatically tracks CSGO promotional codes from followed channels.')
    .setColor('#5865F2')
    .addFields(
      { 
        name: 'Features', 
        value: '• Automatic code detection\n• Code management database\n• Notifications for new codes\n• Easy-to-use commands' 
      },
      { 
        name: 'How It Works', 
        value: 'This bot monitors messages in the specified channel for CSGO promo codes using Discord\'s "Follow Channel" feature. When found, codes are stored and notifications are sent.'
      },
      { 
        name: 'Version', 
        value: '1.0.0' 
      },
      { 
        name: 'Developer', 
        value: 'Created with ❤️ for the CSGO community'
      }
    )
    .setTimestamp()
    .setFooter({ text: 'Type !csgo help for a list of commands' });
  
  await message.channel.send({ embeds: [embed] });
}

// !csgo help - Show help message
async function handleHelpCommand(message) {
  const embed = new EmbedBuilder()
    .setTitle('CSGO Code Checker Bot Help')
    .setDescription('Commands available to track CSGO promotional codes:')
    .setColor('#3498db')
    .addFields(
      { name: '!csgo check', value: 'Check for codes immediately' },
      { name: '!csgo list', value: 'List all unused codes' },
      { name: '!csgo stats', value: 'Show code statistics' },
      { name: '!csgo use <code>', value: 'Mark a specific code as used' },
      { name: '!csgo about', value: 'Information about this bot' },
      { name: '!csgo help', value: 'Show this help message' }
    )
    .setFooter({ text: `Bot checks for codes automatically every ${CHECK_INTERVAL} minutes.` });
  
  await message.channel.send({ embeds: [embed] });
}

// Function to check for codes
async function checkForCodes() {
  console.log('Checking for codes...');
  lastCheckTime = new Date();
  
  try {
    // Get channel info
    const guildId = process.env.DISCORD_GUILD_ID;
    const channelId = process.env.DISCORD_CHANNEL_ID;
    
    if (!guildId || !channelId) {
      console.error('Missing server or channel ID. Check your .env file.');
      return { newCodes: [] };
    }
    
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      console.error(`Server not found: ${guildId}`);
      return { newCodes: [] };
    }
    
    const channel = guild.channels.cache.get(channelId);
    if (!channel || channel.type !== 0) { // 0 = GUILD_TEXT
      console.error(`Channel not found or not a text channel: ${channelId}`);
      return { newCodes: [] };
    }
    
    console.log(`Checking messages in channel "${channel.name}"...`);
    
    // Get last 50 messages (Discord API limitation)
    const messages = await channel.messages.fetch({ limit: 50 });
    console.log(`Retrieved ${messages.size} messages.`);
    
    // Search for codes in messages
    const foundCodes = [];
    
    // Process each message
    for (const [_, message] of messages) {
      // Process text content and attached images
      const messageCodes = await processMessageForImageCodes(message, CODE_REGEX);
      
      if (messageCodes.length > 0) {
        messageCodes.forEach(code => {
          foundCodes.push({
            code: code,
            date_found: new Date().toISOString(),
            is_used: 0
          });
        });
      }
    }
    
    console.log(`Found ${foundCodes.length} potential codes.`);
    
    // Save new codes to database
    const newCodes = await saveCodesIfNew(foundCodes);
    
    if (newCodes.length > 0) {
      console.log(`Added ${newCodes.length} new codes to database.`);
    } else {
      console.log('No new codes found.');
    }
    
    return { newCodes };
  } catch (error) {
    console.error('Error checking codes:', error);
    return { newCodes: [] };
  }
}

// Date format helper
function formatDate(date) {
  if (typeof date === 'string') {
    date = new Date(date);
  }
  return date.toLocaleString('en-US', { 
    day: '2-digit', 
    month: '2-digit', 
    year: 'numeric', 
    hour: '2-digit', 
    minute: '2-digit' 
  });
}

// Handle process exit
process.on('SIGINT', async () => {
  console.log('Shutting down...');
  await terminateOCR();
  process.exit(0);
}); 