import { Alert, Platform } from 'react-native';

/**
 * 「本当に〜しますか？」の確認。OKなら true。
 * スマホは標準のダイアログ、Webはブラウザの確認ダイアログを使う。
 */
export function confirmAsync(options: {
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
}): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(typeof window !== 'undefined' && window.confirm(options.message));
  }
  return new Promise((resolve) => {
    Alert.alert(
      '',
      options.message,
      [
        { text: options.cancelLabel, style: 'cancel', onPress: () => resolve(false) },
        {
          text: options.confirmLabel,
          style: options.destructive ? 'destructive' : 'default',
          onPress: () => resolve(true),
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
