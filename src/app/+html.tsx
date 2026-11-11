/**
 * Web版の土台になるHTML（ページの説明・テーマ色・ホーム画面に追加したときのアイコンなど）。
 * スマホアプリには影響しない。
 */
import { ScrollViewStyleReset, useServerDocumentContext } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

const DESCRIPTION =
  'Karakuchi AI — ONE AI. EVERY LANGUAGE. NO FILTER. 忖度なしで答える、世界中の言語に対応したAI。';

export default function Root({ children }: PropsWithChildren) {
  // Expo が用意する、アプリ本体を読み込むためのタグ（これが無いと画面が真っ白になる）
  const { htmlAttributes, bodyAttributes, headNodes, bodyNodes } = useServerDocumentContext();
  return (
    <html lang="ja" {...htmlAttributes}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <title>Karakuchi AI</title>
        <meta name="description" content={DESCRIPTION} />
        <meta name="theme-color" content="#0A0A0A" />
        <meta name="color-scheme" content="dark" />
        <meta name="apple-mobile-web-app-title" content="Karakuchi AI" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta property="og:title" content="Karakuchi AI" />
        <meta property="og:description" content={DESCRIPTION} />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="/og-image.png" />
        <meta name="twitter:card" content="summary" />
        {/* スクロールの見た目をそろえる（Expo Router 標準） */}
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: 'html,body{background:#0A0A0A;}' }} />
        {headNodes}
      </head>
      <body {...bodyAttributes}>
        {children}
        {bodyNodes}
      </body>
    </html>
  );
}
