/**
 * Instagram Carousel Automation
 * Runs daily at 08:00 UK time via cron
 * Stack: Node.js, Anthropic Claude Haiku, Unsplash, Instagram Graph API
 */

const cron = require('node-cron');
const Anthropic = require('@anthropic-ai/sdk');
const fetch = require('node-fetch');

// ── Config ──────────────────────────────────────────────────────────────────
const ANTHROPIC_API_KEY      = process.env.ANTHROPIC_API_KEY;
const UNSPLASH_ACCESS_KEY    = process.env.UNSPLASH_ACCESS_KEY;
const INSTAGRAM_ACCOUNT_ID   = process.env.INSTAGRAM_ACCOUNT_ID;
const INSTAGRAM_ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN;

const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1080&q=80';

const TOPICS = {
  0: 'Mindset and consistency',
  1: 'Compound movement mechanics',
  2: 'Progressive overload',
  3: 'Nutrition timing',
  4: 'Recovery science',
  5: 'Common training mistakes',
  6: 'Programme structure',
};

// ── Utilities ────────────────────────────────────────────────────────────────
function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchWithRetry(url, options = {}, retries = 3) {
  for (let i = 1; i <= retries; i++) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status}: ${body}`);
      }
      return res;
    } catch (err) {
      log(`Attempt ${i}/${retries} failed for ${url} — ${err.message}`);
      if (i === retries) throw err;
      await sleep(2000 * i);
    }
  }
}

// ── Step 1: Generate content with Claude Haiku ────────────────────────────
async function generateContent(topic) {
  log(`Step 1: Generating content — topic: "${topic}"`);
  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  const prompt = `You are a personal trainer content writer. Create Instagram carousel content on: "${topic}".

Return ONLY valid JSON — no markdown fences, no explanation. Schema:
{
  "slides": [
    { "headline": "under 8 words", "body": "1-2 sentences, concrete coaching cue", "image_query": "specific fitness keyword" }
  ],
  "caption": "under 150 words, professional tone",
  "hashtags": "#tag1 #tag2 ... (15-20 tags)"
}

Rules:
- 5 slides exactly
- Voice: professional, sharp, human, calm authority — no hype, no wellness fluff
- Every slide = 1 observation, cue, or next step
- image_query = specific (e.g. "barbell squat gym" not "fitness")`;

  const message = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = message.content[0].text.trim();
  const content = JSON.parse(raw);

  if (!content.slides || content.slides.length !== 5) throw new Error('Expected 5 slides from Claude');
  if (!content.caption || content.caption.length < 10) throw new Error('Caption is empty or too short');

  log(`Step 1 ✓ — caption ${content.caption.length} chars, ${content.hashtags.split('#').length - 1} hashtags`);
  return content;
}

// ── Step 2: Fetch images from Unsplash ───────────────────────────────────
async function fetchImages(slides) {
  log('Step 2: Fetching images from Unsplash');
  const urls = [];

  for (const slide of slides) {
    try {
      const query = encodeURIComponent(slide.image_query);
      const res = await fetchWithRetry(
        `https://api.unsplash.com/search/photos?query=${query}&per_page=3&orientation=squarish`,
        { headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` } }
      );
      const data = await res.json();
      const url = data.photos?.[0]?.urls?.regular || FALLBACK_IMAGE;
      urls.push(url);
      log(`  Image ${urls.length}: ${url.substring(0, 60)}...`);
    } catch (err) {
      log(`  Image ${urls.length + 1} fetch failed — using fallback. ${err.message}`);
      urls.push(FALLBACK_IMAGE);
    }
  }

  log(`Step 2 ✓ — ${urls.length} images ready`);
  return urls;
}

// ── Step 3: Upload individual carousel items ─────────────────────────────
async function uploadCarouselItems(imageUrls) {
  log('Step 3: Uploading carousel items to Instagram');
  const containerIds = [];

  for (let i = 0; i < imageUrls.length; i++) {
    const res = await fetchWithRetry(
      `https://graph.facebook.com/v20.0/${INSTAGRAM_ACCOUNT_ID}/media`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_url: imageUrls[i],
          is_carousel_item: true,
          access_token: INSTAGRAM_ACCESS_TOKEN,
        }),
      }
    );
    const data = await res.json();
    if (!data.id) throw new Error(`No container ID returned for image ${i + 1}: ${JSON.stringify(data)}`);
    containerIds.push(data.id);
    log(`  Container ${i + 1}/5 created: ${data.id}`);
  }

  if (containerIds.length < 2) throw new Error(`Only ${containerIds.length} containers created — Instagram requires minimum 2`);
  log(`Step 3 ✓ — ${containerIds.length} containers uploaded`);
  return containerIds;
}

// ── Step 4: Create carousel container ────────────────────────────────────
async function createCarouselContainer(containerIds, caption, hashtags) {
  log('Step 4: Creating carousel container');

  const fullCaption = `${caption}\n\n${hashtags}`;
  const res = await fetchWithRetry(
    `https://graph.facebook.com/v20.0/${INSTAGRAM_ACCOUNT_ID}/media`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        media_type: 'CAROUSEL',
        children: containerIds.join(','),
        caption: fullCaption,
        access_token: INSTAGRAM_ACCESS_TOKEN,
      }),
    }
  );

  const data = await res.json();
  if (!data.id) throw new Error(`No carousel container ID returned: ${JSON.stringify(data)}`);
  log(`Step 4 ✓ — carousel container: ${data.id}`);
  return data.id;
}

// ── Step 5: Publish ───────────────────────────────────────────────────────
async function publishCarousel(carouselContainerId) {
  log('Step 5: Publishing carousel (waiting 8s for containers to be ready)');
  await sleep(8000);

  const res = await fetchWithRetry(
    `https://graph.facebook.com/v20.0/${INSTAGRAM_ACCOUNT_ID}/media_publish`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        creation_id: carouselContainerId,
        access_token: INSTAGRAM_ACCESS_TOKEN,
      }),
    }
  );

  const data = await res.json();
  if (!data.id) throw new Error(`Publish failed: ${JSON.stringify(data)}`);
  log(`Step 5 ✓ — post published: ${data.id}`);
  return data.id;
}

// ── Main orchestrator ─────────────────────────────────────────────────────
async function runCarouselPost() {
  const startTime = new Date();
  // Use UK day-of-week (account for BST/GMT via UTC offset)
  const ukNow = new Date(startTime.toLocaleString('en-GB', { timeZone: 'Europe/London' }));
  const dayOfWeek = ukNow.getDay();
  const topic = TOPICS[dayOfWeek];

  log(`═══ Instagram Carousel Run — ${topic} ═══`);

  try {
    // Validate env vars
    for (const [k, v] of Object.entries({ ANTHROPIC_API_KEY, UNSPLASH_ACCESS_KEY, INSTAGRAM_ACCOUNT_ID, INSTAGRAM_ACCESS_TOKEN })) {
      if (!v) throw new Error(`Missing environment variable: ${k}`);
    }

    const content    = await generateContent(topic);
    const imageUrls  = await fetchImages(content.slides);
    const containers = await uploadCarouselItems(imageUrls);
    const carouselId = await createCarouselContainer(containers, content.caption, content.hashtags);
    const postId     = await publishCarousel(carouselId);

    const hashtagCount = content.hashtags.split('#').length - 1;
    log(`✓ Carousel posted at ${startTime.toISOString()}. Topic: ${topic}. 5 images, ${content.caption.length} chars, ${hashtagCount} tags. Post ID: ${postId}`);

  } catch (err) {
    log(`✗ CAROUSEL FAILED — ${err.message}`);
    log(err.stack);
    process.exitCode = 1;
  }
}

// ── Scheduler: 08:00 UK (Europe/London handles BST/GMT automatically) ─────
// Cron TZ support: runs at 08:00 Europe/London every day
log('Instagram Carousel Automation started. Cron: 08:00 Europe/London daily.');

cron.schedule('0 8 * * *', () => {
  runCarouselPost();
}, {
  timezone: 'Europe/London',
});

// Health-check endpoint (Railway / Render need a port to stay alive)
const http = require('http');
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200);
  res.end(JSON.stringify({ status: 'ok', next: 'daily 08:00 Europe/London' }));
}).listen(PORT, () => log(`Health check listening on port ${PORT}`));

// Allow manual trigger via env var for testing
if (process.env.RUN_NOW === 'true') {
  log('RUN_NOW=true detected — executing immediately');
  runCarouselPost();
}
