'use client';

import { Suspense } from 'react';
import { useSearchParams, redirect } from 'next/navigation';
import QuizView from '@/components/quiz/QuizView';

function QuizContent() {
  const searchParams = useSearchParams();
  const bookKey = searchParams?.get('bookKey') ?? null;

  if (!bookKey) {
    redirect('/library');
  }

  return (
    <div className='bg-base-100 text-base-content full-height flex select-none flex-col items-center justify-center overflow-hidden p-4'>
      <QuizView bookKey={bookKey} />
    </div>
  );
}

export default function QuizPageClient() {
  return (
    <Suspense fallback={<div className='bg-base-100 full-height' />}>
      <QuizContent />
    </Suspense>
  );
}
