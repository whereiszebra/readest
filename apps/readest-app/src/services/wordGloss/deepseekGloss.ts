const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';

// Simple in-memory cache: paragraph text → {word: translation} map
const glossCache = new Map<string, Record<string, string>>();

const SYSTEM_PROMPT = `You are a Chinese content word translator. Given Chinese text, return a JSON object mapping content words (实词) to their English translations.

Rules:
- Include: nouns (名词), verbs (动词), adjectives (形容词), measure words (量词)
- Skip function words (虚词): 的/了/在/是/也/而/但/以/于/其/之/乃/则/且/所/者/也/哉/矣
- Skip proper nouns (人名地名): characters' names, place names — keep them Chinese
- Translations must reflect the sentence's context and tone
- Return ONLY valid JSON with no explanation or markdown`;

export type WordGlossMap = Record<string, string>;

export async function getWordGloss(paragraph: string, apiKey: string): Promise<WordGlossMap> {
  const cacheKey = paragraph;
  const cached = glossCache.get(cacheKey);
  if (cached) return cached;

  const response = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: paragraph },
      ],
      temperature: 0.1,
      max_tokens: 1000,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    throw new Error(`DeepSeek API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content ?? '{}';
  const result: WordGlossMap = JSON.parse(content);

  glossCache.set(cacheKey, result);
  return result;
}

export function clearGlossCache() {
  glossCache.clear();
}
