import { useCallback, useEffect, useRef } from 'react';
import { FoliateView } from '@/types/view';
import { useReaderStore } from '@/store/readerStore';
import { getVocabReplacements, clearVocabCache } from '@/services/wordGloss/deepseekLayered';

// ============================================================================
// 这个文件是做什么的？
//
// 你在读一本中文电子书。这个功能会：
//   1. 看你正在读的段落
//   2. 把段落发给你配置的 AI（DeepSeek）
//   3. AI 挑出几个中文词，返回「英文翻译（谐音）」的对照表
//      比如 { "苹果": "apple（阿婆）", "电脑": "computer（可木皮特）" }
//   4. 在页面上，把这些中文词替换成英文，英文上方再飘一行小字显示「中文:谐音」
//
// 效果就是：你读中文书的时候，每隔几句就有一个词变成了英文，你自然就记住了。
// 如果不想看了，关掉开关，所有段落恢复原样。
// ============================================================================

// ---------------------------------------------------------------------------
// 第一部分：工具函数 —— 判断一段文字里有没有中文
// ---------------------------------------------------------------------------

// 这是一个「正则表达式」，你可以把它理解成一个「找中文的探测器」。
// 方括号里的范围覆盖了常用的汉字 Unicode 编码区间。
// 一-鿿  → 基本汉字区
// 㐀-䶿  → 扩展 A 区
const CJK_RE = /[一-鿿㐀-䶿]/;

// 只要字符串里包含至少一个中文字符，就返回 true
export const hasChinese = (t: string) => CJK_RE.test(t);

// ---------------------------------------------------------------------------
// 第二部分：数据结构 —— 定义我们要用到的「数据模型」
// ---------------------------------------------------------------------------

// 每个被我们处理过的段落，都要记住它的「原始 HTML」。
// 为什么？因为用户关掉功能的时候，我们需要把段落恢复成原来的样子。
// originalHTML → 段落最初的 HTML 代码
// applied      → 这个段落已经替换过了吗？（true = 已替换，false = 还没）
interface ParaData {
  originalHTML: string;
  applied: boolean;
}

// AI 返回的每条词汇翻译数据。
// 比如用户原文是「苹果」，AI 返回 "apple（阿婆）"，
// 那么 cn="苹果", en="apple", phonetic="阿婆"
// TODO:让claude 解释这个RubyItem的名字为啥要用 Ruby
interface RubyItem {
  cn: string; // 中文原词（Chinese）
  en: string; // 英文翻译（English）
  phonetic: string | null; // 谐音（英文发音用中文标注），可以为空
}

// ---------------------------------------------------------------------------
// 第三部分：解析 AI 返回的数据格式
// ---------------------------------------------------------------------------

// AI 返回的格式是 "english（谐音）"，比如 "apple（阿婆）" 或 "hello（哈喽）"。
// 这个函数把它拆成两部分：英文 和 谐音。
//
// 举例：
//   parseValue("apple（阿婆）") → { en: "apple", phonetic: "阿婆" }
//   parseValue("computer")      → { en: "computer", phonetic: null }（没有括号就没有谐音）
export function parseValue(val: string): { en: string; phonetic: string | null } {
  // 正则：匹配「任意字符（任意字符）」这个模式
  // (.+?)   → 英文部分（括号外面的内容）
  // （.+?） → 谐音部分（中文括号里的内容）
  const m = val.match(/^(.+?)（(.+?)）$/);
  // 如果匹配成功，返回拆开的两部分；否则整个 val 就是英文，谐音为空
  return m ? { en: m[1]!, phonetic: m[2]! } : { en: val, phonetic: null };
}

// ---------------------------------------------------------------------------
// 第四部分：DOM 操作 —— 在页面上把中文词替换成「英文 + 上方注释」
// ---------------------------------------------------------------------------

// 这是整个文件最核心的函数。
// 它的任务：遍历一个 HTML 节点，找到里面所有的文本，
// 如果文本里出现了 AI 给的中文词，就用「英文 + 注释」的结构替换掉。
//
// 通俗地说：把一锅白米饭里零星几粒米换成红豆，红豆上面还贴个小标签。
//
// 参数说明：
//   node  → 要处理的 HTML 节点（可能是一段文字、一个列表项等等）
//   items → AI 返回的词汇对照表，比如 [{cn:"苹果", en:"apple", phonetic:"阿婆"}, ...]
export function applyRubyToNode(node: Node, items: RubyItem[]): void {
  // ------------------------------------------------------------------
  // 情况 A：这个节点是「纯文本节点」（比如 <p> 里的文字内容）
  // ------------------------------------------------------------------
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? '';

    // 快速检查：这段文本里有没有我们要替换的中文词？
    // 如果完全没有，直接跳过，不浪费性能。
    if (!items.some(({ cn }) => text.includes(cn))) return;

    // doc → 当前文档对象，用来创建新的 HTML 元素
    const doc = node.ownerDocument ?? document;
    // frag → 一个「临时篮子」，我们把替换后的一堆东西先放进去，最后一次性替换原文
    const frag = doc.createDocumentFragment();
    // rest → 还没处理的剩余文本，一开始是整个文本，处理一点就切掉一点
    let rest = text;

    // 循环处理：每次找到文本里「位置最靠前」的一个中文词，把它替换掉
    // 替换完后继续处理后面的文本，直到整段文本处理完。
    while (rest.length > 0) {
      // 在所有 AI 给的词里，找「在 rest 中最早出现」的那一个
      // best 记录：{ idx: 出现的位置, item: 对应的词汇数据 }
      let best: { idx: number; item: RubyItem } | null = null;
      for (const item of items) {
        const idx = rest.indexOf(item.cn);
        // 如果找到了，而且它比当前 best 更靠前，就更新 best
        if (idx !== -1 && (!best || idx < best.idx)) best = { idx, item };
      }

      // 如果找不到任何匹配的中文词了，把剩余的文本原样放入篮子，结束循环
      if (!best) {
        frag.appendChild(doc.createTextNode(rest));
        break;
      }

      // 如果中文词前面还有普通文字（比如 "我吃了[苹果]很好吃" 里的 "我吃了"），
      // 先把前面的普通文字原样放进篮子
      if (best.idx > 0) frag.appendChild(doc.createTextNode(rest.slice(0, best.idx)));

      // ------------------------------------------------------------------
      // 到了关键步骤：把找到的中文词替换掉
      // ------------------------------------------------------------------

      if (best.item.phonetic) {
        // --- 有谐音的情况：创建一个「英文 + 上方注释」的结构 ---
        //
        // 最终渲染效果（用户看到的）：
        //
        //     苹果:阿婆        ← 灰色小字，悬浮在英文上方
        //     apple            ← 英文单词，替换了原来的「苹果」
        //
        // HTML 结构（三个 <span> 嵌套）：
        //
        // <span class="wrapper">           ← 外层容器（inline + relative，不改变行高）
        //   <span class="annotation">      ← 注释层（绝对定位，飘在上方）
        //     苹果:阿婆
        //   </span>
        //   <span class="base">            ← 英文层（占据正常位置）
        //     apple
        //   </span>
        // </span>
        //
        // 排版要点：
        //   wrapper 使用 display:inline（而非 inline-block），这样它不
        //   会撑大所在行的行盒高度，开启/关闭功能时行间距保持一致。
        //   注释通过负值 top 悬浮在文字上方，利用段落本身的 line-height
        //   提供的行间空隙来容纳，不额外占用垂直空间。

        // ① 外层容器 wrapper
        //    - display:inline：不撑大行盒，保持与周围文字一致的行高
        //    - position:relative：作为注释层绝对定位的锚点
        //    - white-space:nowrap：英文单词不换行
        const wrapper = doc.createElement('span');
        wrapper.style.cssText =
          'display:inline;position:relative;white-space:nowrap;vertical-align:baseline;';

        // ② 注释层 annotation（英文上方的小字）
        //    - position:absolute：脱离文档流，不占垂直空间
        //    - top:-1.05em：负值 → 注释浮在 wrapper 上方（利用行间空隙）
        //    - left:50% + translateX(-50%)：水平居中
        //    - font-size:0.6em：字号是英文的 60%，很小，不抢眼
        //    - opacity:0.4：半透明，像水印一样淡
        const annotation = doc.createElement('span');
        annotation.textContent = `${best.item.cn}:${best.item.phonetic}`;
        annotation.style.cssText =
          'position:absolute;top:-1.05em;left:50%;transform:translateX(-50%);font-size:0.6em;opacity:0.4;white-space:nowrap;letter-spacing:0;line-height:1.3;';

        // ③ 英文层 base（占据正常位置，替换掉原来的中文词）
        const base = doc.createElement('span');
        base.textContent = best.item.en;

        // ④ 按顺序组装：注释在上 → 英文在下 → 放进篮子
        wrapper.appendChild(annotation);
        wrapper.appendChild(base);
        frag.appendChild(wrapper);
      } else {
        // --- 没有谐音的情况：直接用纯文本英文替换 ---
        // 比如 AI 只返回了 "the"，没有谐音，那就直接放 "the" 进去
        frag.appendChild(doc.createTextNode(best.item.en));
      }

      // 切掉已经处理过的部分，继续处理剩余文本
      // 比如原文 "我吃了苹果很好吃"，已经处理了 "苹果"（位置 3，长度 2），
      // 那么 rest 变成 "很好吃"，继续下一轮循环
      rest = rest.slice(best.idx + best.item.cn.length);
    }

    // 用篮子里的内容（已替换好的）替换掉原来的文本节点
    node.parentNode?.replaceChild(frag, node);
  } else {
    // ------------------------------------------------------------------
    // 情况 B：这个节点不是纯文本，而是容器节点（比如 <p>、<div>、<span>）
    //         那就递归处理它的每一个子节点
    // ------------------------------------------------------------------
    // Array.from 把「活的子节点列表」快照成一个固定数组，
    // 防止在遍历过程中因为替换操作导致列表变化，引发 bug
    Array.from(node.childNodes).forEach((child) => applyRubyToNode(child, items));
  }
}

// ---------------------------------------------------------------------------
// 第五部分：React Hook —— 把上面的功能串联起来，对接 React 组件
// ---------------------------------------------------------------------------

// 这是暴露给外部使用的 Hook（React 的「功能钩子」）。
// 外部组件调用它，传进来一本书的标识和阅读器视图，它就自动干活了。
//
// 参数：
//   bookKey → 书的唯一标识（比如 "book-123"），用来找到这本书的设置
//   view    → 阅读器视图对象（包含渲染器，能拿到当前显示的文档内容）
export function useWordGloss(bookKey: string, view: FoliateView | HTMLElement | null): void {
  // --- 5a. 读取用户设置 ---
  // 从全局状态里拿到这本书的阅读设置，包括「词汇注释开关」是开还是关
  const { getViewSettings } = useReaderStore();
  const viewSettings = getViewSettings(bookKey);
  const enabledRef = useRef(viewSettings?.wordGlossEnabled ?? false);

  // --- 5b. API Key（从环境变量里读） ---
  // 这是在 .env.local 文件里配置的 DeepSeek API 密钥
  const apiKey = process.env['NEXT_PUBLIC_DEEPSEEK_WORD_GLOSS_KEY'] ?? '';

  // --- 5c. 数据仓库 ---
  // 一个 Map（键值对仓库），用来记住每个段落的原始 HTML。
  // 键 = 页面上的段落元素（HTMLElement）
  // 值 = { originalHTML, applied }
  // 为什么用 useRef？因为这个 Map 不需要触发 React 重渲染，只是自己记着用。
  const dataMap = useRef(new Map<HTMLElement, ParaData>());

  // --- 5d. 应用替换：把 AI 返回的结果写入页面 ---
  //
  // 输入：el（页面上的一个段落元素）, replacements（AI 返回的对照表）
  // 比如 replacements = { "苹果": "apple（阿婆）", "电脑": "computer（可木皮特）" }
  //
  // 做的事情：
  //   1. 把 replacements 解析成 RubyItem 数组
  //   2. 遍历段落的每个子节点，找到中文词就替换
  const applyReplacements = useCallback((el: HTMLElement, replacements: Record<string, string>) => {
    const items: RubyItem[] = Object.entries(replacements).map(([cn, val]) => {
      const { en, phonetic } = parseValue(val);
      return { cn, en, phonetic };
    });
    Array.from(el.childNodes).forEach((child) => applyRubyToNode(child, items));
  }, []);

  // --- 5e. 预取并处理一个段落（prefetch） ---
  //
  // 这是「触发 AI 处理」的入口函数。
  // 当一个段落滚动进用户视野时，这个函数被调用。
  //
  // 流程：
  //   1. 检查这个段落是不是已经处理过了（避免重复调用 AI，浪费钱和时间）
  //   2. 取文本内容，跳过太短的、没中文的
  //   3. 保存原始 HTML（为了以后恢复）
  //   4. 发请求给 AI，拿到对照表
  //   5. 在页面上做替换
  //   6. 标记为「已处理」
  const prefetch = useCallback(
    async (el: HTMLElement) => {
      // 查一下这个段落有没有记录
      const existing = dataMap.current.get(el);
      // 如果已经处理过了，直接跳过
      if (existing?.applied) return;

      // 取文本内容，去掉首尾空白
      const text = el.textContent?.trim() ?? '';
      // 过滤：没内容的不处理、没中文的不处理、太短的不处理（不到 4 个字不值得）
      if (!text || !hasChinese(text) || text.length < 4) return;

      // 保存原始 HTML（如果之前没保存过的话）
      const originalHTML = existing?.originalHTML ?? el.innerHTML;
      dataMap.current.set(el, { originalHTML, applied: false });

      try {
        // 调用 AI 服务，拿到词汇对照表
        // getVocabReplacements 内部会：检查缓存 → 缓存有就直接返回 → 没有就调 DeepSeek API
        const replacements = await getVocabReplacements(text, apiKey);
        // 如果 AI 确实返回了要替换的词（对照表不为空），就替换
        if (Object.keys(replacements).length > 0) {
          applyReplacements(el, replacements);
        }
        // 标记为「已处理」
        dataMap.current.set(el, { originalHTML, applied: true });
      } catch (err) {
        // API 调用失败也不影响阅读，静默处理，只是在控制台留个记录方便排查
        console.warn('[WordGloss] prefetch failed:', err);
      }
    },
    [apiKey, applyReplacements],
  );

  // --- 5f. 恢复所有段落 ---
  //
  // 当用户关掉「词汇注释」开关时调用。
  // 遍历所有处理过的段落，把它们的 innerHTML 恢复成最初保存的原始 HTML。
  // applied 也重置为 false，这样下次打开开关时能重新处理。
  const restoreAll = useCallback(() => {
    dataMap.current.forEach((data, el) => {
      el.innerHTML = data.originalHTML;
      dataMap.current.set(el, { originalHTML: data.originalHTML, applied: false });
    });
  }, []);

  // --- 5g. 彻底重置（换书时调用） ---
  //
  // 和 restoreAll 的区别：
  //   restoreAll → 恢复文字，但保留记录（下次打开开关还能用）
  //   resetAll   → 恢复文字，同时清空所有记录（相当于「从头来过」）
  // 另外还会清除 AI 返回结果的缓存。
  const resetAll = useCallback(() => {
    dataMap.current.forEach((data, el) => {
      el.innerHTML = data.originalHTML;
    });
    dataMap.current.clear();
    clearVocabCache();
  }, []);

  // -------------------------------------------------------------------------
  // 第六部分：useEffect —— 页面加载时自动开始监听段落
  // -------------------------------------------------------------------------
  //
  // 这个 useEffect 在「书被打开 / view 对象变化」时执行。
  // 它做了三件事：
  //   1. 用 IntersectionObserver 监听段落是否出现在屏幕上
  //   2. 段落进入视野 → 自动触发 prefetch
  //   3. 书关闭 / 切换时，清理所有监听和替换
  useEffect(() => {
    // 如果没有 view，或者 view 没有 renderer（渲染器还没初始化），就什么也不做
    if (!view || !('renderer' in view)) return;

    const foliateView = view as FoliateView;

    // --- IntersectionObserver（交叉观察器） ---
    // 这是浏览器自带的能力：监视一个元素有没有进入屏幕。
    //
    // 通俗解释：
    //   你在读一本书，屏幕只能显示一部分内容。
    //   Observer 就像一个「哨兵」，盯着书里的每个段落。
    //   当某个段落滚动到屏幕范围内时，哨兵就喊：「这个段落进来了！」
    //   然后我们就对这个段落调用 prefetch，发 AI 请求处理它。
    //
    // threshold: 0 的意思是「只要段落有一丁点出现在屏幕上就算进入了」。
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          // entry.isIntersecting → true 表示这个元素进入屏幕了
          // enabledRef.current   → 用户是不是开着词汇注释功能
          // 两个条件都满足时，才触发预取
          if (entry.isIntersecting && enabledRef.current) {
            prefetch(entry.target as HTMLElement);
          }
        }
      },
      { threshold: 0 },
    );

    // --- 把 observer 绑定到文档里的每个段落 ---
    //
    // 一本书打开后，渲染器会生成 HTML 文档（Document）。
    // 我们在这份文档里找到所有值得处理的元素：
    //   p         → 普通段落
    //   li        → 列表项
    //   blockquote → 引用块
    //   dd        → 描述列表的描述项
    //
    // 然后对每个元素：
    //   1. 检查文本是否够长（>4 字）且包含中文
    //   2. 保存它的原始 HTML（如果还没保存）
    //   3. 让 observer 开始盯着它
    const attachToDoc = (doc: Document) => {
      doc.querySelectorAll<HTMLElement>('p, li, blockquote, dd').forEach((el) => {
        const text = el.textContent?.trim() ?? '';
        if (text.length > 4 && hasChinese(text)) {
          if (!dataMap.current.has(el)) {
            dataMap.current.set(el, { originalHTML: el.innerHTML, applied: false });
          }
          observer.observe(el);
        }
      });
    };

    // --- 当书本内容加载完毕时 ---
    // 重置所有旧数据（换书 / 翻章节时会触发）
    // 然后拿到渲染器当前渲染的所有文档，逐个绑定 observer
    const onLoad = () => {
      resetAll();
      const contents = foliateView.renderer?.getContents?.() ?? [];
      for (const { doc } of contents) attachToDoc(doc);
    };

    // 监听「内容加载完毕」事件
    foliateView.addEventListener('load', onLoad);

    // 如果内容已经加载了（事件不会重复触发），直接处理当前已渲染的文档
    const contents = foliateView.renderer?.getContents?.() ?? [];
    for (const { doc } of contents) attachToDoc(doc);

    // --- 清理函数 ---
    // 当书关闭、切换、或组件卸载时执行。
    // 把该清理的都清理干净：
    //   1. 移除事件监听
    //   2. 断开 observer（不再盯着段落）
    //   3. 恢复所有被替换的段落文字
    return () => {
      foliateView.removeEventListener('load', onLoad);
      observer.disconnect();
      resetAll();
    };
  }, [view, prefetch, resetAll]);

  // -------------------------------------------------------------------------
  // 第七部分：useEffect —— 响应用户开关「词汇注释」功能
  // -------------------------------------------------------------------------
  //
  // 这个 useEffect 监听 viewSettings.wordGlossEnabled 的值。
  // wordGlossEnabled 是用户在设置面板里那个开关按钮的状态。
  //
  //   true  → 用户打开了功能
  //   false → 用户关闭了功能
  //
  // 打开时：对所有已记录的段落重新调用 prefetch
  // 关闭时：调用 restoreAll，把所有段落恢复成原始中文
  useEffect(() => {
    if (!viewSettings) return;
    const enabled = viewSettings.wordGlossEnabled ?? false;
    enabledRef.current = enabled;

    if (!enabled) {
      // 关掉 → 恢复原文
      restoreAll();
    } else {
      // 打开 → 重新处理所有已记录的段落
      dataMap.current.forEach((_, el) => prefetch(el));
    }
  }, [viewSettings?.wordGlossEnabled, restoreAll, prefetch]);
}
