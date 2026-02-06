const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

// Configuration
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || '7932473138:AAGxrP1y3wEMVwDmzqlJIW5IT7_t-vak1so';

// Channel ID where notifications will be sent
const CHANNEL_ID = '-1003832803701';

// Profiles to monitor with their minimum follower requirements
const MONITORED_PROFILES = [
  { username: 'clanker', minFollowers: 9000 },
  { username: 'bankr', minFollowers: 10000 }
];

const CHECK_INTERVAL = parseInt(process.env.CHECK_INTERVAL) || 30000; // Check every 30 seconds

// Neynar API key - MUST be set in environment variables
const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY || '3ED55263-9C62-4683-B057-3C83FAC26235';

// Validate API key
if (!NEYNAR_API_KEY || NEYNAR_API_KEY === 'CEDC8FB7-010A-4249-B9C5-D5E8A5D0D667') {
  console.error('❌ BŁĄD: Brak poprawnego NEYNAR_API_KEY!');
  console.error('💡 Ustaw zmienną środowiskową NEYNAR_API_KEY na Railway');
  console.error('🔑 Zdobądź darmowy klucz na: https://neynar.com');
}

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

let lastCheckedTimestamp = Date.now(); // Start from now to avoid duplicates
let chatIds = new Set(); // Store chat IDs of users who started the bot

// Store the last known cast hash to avoid duplicates
let processedCasts = new Set();

// Cache for user data to avoid repeated API calls
const userCache = new Map();
const CACHE_DURATION = 3600000; // 1 hour in milliseconds

// Helper function to get cached user or fetch from API
async function getCachedUser(username) {
  const cached = userCache.get(username);
  
  // Return cached data if it exists and is fresh
  if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
    console.log(`✅ Używam cache dla @${username}`);
    return cached.data;
  }
  
  // Fetch fresh data
  console.log(`🔄 Pobieram dane dla @${username}`);
  const userData = await getClankerUser(username);
  
  if (userData) {
    userCache.set(username, {
      data: userData,
      timestamp: Date.now()
    });
  }
  
  return userData;
}

// Cache for follower counts
const followerCache = new Map();

// Counter for replies to each user (to avoid spam)
const replyCounter = new Map(); // Daily counter (resets every 24h)
const MAX_REPLIES_PER_USER = 3;

// Permanent counter - blocks user forever after 5 replies total
const permanentReplyCounter = new Map();
const PERMANENT_BLOCK_LIMIT = 5;

async function getCachedUserByFid(fid) {
  const cached = followerCache.get(fid);
  
  if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
    console.log(`✅ Używam cache dla FID:${fid}`);
    return cached.data;
  }
  
  console.log(`🔄 Pobieram dane dla FID:${fid}`);
  const userData = await getUserByFid(fid);
  
  if (userData) {
    followerCache.set(fid, {
      data: userData,
      timestamp: Date.now()
    });
  }
  
  return userData;
}

// Helper function to fetch user info by username
async function getClankerUser(username) {
  try {
    const response = await axios.get(
      `https://api.neynar.com/v2/farcaster/user/by_username`,
      {
        params: { username: username },
        headers: {
          'accept': 'application/json',
          'x-api-key': NEYNAR_API_KEY
        }
      }
    );
    return response.data.user;
  } catch (error) {
    console.error(`Error fetching ${username} user:`, error.response?.data || error.message);
    return null;
  }
}

// Helper function to fetch clanker's recent casts (we'll filter replies ourselves)
async function getClankerCasts(fid) {
  try {
    // Use the FREE endpoint - get all casts, then filter for replies
    const response = await axios.get(
      `https://api.neynar.com/v2/farcaster/feed/user/casts`,
      {
        params: {
          fid: fid,
          limit: 50 // Get more casts to find replies
        },
        headers: {
          'accept': 'application/json',
          'x-api-key': NEYNAR_API_KEY
        }
      }
    );
    
    const casts = response.data.casts || [];
    
    // Filter only replies (casts that have a parent)
    const replies = casts.filter(cast => cast.parent_hash || cast.parent_url);
    
    return replies;
  } catch (error) {
    console.error('Error fetching clanker casts:', error.response?.data || error.message);
    return [];
  }
}

// Helper function to fetch user by FID with follower count
async function getUserByFid(fid) {
  try {
    const response = await axios.get(
      `https://api.neynar.com/v2/farcaster/user/bulk`,
      {
        params: { 
          fids: fid,
          viewer_fid: 3 // Optional viewer context
        },
        headers: {
          'accept': 'application/json',
          'x-api-key': NEYNAR_API_KEY
        }
      }
    );
    return response.data.users?.[0] || null;
  } catch (error) {
    console.error('Error fetching user by FID:', error.response?.data || error.message);
    return null;
  }
}

// Format cast for Telegram message
async function formatCastMessage(cast, profileUsername, minFollowers) {
  const author = cast.author;
  const parentAuthor = cast.parent_author;
  
  let message = `🔔 <b>Nowa odpowiedź od @${profileUsername}</b>\n\n`;
  
  if (parentAuthor) {
    let parentName = parentAuthor.username || parentAuthor.display_name;
    let followerCount = parentAuthor.follower_count;
    
    // If we only have FID, fetch full user details (with caching)
    if ((!parentName || !followerCount) && parentAuthor.fid) {
      const fullUser = await getCachedUserByFid(parentAuthor.fid);
      if (fullUser) {
        parentName = parentName || fullUser.username || fullUser.display_name;
        followerCount = followerCount || fullUser.follower_count;
      }
    }
    
    // Final fallback to FID
    if (!parentName) {
      parentName = `fid:${parentAuthor.fid}`;
    }
    
    // Ensure followerCount is always a number
    followerCount = Number(followerCount) || 0;
    
    message += `💬 Odpowiedź do: <b>@${parentName}</b>\n`;
    message += `👥 Followers: <b>${followerCount.toLocaleString('pl-PL')}</b>\n`;
  }
  
  message += `📝 <i>${cast.text || '(brak tekstu)'}</i>\n\n`;
  
  // Create Warpcast link - use hash for direct link
  const castHash = cast.hash;
  message += `🔗 <a href="https://warpcast.com/${author.username || author.display_name}/${castHash}">Zobacz na Warpcast</a>\n\n`;
  
  // Add Sigma Trading bot link
  message += `💎 <a href="https://t.me/SigmaTrading3_bot">Sigma</a>`;
  
  return message;
}

// Initial check to populate processed casts (without sending notifications)
async function initialPopulation() {
  console.log('🔄 Pierwsza inicjalizacja - pobieram ostatnie casts bez wysyłania...');
  
  for (const profile of MONITORED_PROFILES) {
    const user = await getCachedUser(profile.username);
    if (user) {
      const replies = await getClankerCasts(user.fid);
      replies.forEach(cast => {
        const castKey = `${profile.username}:${cast.hash}`;
        processedCasts.add(castKey);
      });
      console.log(`✅ Załadowano ${replies.length} castów z @${profile.username}`);
    }
  }
  
  console.log('✅ Inicjalizacja zakończona - teraz monitoruję tylko nowe odpowiedzi');
}

// Check for new replies from all monitored profiles
async function checkForNewReplies() {
  try {
    console.log(`[${new Date().toLocaleTimeString()}] Sprawdzam nowe odpowiedzi...`);
    
    // Check each monitored profile
    for (const profile of MONITORED_PROFILES) {
      const { username, minFollowers } = profile;
      console.log(`\n📡 Sprawdzam profil: @${username} (min followers: ${minFollowers})`);
      
      // Get user info (with caching)
      const user = await getCachedUser(username);
      if (!user) {
        console.log(`Nie można pobrać informacji o użytkowniku ${username}`);
        continue;
      }
      
      const fid = user.fid;
      console.log(`FID ${username}: ${fid}`);
      
      // Get recent casts and filter for replies
      const replies = await getClankerCasts(fid);
      console.log(`Znaleziono ${replies.length} odpowiedzi`);
      
      // Filter for new replies since last check
      const newReplies = replies.filter(cast => {
        const castTime = new Date(cast.timestamp).getTime();
        const castKey = `${username}:${cast.hash}`;
        const isNew = castTime > lastCheckedTimestamp && !processedCasts.has(castKey);
        return isNew;
      });
      
      console.log(`Nowych odpowiedzi: ${newReplies.length}`);
      
      // Filter out replies to excluded users
      const EXCLUDED_USERS = [
        'bondings.base.eth', 'bondings',
        'joshidead.eth', 'joshidead', 'joshisdead.eth', 'joshisdead',
        'zoopdrop.eth', 'zoopdrop',
        'liadavid',
        'darcris.eth', 'darcris',
        'imthedude',
        'baseddonnie',
        'frissonchain.eth', 'frissonchain',
        'cristianisbased.eth', 'cristianisbased'
      ];
      const filteredReplies = newReplies.filter(reply => {
        // If no parent author, keep the reply
        if (!reply.parent_author) return true;
        
        // Safely get parent username
        const parentUsername = reply.parent_author.username || reply.parent_author.display_name || '';
        
        // Check if excluded (case insensitive)
        const isExcluded = EXCLUDED_USERS.some(excluded => {
          if (!excluded || !parentUsername) return false;
          return parentUsername.toLowerCase().includes(excluded.toLowerCase());
        });
        
        if (isExcluded) {
          console.log(`⏭️  Pomijam odpowiedź do wykluczzonego użytkownika: ${parentUsername}`);
        }
        
        return !isExcluded;
      });
      
      console.log(`Po filtrowaniu wykluczonych: ${filteredReplies.length} odpowiedzi`);
      
      // Filter by minimum follower count
      const finalReplies = [];
      
      for (const reply of filteredReplies) {
        if (!reply.parent_author) {
          finalReplies.push(reply);
          continue;
        }
        
        let followerCount = reply.parent_author.follower_count;
        
        // If follower count not available, fetch user details (with caching)
        if (!followerCount && reply.parent_author.fid) {
          const fullUser = await getCachedUserByFid(reply.parent_author.fid);
          if (fullUser) {
            followerCount = fullUser.follower_count;
          }
        }
        
        followerCount = Number(followerCount) || 0;
        
        if (followerCount >= minFollowers) {
          // Check if we've already sent too many notifications for this user
          const parentUsername = reply.parent_author.username || reply.parent_author.display_name || `fid:${reply.parent_author.fid}`;
          
          // Check PERMANENT block first (lifetime limit)
          const permanentCount = permanentReplyCounter.get(parentUsername) || 0;
          
          if (permanentCount >= PERMANENT_BLOCK_LIMIT) {
            console.log(`🚫 PERMANENTNIE ZABLOKOWANY @${parentUsername} (osiągnięto limit ${PERMANENT_BLOCK_LIMIT} odpowiedzi lifetime)`);
            continue; // Skip this user permanently
          }
          
          // Check daily counter
          const replyCount = replyCounter.get(parentUsername) || 0;
          
          if (replyCount >= MAX_REPLIES_PER_USER) {
            console.log(`⏭️  Pomijam odpowiedź do @${parentUsername} (osiągnięto dzienny limit ${MAX_REPLIES_PER_USER} powiadomień)`);
          } else {
            finalReplies.push(reply);
            // Increment both counters
            replyCounter.set(parentUsername, replyCount + 1);
            permanentReplyCounter.set(parentUsername, permanentCount + 1);
            console.log(`📊 Licznik dla @${parentUsername}: dzienny ${replyCount + 1}/${MAX_REPLIES_PER_USER}, lifetime ${permanentCount + 1}/${PERMANENT_BLOCK_LIMIT}`);
          }
        } else {
          const parentUsername = reply.parent_author.username || reply.parent_author.display_name || `fid:${reply.parent_author.fid}`;
          console.log(`⏭️  Pomijam odpowiedź do @${parentUsername} (tylko ${followerCount} followers, min: ${minFollowers})`);
        }
      }
      
      console.log(`Po filtrowaniu followersów: ${finalReplies.length} odpowiedzi do wysłania`);
      
      // Send notifications for new replies
      for (const reply of finalReplies) {
        const message = await formatCastMessage(reply, username, minFollowers);
        
        // Send to channel
        try {
          await bot.sendMessage(CHANNEL_ID, message, { 
            parse_mode: 'HTML',
            disable_web_page_preview: false
          });
          console.log(`✅ Wysłano powiadomienie na kanał`);
        } catch (error) {
          console.error(`❌ Błąd wysyłania na kanał:`, error.message);
        }
        
        // Mark as processed with profile-specific key
        const castKey = `${username}:${reply.hash}`;
        processedCasts.add(castKey);
      }
      
      // Update last checked timestamp
      if (replies.length > 0) {
        const latestTime = Math.max(...replies.map(c => new Date(c.timestamp).getTime()));
        lastCheckedTimestamp = Math.max(lastCheckedTimestamp, latestTime);
      }
    }
    
  } catch (error) {
    console.error('Błąd podczas sprawdzania odpowiedzi:', error.message);
  }
}

// Bot commands
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  
  const profilesList = MONITORED_PROFILES.map(p => 
    `<b>@${p.username}</b> (min ${p.minFollowers.toLocaleString('pl-PL')} followers)`
  ).join('\n');
  
  bot.sendMessage(
    chatId,
    `🤖 <b>Farcaster Monitor Bot</b>\n\n` +
    `✅ Bot automatycznie wysyła powiadomienia na kanał gdy te profile odpowiedzą:\n\n` +
    `${profilesList}\n\n` +
    `📊 Dostępne komendy:\n` +
    `/status - Sprawdź status bota\n` +
    `/test - Wyślij test na kanał`,
    { parse_mode: 'HTML' }
  );
  
  console.log(`✅ Użytkownik sprawdził status: ${chatId}`);
});

bot.onText(/\/status/, async (msg) => {
  const chatId = msg.chat.id;
  
  let statusMessage = `📊 <b>Status Bota</b>\n\n`;
  statusMessage += `📢 Kanał: <code>${CHANNEL_ID}</code>\n\n`;
  statusMessage += `🎯 Monitorowane profile:\n`;
  
  for (const profile of MONITORED_PROFILES) {
    const user = await getCachedUser(profile.username);
    statusMessage += `\n📡 <b>@${profile.username}</b>\n`;
    if (user) {
      statusMessage += `   👤 ${user.display_name}\n`;
      statusMessage += `   🆔 FID: ${user.fid}\n`;
    }
    statusMessage += `   👥 Min followers: ${profile.minFollowers.toLocaleString('pl-PL')}\n`;
  }
  
  statusMessage += `\n🕐 Częstotliwość sprawdzania: ${CHECK_INTERVAL / 1000}s\n`;
  statusMessage += `📦 Przetworzonych castów: ${processedCasts.size}\n`;
  statusMessage += `🚫 Permanentnie zablokowanych: ${Array.from(permanentReplyCounter.entries()).filter(([_, count]) => count >= PERMANENT_BLOCK_LIMIT).length}\n`;
  
  bot.sendMessage(chatId, statusMessage, { parse_mode: 'HTML' });
});

bot.onText(/\/test/, async (msg) => {
  const chatId = msg.chat.id;
  
  const profilesList = MONITORED_PROFILES.map(p => `@${p.username}`).join(', ');
  
  // Send test to channel
  try {
    await bot.sendMessage(
      CHANNEL_ID,
      `🧪 <b>Testowe powiadomienie</b>\n\n` +
      `To jest przykład powiadomienia, które pojawi się gdy ${profilesList} odpowiedzą na czyiś cast.\n\n` +
      `Bot działa poprawnie! ✅`,
      { parse_mode: 'HTML' }
    );
    
    bot.sendMessage(chatId, '✅ Wysłano test na kanał!', { parse_mode: 'HTML' });
  } catch (error) {
    bot.sendMessage(chatId, `❌ Błąd: ${error.message}`, { parse_mode: 'HTML' });
  }
});

// Error handling
bot.on('polling_error', (error) => {
  console.error('Polling error:', error.message);
});

// Start monitoring
console.log('🚀 Bot uruchomiony!');
console.log('📡 Monitorowane profile:');
MONITORED_PROFILES.forEach(profile => {
  console.log(`   - @${profile.username} (min followers: ${profile.minFollowers})`);
});
console.log(`⏱️  Sprawdzam co ${CHECK_INTERVAL / 1000} sekund`);
console.log('---');

// Run initial population first to avoid sending old notifications
initialPopulation().then(() => {
  console.log('🚀 Rozpoczynam monitorowanie...');
  // Initial check after population
  checkForNewReplies();
  
  // Set up interval for checking
  setInterval(checkForNewReplies, CHECK_INTERVAL);
});

// Keep some processed casts in memory (max 1000)
setInterval(() => {
  if (processedCasts.size > 1000) {
    const castsArray = Array.from(processedCasts);
    processedCasts = new Set(castsArray.slice(-500));
  }
}, 300000); // Clean up every 5 minutes

// Reset DAILY reply counter every 24 hours (permanent counter NEVER resets)
setInterval(() => {
  console.log('🔄 Resetuję DZIENNY licznik odpowiedzi (24h upłynęło)');
  console.log(`📊 Permanentnie zablokowanych użytkowników: ${Array.from(permanentReplyCounter.entries()).filter(([_, count]) => count >= PERMANENT_BLOCK_LIMIT).length}`);
  replyCounter.clear();
}, 86400000); // 24 hours

console.log('✅ Bot gotowy do pracy!');
console.log('💡 Wyślij /start na Telegramie aby zacząć otrzymywać powiadomienia');
