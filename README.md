# HandyFlix - Movie Streaming Web App

A web-based movie streaming application integrated with MovieBox API.

## Features

- 🏠 **Homepage** - Multiple content categories (Anime, Trending, Nollywood, Chinese, Romance, etc.)
- 🎭 **Genres** - Multiple genre filters with beautiful UI
- 🎬 **Video Player** - Quality selection and smooth streaming with Plyr
- 🎥 **Trailers** - Auto-play trailer support
- 🔍 **Search** - Advanced search and filtering
- 📱 **Mobile App** - Download the Android APK for native app experience
- ⚡ **Redis Cache** - Fast API response caching for better performance

## Quick Start

### Prerequisites

- Node.js 14+ installed
- Redis (optional, but recommended for better performance)

### Installation

```bash
# Clone the repository
git clone https://github.com/mr-Colab/A.git
cd A

# Install dependencies
npm install

# Optional: Copy and configure environment variables
cp .env.example .env

# Start the server
npm start
```

The app will be available at `http://localhost:3000`

### Redis Setup (Optional but Recommended)

**Windows:**
```bash
# Download Redis from https://github.com/tporadowski/redis/releases
# Or use WSL:
wsl --install
sudo apt update
sudo apt install redis-server
redis-server
```

**Linux/Mac:**
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install redis-server
sudo systemctl start redis

# Mac
brew install redis
brew services start redis
```

**Without Redis:**
The app works perfectly without Redis, it just won't cache API responses.

### Running the Web App

Simply open `index.html` in a web browser, or use a local web server:

```bash
# Using Python 3
python -m http.server 8000

# Using Node.js (http-server)
npx http-server

# Using PHP
php -S localhost:8000
```

Then navigate to `http://localhost:8000` in your browser.

### Download Mobile App

Download the HandyFlix Android APK:
[Download APK](https://github.com/mr-Colab/Andyflixapk/raw/main/Handy%20Flix.apk)

## Project Structure

```
.
├── index.html          # Main homepage
├── search.html         # Search page
├── details.html        # Movie details page
├── player.html         # Video player page
├── category.html       # Category browse page
├── app.js              # Main application logic
├── styles.css          # Styling
├── assets/             # Images and icons
└── server.js           # Optional Node.js server
```

## API Integration

The app integrates with movieapi.giftedtech.co.ke providing:

- Search movies and series
- Movie details and metadata
- Video streaming sources
- Trailer URLs

## License

This project is a web application for movie streaming.
