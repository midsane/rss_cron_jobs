import Parser from 'rss-parser';
import Redis from 'ioredis';
import dotenv from 'dotenv';
dotenv.config();

const parser = new Parser({
    customFields: {
        item: [
            ['media:thumbnail', 'mediaThumbnail'],
            ['media:content', 'mediaContent'],
            ['enclosure', 'enclosure'],
        ]
    }
});
const REDIS_KEY = process.env.REDIS_KEY;
if (!REDIS_KEY) {
    console.error("REDIS_KEY is not set in the environment variables.");
    process.exit(1);
}
const redis = new Redis(REDIS_KEY);


const rssFeeds = [
    'https://feeds.bbci.co.uk/news/rss.xml',
    'https://www.thehindu.com/news/national/feeder/default.rss',
    'https://timesofindia.indiatimes.com/rssfeedstopstories.cms',
    'https://feeds.feedburner.com/ndtvnews-top-stories'
];

const QUEUE_KEY = 'news:articles';

const isToday = (dateString) => {
    const today = new Date();
    const pubDate = new Date(dateString);
    return (
        today.getUTCFullYear() === pubDate.getUTCFullYear() &&
        today.getUTCMonth() === pubDate.getUTCMonth() &&
        today.getUTCDate() === pubDate.getUTCDate()
    );
};

let count = 0;

function extractImageUrl(item) {
    if (item.mediaThumbnail?.$?.url) return item.mediaThumbnail.$.url;
    if (item.mediaContent?.$?.url) return item.mediaContent.$.url;
    if (item.enclosure?.url) return item.enclosure.url;
    return "";
}

for (const feedUrl of rssFeeds) {
    try {
        const feed = await parser.parseURL(feedUrl);
        for (const item of feed.items) {
            if (item.pubDate && isToday(item.pubDate)) {
                const article = {
                    title: item.title,
                    link: item.link,
                    pubDate: item.pubDate,
                    content: item.contentSnippet || '',
                    source: feed.title,
                    imageUrl: extractImageUrl(item)

                };
                await redis.lpush(QUEUE_KEY, JSON.stringify(article));
                count++;
            }
        }
    } catch (err) {
        console.error(`❌ Failed to fetch ${feedUrl}:`, err.message);
    }
}

console.log(`✅ Pushed ${count} articles to Redis queue "${QUEUE_KEY}".`);
await redis.quit();
