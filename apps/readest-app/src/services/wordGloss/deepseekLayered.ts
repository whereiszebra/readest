const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';

const cache = new Map<string, Record<string, string>>();

const SYSTEM_PROMPT = `You help Chinese readers learn English vocabulary while reading Chinese text.

Given a Chinese paragraph, pick 3 to 5 words and replace them with their English equivalents inline. The sentence should remain roughly readable.

Selection rules:
- Prefer words that a reader can half-guess from context: concrete nouns, actions, emotions, vivid adjectives
- Choose intermediate vocabulary — not too trivial (书→book) but not so obscure the reader is lost
- Skip particles and grammar words: 的/了/在/是/有/也/而/故/于/其/之/乃/则/且
- Skip proper nouns: character names, place names
- Maximum 3 words per paragraph. Fewer is better — only replace words that clearly help comprehension.
- If nothing qualifies, return {}

For every selected word, append a Chinese phonetic hint (谐音) in parentheses so the reader can sound out the English word.

Return ONLY a JSON object like: {"省亲": "homecoming（好姆卡明）", "通灵": "supernatural（苏伯纳秋洛）"}
No explanation, no markdown.`;

export async function getVocabReplacements(
  paragraph: string,
  apiKey: string,
): Promise<Record<string, string>> {
  const cached = cache.get(paragraph);
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
      max_tokens: 200,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) throw new Error(`DeepSeek API error: ${response.status}`);

  const data = await response.json();
  const result: Record<string, string> = JSON.parse(data.choices[0].message.content);
  cache.set(paragraph, result);
  return result;
}

export function clearVocabCache() {
  cache.clear();
}
