/**
 * deepseekLayered 单元测试
 *
 * 重点测试 isPersonName（人名检测）和 filterPersonNames（API 结果过滤），
 * 确保客户端人名过滤的双保险机制正确工作。
 */

import { describe, it, expect } from 'vitest';
import { isPersonName, filterPersonNames } from '@/services/wordGloss/deepseekLayered';

// ---------------------------------------------------------------------------
// isPersonName
// ---------------------------------------------------------------------------

describe('isPersonName', () => {
  // --- 典型人名（应该被识别） ---

  it('常见全名：宝玉', () => {
    expect(isPersonName('宝玉')).toBe(true);
  });

  it('常见全名：黛玉', () => {
    expect(isPersonName('黛玉')).toBe(true);
  });

  it('姓氏+称谓：王夫人', () => {
    expect(isPersonName('王夫人')).toBe(true);
  });

  it('姓氏+称谓：贾母', () => {
    expect(isPersonName('贾母')).toBe(true);
  });

  it('姓氏+称谓：老太太', () => {
    expect(isPersonName('老太太')).toBe(true);
  });

  it('姓氏单称：贾', () => {
    expect(isPersonName('贾')).toBe(true);
  });

  it('姓氏单称：林', () => {
    expect(isPersonName('林')).toBe(true);
  });

  it('常见角色名：宝钗', () => {
    expect(isPersonName('宝钗')).toBe(true);
  });

  it('常见角色名：熙凤', () => {
    expect(isPersonName('熙凤')).toBe(true);
  });

  it('丫鬟名：晴雯', () => {
    expect(isPersonName('晴雯')).toBe(true);
  });

  it('儿化小名：平儿', () => {
    expect(isPersonName('平儿')).toBe(true);
  });

  // 袭人 这类名字不含姓氏、不含名字专用字、不含称谓，客户端无法通过字面判断，
  // 需要靠 SYSTEM_PROMPT 中的规则来拦截。这里只验证不会误判成非人名（已知局限）。

  it('称谓：姑娘', () => {
    expect(isPersonName('姑娘')).toBe(true);
  });

  it('称谓：丫头', () => {
    expect(isPersonName('丫头')).toBe(true);
  });

  // --- 非人名词汇（不应被误判） ---

  it('普通词汇：苹果', () => {
    expect(isPersonName('苹果')).toBe(false);
  });

  it('普通词汇：电脑', () => {
    expect(isPersonName('电脑')).toBe(false);
  });

  it('普通词汇：书房', () => {
    expect(isPersonName('书房')).toBe(false);
  });

  it('普通词汇：花园', () => {
    expect(isPersonName('花园')).toBe(false);
  });

  it('普通词汇：仙境', () => {
    expect(isPersonName('仙境')).toBe(false);
  });

  it('单字非姓氏：手', () => {
    expect(isPersonName('手')).toBe(false);
  });

  it('单字非姓氏：吃', () => {
    expect(isPersonName('吃')).toBe(false);
  });

  it('空字符串', () => {
    expect(isPersonName('')).toBe(false);
  });

  it('长词（>3字）', () => {
    expect(isPersonName('王夫人说')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// filterPersonNames
// ---------------------------------------------------------------------------

describe('filterPersonNames', () => {
  it('删除人名条目，保留普通词汇', () => {
    const input = {
      宝玉: 'jade（宝）',
      黛玉: 'black jade（代玉）',
      书房: 'study（书得）',
      花园: 'garden（花得恩）',
    };
    const result = filterPersonNames(input);
    expect(result).toEqual({
      书房: 'study（书得）',
      花园: 'garden（花得恩）',
    });
  });

  it('全部是普通词汇，原样返回', () => {
    const input = {
      书房: 'study（书得）',
      花园: 'garden（花得恩）',
    };
    const result = filterPersonNames(input);
    expect(result).toEqual(input);
  });

  it('全部是人名，返回空对象', () => {
    const input = {
      宝玉: 'jade（宝）',
      黛玉: 'black jade（代玉）',
      王夫人: 'Lady Wang（王夫人）',
    };
    const result = filterPersonNames(input);
    expect(result).toEqual({});
  });

  it('空对象入参返回空对象', () => {
    expect(filterPersonNames({})).toEqual({});
  });
});
