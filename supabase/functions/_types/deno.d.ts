// 型チェック用の最小限の Deno の定義（本番の Supabase では本物の Deno が使われる）
declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};
