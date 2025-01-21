const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { parseStringPromise } = require('xml2js');
const { decode } = require('html-entities');

const feedUrl = 'https://www.whitehouse.gov/presidential-actions/feed/';
const outputFilePath = path.join(__dirname, 'actions', 'presidentialActions.json');
const existingDataPath = path.join(__dirname, 'actions', 'existingData.json');
const newDataPath = path.join(__dirname, 'actions', 'newData.json');

// Fetch RSS feed
async function fetchRSSFeed(feedUrl) {
    try {
        const response = await axios.get(feedUrl);
        return response.data;
    } catch (error) {
        console.error(`Error fetching RSS feed: ${error.message}`);
        throw error;
    }
}

// Parse and sanitize RSS feed
async function parseAndSanitizeRSS(xmlData) {
    try {
        const parsedData = await parseStringPromise(xmlData);
        const items = parsedData.rss.channel[0].item;

        // Map and sanitize the content
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
        console.error(`Error parsing RSS data: ${error.message}`);
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
        console.error(`Error loading existing data: ${error.message}`);
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
        console.log(`JSON data saved to ${filePath}`);
    } catch (error) {
        console.error(`Error saving JSON file: ${error.message}`);
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
    try {
        console.log('Fetching RSS feed...');
        const xmlData = await fetchRSSFeed(feedUrl);

        console.log('Parsing and sanitizing RSS data...');
        const newData = await parseAndSanitizeRSS(xmlData);

        console.log('Saving new data snapshot...');
        await saveJSONToFile(newData, newDataPath); // Save the new data for review

        console.log('Loading existing data...');
        const existingData = loadExistingData(outputFilePath);

        console.log('Saving existing data snapshot...');
        await saveJSONToFile(existingData, existingDataPath); // Save the existing data for review

        console.log('Comparing new data with existing data...');
        const newItems = findNewItems(existingData, newData);

        if (newItems.length > 0) {
            console.log(`${newItems.length} new item(s) found.`);
            const updatedData = [...newItems, ...existingData];
            await saveJSONToFile(updatedData, outputFilePath);
        } else {
            console.log('No new items found.');
        }
    } catch (error) {
        console.error('Error processing RSS:', error.message);
    }
}

// Schedule the process to run every 30 minutes
function startScheduler(feedUrl, outputFilePath, intervalMs) {
    processRSS(feedUrl, outputFilePath); // Run initially
    setInterval(() => processRSS(feedUrl, outputFilePath), intervalMs);
}

// Start the scheduler
startScheduler(feedUrl, outputFilePath, 30 * 60 * 1000); // Every 30 minutes