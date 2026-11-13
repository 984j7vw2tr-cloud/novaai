/**
 * AIの回答（Markdown）を、読みやすい画面の部品に変換して表示する。
 * 見出し・段落・箇条書き・番号付きリスト・コードブロック・表・引用・区切り線・
 * 太字・斜体・取り消し線・コード・リンクに対応。回答の途中（ストリーミング中）でも崩れにくい。
 */
import * as Clipboard from 'expo-clipboard';
import { lexer, type Token, type Tokens } from 'marked';
import { memo, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { IconButton } from '@/components/form';
import { NovaText } from '@/components/nova-text';
import { Colors, Fonts, Radius, Spacing, Type } from '@/constants/theme';

/** Webで、文章の向き（アラビア語なら右から左）を中身に合わせて自動で決める */
/** 出典リンクを囲む丸かっこを外す：([nhk.or.jp](https://...)) → [nhk.or.jp](https://...)（かっこを使わない指定のため） */
export const unwrapLinks = (text: string) =>
  text.replace(/[(（]\s*(\[[^\]\n]+\]\(https?:\/\/[^)\s]+\))\s*[)）]/g, ' $1');

const autoDir = (Platform.OS === 'web' ? { dir: 'auto' } : {}) as object;

type Labels = { copy: string; copied: string };

export const Markdown = memo(function Markdown({
  content,
  labels,
  trailing,
}: {
  content: string;
  labels: Labels;
  /** 最後の段落の末尾に付けるもの（回答中のカーソルなど） */
  trailing?: ReactNode;
}) {
  const tokens = useMemo(() => {
    try {
      return lexer(unwrapLinks(content), { gfm: true, breaks: false });
    } catch {
      return null;
    }
  }, [content]);

  if (!tokens) {
    return (
      <NovaText style={styles.paragraph} selectable {...autoDir}>
        {content}
        {trailing}
      </NovaText>
    );
  }

  const blocks = tokens.filter((t) => t.type !== 'space');
  return (
    <View style={styles.root}>
      {blocks.map((token, i) => (
        <Block
          key={i}
          token={token}
          labels={labels}
          trailing={i === blocks.length - 1 ? trailing : undefined}
        />
      ))}
      {blocks.length === 0 && trailing ? <NovaText>{trailing}</NovaText> : null}
    </View>
  );
});

function Block({
  token,
  labels,
  trailing,
}: {
  token: Token;
  labels: Labels;
  trailing?: ReactNode;
}): ReactNode {
  switch (token.type) {
    case 'heading': {
      const t = token as Tokens.Heading;
      const style = t.depth <= 1 ? styles.h1 : t.depth === 2 ? styles.h2 : styles.h3;
      return (
        <NovaText style={style} selectable accessibilityRole="header" {...autoDir}>
          <Inline tokens={t.tokens} />
          {trailing}
        </NovaText>
      );
    }
    case 'paragraph': {
      const t = token as Tokens.Paragraph;
      return (
        <NovaText style={styles.paragraph} selectable {...autoDir}>
          <Inline tokens={t.tokens} />
          {trailing}
        </NovaText>
      );
    }
    case 'text': {
      const t = token as Tokens.Text;
      return (
        <NovaText style={styles.paragraph} selectable {...autoDir}>
          {t.tokens ? <Inline tokens={t.tokens} /> : t.text}
          {trailing}
        </NovaText>
      );
    }
    case 'list': {
      const t = token as Tokens.List;
      const start = typeof t.start === 'number' ? t.start : 1;
      return (
        <View style={styles.list}>
          {t.items.map((item, i) => (
            <View key={i} style={styles.listItem}>
              <NovaText style={[styles.paragraph, styles.bullet]} tone="secondary">
                {t.ordered ? `${start + i}.` : '•'}
              </NovaText>
              <View style={styles.listBody}>
                {item.tokens
                  .filter((c) => c.type !== 'space')
                  .map((child, j, arr) => (
                    <Block
                      key={j}
                      token={child}
                      labels={labels}
                      trailing={
                        i === t.items.length - 1 && j === arr.length - 1 ? trailing : undefined
                      }
                    />
                  ))}
              </View>
            </View>
          ))}
        </View>
      );
    }
    case 'code': {
      const t = token as Tokens.Code;
      return <CodeBlock code={t.text} language={t.lang} labels={labels} />;
    }
    case 'blockquote': {
      const t = token as Tokens.Blockquote;
      return (
        <View style={styles.quote}>
          {t.tokens
            .filter((c) => c.type !== 'space')
            .map((child, i) => (
              <Block key={i} token={child} labels={labels} />
            ))}
        </View>
      );
    }
    case 'table':
      return <Table token={token as Tokens.Table} />;
    case 'hr':
      return <View style={styles.hr} />;
    case 'html':
      // HTMLは解釈せず、そのまま文字として出す（安全のため）
      return (
        <NovaText style={styles.paragraph} selectable>
          {(token as Tokens.HTML).text}
        </NovaText>
      );
    default: {
      const raw = (token as { raw?: string }).raw;
      return raw ? (
        <NovaText style={styles.paragraph} selectable {...autoDir}>
          {raw}
        </NovaText>
      ) : null;
    }
  }
}

/** 文の中の装飾（太字・斜体・コード・リンクなど） */
function Inline({ tokens }: { tokens?: Token[] }): ReactNode {
  if (!tokens) return null;
  return tokens.map((t, i) => {
    switch (t.type) {
      case 'strong':
        return (
          <Text key={i} style={styles.strong}>
            <Inline tokens={(t as Tokens.Strong).tokens} />
          </Text>
        );
      case 'em':
        return (
          <Text key={i} style={styles.em}>
            <Inline tokens={(t as Tokens.Em).tokens} />
          </Text>
        );
      case 'del':
        return (
          <Text key={i} style={styles.del}>
            <Inline tokens={(t as Tokens.Del).tokens} />
          </Text>
        );
      case 'codespan':
        return (
          <Text key={i} style={styles.inlineCode}>
            {decode((t as Tokens.Codespan).text)}
          </Text>
        );
      case 'br':
        return <Text key={i}>{'\n'}</Text>;
      case 'link': {
        const link = t as Tokens.Link;
        const safe = /^https?:\/\//i.test(link.href);
        return (
          <Text
            key={i}
            style={styles.link}
            accessibilityRole="link"
            onPress={safe ? () => Linking.openURL(link.href) : undefined}>
            <Inline tokens={link.tokens} />
          </Text>
        );
      }
      case 'text': {
        const text = t as Tokens.Text;
        return text.tokens ? (
          <Inline key={i} tokens={text.tokens} />
        ) : (
          <Text key={i}>{decode(text.text)}</Text>
        );
      }
      case 'escape':
        return <Text key={i}>{(t as Tokens.Escape).text}</Text>;
      default:
        return <Text key={i}>{decode((t as { raw?: string }).raw ?? '')}</Text>;
    }
  });
}

/** marked が変換した記号（&amp; など）を元に戻す */
function decode(s: string) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function CodeBlock({
  code,
  language,
  labels,
}: {
  code: string;
  language?: string;
  labels: Labels;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const copy = async () => {
    await Clipboard.setStringAsync(code);
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1600);
  };
  return (
    // コードは常に左から右
    <View style={styles.codeBlock} {...(Platform.OS === 'web' ? { dir: 'ltr' } : {})}>
      <View style={styles.codeHeader}>
        <NovaText variant="caption" tone="muted">
          {language || 'code'}
        </NovaText>
        <IconButton
          icon={copied ? 'check' : 'copy'}
          label={copied ? labels.copied : labels.copy}
          onPress={copy}
          size="sm"
        />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator
        contentContainerStyle={styles.codeScroll}>
        <Text style={styles.code} selectable>
          {code}
        </Text>
      </ScrollView>
    </View>
  );
}

/** 文字幅の目安（全角は半角の約2倍） */
const textWidth = (s: string) =>
  [...s].reduce((n, ch) => n + (ch.charCodeAt(0) > 0x2e80 ? 2 : 1), 0);

function Table({ token }: { token: Tokens.Table }) {
  const align = (i: number) =>
    token.align[i] === 'right' ? 'right' : token.align[i] === 'center' ? 'center' : 'left';
  // 列ごとに、いちばん長い中身に合わせて幅を決める（どの行でも列がそろうように）
  const widths = token.header.map((h, i) => {
    const longest = Math.max(
      textWidth(h.text),
      ...token.rows.map((row) => textWidth(row[i]?.text ?? '')),
    );
    return Math.min(320, Math.max(96, longest * 8 + Spacing.md * 2));
  });
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator style={styles.tableScroll}>
      <View style={styles.table}>
        <View style={[styles.tr, styles.thead]}>
          {token.header.map((cell, i) => (
            <View key={i} style={[styles.td, { width: widths[i] }, i > 0 && styles.tdBorder]}>
              <NovaText variant="smallMedium" style={{ textAlign: align(i) }} {...autoDir}>
                <Inline tokens={cell.tokens} />
              </NovaText>
            </View>
          ))}
        </View>
        {token.rows.map((row, r) => (
          <View key={r} style={[styles.tr, styles.trBorder]}>
            {row.map((cell, i) => (
              <View key={i} style={[styles.td, { width: widths[i] }, i > 0 && styles.tdBorder]}>
                <NovaText variant="small" style={{ textAlign: align(i) }} selectable {...autoDir}>
                  <Inline tokens={cell.tokens} />
                </NovaText>
              </View>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const READ = { fontSize: 16, lineHeight: 27 };

const styles = StyleSheet.create({
  root: { gap: Spacing.md + 2 },
  paragraph: { ...Type.body, ...READ, color: Colors.text },
  h1: { ...Type.title, marginTop: Spacing.sm },
  h2: { ...Type.heading, fontSize: 19, lineHeight: 27, marginTop: Spacing.sm },
  h3: { ...Type.heading, marginTop: Spacing.xs },
  strong: { fontFamily: Fonts.semibold },
  em: { fontStyle: 'italic' },
  del: { textDecorationLine: 'line-through', color: Colors.textSecondary },
  link: { textDecorationLine: 'underline', textDecorationColor: Colors.textMuted },
  inlineCode: {
    fontFamily: Fonts.mono,
    fontSize: 14,
    backgroundColor: Colors.surfaceRaised,
    color: Colors.text,
    borderRadius: 4,
    paddingHorizontal: 4,
  },
  list: { gap: Spacing.sm },
  listItem: { flexDirection: 'row', gap: Spacing.sm },
  bullet: { minWidth: 18, textAlign: 'right' },
  listBody: { flex: 1, gap: Spacing.sm },
  quote: {
    borderLeftWidth: 2,
    borderLeftColor: Colors.accentMuted,
    paddingLeft: Spacing.lg,
    gap: Spacing.sm,
  },
  hr: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginVertical: Spacing.sm,
  },
  codeBlock: {
    backgroundColor: Colors.code,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  codeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: Spacing.lg,
    paddingRight: Spacing.xs,
    paddingVertical: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderSubtle,
  },
  codeScroll: { padding: Spacing.lg },
  code: { ...Type.mono, color: Colors.text },
  tableScroll: { flexGrow: 0 },
  table: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  tr: { flexDirection: 'row' },
  thead: { backgroundColor: Colors.surface },
  trBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
  td: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2 },
  tdBorder: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: Colors.border },
});
