// Deploy Discord slash commands
require('dotenv').config(); // Load environment variables
const { REST, Routes, SlashCommandBuilder } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

// Detaylı log için
const DETAILED_LOGGING = true;

// Check environment variables
const clientId = process.env.BOT_CLIENT_ID;
const token = process.env.DISCORD_BOT_TOKEN;
const guildId = process.env.DISCORD_GUILD_ID;

if (!clientId) {
  console.error('❌ Hata: BOT_CLIENT_ID .env dosyasında bulunamadı');
  process.exit(1);
}

if (!token) {
  console.error('❌ Hata: DISCORD_BOT_TOKEN .env dosyasında bulunamadı');
  process.exit(1);
}

// Log environment info
console.log('🔧 ENV Bilgileri:');
console.log(`Bot Client ID: ${clientId}`);
console.log(`Guild ID: ${guildId || 'Belirtilmemiş, komutlar global olarak yayınlanacak'}`);
console.log(`Node.js Version: ${process.version}`);
console.log(`Platform: ${process.platform}`);

// Define commands
const commands = [
  new SlashCommandBuilder()
    .setName('check')
    .setDescription('Check for new CSGO codes immediately'),
  
  new SlashCommandBuilder()
    .setName('list')
    .setDescription('List all unused CSGO codes'),
  
  new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Show CSGO codes statistics'),
  
  new SlashCommandBuilder()
    .setName('use')
    .setDescription('Mark a CSGO code as used')
    .addStringOption(option =>
      option.setName('code')
        .setDescription('The code to mark as used')
        .setRequired(true)),
  
  new SlashCommandBuilder()
    .setName('about')
    .setDescription('Information about the CSGO Code Checker bot'),
  
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show help message for CSGO Code Checker commands'),
    
  new SlashCommandBuilder()
    .setName('testocr')
    .setDescription('Test OCR on an image URL')
    .addStringOption(option =>
      option.setName('url')
        .setDescription('URL of the image to test')
        .setRequired(true))
];

// Log command data
if (DETAILED_LOGGING) {
  console.log('\n📋 Kaydedilecek komutlar:');
  commands.forEach(cmd => console.log(` - /${cmd.name}: ${cmd.description}`));
}

// Convert commands to JSON
const commandsJSON = commands.map(command => command.toJSON());

// Create REST instance
const rest = new REST({ version: '10' }).setToken(token);

// Deploy commands
(async () => {
  try {
    console.log(`\n🔄 ${commands.length} adet slash komutu yükleniyor...`);

    let data;
    let endpoint = '';

    // If we have a guild ID, deploy to guild (faster for testing)
    // Otherwise deploy globally (takes up to an hour to propagate)
    if (guildId) {
      console.log(`📡 Komutlar sunucuya yükleniyor (Guild ID: ${guildId})`);
      endpoint = Routes.applicationGuildCommands(clientId, guildId);
      
      // Verify the bot is in the guild
      console.log('⚠️ Not: Botun belirtilen sunucuda olduğundan emin olun, aksi halde komutlar kaydedilemez.');
    } else {
      console.log('⚠️ Komutlar global olarak yükleniyor (yayılması 1 saate kadar sürebilir)');
      endpoint = Routes.applicationCommands(clientId);
    }
    
    // Log endpoint
    if (DETAILED_LOGGING) {
      console.log(`API Endpoint: ${endpoint}`);
    }

    // Make the request
    console.log('📤 Discord API\'ye istek gönderiliyor...');
    data = await rest.put(endpoint, { body: commandsJSON });

    // Log response data
    if (DETAILED_LOGGING && data) {
      console.log('\n📥 API Yanıtı:');
      console.log(JSON.stringify(data, null, 2));
    }

    console.log(`\n✅ Başarı! ${data.length} adet slash komutu kaydedildi.`);
    console.log('\n📝 Bot başlatıldığında bu komutlar kullanılabilir olacak.');
    console.log('❗ Eğer yine "Unknown Command" hatası alırsanız, botu yeniden başlatmayı unutmayın!');
  } catch (error) {
    console.error('\n❌ Komut kaydetme hatası:', error);
    
    if (error.code === 50001) {
      console.error('🔒 Bot için gerekli izinler eksik!');
    }
    
    if (error.code === 50035) {
      console.error('📄 Komut verisi geçersiz!');
    }
    
    console.error('📋 Hata detayları:', error);
  }
})(); 