/**
 * useWordGloss 排版回归测试
 *
 * 验证词汇注释功能不会影响行距/排版。
 *
 * 修复后的实现：
 *   wrapper 使用 display:inline（而非 inline-block），不撑大行盒高度。
 *   注释通过负值 top:-1.05em 悬浮在文字上方，利用段落 line-height 的
 *   行间空隙来容纳，不额外占用垂直空间。
 *
 * 开启/关闭功能时，文字的行间距应保持一致。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  applyRubyToNode,
  parseValue,
  hasChinese,
  groupAdjacentElements,
  exposureCount,
  wordBank,
} from '@/app/reader/hooks/useWordGloss';

// 每个测试前清空曝光计数和词库，避免测试间相互污染
beforeEach(() => {
  exposureCount.clear();
  for (const key of Object.keys(wordBank)) {
    delete wordBank[key as keyof typeof wordBank];
  }
});

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

/** 创建一个包含中文文本的 <p> 元素 */
function makePara(text: string): HTMLParagraphElement {
  const p = document.createElement('p');
  p.textContent = text;
  return p;
}

/** 从段落中找出所有 wrapper span（display:inline + position:relative） */
function findWrappers(para: HTMLElement): HTMLSpanElement[] {
  return Array.from(para.querySelectorAll<HTMLSpanElement>('span')).filter(
    (el) => el.style.display === 'inline' && el.style.position === 'relative',
  );
}

/** 从段落中找出所有 annotation span（position:absolute） */
function findAnnotations(para: HTMLElement): HTMLSpanElement[] {
  return Array.from(para.querySelectorAll<HTMLSpanElement>('span')).filter(
    (el) => el.style.position === 'absolute',
  );
}

// ---------------------------------------------------------------------------
// parseValue
// ---------------------------------------------------------------------------

describe('parseValue', () => {
  it('拆分带谐音的格式 "english（谐音）"', () => {
    expect(parseValue('apple（阿婆）')).toEqual({ en: 'apple', phonetic: '阿婆' });
  });

  it('没有谐音时 phonetic 为 null', () => {
    expect(parseValue('computer')).toEqual({ en: 'computer', phonetic: null });
  });

  it('空字符串', () => {
    expect(parseValue('')).toEqual({ en: '', phonetic: null });
  });
});

// ---------------------------------------------------------------------------
// hasChinese
// ---------------------------------------------------------------------------

describe('hasChinese', () => {
  it('纯中文返回 true', () => {
    expect(hasChinese('今天天气很好')).toBe(true);
  });

  it('中英混合返回 true', () => {
    expect(hasChinese('hello 世界')).toBe(true);
  });

  it('纯英文返回 false', () => {
    expect(hasChinese('hello world')).toBe(false);
  });

  it('空字符串返回 false', () => {
    expect(hasChinese('')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// applyRubyToNode —— 排版影响测试
// ---------------------------------------------------------------------------

describe('applyRubyToNode 排版影响', () => {
  /**
   * 修复后的 wrapper CSS：
   *   display: inline        → 不撑大行盒，行高与周围文字一致
   *   padding-top: (无)      → 不额外增加垂直空间
   *
   * 注释通过负值 top 悬浮在上方，利用段落 line-height 的行间空隙。
   *
   * 这些测试确保：
   *   1. wrapper 不会引入影响行高的 CSS 属性
   *   2. 注释采用绝对定位，不占文档流
   *   3. 如果有人把 wrapper 改回 inline-block + padding-top，测试会失败
   */

  const rubyItems = [
    { cn: '苹果', en: 'apple', phonetic: '阿婆' },
    { cn: '电脑', en: 'computer', phonetic: '可木皮特' },
  ];

  it('wrapper 使用 display:inline（不影响行盒高度）', () => {
    const para = makePara('我今天买了一个苹果和一台电脑。');
    Array.from(para.childNodes).forEach((child) => applyRubyToNode(child, rubyItems));

    const wrappers = findWrappers(para);
    expect(wrappers.length).toBeGreaterThanOrEqual(2);

    for (const w of wrappers) {
      expect(w.style.display).toBe('inline');
      // 关键断言：wrapper 不能有 padding-top（否则会撑大行盒）
      expect(w.style.paddingTop).toBe('');
    }
  });

  it('wrapper 不使用 inline-block（排版安全的保证）', () => {
    const para = makePara('苹果很好吃。');
    Array.from(para.childNodes).forEach((child) => applyRubyToNode(child, rubyItems));

    // 整个段落里不应出现任何 inline-block span
    const inlineBlocks = Array.from(para.querySelectorAll<HTMLSpanElement>('span')).filter(
      (el) => el.style.display === 'inline-block',
    );
    expect(inlineBlocks.length).toBe(0);
  });

  it('注释使用 position:absolute + 负值 top（浮在文字上方，不占文档流）', () => {
    const para = makePara('苹果很好吃。');
    Array.from(para.childNodes).forEach((child) => applyRubyToNode(child, rubyItems));

    const annotations = findAnnotations(para);
    expect(annotations.length).toBeGreaterThanOrEqual(1);

    for (const a of annotations) {
      expect(a.style.position).toBe('absolute');
      expect(a.style.top).toBe('-1.05em');
      expect(a.style.fontSize).toBe('0.6em');
      expect(a.style.opacity).toBe('0.4');
    }
  });

  it('替换后英文单词替换了原中文位置，中文只出现在注释中', () => {
    const para = makePara('苹果和电脑。');
    Array.from(para.childNodes).forEach((child) => applyRubyToNode(child, rubyItems));

    const text = para.textContent ?? '';
    expect(text).toContain('apple');
    expect(text).toContain('computer');

    const annotations = findAnnotations(para);
    expect(annotations.length).toBe(2);
    expect(annotations[0]!.textContent).toContain('苹果');
    expect(annotations[1]!.textContent).toContain('电脑');
  });

  it('同一词第二次出现时注释只显示谐音（无冒号、无中文）', () => {
    // 第一次曝光：完整格式「苹果:阿婆」
    const para1 = makePara('苹果很好吃');
    Array.from(para1.childNodes).forEach((child) =>
      applyRubyToNode(child, [{ cn: '苹果', en: 'apple', phonetic: '阿婆' }]),
    );
    const ann1 = findAnnotations(para1);
    expect(ann1[0]!.textContent).toBe('苹果:阿婆');

    // 第二次曝光：只有谐音
    const para2 = makePara('苹果也不错');
    Array.from(para2.childNodes).forEach((child) =>
      applyRubyToNode(child, [{ cn: '苹果', en: 'apple', phonetic: '阿婆' }]),
    );
    const ann2 = findAnnotations(para2);
    expect(ann2[0]!.textContent).toBe('阿婆');
    // 不应该包含冒号
    expect(ann2[0]!.textContent).not.toContain(':');
    expect(ann2[0]!.textContent).not.toContain('苹果');
  });

  it('不含中文词的段落不做任何修改', () => {
    const para = makePara('hello world');
    const originalHTML = para.innerHTML;
    Array.from(para.childNodes).forEach((child) =>
      applyRubyToNode(child, [{ cn: '苹果', en: 'apple', phonetic: '阿婆' }]),
    );
    expect(para.innerHTML).toBe(originalHTML);
  });

  it('不匹配的中文段落保持原样', () => {
    const para = makePara('今天天气很好');
    const originalHTML = para.innerHTML;
    Array.from(para.childNodes).forEach((child) =>
      applyRubyToNode(child, [{ cn: '苹果', en: 'apple', phonetic: '阿婆' }]),
    );
    expect(para.innerHTML).toBe(originalHTML);
  });
});

// ---------------------------------------------------------------------------
// 行高影响量化测试
// ---------------------------------------------------------------------------

describe('行高影响量化', () => {
  /**
   * 修复后，wrapper 不再使用 inline-block + padding-top，
   * 改用 display:inline。
   *
   * 在真实浏览器中：
   *   - display:inline 元素的高度由 line-height 决定，不由 padding 决定
   *   - 因此 wrapper 不会撑大所在行的行盒高度
   *   - 开启/关闭功能时，行间距保持一致
   *
   * jsdom 不做 CSS 布局（getBoundingClientRect 始终返回 0），
   * 所以这里通过检查 CSS 属性来验证。如需实际视觉验证，
   * 应运行 browser test（playwright）在 Chromium 中测量高度。
   */

  it('wrapper 没有 padding-top（行高不受影响）', () => {
    const para = makePara('苹果很好吃');
    Array.from(para.childNodes).forEach((child) =>
      applyRubyToNode(child, [{ cn: '苹果', en: 'apple', phonetic: '阿婆' }]),
    );

    const wrappers = findWrappers(para);
    expect(wrappers.length).toBeGreaterThan(0);

    for (const w of wrappers) {
      // wrapper 不应有任何 padding，保证行高与周围文字一致
      expect(w.style.paddingTop).toBe('');
      expect(w.style.paddingBottom).toBe('');
    }
  });

  it('wrapper 的结构里，base 文本直接占据正常位置（无额外垂直空间）', () => {
    const para = makePara('苹果很好吃');
    Array.from(para.childNodes).forEach((child) =>
      applyRubyToNode(child, [{ cn: '苹果', en: 'apple', phonetic: '阿婆' }]),
    );

    const wrappers = findWrappers(para);
    expect(wrappers.length).toBe(1);

    // wrapper 的子元素：annotation（absolute 定位） + base（正常文本流）
    const children = Array.from(wrappers[0]!.children);
    expect(children.length).toBe(2);
    // 第一个子元素是 annotation
    expect((children[0] as HTMLElement).style.position).toBe('absolute');
    // 第二个子元素是 base（inline，无特殊样式，不增加垂直空间）
    expect(children[1]!.textContent).toBe('apple');
    expect((children[1] as HTMLElement).style.cssText).toBe('');
  });

  it('没有谐音时不创建 wrapper，直接用纯文本（行高不受影响）', () => {
    const para = makePara('苹果很好吃');
    Array.from(para.childNodes).forEach((child) =>
      applyRubyToNode(child, [{ cn: '苹果', en: 'apple', phonetic: null }]),
    );

    // 没有谐音 → 不创建 wrapper → 直接用 TextNode 替换，行高完全不变
    const wrappers = findWrappers(para);
    expect(wrappers.length).toBe(0);
    expect(para.textContent).toContain('apple');
  });
});

// ---------------------------------------------------------------------------
// groupAdjacentElements —— 段落合并
// ---------------------------------------------------------------------------

describe('groupAdjacentElements', () => {
  /** 创建一个 <div> 容器，里面放几个 <p> 子元素 */
  function makeContainer(texts: string[]): HTMLDivElement {
    const div = document.createElement('div');
    for (const t of texts) {
      const p = document.createElement('p');
      p.textContent = t;
      div.appendChild(p);
    }
    return div;
  }

  it('相邻的三个段落合并为一组', () => {
    const container = makeContainer(['今天天气很好', '我去公园散步', '看到了很多花']);
    const elements = Array.from(container.querySelectorAll<HTMLElement>('p'));
    const groups = groupAdjacentElements(elements);

    expect(groups.length).toBe(1);
    expect(groups[0]!.length).toBe(3);
  });

  it('中间被非同类元素隔开，分成两组', () => {
    const container = makeContainer(['第一段', '第二段', '第三段']);
    // 在第二段和第三段之间插入一个 <div>
    const div = document.createElement('div');
    const third = container.children[2]!;
    container.insertBefore(div, third);

    const elements = Array.from(container.querySelectorAll<HTMLElement>('p'));
    const groups = groupAdjacentElements(elements);

    // 前两个 <p> 相邻 → 一组，第三个 <p> 被 <div> 隔开 → 另一组
    expect(groups.length).toBe(2);
    expect(groups[0]!.length).toBe(2);
    expect(groups[1]!.length).toBe(1);
  });

  it('单独一个元素也作为一组', () => {
    const container = makeContainer(['独自一段']);
    const elements = Array.from(container.querySelectorAll<HTMLElement>('p'));
    const groups = groupAdjacentElements(elements);

    expect(groups.length).toBe(1);
    expect(groups[0]!.length).toBe(1);
  });

  it('空数组返回空', () => {
    expect(groupAdjacentElements([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// exposureCount —— 词汇曝光计数
// ---------------------------------------------------------------------------

describe('exposureCount', () => {
  it('每次替换时累加对应中文词的计数', () => {
    const para = makePara('苹果和电脑。');
    const items = [
      { cn: '苹果', en: 'apple', phonetic: '阿婆' },
      { cn: '电脑', en: 'computer', phonetic: null },
    ];
    Array.from(para.childNodes).forEach((child) => applyRubyToNode(child, items));

    // applyRubyToNode 内部会调用 recordExposure 累加计数
    expect(exposureCount.get('苹果')).toBe(1);
    expect(exposureCount.get('电脑')).toBe(1);
  });

  it('同一个词多次出现则累加', () => {
    const para1 = makePara('苹果很好吃');
    const para2 = makePara('苹果也不错');
    const items = [{ cn: '苹果', en: 'apple', phonetic: '阿婆' }];
    Array.from(para1.childNodes).forEach((child) => applyRubyToNode(child, items));
    Array.from(para2.childNodes).forEach((child) => applyRubyToNode(child, items));

    expect(exposureCount.get('苹果')).toBe(2);
  });

  // 这是一个演示用例，模拟读完几个段落后查看曝光统计。
  // 运行后可以在 VS Code 测试输出面板看到 table 形式的报告。
  it('【演示】模拟阅读后查看曝光统计', () => {
    // 模拟：读到 3 个段落，其中"电脑"出现 3 次，"苹果"出现 2 次，"手机"出现 1 次
    const items = [
      { cn: '电脑', en: 'computer', phonetic: '可木皮特' },
      { cn: '苹果', en: 'apple', phonetic: '阿婆' },
      { cn: '手机', en: 'phone', phonetic: null },
    ];

    for (const paraText of ['电脑很好用', '苹果和电脑', '手机和电脑和苹果']) {
      const p = makePara(paraText);
      Array.from(p.childNodes).forEach((child) => applyRubyToNode(child, items));
    }

    // 打印曝光报告（process.stderr.write 绕过 vitest 的 console 过滤）
    const report = Array.from(exposureCount.entries())
      .map(([word, count]) => `${word}: ${count}次`)
      .join('\n');
    process.stderr.write(`\n===== 词汇曝光统计 =====\n${report}\n\n`);

    // 断言：电脑 3 次，苹果 2 次，手机 1 次
    expect(exposureCount.get('电脑')).toBe(3);
    expect(exposureCount.get('苹果')).toBe(2);
    expect(exposureCount.get('手机')).toBe(1);
  });

  it('达到曝光上限的词不再替换', () => {
    const items = [{ cn: '苹果', en: 'apple', phonetic: '阿婆' }];

    // 直接设定曝光计数已达到上限（MAX_EXPOSURE = 100），验证过滤逻辑
    exposureCount.set('苹果', 100);

    const para = makePara('苹果很好吃');
    Array.from(para.childNodes).forEach((child) => applyRubyToNode(child, items));
    // 段落保持原样（中文没被替换）
    expect(para.innerHTML).toBe('苹果很好吃');
    // 计数也不再增加，保持原值
    expect(exposureCount.get('苹果')).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// wordBank —— 词库持久化
// ---------------------------------------------------------------------------

describe('wordBank', () => {
  it('首次曝光时词库记录完整信息', () => {
    const para = makePara('苹果很好吃');
    Array.from(para.childNodes).forEach((child) =>
      applyRubyToNode(child, [{ cn: '苹果', en: 'apple', phonetic: '阿婆' }]),
    );

    expect(wordBank['苹果']).toEqual({ en: 'apple', phonetic: '阿婆', count: 1 });
  });

  it('多次曝光时 count 累加', () => {
    const items = [{ cn: '电脑', en: 'computer', phonetic: '可木皮特' }];
    for (let i = 0; i < 3; i++) {
      const p = makePara('电脑很好用');
      Array.from(p.childNodes).forEach((child) => applyRubyToNode(child, items));
    }

    expect(wordBank['电脑']).toEqual({ en: 'computer', phonetic: '可木皮特', count: 3 });
  });

  it('没有谐音时 phonetic 为 null', () => {
    const para = makePara('手机很好用');
    Array.from(para.childNodes).forEach((child) =>
      applyRubyToNode(child, [{ cn: '手机', en: 'phone', phonetic: null }]),
    );

    expect(wordBank['手机']).toEqual({ en: 'phone', phonetic: null, count: 1 });
  });

  it('词库与 exposureCount 保持同步', () => {
    const para = makePara('苹果和电脑');
    Array.from(para.childNodes).forEach((child) =>
      applyRubyToNode(child, [
        { cn: '苹果', en: 'apple', phonetic: '阿婆' },
        { cn: '电脑', en: 'computer', phonetic: '可木皮特' },
      ]),
    );

    // exposureCount 和 wordBank 中相同词的 count 一致
    for (const [cn, record] of Object.entries(wordBank)) {
      expect(exposureCount.get(cn)).toBe(record.count);
    }
  });
});
