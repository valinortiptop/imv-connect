/**
 * Server-only: decides whether the signed-in user may use the AI assistant.
 * Admins always can. Representatives only when an admin enabled them in
 * rep_ai_access (RLS limits the read to the caller's own rep rows).
 */
export async function isAiAllowedForUser(supabase: any, userId: string): Promise<boolean> {
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (isAdmin) return true;
  const { data, error } = await supabase
    .from("rep_ai_access")
    .select("representante_id")
    .eq("allowed", true)
    .limit(1);
  if (error) return false;
  return (data ?? []).length > 0;
}
