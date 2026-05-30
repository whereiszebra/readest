const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';

const cache = new Map<string, Record<string, string>>();

// ---------------------------------------------------------------------------
// 客户端人名过滤 —— DeepSeek 即使被 prompt 禁止也偶尔会翻译人名，
// 所以在拿到 API 结果后直接删除明显是人名的条目，双保险。
// ---------------------------------------------------------------------------

// 常见中文姓氏（百家姓前 100 个，覆盖 99%+ 人口）
const SURNAME_RE =
  /^(王|李|张|刘|陈|杨|赵|黄|周|吴|徐|孙|胡|朱|高|林|何|郭|马|罗|梁|宋|郑|谢|韩|唐|冯|于|董|萧|程|曹|袁|邓|许|傅|沈|曾|彭|吕|苏|卢|蒋|蔡|贾|丁|魏|薛|叶|阎|余|潘|杜|戴|夏|钟|汪|田|任|姜|范|方|石|姚|谭|廖|邹|熊|金|陆|郝|孔|白|崔|康|毛|邱|秦|江|史|顾|侯|邵|孟|龙|万|段|雷|钱|汤|尹|易|常|武|乔|贺|赖|龚|文)/;

// 人名常见后缀/称谓
const NAME_TITLE_RE =
  /(太太|夫人|小姐|公子|老爷|先生|女士|老太太|媳妇|嫂子|奶奶|爷爷|姥姥|姥爷|舅舅|姑姑|姨妈|叔叔|伯伯|婶婶|婆婆|公公|哥哥|姐姐|弟弟|妹妹|师傅|师父|师太|道长|和尚|尼姑|大侠|教主|掌门|帮主|大人|老爷|少爷|姑娘|丫头|丫鬟|嬷嬷|婆子|娘子|相公|官人|陛下|殿下|皇上|皇后|贵妃|娘娘|太子|公主|王爷|王妃|郡主|贝勒|格格|福晋|阿哥|公公|太监|侍卫|捕头|镖头|员外|秀才|举人|进士|状元|郎中|大夫|将军|元帅|军师|丞相|太师|太守|县令|知县|知府|大人)/;

// 中文名字专用字 —— 这些字在古典文学中几乎只用于人名，很少出现在普通词汇中。
// 如果 2 字词包含这些字的任何一个，且不以姓氏开头（否则已被规则 1 覆盖），
// 大概率是名字（如 黛玉→黛, 宝钗→钗, 熙凤→凤, 晴雯→雯, 鸳鸯→鸳/鸯）。
const GIVEN_NAME_CHAR_RE =
  /[钗黛雯鸳鸯凤婵娟娥媛嫔妃姬妾婢倪嫣婷婉娴淑妍妙伶俐倩琳瑶琼瑞琪瑾瑜瑛珊瑚珑玲珮环璧瑗琬琰琚玥玫瑰玉]/;

// 儿化小名：X儿 / XX儿 是中文古典小说里丫鬟/小辈的常见名字格式（平儿、凤儿、巧姐儿）
const ER_NAME_RE = /^.{1,2}儿$/;

/**
 * 判断一个中文词是否像人名。
 * 规则（按优先级）：
 *   1. 包含称谓后缀（如 X太太、X公子、姑娘、丫头）
 *   2. 单字姓氏（如 贾、林、王）
 *   3. 2-3 字，以常见姓氏开头 → 很可能是全名（如 王夫人、贾宝玉、林黛玉）
 *   4. 2-3 字，包含名字专用字（如 钗、黛、雯、鸳、鸯、凤）→ 大概率是名字
 *   5. X儿格式（如 平儿、凤儿、巧姐儿）
 */
export function isPersonName(word: string): boolean {
  if (!word || word.length > 3) return false;

  // 规则 1：包含称谓后缀
  if (NAME_TITLE_RE.test(word)) return true;

  // 规则 2：单字姓氏（在上下文中可能是称呼，如"贾说"）
  if (word.length === 1 && SURNAME_RE.test(word)) return true;

  // 规则 3：以姓氏开头的 2-3 字词（如 王夫人、贾宝玉、林黛玉）
  if (SURNAME_RE.test(word[0]!)) return true;

  // 规则 4：包含名字专用字的 2-3 字词（如 宝玉→玉、黛玉→黛、宝钗→钗、袭人、晴雯→雯）
  if (word.length >= 2 && GIVEN_NAME_CHAR_RE.test(word)) return true;

  // 规则 5：X儿 格式（如 平儿、凤儿、巧姐儿）
  if (ER_NAME_RE.test(word)) return true;

  return false;
}

/** 从 API 返回结果中删除明显是人名的条目 */
export function filterPersonNames(result: Record<string, string>): Record<string, string> {
  const filtered: Record<string, string> = {};
  for (const [cn, en] of Object.entries(result)) {
    if (isPersonName(cn)) {
      console.log('[WordGloss] filtered person name:', cn, '→', en);
    } else {
      filtered[cn] = en;
    }
  }
  return filtered;
}

const SYSTEM_PROMPT = `You help Chinese readers learn English vocabulary while reading Chinese text.

Given the full text of a page from a Chinese book, pick 3-5 Chinese words that appear MULTIPLE TIMES in the text and replace them with their English equivalents.

Selection rules (strict):
- Prioritize words that appear repeatedly (2+ times) in the text. Repeated words are the most important to learn.
- Choose moderate-difficulty vocabulary — not basics like 手→hand/水→water/吃→eat, not obscure SAT words. Aim for words a motivated learner would know or want to know.
- The English word should map naturally to the original Chinese word.

PERSON NAMES — THIS IS CRITICAL:
- Chinese person names typically consist of a surname (姓) + given name (名), e.g. 宝玉, 黛玉, 宝钗, 熙凤, 贾政, 王夫人, 林黛玉, 贾宝玉
- Common surnames include: 王, 李, 张, 刘, 陈, 杨, 赵, 黄, 周, 吴, 徐, 孙, 胡, 朱, 高, 林, 何, 郭, 马, 罗, 梁, 宋, 郑, 谢, 韩, 唐, 冯, 于, 董, 萧, 程, 曹, 袁, 邓, 许, 傅, 沈, 曾, 彭, 吕, 苏, 卢, 蒋, 蔡, 贾, 丁, 魏, 薛, 叶, 余, 潘, 杜, 戴, 夏, 钟, 汪, 田, 任, 姜, 范, 方, 石, 姚, 谭, 廖, 邹, 熊, 金, 陆, 郝, 孔, 白, 崔, 康, 毛, 邱, 秦, 江, 史, 顾, 侯, 邵, 孟, 龙, 万, 段, 雷, 钱, 汤, 尹, 易, 常, 武, 乔, 贺, 赖, 龚, 文
- Honorific titles that appear with names: 太太, 夫人, 小姐, 公子, 老爷, 先生, 老太太, 奶奶, 媳妇, 嫂子, 姑娘, 丫头, 丫鬟, 嬷嬷
- Names followed by titles (e.g. 王夫人, 林黛玉, 宝二哥, 袭人, 平儿, 鸳鸯, 晴雯) are ALL person names
- IF THE WORD IS A PERSON NAME, DO NOT SELECT IT. This is the most important rule.

Other rules:
- Skip particles and grammar words: 的/了/在/是/有/也/而/故/于/其/之/乃/则/且/不/就/都/这/那/他/她/它/们/着/过/得/地
- Skip place names and organization names.
- If no suitable repeated words found, return {}

For each selected word, append a Chinese phonetic hint (谐音) in parentheses.

Return ONLY JSON like: {"仙境": "fairyland（费尔兰）", "书房": "study（书得）"} or {}
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
      max_tokens: 300,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) throw new Error(`DeepSeek API error: ${response.status}`);

  const data = await response.json();
  const raw: Record<string, string> = JSON.parse(data.choices[0].message.content);
  const result = filterPersonNames(raw);
  cache.set(paragraph, result);
  return result;
}

export function clearVocabCache() {
  cache.clear();
}
