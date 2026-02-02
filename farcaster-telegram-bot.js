const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

// Configuration
const TELEGRAM_TOKEN = '7932473138:AAGxrP1y3wEMVwDmzqlJIW5IT7_t-vak1so';
const FARCASTER_USERNAME = 'clanker';
const CHECK_INTERVAL = 60000; // Check every 60 seconds (1 minute)

// You'll need a Neynar API key - get free one at https://neynar.com
// For now, we'll use public endpoints where possible
const NEYNAR_API_KEY = 'CEDC8FB7-010A-4249-B9C5-D5E8A5D0D667'; // Demo key - replace with your own

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

let lastCheckedTimestamp = Date.now();
let chatIds = new Set(); // Store chat IDs of users who started the bot

// Store the last known cast hash to avoid duplicates
let processedCasts = new Set();

// Helper function to fetch clanker's user info
async function getClankerUser() {
  try {
    const response = await axios.get(
      `https://api.neynar.com/v2/farcaster/user/by_username`,
      {
        params: { username: FARCASTER_USERNAME },
        headers: {
          'accept': 'application/json',
          'api_key': NEYNAR_API_KEY
        }
      }
    );
    return response.data.result.user;
  } catch (error) {
    console.error('Error fetching clanker user:', error.response?.data || error.message);
    return null;
  }
}

// Helper function to fetch clanker's recent casts (including replies)
async function getClankerReplies(fid) {
  try {
    const response = await axios.get(
      `https://api.neynar.com/v2/farcaster/feed/user/${fid}/replies`,
      {
        params: {
          limit: 25 // Get last 25 replies
        },
        headers: {
          'accept': 'application/json',
          'api_key': NEYNAR_API_KEY
        }
      }
    );
    return response.data.casts || [];
  } catch (error) {
    console.error('Error fetching clanker replies:', error.response?.data || error.message);
    return [];
  }
}

// Format cast for Telegram message
function formatCastMessage(cast) {
  const author = cast.author;
  const parentAuthor = cast.parent_author;
  const timestamp = new Date(cast.timestamp).toLocaleString('pl-PL');
  
  let message = `🔔 <b>Nowa odpowiedź od @${FARCASTER_USERNAME}</b>\n\n`;
  
  if (parentAuthor) {
    message += `💬 Odpowiedź do: <b>@${parentAuthor.username}</b>\n`;
  }
  
  message += `📝 <i>${cast.text || '(brak tekstu)'}</i>\n\n`;
  
  // Add embeds if present
  if (cast.embeds && cast.embeds.length > 0) {
    message += `🔗 Załączniki: ${cast.embeds.length}\n`;
  }
  
  message += `⏰ ${timestamp}\n`;
  message += `🔗 <a href="https://warpcast.com/${author.username}/${cast.hash.substring(0, 10)}">Zobacz na Warpcast</a>`;
  
  return message;
}

// Check for new replies
async function checkForNewReplies() {
  try {
    console.log(`[${new Date().toLocaleTimeString()}] Sprawdzam nowe odpowiedzi...`);
    
    // Get clanker's user info first
    const clankerUser = await getClankerUser();
    if (!clankerUser) {
      console.log('Nie można pobrać informacji o użytkowniku clanker');
      return;
    }
    
    const fid = clankerUser.fid;
    console.log(`FID clanker: ${fid}`);
    
    // Get recent replies
    const replies = await getClankerReplies(fid);
    console.log(`Znaleziono ${replies.length} odpowiedzi`);
    
    // Filter for new replies since last check
    const newReplies = replies.filter(cast => {
      const castTime = new Date(cast.timestamp).getTime();
      const isNew = castTime > lastCheckedTimestamp && !processedCasts.has(cast.hash);
      return isNew;
    });
    
    console.log(`Nowych odpowiedzi: ${newReplies.length}`);
    
    // Send notifications for new replies
    for (const reply of newReplies) {
      const message = formatCastMessage(reply);
      
      // Send to all subscribed chats
      for (const chatId of chatIds) {
        try {
          await bot.sendMessage(chatId, message, { 
            parse_mode: 'HTML',
            disable_web_page_preview: false
          });
          console.log(`✅ Wysłano powiadomienie do chat ${chatId}`);
        } catch (error) {
          console.error(`❌ Błąd wysyłania do ${chatId}:`, error.message);
          // If user blocked the bot, remove them
          if (error.response && error.response.statusCode === 403) {
            chatIds.delete(chatId);
          }
        }
      }
      
      // Mark as processed
      processedCasts.add(reply.hash);
    }
    
    // Update last checked timestamp
    if (replies.length > 0) {
      const latestTime = Math.max(...replies.map(c => new Date(c.timestamp).getTime()));
      lastCheckedTimestamp = Math.max(lastCheckedTimestamp, latestTime);
    }
    
  } catch (error) {
    console.error('Błąd podczas sprawdzania odpowiedzi:', error.message);
  }
}

// Bot commands
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  chatIds.add(chatId);
  
  bot.sendMessage(
    chatId,
    `🤖 <b>Witaj w Farcaster Monitor!</b>\n\n` +
    `✅ Teraz będziesz otrzymywać powiadomienia, gdy <b>@${FARCASTER_USERNAME}</b> odpowie na czyiś post na Farcaster.\n\n` +
    `📊 Dostępne komendy:\n` +
    `/start - Włącz powiadomienia\n` +
    `/stop - Wyłącz powiadomienia\n` +
    `/status - Sprawdź status\n` +
    `/test - Testowe powiadomienie`,
    { parse_mode: 'HTML' }
  );
  
  console.log(`✅ Nowy użytkownik: ${chatId}`);
});

bot.onText(/\/stop/, (msg) => {
  const chatId = msg.chat.id;
  chatIds.delete(chatId);
  
  bot.sendMessage(
    chatId,
    `👋 Powiadomienia zostały wyłączone.\n\nAby włączyć ponownie, wyślij /start`,
    { parse_mode: 'HTML' }
  );
  
  console.log(`❌ Użytkownik opuścił: ${chatId}`);
});

bot.onText(/\/status/, async (msg) => {
  const chatId = msg.chat.id;
  const isSubscribed = chatIds.has(chatId);
  
  const clankerUser = await getClankerUser();
  
  let statusMessage = `📊 <b>Status Bota</b>\n\n`;
  statusMessage += `🎯 Monitorowany profil: <b>@${FARCASTER_USERNAME}</b>\n`;
  if (clankerUser) {
    statusMessage += `👤 Nazwa: ${clankerUser.display_name}\n`;
    statusMessage += `🆔 FID: ${clankerUser.fid}\n`;
  }
  statusMessage += `📢 Status powiadomień: ${isSubscribed ? '✅ Włączone' : '❌ Wyłączone'}\n`;
  statusMessage += `👥 Aktywnych subskrybentów: ${chatIds.size}\n`;
  statusMessage += `🕐 Częstotliwość sprawdzania: ${CHECK_INTERVAL / 1000}s\n`;
  statusMessage += `📦 Przetworzonych castów: ${processedCasts.size}\n`;
  
  bot.sendMessage(chatId, statusMessage, { parse_mode: 'HTML' });
});

bot.onText(/\/test/, async (msg) => {
  const chatId = msg.chat.id;
  
  bot.sendMessage(
    chatId,
    `🧪 <b>Testowe powiadomienie</b>\n\n` +
    `To jest przykład powiadomienia, które otrzymasz gdy @${FARCASTER_USERNAME} odpowie na czyiś cast.\n\n` +
    `Bot działa poprawnie! ✅`,
    { parse_mode: 'HTML' }
  );
});

// Error handling
bot.on('polling_error', (error) => {
  console.error('Polling error:', error.message);
});

// Start monitoring
console.log('🚀 Bot uruchomiony!');
console.log(`📡 Monitoruję profil: @${FARCASTER_USERNAME}`);
console.log(`⏱️  Sprawdzam co ${CHECK_INTERVAL / 1000} sekund`);
console.log('---');

// Initial check
checkForNewReplies();

// Set up interval for checking
setInterval(checkForNewReplies, CHECK_INTERVAL);

// Keep some processed casts in memory (max 1000)
setInterval(() => {
  if (processedCasts.size > 1000) {
    const castsArray = Array.from(processedCasts);
    processedCasts = new Set(castsArray.slice(-500));
  }
}, 300000); // Clean up every 5 minutes

console.log('✅ Bot gotowy do pracy!');
console.log('💡 Wyślij /start na Telegramie aby zacząć otrzymywać powiadomienia');
