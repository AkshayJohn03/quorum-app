import type { Metadata } from 'next';
import { Instrument_Serif, Hanken_Grotesk, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const serif = Instrument_Serif({ weight: '400', subsets: ['latin'], variable: '--font-serif' });
const sans = Hanken_Grotesk({ subsets: ['latin'], variable: '--font-sans' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'Quorum — a focus group in a box',
  description:
    'Describe an idea, pick an audience, and a grounded panel reacts — every reaction cited with real Qloo affinity data. Qloo Agentic Hackathon entry.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${serif.variable} ${sans.variable} ${mono.variable}`}>{children}</body>
    </html>
  );
}
