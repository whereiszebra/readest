'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { useTheme } from '@/hooks/useTheme';
import { getQuizWords, generateQuestion, type QuizQuestion } from '@/services/wordGloss/quiz';
import { setAllBookWordsMastered } from '@/app/reader/hooks/useWordGloss';
import { navigateToLibrary } from '@/utils/nav';

type QuizPhase = 'loading' | 'active' | 'completed';

interface QuizViewProps {
  bookKey: string;
}

export default function QuizView({ bookKey }: QuizViewProps) {
  useTheme({ systemUIVisible: true, appThemeColor: 'base-100' });
  const router = useRouter();

  const [phase, setPhase] = useState<QuizPhase>('loading');
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [selectedCn, setSelectedCn] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);

  // 初始化题目
  useEffect(() => {
    const words = getQuizWords(bookKey);
    if (words.length === 0) {
      setPhase('completed');
      return;
    }

    const generated: QuizQuestion[] = words.map(({ cn, record }) =>
      generateQuestion(cn, record, words),
    );
    setQuestions(generated);
    setPhase('active');
  }, [bookKey]);

  const handleSelect = useCallback(
    (cn: string) => {
      if (feedback) return; // 正在显示反馈，忽略点击

      setSelectedCn(cn);
      const isCorrect = questions[currentIndex]!.options.find((o) => o.cn === cn)?.isCorrect;
      setFeedback(isCorrect ? 'correct' : 'wrong');

      if (isCorrect) {
        setCorrectCount((c) => c + 1);
      }

      // 1 秒后自动进入下一题
      setTimeout(() => {
        setSelectedCn(null);
        setFeedback(null);
        if (currentIndex + 1 >= questions.length) {
          setPhase('completed');
        } else {
          setCurrentIndex((i) => i + 1);
        }
      }, 1000);
    },
    [feedback, currentIndex, questions],
  );

  const handleTryAgain = useCallback(() => {
    const words = getQuizWords(bookKey);
    const generated: QuizQuestion[] = words.map(({ cn, record }) =>
      generateQuestion(cn, record, words),
    );
    setQuestions(generated);
    setCurrentIndex(0);
    setCorrectCount(0);
    setSelectedCn(null);
    setFeedback(null);
    setPhase('active');
  }, [bookKey]);

  const handleMarkAllMastered = useCallback(() => {
    setAllBookWordsMastered(bookKey);
  }, [bookKey]);

  const handleBackToLibrary = useCallback(() => {
    navigateToLibrary(router);
  }, [router]);

  const handleBackToReader = useCallback(() => {
    router.back();
  }, [router]);

  // --- loading ---
  if (phase === 'loading') {
    return (
      <div className='flex items-center justify-center'>
        <span className='text-base-content/70'>Loading quiz...</span>
      </div>
    );
  }

  // --- completed (or empty) ---
  if (phase === 'completed' && questions.length === 0) {
    return (
      <div className='flex flex-col items-center gap-4'>
        <p className='text-base-content/70'>
          No words to quiz on yet. Read more of this book first!
        </p>
        <button onClick={handleBackToLibrary} className='btn btn-ghost'>
          Back to Library
        </button>
      </div>
    );
  }

  // --- completed (with results) ---
  if (phase === 'completed') {
    const score = Math.round((correctCount / questions.length) * 100);
    return (
      <div className='flex flex-col items-center gap-6'>
        <h2 className='text-base-content text-2xl font-bold'>Quiz Complete!</h2>
        <p className='text-base-content/70 text-lg'>
          You got {correctCount} out of {questions.length} correct ({score}%)
        </p>
        <div className='flex gap-3'>
          <button onClick={handleTryAgain} className='btn btn-ghost'>
            Try again
          </button>
          <button onClick={handleMarkAllMastered} className='btn btn-primary'>
            Mark all as mastered
          </button>
        </div>
        <button onClick={handleBackToReader} className='btn btn-ghost text-base-content/50'>
          Back to Library
        </button>
      </div>
    );
  }

  // --- active ---
  const current = questions[currentIndex]!;
  return (
    <div className='mx-auto flex w-full max-w-md flex-col items-center gap-6'>
      {/* 进度指示 */}
      <p className='text-base-content/70 text-sm'>
        Question {currentIndex + 1}/{questions.length}
      </p>

      {/* 英文单词 */}
      <h1 className='text-base-content text-3xl font-bold'>{current.en}</h1>

      {/* 选项按钮 */}
      <div className='flex w-full flex-col gap-3'>
        {current.options.map((opt) => {
          let btnClass = 'btn btn-outline border-base-300 text-base-content';

          if (feedback) {
            if (opt.isCorrect) {
              btnClass = 'btn !bg-green-600 !text-white !border-green-600';
            } else if (opt.cn === selectedCn && !opt.isCorrect) {
              btnClass = 'btn !bg-red-600 !text-white !border-red-600';
            } else {
              btnClass = 'btn btn-outline border-base-300 text-base-content opacity-50';
            }
          }

          return (
            <button
              key={opt.cn}
              onClick={() => handleSelect(opt.cn)}
              disabled={!!feedback}
              className={clsx(btnClass, 'min-h-[48px] text-lg transition-colors duration-150')}
            >
              {opt.cn}
            </button>
          );
        })}
      </div>
    </div>
  );
}
