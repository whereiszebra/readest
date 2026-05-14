import { useCallback, useEffect, useRef } from 'react';
import { FoliateView } from '@/types/view';
import { useReaderStore } from '@/store/readerStore';
import { getVocabReplacements, clearVocabCache } from '@/services/wordGloss/deepseekLayered';

const CJK_RE = /[一-鿿㐀-䶿]/;
const hasChinese = (t: string) => CJK_RE.test(t);

interface ParaData {
  originalHTML: string;
  applied: boolean;
}

interface RubyItem {
  cn: string;
  en: string;
  phonetic: string | null;
}

// Parse "english（谐音）" → { en, phonetic }
function parseValue(val: string): { en: string; phonetic: string | null } {
  const m = val.match(/^(.+?)（(.+?)）$/);
  return m ? { en: m[1]!, phonetic: m[2]! } : { en: val, phonetic: null };
}

// Walk text nodes and replace Chinese words with <ruby> elements in-place
function applyRubyToNode(node: Node, items: RubyItem[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? '';
    if (!items.some(({ cn }) => text.includes(cn))) return;

    const doc = node.ownerDocument ?? document;
    const frag = doc.createDocumentFragment();
    let rest = text;

    while (rest.length > 0) {
      let best: { idx: number; item: RubyItem } | null = null;
      for (const item of items) {
        const idx = rest.indexOf(item.cn);
        if (idx !== -1 && (!best || idx < best.idx)) best = { idx, item };
      }

      if (!best) {
        frag.appendChild(doc.createTextNode(rest));
        break;
      }

      if (best.idx > 0) frag.appendChild(doc.createTextNode(rest.slice(0, best.idx)));

      if (best.item.phonetic) {
        const wrapper = doc.createElement('span');
        wrapper.style.cssText =
          'display:inline-flex;flex-direction:column;align-items:center;vertical-align:bottom;white-space:nowrap;line-height:1;';
        const annotation = doc.createElement('span');
        annotation.textContent = `${best.item.cn}:${best.item.phonetic}`;
        annotation.style.cssText = 'font-size:0.6em;opacity:0.4;letter-spacing:0;line-height:1.3;';
        const base = doc.createElement('span');
        base.textContent = best.item.en;
        wrapper.appendChild(annotation);
        wrapper.appendChild(base);
        frag.appendChild(wrapper);
      } else {
        frag.appendChild(doc.createTextNode(best.item.en));
      }

      rest = rest.slice(best.idx + best.item.cn.length);
    }

    node.parentNode?.replaceChild(frag, node);
  } else {
    // Snapshot children before walking to avoid live-collection issues
    Array.from(node.childNodes).forEach((child) => applyRubyToNode(child, items));
  }
}

export function useWordGloss(bookKey: string, view: FoliateView | HTMLElement | null): void {
  const { getViewSettings } = useReaderStore();
  const viewSettings = getViewSettings(bookKey);
  const enabledRef = useRef(viewSettings?.wordGlossEnabled ?? false);

  const apiKey = process.env['NEXT_PUBLIC_DEEPSEEK_WORD_GLOSS_KEY'] ?? '';
  const dataMap = useRef(new Map<HTMLElement, ParaData>());

  const applyReplacements = useCallback((el: HTMLElement, replacements: Record<string, string>) => {
    const items: RubyItem[] = Object.entries(replacements).map(([cn, val]) => {
      const { en, phonetic } = parseValue(val);
      return { cn, en, phonetic };
    });
    Array.from(el.childNodes).forEach((child) => applyRubyToNode(child, items));
  }, []);

  const prefetch = useCallback(
    async (el: HTMLElement) => {
      const existing = dataMap.current.get(el);
      if (existing?.applied) return;

      const text = el.textContent?.trim() ?? '';
      if (!text || !hasChinese(text) || text.length < 4) return;

      const originalHTML = existing?.originalHTML ?? el.innerHTML;
      dataMap.current.set(el, { originalHTML, applied: false });

      try {
        const replacements = await getVocabReplacements(text, apiKey);
        if (Object.keys(replacements).length > 0) {
          applyReplacements(el, replacements);
        }
        dataMap.current.set(el, { originalHTML, applied: true });
      } catch (err) {
        console.warn('[WordGloss] prefetch failed:', err);
      }
    },
    [apiKey, applyReplacements],
  );

  const restoreAll = useCallback(() => {
    dataMap.current.forEach((data, el) => {
      el.innerHTML = data.originalHTML;
      dataMap.current.set(el, { originalHTML: data.originalHTML, applied: false });
    });
  }, []);

  const resetAll = useCallback(() => {
    dataMap.current.forEach((data, el) => {
      el.innerHTML = data.originalHTML;
    });
    dataMap.current.clear();
    clearVocabCache();
  }, []);

  useEffect(() => {
    if (!view || !('renderer' in view)) return;

    const foliateView = view as FoliateView;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && enabledRef.current) {
            prefetch(entry.target as HTMLElement);
          }
        }
      },
      { threshold: 0 },
    );

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

    const onLoad = () => {
      resetAll();
      const contents = foliateView.renderer?.getContents?.() ?? [];
      for (const { doc } of contents) attachToDoc(doc);
    };

    foliateView.addEventListener('load', onLoad);
    const contents = foliateView.renderer?.getContents?.() ?? [];
    for (const { doc } of contents) attachToDoc(doc);

    return () => {
      foliateView.removeEventListener('load', onLoad);
      observer.disconnect();
      resetAll();
    };
  }, [view, prefetch, resetAll]);

  useEffect(() => {
    if (!viewSettings) return;
    const enabled = viewSettings.wordGlossEnabled ?? false;
    enabledRef.current = enabled;
    if (!enabled) {
      restoreAll();
    } else {
      dataMap.current.forEach((_, el) => prefetch(el));
    }
  }, [viewSettings?.wordGlossEnabled, restoreAll, prefetch]);
}
