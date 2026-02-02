# 🤖 Farcaster Telegram Monitor Bot

Bot monitorujący odpowiedzi profilu **@clanker** na Farcaster i wysyłający powiadomienia na Telegram.

## 🚀 Funkcje

- ✅ Monitoruje odpowiedzi (replies) @clanker na Farcaster
- ✅ Wysyła powiadomienia na Telegram w czasie rzeczywistym
- ✅ Formatowane wiadomości z linkami do castów
- ✅ Obsługa wielu użytkowników
- ✅ Prosta konfiguracja

## 📋 Wymagania

- Node.js 18+ 
- Telegram Bot Token (już masz: `7932473138:AAGxrP1y3wEMVwDmzqlJIW5IT7_t-vak1so`)
- Neynar API Key (opcjonalne - bot używa demo key)

## 🛠️ Instalacja Lokalna

### 1. Zainstaluj zależności
```bash
npm install
```

### 2. Uruchom bota
```bash
npm start
```

### 3. Otwórz swojego bota na Telegramie i wyślij `/start`

Bot zacznie monitorować @clanker i wyśle powiadomienie gdy pojawi się nowa odpowiedź!

## 📱 Komendy Telegram

- `/start` - Włącz powiadomienia
- `/stop` - Wyłącz powiadomienia  
- `/status` - Sprawdź status bota
- `/test` - Wyślij testowe powiadomienie

## ☁️ Deployment (Hosting)

### Opcja 1: Railway (ZALECANE - Darmowe)

1. Załóż konto na https://railway.app
2. Kliknij "New Project" → "Deploy from GitHub repo"
3. Podłącz swoje repo lub wgraj pliki
4. Railway automatycznie wykryje Node.js i uruchomi bota
5. ✅ Gotowe! Bot działa 24/7

### Opcja 2: Render (Darmowe)

1. Załóż konto na https://render.com
2. Kliknij "New" → "Background Worker"
3. Podłącz repo lub wgraj pliki
4. Build Command: `npm install`
5. Start Command: `npm start`
6. ✅ Deploy!

### Opcja 3: Heroku

1. Załóż konto na https://heroku.com
2. Zainstaluj Heroku CLI
3. Uruchom:
```bash
heroku login
heroku create nazwa-twojego-bota
git push heroku main
```

### Opcja 4: VPS (np. DigitalOcean, Vultr)

```bash
# Połącz się z VPS
ssh user@your-server-ip

# Zainstaluj Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Sklonuj/wgraj pliki
cd /home/your-user
# ... wgraj pliki ...

# Zainstaluj PM2 do zarządzania procesem
sudo npm install -g pm2

# Uruchom bota
pm2 start farcaster-telegram-bot.js --name farcaster-bot

# Ustaw autostart
pm2 startup
pm2 save

# ✅ Bot działa!
```

## 🔧 Konfiguracja

### Zmiana częstotliwości sprawdzania

W pliku `farcaster-telegram-bot.js` zmień:
```javascript
const CHECK_INTERVAL = 60000; // 60 sekund
```

Na przykład:
- `30000` - sprawdzaj co 30 sekund
- `120000` - sprawdzaj co 2 minuty

### Neynar API Key (opcjonalne)

Bot używa demo key, ale możesz użyć własnego:

1. Zarejestruj się na https://neynar.com
2. Otrzymasz darmowy API key
3. Zmień w pliku `farcaster-telegram-bot.js`:
```javascript
const NEYNAR_API_KEY = 'TWOJ_KLUCZ_TUTAJ';
```

## 📊 Jak to działa?

1. Bot co 60 sekund odpytuje Neynar API o nowe odpowiedzi @clanker
2. Porównuje timestamp z ostatnim sprawdzeniem
3. Jeśli znajdzie nowe odpowiedzi, formatuje je i wysyła na Telegram
4. Przechowuje hashe już przetworzonych castów aby uniknąć duplikatów

## 🐛 Troubleshooting

**Bot się nie uruchamia:**
- Sprawdź czy masz Node.js 18+: `node --version`
- Uruchom: `npm install` ponownie

**Nie otrzymuję powiadomień:**
- Sprawdź czy wysłałeś `/start` na Telegramie
- Sprawdź logi bota czy wykrywa nowe casts
- Sprawdź `/status` aby zobaczyć czy jesteś subskrybentem

**Błędy API:**
- Neynar demo key ma limity - rozważ własny klucz
- Sprawdź połączenie internetowe

## 📝 Notatki

- Bot sprawdza ostatnie 25 odpowiedzi przy każdym zapytaniu
- Przechowuje max 1000 przetworzonych castów w pamięci
- Automatycznie usuwa użytkowników, którzy zablokowali bota

## 💡 Przydatne linki

- Farcaster: https://farcaster.xyz
- Warpcast: https://warpcast.com/clanker
- Neynar API Docs: https://docs.neynar.com
- Telegram Bot API: https://core.telegram.org/bots/api

---

Made with ❤️ for Farcaster community
