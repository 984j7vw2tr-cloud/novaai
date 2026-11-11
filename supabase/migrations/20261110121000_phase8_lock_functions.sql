-- トリガー専用の関数を、外から（/rest/v1/rpc/...）呼べないようにする（Security Advisor の指摘への対応）
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.touch_conversation() from public, anon, authenticated;
