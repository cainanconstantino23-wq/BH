import { Jost } from 'next/font/google';
import type { ReactNode } from 'react';

const jost = Jost({
  variable: '--font-jost',
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
});

export default function ApprovalLayout({ children }: { children: ReactNode }) {
  return <div className={`${jost.variable} contents`}>{children}</div>;
}
