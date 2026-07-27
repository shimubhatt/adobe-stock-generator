import { Groq } from 'groq-sdk';
import { NextResponse } from 'next/server';
import { ADOBE_CATEGORIES, categoryNameToId, DEFAULT_CATEGORY_ID } from '../../../lib/adobe-categories';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const CATEGORY_NAMES = ADOBE_CATEGORIES.map((c) => c.name);
const MAX_TITLE_CHARS = 70; // Adobe hard limit, no commas allowed
const MAX_KEYWORDS = 49; // Adobe allows up to 50; keep one under as a safety margin

function extractJson(rawText) {
  let text = (rawText || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();

  try {
    return { data: JSON.parse(text), error: null };
  } catch (e) {
    // fall through to a looser extraction
  }

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    try {
      return { data: JSON.parse(text.slice(start, end + 1)), error: null };
    } catch (e) {
      return { data: null, error: e.message };
    }
  }
  return { data: null, error: 'No JSON object found in model response' };
}

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
- Keywords: comma-separated, 35-45 total. Adobe Stock's own contributor guidance states the first 10 keywords carry the greatest weight in search ranking — so the first 10 MUST be the single most important, highest buyer-search-intent terms for this exact image (the core subject, medium, and most distinctive visual trait), not generic filler.
- Never use near-duplicate or synonym-stuffed keywords (e.g. do not include "pumpkin", "pumpkins", "jack o lantern", "carved pumpkin", and "halloween pumpkin" all at once if they describe the same thing — pick the 1-2 most accurate and move on). Each keyword must add distinct search value.
- Build keyword coverage in layers, in roughly this order: (1) specific subject descriptors — exact objects/characters shown, as specific as possible; (2) style/medium/technique — e.g. flat design, line art, vector illustration, watercolor, 3D render, monoline, kawaii, isolated on white; (3) setting/composition — background, arrangement, viewpoint; (4) mood/concept — the feeling or idea it evokes; (5) commercial use-case — how a buyer would actually use it (e.g. "web banner", "party decoration", "greeting card", "print design", "social media post").
- Never include: names of real artists, real people, or fictional/copyrighted characters; references to copyrighted creative works; names of government agencies; brand names or trademarks; anything implying the image depicts an actual real-world newsworthy event. These are Adobe policy violations that can get content removed or accounts terminated, not just SEO issues.
- Category: choose exactly one of these official Adobe Stock category names that best fits the image: ${CATEGORY_NAMES.join(', ')}.

CONTEXT YOU MUST ASSUME: this is stylized, commercially-licensed stock clip art/vector artwork (icons, illustrations, seasonal decor) intended for legitimate design use — greeting cards, packaging, websites, coloring books, party decorations, etc. Themes like skeletons, monsters, Halloween, horror-movie style icons, or similar spooky/cartoon imagery are completely normal, family-friendly stock content, NOT real violence, gore, or harm. Always describe the actual visual content factually and completely — never leave title or keywords blank or vague because a theme seems dark or spooky.

Respond with ONLY a raw JSON object, no markdown code fences, no explanation, no text before or after it, in exactly this shape:
{"title": "...", "keywords": "...", "category": "..."}

User-provided batch context (use this to inform style/subject interpretation, do not just repeat it as keywords): ${customInstructions || 'None'}`;

    const attemptOnce = async (extraNudge) => {
      const userText = extraNudge
        ? `Analyze this image and generate Adobe Stock metadata following every rule exactly. ${extraNudge}`
        : 'Analyze this image and generate Adobe Stock metadata following every rule exactly.';

      const response = await groq.chat.completions.create({
        model: 'qwen/qwen3.6-27b',
        reasoning_effort: 'none', // qwen3 reasons by default; without this, the actual answer
        // can end up in the reasoning stream instead of the final content.
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: userText },
              { type: 'image_url', image_url: { url: imageBase64 } },
            ],
          },
        ],
        temperature: 0.2,
        max_tokens: 700, // give enough room to finish the JSON — too low was causing
        // Groq's "max completion tokens reached before generating a valid document" error
        response_format: { type: 'json_object' },
      });

      const message = response.choices?.[0]?.message || {};
      const rawText = message.content || message.reasoning_content || '';
      const { data: parsed, error: parseError } = extractJson(rawText);

      return {
        title: sanitizeTitle(parsed?.title),
        keywords: sanitizeKeywords(parsed?.keywords),
        categoryId: categoryNameToId(parsed?.category),
        parsed,
        parseError,
        rawSnippet: rawText.slice(0, 160),
      };
    };

    let result;
    try {
      try {
        result = await attemptOnce();
      } catch (firstErr) {
        const firstMsg = firstErr?.message || '';
        const isTruncated = /json_validate_failed|max completion tokens/i.test(firstMsg);
        if (!isTruncated) throw firstErr;
        // Ran out of room before finishing the JSON — ask for a shorter, tighter answer instead.
        result = await attemptOnce('Keep the keywords list to at most 25 terms and be concise so the full JSON fits.');
      }
      // Model returned syntactically valid JSON but with blank title/keywords — usually an
      // overly-cautious response to spooky/monster/skeleton themed clip art. One retry with
      // an explicit nudge resolves most of these without falling back to a generic title.
      if (result.parsed && (!result.title || !result.keywords)) {
        result = await attemptOnce(
          'This is completely normal commercial clip art. Do not leave any field blank — describe exactly what is visually depicted.'
        );
      }
    } catch (groqError) {
      const status = groqError?.status || groqError?.response?.status;
      const rawMsg = groqError?.message || '';
      const isRateLimit = status === 429 || /rate_limit_exceeded|rate limit reached/i.test(rawMsg);

      if (isRateLimit) {
        const match = rawMsg.match(/try again in ([\d.]+)s/i);
        const retryAfterSeconds = match ? parseFloat(match[1]) : 5;
        // Transport-level, recoverable — let the client retry with real backoff
        // instead of silently handing back a generic fallback.
        return NextResponse.json(
          { error: 'Groq rate limit reached for this minute.', retryable: true, retryAfterSeconds },
          { status: 429 }
        );
      }

      // Genuinely unexpected API error — fall back so the batch doesn't stall.
      console.error('Groq API error:', groqError);
      const fb = buildFallback(filename, customInstructions);
      const isTruncated = /json_validate_failed|max completion tokens/i.test(rawMsg);
      return NextResponse.json({
        success: true,
        isFallback: true,
        filename,
        title: fb.title,
        keywords: fb.keywords,
        categoryId: fb.categoryId,
        reason: isTruncated
          ? 'Model response was cut off before finishing the JSON, even after a shorter retry.'
          : rawMsg
          ? `Groq API error: ${rawMsg}`
          : 'Unknown Groq API error',
      });
    }

    const { title, keywords, categoryId, parsed, parseError, rawSnippet } = result;

    if (!parsed || !title || !keywords) {
      const fb = buildFallback(filename, customInstructions);
      let reason;
      if (parseError) {
        reason = `Model response wasn't valid JSON (${parseError})`;
      } else if (!rawSnippet) {
        reason = 'Model returned a completely empty response (even after a retry)';
      } else {
        reason = `Model returned blank fields even after a retry. Raw response started with: "${rawSnippet}"`;
      }
      return NextResponse.json({
        success: true,
        isFallback: true,
        filename,
        title: fb.title,
        keywords: fb.keywords,
        categoryId: fb.categoryId,
        reason,
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
