const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { parseStringPromise } = require('xml2js');
const { decode } = require('html-entities');

async function fetchRSSFeed(feedUrl) {
    try {
        const response = await axios.get(feedUrl);
        return response.data;
    } catch (error) {
        console.error(`Error fetching RSS feed: ${error.message}`);
        throw error;
    }
}

async function parseAndSanitizeRSS(xmlData) {
    try {
        const parsedData = await parseStringPromise(xmlData);
        const items = parsedData.rss.channel[0].item;

        // Map and sanitize the content
        return items.map(item => ({
            title: decode(item.title[0]).trim(),
            date: new Date(item.pubDate[0]).toISOString(), // Convert to ISO format
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

async function processRSS(feedUrl, outputFilePath) {
    try {
        console.log('Fetching RSS feed...');
        const xmlData = await fetchRSSFeed(feedUrl);

        console.log('Parsing and sanitizing RSS data...');
        const sanitizedData = await parseAndSanitizeRSS(xmlData);

        console.log('Saving data to file...');
        await saveJSONToFile(sanitizedData, outputFilePath);
    } catch (error) {
        console.error('Error processing RSS:', error.message);
    }
}

// Replace with the actual RSS feed URL and output path
const feedUrl = 'https://www.whitehouse.gov/presidential-actions/feed/';
const outputFilePath = path.join(__dirname, 'actions', 'presidentialActions.json');

processRSS(feedUrl, outputFilePath);