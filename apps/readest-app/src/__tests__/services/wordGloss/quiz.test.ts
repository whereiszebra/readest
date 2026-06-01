/**
 * quiz.ts 单元测试
 *
 * 测验逻辑纯函数：getQuizWords、generateQuestion、shuffleArray。
 * 不依赖 React 或 DOM，直接用 wordBank 数据测试。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { getQuizWords, generateQuestion, shuffleArray } from '@/services/wordGloss/quiz';
import { wordBank, exposureCount } from '@/app/reader/hooks/useWordGloss';

// 每个测试前清空词库
beforeEach(() => {
  exposureCount.clear();
  for (const key of Object.keys(wordBank)) {
    delete wordBank[key as keyof typeof wordBank];
  }
});

/** 辅助函数：往词库里添加一个测试条目 */
function addWord(
  cn: string,
  en: string,
  phonetic: string | null,
  books: string[],
  mastered = false,
): void {
  wordBank[cn] = { en, phonetic, count: 1, books, mastered };
}

// ---------------------------------------------------------------------------
// getQuizWords
// ---------------------------------------------------------------------------

describe('getQuizWords', () => {
  it('只返回指定书中的词', () => {
    addWord('苹果', 'apple', '阿婆', ['book-A']);
    addWord('电脑', 'computer', '可木皮特', ['book-A']);
    addWord('手机', 'phone', null, ['book-B']);

    const words = getQuizWords('book-A');
    expect(words).toHaveLength(2);
    expect(words.map((w) => w.cn).sort()).toEqual(['电脑', '苹果']);
  });

  it('排除已掌握的词汇', () => {
    addWord('苹果', 'apple', '阿婆', ['book-A']);
    addWord('电脑', 'computer', '可木皮特', ['book-A'], true); // mastered

    const words = getQuizWords('book-A');
    expect(words).toHaveLength(1);
    expect(words[0]!.cn).toBe('苹果');
  });

  it('不存在的书返回空数组', () => {
    addWord('苹果', 'apple', '阿婆', ['book-A']);

    expect(getQuizWords('nonexistent')).toEqual([]);
  });

  it('全部已掌握时返回空数组', () => {
    addWord('苹果', 'apple', '阿婆', ['book-A'], true);
    addWord('电脑', 'computer', '可木皮特', ['book-A'], true);

    expect(getQuizWords('book-A')).toEqual([]);
  });

  it('空词库返回空数组', () => {
    expect(getQuizWords('any-book')).toEqual([]);
  });

  it('一词跨多书时正确筛选', () => {
    addWord('苹果', 'apple', '阿婆', ['book-A', 'book-B']);

    expect(getQuizWords('book-A')).toHaveLength(1);
    expect(getQuizWords('book-B')).toHaveLength(1);
    expect(getQuizWords('book-C')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// generateQuestion
// ---------------------------------------------------------------------------

describe('generateQuestion', () => {
  it('生成 4 个选项，恰好 1 个正确', () => {
    addWord('苹果', 'apple', '阿婆', ['book-A']);
    addWord('电脑', 'computer', '可木皮特', ['book-A']);
    addWord('手机', 'phone', null, ['book-A']);
    addWord('书房', 'study', '书得', ['book-A']);
    addWord('花园', 'garden', '花得恩', ['book-A']);

    const allWords = getQuizWords('book-A');
    const question = generateQuestion('苹果', wordBank['苹果']!, allWords);

    expect(question.en).toBe('apple');
    expect(question.options).toHaveLength(4);
    const correctOptions = question.options.filter((o) => o.isCorrect);
    expect(correctOptions).toHaveLength(1);
    expect(correctOptions[0]!.cn).toBe('苹果');
  });

  it('候选词不足 4 个时返回所有可用的词', () => {
    addWord('苹果', 'apple', '阿婆', ['book-A']);
    addWord('电脑', 'computer', '可木皮特', ['book-A']);

    const allWords = getQuizWords('book-A');
    const question = generateQuestion('苹果', wordBank['苹果']!, allWords);

    expect(question.options).toHaveLength(2);
    const cns = question.options.map((o) => o.cn).sort();
    expect(cns).toEqual(['电脑', '苹果']);
  });

  it('只有 1 个词时返回单选项', () => {
    addWord('苹果', 'apple', '阿婆', ['book-A']);

    const allWords = getQuizWords('book-A');
    const question = generateQuestion('苹果', wordBank['苹果']!, allWords);

    expect(question.options).toHaveLength(1);
    expect(question.options[0]!.cn).toBe('苹果');
    expect(question.options[0]!.isCorrect).toBe(true);
  });

  it('选项顺序是随机的（多次运行不总在同一位置）', () => {
    addWord('苹果', 'apple', '阿婆', ['book-A']);
    addWord('电脑', 'computer', '可木皮特', ['book-A']);
    addWord('手机', 'phone', null, ['book-A']);
    addWord('书房', 'study', '书得', ['book-A']);

    const allWords = getQuizWords('book-A');
    const positions = new Set<number>();
    for (let i = 0; i < 50; i++) {
      const question = generateQuestion('苹果', wordBank['苹果']!, allWords);
      const idx = question.options.findIndex((o) => o.isCorrect);
      positions.add(idx);
    }
    // 50 次运行至少出现 2 个不同位置（概率极低才全在同一位置）
    expect(positions.size).toBeGreaterThan(1);
  });

  it('所有选项的 cn 各不相同', () => {
    addWord('苹果', 'apple', '阿婆', ['book-A']);
    addWord('电脑', 'computer', '可木皮特', ['book-A']);
    addWord('手机', 'phone', null, ['book-A']);
    addWord('书房', 'study', '书得', ['book-A']);

    const allWords = getQuizWords('book-A');
    const question = generateQuestion('苹果', wordBank['苹果']!, allWords);

    const cns = question.options.map((o) => o.cn);
    expect(new Set(cns).size).toBe(cns.length); // 无重复
  });
});

// ---------------------------------------------------------------------------
// shuffleArray
// ---------------------------------------------------------------------------

describe('shuffleArray', () => {
  it('不修改原数组', () => {
    const original = [1, 2, 3, 4, 5];
    const copy = [...original];
    shuffleArray(original);
    expect(original).toEqual(copy);
  });

  it('返回包含相同元素的新数组', () => {
    const input = [1, 2, 3, 4, 5];
    const result = shuffleArray(input);
    expect(result.sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('空数组返回空数组', () => {
    expect(shuffleArray([])).toEqual([]);
  });

  it('单元素数组返回单元素数组', () => {
    expect(shuffleArray([42])).toEqual([42]);
  });
});
