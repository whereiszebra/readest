/**
 * 测验逻辑（纯函数，不依赖 React/DOM）
 *
 * 从词库中抽取指定书的词汇，生成「看英文选中文意思」的选择题。
 */

import { wordBank, type WordRecord } from '@/app/reader/hooks/useWordGloss';

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

export interface QuizQuestion {
  /** 英文单词（题目） */
  en: string;
  /** 4 个中文选项（或更少，当候选词不足时） */
  options: QuizOption[];
}

export interface QuizOption {
  /** 中文词 */
  cn: string;
  /** 是否为正确答案 */
  isCorrect: boolean;
}

// ---------------------------------------------------------------------------
// shuffleArray — Fisher-Yates 洗牌（不修改原数组）
// ---------------------------------------------------------------------------

export function shuffleArray<T>(array: readonly T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = result[i]!;
    result[i] = result[j]!;
    result[j] = tmp;
  }
  return result;
}

// ---------------------------------------------------------------------------
// getQuizWords — 获取指定书中可测验的词汇
// ---------------------------------------------------------------------------

/**
 * 从词库中筛选出属于指定书、且未被标记为已掌握的词汇。
 * 返回的数组已随机打乱，避免每次测验顺序相同。
 */
export function getQuizWords(bookKey: string): { cn: string; record: WordRecord }[] {
  const result: { cn: string; record: WordRecord }[] = [];
  for (const [cn, record] of Object.entries(wordBank)) {
    if (record.books.includes(bookKey) && !record.mastered) {
      result.push({ cn, record });
    }
  }
  return shuffleArray(result);
}

// ---------------------------------------------------------------------------
// generateQuestion — 生成一道选择题
// ---------------------------------------------------------------------------

/**
 * 为指定词汇生成一道选择题：显示英文，从候选池中抽取 3 个干扰项（中文）。
 *
 * @param correctCn    正确中文词
 * @param correctRecord 正确词的完整记录
 * @param allBookWords 同书所有可测验词汇（来自 getQuizWords）
 * @returns 一道包含 4 个选项（或更少）的题目
 */
export function generateQuestion(
  correctCn: string,
  correctRecord: WordRecord,
  allBookWords: { cn: string; record: WordRecord }[],
): QuizQuestion {
  // 干扰项：从候选池中排除正确词自身
  const distractors = allBookWords.filter((w) => w.cn !== correctCn);

  // 随机抽最多 3 个干扰项
  const picked = shuffleArray(distractors).slice(0, 3);

  // 构建选项：1 正确 + N 干扰，再打乱顺序
  const options: QuizOption[] = [
    { cn: correctCn, isCorrect: true },
    ...picked.map((w) => ({ cn: w.cn, isCorrect: false as const })),
  ];

  return {
    en: correctRecord.en,
    options: shuffleArray(options),
  };
}
