import { Groq } from 'groq-sdk';
import { NextResponse } from 'next/server';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export async function POST(req) {
  try {
    const body = await req.json();
    const { imageBase64, customInstructions, filename } = body;

    if (!imageBase64) {
      return NextResponse.json(
        { error: 'No image data provided' },
        { status: 400 }
      );
    }

    // Clean, direct prompt that vision models handle easily without JSON mode crashing
    const promptText = `Analyze the objects, elements, and style in this image carefully for Adobe Stock metadata.
Provide the response in EXACTLY two lines like this:

Title: [Write a clear descriptive title under 70 characters]
Keywords: [Write 30 to 45 comma-separated keywords describing the subject, elements, colors, and style]

Do NOT add any extra text or thinking tags outside this format.`;

    const finalPrompt = customInstructions 
      ? `${promptText}\nContext Hint: ${customInstructions}`
      : promptText;

    const response = await groq.chat.completions.create({
      model: 'qwen/qwen3.6-27b',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: finalPrompt },
            { type: 'image_url', image_url: { url: imageBase64 } }
          ],
        },
      ],
      temperature: 0.2,
      max_tokens: 800,
    });

    let rawText = response.choices[0]?.message?.content || '';

    // Remove any <think> tags if present
    rawText = rawText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

    // Extract Title and Keywords using Regex
    const titleMatch = rawText.match(/Title:\s*(.+)/i);
    const keywordsMatch = rawText.match(/Keywords:\s*(.+)/i);

    const title = titleMatch ? titleMatch[1].trim() : '';
    const keywords = keywordsMatch ? keywordsMatch[1].trim() : '';

    // If parsing worked correctly
    if (title || keywords) {
      return NextResponse.json({
        success: true,
        filename: filename || 'adobe_stock_image.jpeg',
        title: title || `${filename.replace(/_/g, ' ')} Vector`,
        keywords: keywords,
        category: 'Graphic Resources',
      });
    }

    // Fallback if formatting was slightly off
    return NextResponse.json({
      success: true,
      filename: filename || 'adobe_stock_image.jpeg',
      title: rawText.split('\n')[0] || 'Adobe Stock Graphic',
      keywords: rawText.replace(/\n/g, ', '),
      category: 'Graphic Resources',
    });

  } catch (error) {
    console.error('Groq API Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate metadata' },
      { status: 500 }
    );
  }
}
