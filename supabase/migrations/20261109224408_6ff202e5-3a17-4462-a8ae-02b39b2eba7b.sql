alter function public.onboarding_items_validation_guard() security invoker;
revoke execute on function public.onboarding_items_validation_guard() from public, anon, authenticated;