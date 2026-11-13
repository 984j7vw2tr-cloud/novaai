/**
 * 利用規約・プライバシーポリシーの本文（日本語・英語）。
 * 日本語が正本。日本語以外の表示言語では英語版を出す。
 * ※公開前に専門家（弁護士など）の確認を受けることをおすすめします。
 */
import { contactEn, contactJa, OPERATOR } from '@/legal/operator';

export const termsJa = () => `最終更新日：${OPERATOR.updated}

この利用規約（以下「本規約」）は、${OPERATOR.nameJa}（以下「運営者」）が提供するAIチャットサービス「NAYQO」（Webサイト・iPhoneアプリ・Androidアプリを含みます。以下「本サービス」）の利用条件を定めるものです。本サービスを利用した時点で、本規約に同意したものとみなします。

## 1. 本サービスの内容
本サービスは、AIとの会話、写真・ファイルの読み取り、画像の作成、ウェブ検索、音声での会話、会話内容の記憶などの機能を提供します。NAYQOは率直で辛口な話し方をするAIです。この話し方を理解したうえでご利用ください。

## 2. アカウント
- メールアドレスで登録してください。登録情報は正確に保ち、パスワードは自分で管理してください。
- 13歳未満の方は利用できません。18歳未満の方は、保護者の同意を得てから利用してください。
- アカウントはいつでも設定画面から削除できます。

## 3. AIの回答について
- AIの回答は自動で作られるもので、正確さ・完全さ・最新性を保証しません。
- 医療・法律・税務・投資などの重要な判断は、必ず専門家に相談してください。
- 回答の利用は、ご自身の判断と責任で行ってください。

## 4. 禁止事項
次の行為を禁止します。
- 法令や公序良俗に反する行為、犯罪につながる行為
- 他人を傷つける・差別する・脅す・嫌がらせをする目的での利用
- 他人の権利（著作権・肖像権・プライバシーなど）を侵害する行為
- 実在の人物になりすます画像や文章を作り、他人をだます行為
- 本サービスへの不正アクセス、過剰な負荷をかける行為、自動化ツールでの大量利用
- 本サービスを複製・転売・再配布する行為
- その他、運営者が不適切と判断する行為
違反があった場合、予告なく利用を制限・停止し、アカウントを削除することがあります。

## 5. 有料プラン（PLUS）
- 料金・内容は料金プランの画面に表示します。
- Webで申し込んだ場合はStripe、アプリで申し込んだ場合はApple（App Store）またはGoogle（Google Play）を通じてお支払いいただきます。
- 有料プランは1か月ごとに自動で更新されます。解約は、申し込んだ方法に応じて、料金プラン画面・App Store・Google Playの設定から行えます。解約後も、お支払い済みの期間の終わりまで利用できます。
- 返金は、各決済方法の規定に従います。運営者の責任でサービスを提供できなかった場合を除き、お支払い済みの料金は返金しません。
- 利用回数・画像の枚数・音声会話の時間などには、プランごとの上限があります。

## 6. 入力した内容と作られた内容
- 入力した文章・写真・ファイルの権利は、もともとの権利者に残ります。
- AIが作った文章・画像は、法令の範囲で自由に使えます。ただし、他人の権利を侵害しないよう注意してください。
- 運営者は、本サービスの提供・改善・安全の確保に必要な範囲で、入力内容を扱います。詳しくはプライバシーポリシーをご覧ください。

## 7. サービスの変更・停止
運営者は、事前の通知なく、本サービスの内容を変更し、または一時的に停止・終了することがあります。

## 8. 免責
- 運営者は、本サービスが中断なく動くこと、エラーがないこと、特定の目的に合うことを保証しません。
- 本サービスの利用によって生じた損害について、運営者に故意または重大な過失がある場合を除き、運営者は責任を負いません。責任を負う場合でも、その額は、損害が発生した月に利用者が支払った利用料金を上限とします。
- 消費者契約法その他の法令で、この免責が認められない場合は、その法令に従います。

## 9. 規約の変更
運営者は、必要に応じて本規約を変更できます。変更後の規約は、本サービス上に掲載した時点から効力を持ちます。

## 10. 準拠法・裁判管轄
本規約は日本法に従います。本サービスに関する紛争は、東京地方裁判所を第一審の専属的合意管轄裁判所とします。

## 11. お問い合わせ
運営者：${OPERATOR.nameJa}
連絡先：${contactJa()}
`;

export const termsEn = () => `Last updated: ${OPERATOR.updated}

These Terms of Service ("Terms") govern your use of NAYQO, an AI chat service provided by ${OPERATOR.nameEn} ("we", "us"), including the website and the iPhone and Android apps (the "Service"). By using the Service, you agree to these Terms. The Japanese version of these Terms is the official version.

## 1. The Service
The Service lets you chat with AI, have photos and files read, create images, search the web, talk by voice, and have the AI remember things from your conversations. NAYQO speaks bluntly by design. Please use it with that in mind.

## 2. Accounts
- Register with your email address, keep your information accurate, and keep your password safe.
- You must be at least 13 years old. If you are under 18, get a parent's or guardian's permission first.
- You can delete your account at any time in Settings.

## 3. AI answers
- AI answers are generated automatically. We do not guarantee that they are accurate, complete, or up to date.
- For important decisions about health, law, tax, or investments, always consult a qualified professional.
- You use the answers at your own judgment and risk.

## 4. Prohibited uses
You must not:
- break the law or use the Service for crime;
- use it to hurt, discriminate against, threaten, or harass anyone;
- infringe anyone's rights, such as copyright, portrait rights, or privacy;
- create images or text that impersonate real people to deceive others;
- access the Service without permission, overload it, or use automated tools for mass use;
- copy, resell, or redistribute the Service;
- do anything else we reasonably consider inappropriate.
We may limit or suspend your use, or delete your account, without notice if you break these rules.

## 5. Paid plan (PLUS)
- Prices and features are shown on the Plans screen.
- Payments are processed by Stripe on the web, or by Apple (App Store) or Google (Google Play) in the apps.
- The paid plan renews automatically every month. You can cancel on the Plans screen, or in your App Store or Google Play settings, depending on where you subscribed. After you cancel, you can keep using it until the end of the paid period.
- Refunds follow the rules of each payment method. Except when we fail to provide the Service through our fault, payments are non-refundable.
- Each plan has limits on messages, images, voice chat time, and more.

## 6. Your content and generated content
- You keep the rights to the text, photos, and files you enter.
- You may use text and images created by the AI as permitted by law. Make sure you do not infringe others' rights.
- We handle your content only as needed to provide, improve, and protect the Service. See the Privacy Policy for details.

## 7. Changes to the Service
We may change, suspend, or end the Service, in whole or in part, without prior notice.

## 8. Disclaimer
- We do not guarantee that the Service will be uninterrupted, error-free, or fit for a particular purpose.
- Except in cases of our intent or gross negligence, we are not liable for damages arising from your use of the Service. If we are liable, our liability is limited to the fees you paid in the month the damage occurred.
- Where applicable law does not allow this disclaimer, that law applies.

## 9. Changes to these Terms
We may change these Terms when needed. Changes take effect when posted in the Service.

## 10. Governing law
These Terms are governed by the laws of Japan. The Tokyo District Court has exclusive jurisdiction in the first instance over disputes about the Service.

## 11. Contact
Operator: ${OPERATOR.nameEn}
Contact: ${contactEn()}
`;

export const privacyJa = () => `最終更新日：${OPERATOR.updated}

${OPERATOR.nameJa}（以下「運営者」）は、AIチャットサービス「NAYQO」（以下「本サービス」）における利用者の情報を、次のとおり取り扱います。

## 1. 集める情報
- **アカウント情報**：メールアドレス、表示名、言語の設定
- **会話の内容**：送った文章、AIの回答、添付した写真・ファイル、AIが作った画像
- **NAYQOの記憶**：会話から覚えた、あなたのこと・目標・やると言ったこと（設定でオフにできます）
- **音声**：声で入力した音声は文字にするために使い、保存しません。音声会話の音声も保存しません。音声会話の文字起こしは、会話として履歴に保存します（一時チャットでは保存しません）。
- **利用の記録**：利用回数、使ったAIの量、画像の枚数、音声会話の時間、エラーの記録
- **支払いの情報**：プラン、契約の状態。カード番号などの支払い情報は、Stripe・Apple・Googleが管理し、運営者は受け取りません。

## 2. 使う目的
- 本サービスを提供するため（回答を作る、履歴を保存する、記憶を使う など）
- プランごとの利用上限を管理し、料金を請求するため
- 不正利用・危険な内容を防ぎ、安全を守るため
- 不具合を直し、本サービスを改善するため
- お問い合わせに答えるため
運営者は、あなたの会話の内容を広告に使ったり、販売したりしません。

## 3. 外部のサービス
本サービスは、次の会社のサービスを使っています。あなたの情報は、それぞれの目的に必要な範囲でこれらの会社に送られます。
- **OpenAI**（アメリカ）：AIの回答・画像の作成・音声の処理・安全チェック・ウェブ検索。OpenAIの規約により、送った内容がAIの学習に使われることは原則ありません。不正利用の監視のため、OpenAI側で一定期間保存されることがあります。
- **Supabase**：アカウント・会話・ファイルの保存（データはオーストラリアのサーバーに保存されます）
- **Vercel**：Webサイトの配信
- **Stripe**：Webでの支払い
- **Apple・Google**：アプリの配信、アプリ内での支払い
これらの会社は日本以外の国にあり、各国の法律に従って情報を扱います。

## 4. 保存する期間
- 会話・記憶・ファイルは、あなたが消すか、アカウントを削除するまで保存します。
- 利用の記録・支払いの記録は、法律や会計のために必要な期間保存することがあります。

## 5. あなたができること
- 会話：1つずつ、またはすべて削除できます（設定 → データ）。
- NAYQOの記憶：見る・1つずつ消す・すべて消す・オフにする ができます（設定 → NAYQOの記憶）。
- 一時チャット：履歴にも記憶にも残しません。
- アカウントの削除：設定から削除すると、会話・記憶・ファイルなどの情報も削除されます。
- 情報の開示・訂正・利用停止を求める場合は、下のお問い合わせ先にご連絡ください。

## 6. 安全管理
通信の暗号化、アクセス権限の制限など、情報を守るための対策を行っています。

## 7. 子どもの情報
13歳未満の方は本サービスを利用できません。13歳未満の方の情報が登録されていると分かった場合は削除します。

## 8. このポリシーの変更
必要に応じて変更します。大きな変更は、本サービス上でお知らせします。

## 9. お問い合わせ
運営者：${OPERATOR.nameJa}
連絡先：${contactJa()}
`;

export const privacyEn = () => `Last updated: ${OPERATOR.updated}

This Privacy Policy explains how ${OPERATOR.nameEn} ("we", "us") handles your information in NAYQO, an AI chat service (the "Service"). The Japanese version is the official version.

## 1. Information we collect
- **Account information**: email address, display name, language settings
- **Conversations**: messages you send, AI answers, photos and files you attach, images the AI creates
- **NAYQO's memory**: things the AI remembers from your chats, such as facts about you, your goals, and what you said you would do. You can turn this off in Settings.
- **Voice**: audio from voice input is used only to turn it into text and is not stored. Audio from voice chat is not stored either. The transcript of a voice chat is saved to your history as a conversation, except in temporary chat.
- **Usage records**: number of messages, amount of AI used, number of images, voice chat time, error logs
- **Payment information**: your plan and subscription status. Card details are handled by Stripe, Apple, or Google. We never receive them.

## 2. How we use it
- To provide the Service: generate answers, save your history, use memory, and so on
- To manage plan limits and bill you
- To prevent abuse and harmful content and keep the Service safe
- To fix problems and improve the Service
- To answer your questions
We do not use your conversations for advertising, and we do not sell them.

## 3. Service providers
The Service uses the following companies. Your information is sent to them only as needed for each purpose.
- **OpenAI** (USA): AI answers, image creation, voice processing, safety checks, web search. Under OpenAI's terms, content sent through its API is generally not used to train its models. OpenAI may keep it for a limited time to monitor abuse.
- **Supabase**: storage of accounts, conversations, and files. Data is stored on servers in Australia.
- **Vercel**: website hosting
- **Stripe**: payments on the web
- **Apple and Google**: app distribution and in-app payments
These companies are located outside Japan and handle information under the laws of their countries.

## 4. How long we keep it
- Conversations, memory, and files are kept until you delete them or delete your account.
- Usage and payment records may be kept as long as required for legal and accounting purposes.

## 5. Your choices
- Conversations: delete them one by one or all at once (Settings → Data).
- NAYQO's memory: view it, delete items or everything, or turn it off (Settings → NAYQO's memory).
- Temporary chat: nothing is saved to history or memory.
- Deleting your account in Settings also deletes your conversations, memory, and files.
- To request access to, correction of, or a stop to the use of your information, contact us below.

## 6. Security
We protect your information with measures such as encrypted connections and restricted access.

## 7. Children
The Service is not for children under 13. If we learn that a child under 13 has registered, we will delete their information.

## 8. Changes
We may update this policy when needed. We will announce major changes in the Service.

## 9. Contact
Operator: ${OPERATOR.nameEn}
Contact: ${contactEn()}
`;
