// Discord komutlarını temizleme
require('dotenv').config();
const { REST, Routes } = require('discord.js');

// Load your application and bot token from .env file
const clientId = process.env.BOT_CLIENT_ID;
const token = process.env.DISCORD_BOT_TOKEN;
const guildId = process.env.DISCORD_GUILD_ID;

// Create REST instance
const rest = new REST({ version: '10' }).setToken(token);

// Global komutları temizle
async function cleanupGlobalCommands() {
  try {
    console.log('🗑️ Global komutlar temizleniyor...');
    
    // Önce tüm global komutları al
    const globalCommands = await rest.get(
      Routes.applicationCommands(clientId)
    );
    
    console.log(`🔍 ${globalCommands.length} global komut bulundu.`);
    
    if (globalCommands.length > 0) {
      console.log('🔄 Komutlar siliniyor...');
      
      // Her komutu tek tek sil
      for (const command of globalCommands) {
        await rest.delete(
          Routes.applicationCommand(clientId, command.id)
        );
        console.log(`✅ Komut silindi: ${command.name}`);
      }
      
      console.log('✅ Tüm global komutlar silindi!');
    } else {
      console.log('ℹ️ Silinecek global komut bulunamadı.');
    }
  } catch (error) {
    console.error('❌ Global komutları temizlerken hata:', error);
  }
}

// Guild komutlarını temizle (opsiyonel)
async function cleanupGuildCommands() {
  if (!guildId) {
    console.log('ℹ️ Guild ID bulunamadı, guild komutları temizlenmedi.');
    return;
  }
  
  try {
    console.log(`🗑️ Guild komutları temizleniyor (Guild ID: ${guildId})...`);
    
    // Önce tüm guild komutlarını al
    const guildCommands = await rest.get(
      Routes.applicationGuildCommands(clientId, guildId)
    );
    
    console.log(`🔍 ${guildCommands.length} guild komutu bulundu.`);
    
    if (guildCommands.length > 0) {
      console.log('🔄 Komutlar siliniyor...');
      
      // Her komutu tek tek sil
      for (const command of guildCommands) {
        await rest.delete(
          Routes.applicationGuildCommand(clientId, guildId, command.id)
        );
        console.log(`✅ Komut silindi: ${command.name}`);
      }
      
      console.log('✅ Tüm guild komutları silindi!');
    } else {
      console.log('ℹ️ Silinecek guild komutu bulunamadı.');
    }
  } catch (error) {
    console.error('❌ Guild komutlarını temizlerken hata:', error);
  }
}

// Ana fonksiyon
async function main() {
  // İlk guild komutlarını temizle
  //await cleanupGuildCommands();
  
  // Sonra global komutları temizle
  await cleanupGlobalCommands();
  
  console.log('\n🔔 Temizleme tamamlandı! Şimdi "npm run deploy-commands" çalıştırarak komutları yeniden yükleyebilirsiniz.');
}

// Çalıştır
main(); 