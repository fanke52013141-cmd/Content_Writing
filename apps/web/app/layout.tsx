import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './styles/tokens.css';
import './styles/globals.css';

export const metadata: Metadata = {
  title: '墨流 AI 创作台',
  description: '本地运行的公众号内容创作工作台',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
