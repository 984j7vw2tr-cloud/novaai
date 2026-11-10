/**
 * チャットの設定。
 * 今は初期値だけ。設定画面ができたら、ユーザーが切り替えた値をここから返す。
 */
export type ChatSettings = {
  /** カウンターモード：NOVAへの暴言にツッコミで言い返す（初期値：ON） */
  counterMode: boolean;
};

const defaults: ChatSettings = { counterMode: true };

export function getChatSettings(): ChatSettings {
  return { ...defaults };
}
