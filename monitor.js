const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { parseStringPromise } = require('xml2js');
const { decode } = require('html-entities');

const feedUrl = 'https://www.whitehouse.gov/presidential-actions/feed/';
const outputFilePath = path.join(__dirname, 'actions', 'presidentialActions.json');
const existingDataPath = path.join(__dirname, 'actions', 'existingData.json');
const newDataPath = path.join(__dirname, 'actions', 'newData.json');

// Utility for styled console output
const log = {
    info: (message) => console.log(`\x1b[34mℹ️ ${message}\x1b[0m`), // Blue
    success: (message) => console.log(`\x1b[32m✅ ${message}\x1b[0m`), // Green
    warn: (message) => console.log(`\x1b[33m⚠️ ${message}\x1b[0m`), // Yellow
    error: (message) => console.log(`\x1b[31m❌ ${message}\x1b[0m`), // Red
};

// Fetch RSS feed
async function fetchRSSFeed(feedUrl) {
    try {
        const response = await axios.get(feedUrl);
        return response.data;
    } catch (error) {
        log.error(`Failed to fetch RSS feed: ${error.message}`);
        throw error;
    }
}

// Parse and sanitize RSS feed
async function parseAndSanitizeRSS(xmlData) {
    try {
        const parsedData = await parseStringPromise(xmlData);
        const items = parsedData.rss.channel[0].item;

        return items.map(item => ({
            title: decode(item.title[0]).trim(),
            date: new Date(item.pubDate[0]).toISOString(),
            content: decode(
                (item['content:encoded']?.[0] || '')
                    .replace(/<[^>]+>/g, '') // Remove HTML tags
                    .replace(/\s+/g, ' ')   // Normalize whitespace
                    .trim()
            )
        }));
    } catch (error) {
        log.error(`Failed to parse RSS data: ${error.message}`);
        throw error;
    }
}

// Load existing JSON data
function loadExistingData(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            const rawData = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(rawData);
        }
        return [];
    } catch (error) {
        log.error(`Failed to load existing data: ${error.message}`);
        return [];
    }
}

// Save JSON to file
async function saveJSONToFile(data, filePath) {
    try {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, JSON.stringify(data, null, 4), 'utf8');
    } catch (error) {
        log.error(`Failed to save JSON file: ${error.message}`);
        throw error;
    }
}

// Compare new data with existing data
function findNewItems(existingData, newData) {
    const existingTitles = new Set(existingData.map(item => item.title));
    return newData.filter(item => !existingTitles.has(item.title));
}

// Process RSS feed
async function processRSS(feedUrl, outputFilePath) {
    log.info('⏳ Starting RSS feed processing...');

    try {
        // Fetch RSS
        log.info('Fetching RSS feed...');
        const xmlData = await fetchRSSFeed(feedUrl);

        // Parse and sanitize
        log.info('Parsing and sanitizing RSS feed...');
        const newData = await parseAndSanitizeRSS(xmlData);
        log.success(`Fetched ${newData.length} item(s) from RSS feed.`);

        // Save new data snapshot
        await saveJSONToFile(newData, newDataPath);
        log.info(`New data snapshot saved. [${newData.length} items]`);

        // Load existing data
        const existingData = loadExistingData(outputFilePath);
        log.info(`Loaded existing data. [${existingData.length} items]`);

        // Save existing data snapshot
        await saveJSONToFile(existingData, existingDataPath);
        log.info('Existing data snapshot saved.');

        // Compare and save updates
        const newItems = findNewItems(existingData, newData);

        if (newItems.length > 0) {
            log.success(`🎉 Found ${newItems.length} new item(s).`);
            const updatedData = [...newItems, ...existingData];
            await saveJSONToFile(updatedData, outputFilePath);
            log.success(`Updated main JSON file with ${updatedData.length} total item(s).`);
        } else {
            log.warn('No new items found.');
        }
    } catch (error) {
        log.error(`RSS processing failed: ${error.message}`);
    }
}

// Schedule the process to run every 30 minutes
function startScheduler(feedUrl, outputFilePath, intervalMs) {
    processRSS(feedUrl, outputFilePath); // Run initially
    setInterval(() => processRSS(feedUrl, outputFilePath), intervalMs);
}

// Start the scheduler
startScheduler(feedUrl, outputFilePath, 10 * 60 * 1000); // Every 30 minutes