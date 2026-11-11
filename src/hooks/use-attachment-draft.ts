import { randomUUID } from 'expo-crypto';
import { useCallback, useRef, useState } from 'react';

import {
  type AttachError,
  AttachmentError,
  MAX_ATTACHMENTS,
  pickFiles,
  pickImages,
  removeAttachmentFiles,
  uploadAttachment,
} from '@/lib/attachments';
import type { Attachment } from '@/lib/chat-types';

/** 入力欄の上に並ぶ、送信前の添付 */
export type DraftItem = {
  id: string;
  kind: 'image' | 'file';
  name: string;
  /** 手元の画像（プレビュー用） */
  previewUri: string;
  status: 'uploading' | 'ready' | 'error';
  attachment?: Attachment;
  width?: number;
  height?: number;
};

export type AttachSource = 'camera' | 'library' | 'file';

/**
 * 送信前の添付の管理：選ぶ → すぐ置き場所に送る（送信を押したときに待たなくてよいように）。
 * 外したら置き場所からも消す。送信したら一覧を空にする（ファイルは発言と一緒に残る）。
 */
export function useAttachmentDraft() {
  const [items, setItems] = useState<DraftItem[]>([]);
  const [error, setError] = useState<AttachError | null>(null);
  const itemsRef = useRef<DraftItem[]>([]);

  const update = (next: (prev: DraftItem[]) => DraftItem[]) => {
    itemsRef.current = next(itemsRef.current);
    setItems(itemsRef.current);
  };

  const add = useCallback(async (source: AttachSource) => {
    setError(null);
    const room = MAX_ATTACHMENTS - itemsRef.current.length;
    if (room <= 0) {
      setError('too_many');
      return;
    }
    let picked;
    try {
      picked = source === 'file' ? await pickFiles(room) : await pickImages(source, room);
    } catch (e) {
      setError(e instanceof AttachmentError ? e.code : 'upload_failed');
      return;
    }
    for (const p of picked) {
      const id = randomUUID();
      update((prev) => [
        ...prev,
        {
          id,
          kind: p.kind,
          name: p.name,
          previewUri: p.uri,
          status: 'uploading',
          width: p.width,
          height: p.height,
        },
      ]);
      uploadAttachment(p).then(
        (attachment) => {
          // アップロード中に外されていたら、置き場所からも消す
          if (!itemsRef.current.some((i) => i.id === id)) {
            void removeAttachmentFiles([attachment.path]);
            return;
          }
          update((prev) =>
            prev.map((i) => (i.id === id ? { ...i, status: 'ready', attachment } : i)),
          );
        },
        (e) => {
          setError(e instanceof AttachmentError ? e.code : 'upload_failed');
          update((prev) => prev.map((i) => (i.id === id ? { ...i, status: 'error' } : i)));
        },
      );
    }
  }, []);

  const remove = useCallback((id: string) => {
    const item = itemsRef.current.find((i) => i.id === id);
    update((prev) => prev.filter((i) => i.id !== id));
    if (item?.attachment) void removeAttachmentFiles([item.attachment.path]);
  }, []);

  /** 送信したあと：一覧だけ空にする（ファイルは消さない） */
  const clear = useCallback(() => update(() => []), []);

  /** 新しいチャットに切り替えたとき：送らなかった添付は置き場所からも消す */
  const discard = useCallback(() => {
    const paths = itemsRef.current.flatMap((i) => (i.attachment ? [i.attachment.path] : []));
    update(() => []);
    void removeAttachmentFiles(paths);
  }, []);

  const uploading = items.some((i) => i.status === 'uploading');
  const ready = items.flatMap((i) => (i.status === 'ready' && i.attachment ? [i.attachment] : []));

  return {
    items,
    ready,
    uploading,
    full: items.length >= MAX_ATTACHMENTS,
    error,
    clearError: () => setError(null),
    add,
    remove,
    clear,
    discard,
  };
}
