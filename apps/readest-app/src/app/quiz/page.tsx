import { Metadata } from 'next';
import QuizPageClient from './page-client';

export const metadata: Metadata = {
  title: 'Vocabulary Quiz - Readest',
};

export default function QuizPage() {
  return <QuizPageClient />;
}
