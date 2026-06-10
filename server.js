const express = require('express');
const path = require('path');
const axios = require('axios');
const redis = require('redis');
const config = require('./config');

const app = express();
const PORT = process.env.PORT || 3000;

// Redis client setup
let redisClient;
let isRedisConnected = false;

(async () => {
    try {
        // Check if Redis configuration is provided
        if (!process.env.REDIS_HOST) {
            console.log('Redis: No REDIS_HOST configured, running without cache');
            isRedisConnected = false;
            return;
        }

        // Parse and validate port
        const redisPort = parseInt(process.env.REDIS_PORT, 10);
        if (isNaN(redisPort) || redisPort <= 0 || redisPort > 65535) {
            console.log('Redis: Invalid REDIS_PORT configured, running without cache');
            isRedisConnected = false;
            return;
        }

        // Redis Cloud configuration
        const redisConfig = {
            socket: {
                host: process.env.REDIS_HOST,
                port: redisPort,
                tls: process.env.REDIS_TLS !== 'false', // Enable TLS by default for cloud Redis
                reconnectStrategy: (retries) => {
                    if (retries > 10) {
                        console.log('Redis: Max reconnection attempts reached');
                        return new Error('Redis reconnection failed');
                    }
                    return retries * 100;
                }
            }
        };

        // Add password if provided
        if (process.env.REDIS_PASSWORD) {
            redisConfig.password = process.env.REDIS_PASSWORD;
        }

        redisClient = redis.createClient(redisConfig);

        redisClient.on('error', (err) => {
            console.log('Redis Client Error (will work without cache):', err.message);
            isRedisConnected = false;
        });

        redisClient.on('connect', () => {
            console.log('Redis connected successfully to cloud instance');
            isRedisConnected = true;
        });

        await redisClient.connect();
    } catch (error) {
        console.log('Redis not available, running without cache:', error.message);
        isRedisConnected = false;
    }
})();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS middleware for API endpoints
app.use('/api', (req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

// External API base URL from config.js
const API_BASE_URL = config.API_BASE_URL;
console.log(`Using external API: ${API_BASE_URL}`);

// Cache helper functions
async function getCache(key) {
    if (!isRedisConnected) return null;
    try {
        const data = await redisClient.get(key);
        return data ? JSON.parse(data) : null;
    } catch (error) {
        console.log('Cache get error:', error.message);
        return null;
    }
}

async function setCache(key, data, expirationInSeconds = 3600) {
    if (!isRedisConnected) return;
    try {
        await redisClient.setEx(key, expirationInSeconds, JSON.stringify(data));
    } catch (error) {
        console.log('Cache set error:', error.message);
    }
}

// Transform external API response to match frontend expectations
function transformResponse(externalData, useResults = true) {
    // External API uses status: "success" and data field
    // Frontend expects status: 200, success: true, and results/data field
    const isSuccess = externalData.status === 'success';
    
    if (useResults) {
        return {
            status: isSuccess ? 200 : 500,
            success: isSuccess,
            results: externalData.data || null
        };
    } else {
        return {
            status: isSuccess ? 200 : 500,
            success: isSuccess,
            data: externalData.data || null
        };
    }
}

// ==================== API ROUTES ====================

// Homepage content
app.get('/api/homepage', async (req, res) => {
    try {
        // Check cache first
        const cacheKey = 'homepage:content';
        const cachedData = await getCache(cacheKey);
        
        if (cachedData) {
            console.log('Cache hit for homepage');
            return res.json(cachedData);
        }
        
        const response = await axios.get(`${API_BASE_URL}/api/homepage`);
        
        // Transform external API response to match frontend expectations
        const result = transformResponse(response.data, false);
        
        // Cache for 10 minutes (homepage updates frequently)
        await setCache(cacheKey, result, 600);
        
        res.json(result);
    } catch (error) {
        console.error('Homepage error:', error.message);
        res.status(500).json({
            status: 500,
            success: false,
            message: 'Failed to fetch homepage content',
            error: error.message
        });
    }
});

// Search movies and TV series
app.get('/api/search/:query', async (req, res) => {
    try {
        const { query } = req.params;
        
        // Check cache first
        const cacheKey = `search:${query}`;
        const cachedData = await getCache(cacheKey);
        
        if (cachedData) {
            console.log(`Cache hit for search: ${query}`);
            return res.json(cachedData);
        }
        
        const response = await axios.get(`${API_BASE_URL}/api/search/${encodeURIComponent(query)}`);
        
        // Transform external API response to match frontend expectations
        const result = transformResponse(response.data, true);
        
        // Cache for 30 minutes
        await setCache(cacheKey, result, 1800);
        
        res.json(result);
    } catch (error) {
        console.error('Search error:', error.message);
        res.status(500).json({
            status: 500,
            success: false,
            message: 'Failed to search content',
            error: error.message
        });
    }
});

// Get movie/series detailed information
app.get('/api/info/:movieId', async (req, res) => {
    try {
        const { movieId } = req.params;
        
        // Check cache first
        const cacheKey = `info:${movieId}`;
        const cachedData = await getCache(cacheKey);
        
        if (cachedData) {
            console.log(`Cache hit for movie info: ${movieId}`);
            return res.json(cachedData);
        }
        
        const response = await axios.get(`${API_BASE_URL}/api/info/${movieId}`);
        
        // Transform external API response to match frontend expectations
        const result = transformResponse(response.data, true);
        
        // Cache for 1 hour (movie info rarely changes)
        await setCache(cacheKey, result, 3600);
        
        res.json(result);
    } catch (error) {
        console.error('Info error:', error.message);
        res.status(500).json({
            status: 500,
            success: false,
            message: 'Failed to fetch movie/series info',
            error: error.message
        });
    }
});

// Get streaming sources/download links - proxy directly from external API
app.get('/api/sources/:movieId', async (req, res) => {
    try {
        const { movieId } = req.params;
        const season = parseInt(req.query.season) || 0;
        const episode = parseInt(req.query.episode) || 0;
        
        console.log(`Getting sources for movieId: ${movieId}`);
        
        // Build query params for external API
        const params = new URLSearchParams();
        if (season > 0) params.append('season', season);
        if (episode > 0) params.append('episode', episode);
        
        const queryString = params.toString();
        const url = `${API_BASE_URL}/api/sources/${movieId}${queryString ? '?' + queryString : ''}`;
        
        const response = await axios.get(url);
        
        // External API provides processedSources with proxyUrl already set
        // Just transform and pass through
        const externalData = response.data;
        let sources = [];
        
        if (externalData.status === 'success' && externalData.data && externalData.data.processedSources) {
            sources = externalData.data.processedSources.map(source => ({
                id: source.id,
                quality: source.quality + 'p',
                download_url: source.proxyUrl, // Use external API's proxy URL
                stream_url: source.proxyUrl,   // Use external API's proxy URL
                original_url: source.directUrl,
                size: source.size,
                format: source.format || 'mp4'
            }));
        }
        
        res.json({
            status: 200,
            success: true,
            results: sources
        });
    } catch (error) {
        console.error('Sources error:', error.message);
        res.status(500).json({
            status: 500,
            success: false,
            message: 'Failed to fetch streaming sources',
            error: error.message
        });
    }
});

// Download proxy - redirect to external API's download proxy
app.get('/api/download/*', async (req, res) => {
    try {
        const encodedUrl = req.url.replace('/api/download/', '');
        // Redirect to external API's download proxy
        res.redirect(`${API_BASE_URL}/api/download/${encodedUrl}`);
    } catch (error) {
        console.error('Download redirect error:', error.message);
        res.status(500).json({
            status: 500,
            success: false,
            message: 'Failed to redirect download',
            error: error.message
        });
    }
});

// ==================== STATIC FILES & PAGES ====================

// Cache control middleware for static files
app.use((req, res, next) => {
  // Skip API routes
  if (req.path.startsWith('/api/')) {
    return next();
  }
  
  // Disable caching for HTML, JS, and CSS files to ensure users get latest updates
  if (req.url.endsWith('.html') || req.url.endsWith('.js') || req.url.endsWith('.css')) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  } else {
    // Allow caching for images and other static assets
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 1 day
  }
  next();
});

// Serve static files
app.use(express.static(path.join(__dirname)));

// Routes for all pages
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/robots.txt', (req, res) => {
  res.sendFile(path.join(__dirname, 'robots.txt'));
});

app.get('/sitemap.xml', (req, res) => {
  res.sendFile(path.join(__dirname, 'sitemap.xml'));
});

app.get('/manifest.json', (req, res) => {
  res.sendFile(path.join(__dirname, 'manifest.json'));
});

app.get('/search', (req, res) => {
  res.sendFile(path.join(__dirname, 'search.html'));
});

app.get('/details', (req, res) => {
  res.sendFile(path.join(__dirname, 'details.html'));
});

app.get('/player', (req, res) => {
  res.sendFile(path.join(__dirname, 'player.html'));
});

app.get('/category/:name', (req, res) => {
  res.sendFile(path.join(__dirname, 'category.html'));
});

app.get('/test-french', (req, res) => {
  res.sendFile(path.join(__dirname, 'test-french.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`HandyFlix server running on port ${PORT}`);
  console.log(`API endpoints available at http://localhost:${PORT}/api/`);
});

