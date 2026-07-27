import { Groq } from 'groq-sdk';
import { NextResponse } from 'next/server';
import { ADOBE_CATEGORIES, categoryNameToId, DEFAULT_CATEGORY_ID } from '../../../lib/adobe-categories';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const CATEGORY_NAMES = ADOBE_CATEGORIES.map((c) => c.name);
const MAX_TITLE_CHARS = 70; // Adobe hard limit, no commas allowed
const MAX_KEYWORDS = 49; // Adobe allows up to 50; keep one under as a safety margin

// ---------- Sanitizers (enforce Adobe's actual CSV rules, don't just hope the model obeys) ----------

function sanitizeTitle(raw) {
  let title = (raw || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/["'\u2018\u2019\u201C\u201D]/g, '')
    .replace(/,/g, ' ') // Adobe titles cannot contain commas
    .replace(/\s+/g, ' ')
    .trim();

  if (title.length > MAX_TITLE_CHARS) {
    title = title.slice(0, MAX_TITLE_CHARS);
    const lastSpace = title.lastIndexOf(' ');
    if (lastSpace > 40) title = title.slice(0, lastSpace); // don't cut mid-word if avoidable
    title = title.trim();
  }
  return title;
}

function sanitizeKeywords(raw) {
  let list = raw;
  if (Array.isArray(list)) list = list.join(',');
  list = (list || '').replace(/<think>[\s\S]*?<\/think>/gi, '');

  const seen = new Set();
  const cleaned = [];
  for (let word of list.split(',')) {
    word = word.trim().toLowerCase().replace(/^["'\u2018\u2019\u201C\u201D]|["'\u2018\u2019\u201C\u201D]$/g, '');
    if (!word) continue;
    if (seen.has(word)) continue; // dedupe
    seen.add(word);
    cleaned.push(word);
    if (cleaned.length >= MAX_KEYWORDS) break;
  }
  return cleaned.join(', ');
}

function buildFallback(filename, customInstructions) {
  const base = (filename || 'stock asset')
    .replace(/\.[^/.]+$/, '')
    .replace(/_\d{10,}$/, '')
    .replace(/[_-]+/g, ' ')
    .trim();

  const contextWords = (customInstructions || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2)
    .slice(0, 6);

  const keywordSet = sanitizeKeywords(
    [base, ...base.toLowerCase().split(' '), ...contextWords, 'vector', 'illustration', 'graphic resource', 'design element', 'isolated']
      .filter(Boolean)
      .join(',')
  );

  return {
    title: sanitizeTitle(`${base} vector illustration`) || 'Untitled stock asset',
    keywords: keywordSet,
    categoryId: DEFAULT_CATEGORY_ID,
  };
}

export async function POST(req) {
  let filename = 'adobe_stock_image.jpeg';
  let customInstructions = '';

  try {
    const body = await req.json();
    filename = body.filename || filename;
    customInstructions = body.customInstructions || '';
    const { imageBase64 } = body;

    if (!imageBase64) {
      return NextResponse.json({ error: 'No image data provided' }, { status: 400 });
    }

    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json(
        { error: 'GROQ_API_KEY is not set on the server. Add it in Vercel → Project Settings → Environment Variables, then redeploy.' },
        { status: 500 }
      );
    }

    // Vercel serverless function default body limit is ~4.5MB. The client compresses
    // images before sending, but guard here too so a huge upload fails fast and clearly.
    const approxBytes = (imageBase64.length * 3) / 4;
    if (approxBytes > 4_000_000) {
      return NextResponse.json(
        { error: 'Image too large after compression. Try a smaller source file.' },
        { status: 413 }
      );
    }

    const systemPrompt = `You are a senior Adobe Stock metadata specialist. Your only job is to maximize search discoverability and sales potential for the image described, while strictly following Adobe Stock's submission rules.

HARD RULES (violating these makes the output unusable):
- Title: a natural, human-readable sentence describing the image, ${MAX_TITLE_CHARS} characters or fewer, no commas, no quotes, no camera/file/technical info, no ALL CAPS, no subjective filler words like "beautiful" or "amazing".
- Keywords: comma-separated, ordered from MOST to LEAST important/relevant (Adobe's search ranking weights earlier keywords higher). 35-45 keywords. No duplicate keywords, no near-duplicate singular/plural pairs, no keyword stuffing, no technical camera data, no brand names or trademarks you cannot verify.
- Keyword coverage should span: primary subject(s), secondary objects/elements, action or concept depicted, setting/background, visual style or technique (e.g. flat design, line art, vector illustration, watercolor, 3D render, photograph), color palette, mood/emotion, and likely commercial use case (e.g. "web banner", "social media", "greeting card").
- Category: choose exactly one of these official Adobe Stock category names that best fits the image: ${CATEGORY_NAMES.join(', ')}.

User-provided batch context (use this to inform style/subject interpretation, do not just repeat it as keywords): ${customInstructions || 'None'}`;

    const response = await groq.chat.completions.create({
      model: 'qwen/qwen3.6-27b',
      reasoning_effort: 'none', // qwen3 reasons by default; combined with json_schema, the
      // schema constraint can bind to the reasoning stream and leave `content` empty.
      // Turning reasoning off keeps the structured output in `content`.
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Analyze this image and generate Adobe Stock metadata following every rule exactly.' },
            { type: 'image_url', image_url: { url: imageBase64 } },
          ],
        },
      ],
      temperature: 0.2,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'adobe_stock_metadata',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              title: { type: 'string', description: `SEO title, ${MAX_TITLE_CHARS} characters or fewer, no commas` },
              keywords: { type: 'string', description: 'Comma-separated keywords, most relevant first, 35-45 terms' },
              category: { type: 'string', enum: CATEGORY_NAMES, description: 'Best-matching Adobe Stock category name' },
            },
            required: ['title', 'keywords', 'category'],
            additionalProperties: false,
          },
        },
      },
    });

    const message = response.choices?.[0]?.message || {};
    // Some Groq reasoning models can leave `content` empty and put the actual JSON in
    // `reasoning_content` when a schema constraint interacts with the thinking stream.
    // Try content first, then fall back to reasoning_content before giving up.
    let rawContent = message.content || message.reasoning_content || '{}';
    rawContent = rawContent.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

    let parsed = {};
    let parseError = null;
    try {
      parsed = JSON.parse(rawContent);
    } catch (e) {
      parseError = e.message;
      console.error('JSON parse error:', e, rawContent);
    }

    const title = sanitizeTitle(parsed.title);
    const keywords = sanitizeKeywords(parsed.keywords);
    const categoryId = categoryNameToId(parsed.category);

    if (!title || !keywords) {
      const fb = buildFallback(filename, customInstructions);
      return NextResponse.json({
        success: true,
        isFallback: true,
        filename,
        title: fb.title,
        keywords: fb.keywords,
        categoryId: fb.categoryId,
        reason: parseError
          ? `Model response wasn't valid JSON (${parseError})`
          : 'Model returned an empty or incomplete response',
      });
    }

    return NextResponse.json({
      success: true,
      isFallback: false,
      filename,
      title,
      keywords,
      categoryId,
    });
  } catch (error) {
    console.error('Groq API error:', error);
    const fb = buildFallback(filename, customInstructions);
    return NextResponse.json({
      success: true,
      isFallback: true,
      filename,
      title: fb.title,
      keywords: fb.keywords,
      categoryId: fb.categoryId,
      reason: error?.message ? `Groq API error: ${error.message}` : 'Unknown Groq API error',
    });
  }
}
