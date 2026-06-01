'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useReaderStore } from '@/store/readerStore';
import { navigateToQuiz } from '@/utils/nav';

/**
 * 监听 readerStore.finishedBookKey，当读完一本书时弹出提示，
 * 让用户选择是否进入词汇测验。
 */
export function useBookFinishPrompt(): {
  bookFinishPrompt: React.ReactNode | null;
} {
  const router = useRouter();
  const [promptBookKey, setPromptBookKey] = useState<string | null>(null);
  const finishedBookKey = useReaderStore((s) => s.finishedBookKey);
  const setFinishedBookKey = useReaderStore((s) => s.setFinishedBookKey);

  useEffect(() => {
    if (finishedBookKey) {
      console.log('[BookFinishPrompt] finishedBookKey changed:', finishedBookKey);
      setPromptBookKey(finishedBookKey);
    }
  }, [finishedBookKey]);

  const handleStartQuiz = useCallback(() => {
    if (promptBookKey) navigateToQuiz(router, promptBookKey);
    setPromptBookKey(null);
    setFinishedBookKey(null);
  }, [router, promptBookKey, setFinishedBookKey]);

  const handleDismiss = useCallback(() => {
    setPromptBookKey(null);
    setFinishedBookKey(null);
  }, [setFinishedBookKey]);

  if (!promptBookKey) return { bookFinishPrompt: null };

  return {
    bookFinishPrompt: (
      <div className='fixed inset-0 z-[100] flex items-center justify-center bg-black/50'>
        <div className='bg-base-300 mx-4 flex max-w-sm flex-col gap-4 rounded-lg p-6 shadow-2xl'>
          <h3 className='text-base-content text-lg font-semibold'>You finished this book!</h3>
          <p className='text-base-content/70 text-sm'>
            Would you like to take a vocabulary quiz on the words you learned?
          </p>
          <div className='flex justify-end gap-3'>
            <button onClick={handleDismiss} className='btn btn-sm btn-ghost'>
              Not now
            </button>
            <button onClick={handleStartQuiz} className='btn btn-sm btn-primary'>
              Start Quiz
            </button>
          </div>
        </div>
      </div>
    ),
  };
}
