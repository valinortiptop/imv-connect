// @ts-nocheck
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  isError?: boolean;
}

export interface ChatConversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  created_at: string;
  updated_at: string;
  is_pinned: boolean;
}

function generateTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return "Nueva conversación";
  const text = firstUser.content.trim();
  return text.length > 60 ? text.slice(0, 57) + "..." : text;
}

export function useChatHistory() {
  const queryClient = useQueryClient();

  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ["chat-conversations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chat_conversations")
        .select("*")
        .order("is_pinned", { ascending: false })
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data || []).map((c: any) => ({
        ...c,
        messages: (typeof c.messages === "string" ? JSON.parse(c.messages) : c.messages) as ChatMessage[],
      })) as ChatConversation[];
    },
    refetchInterval: 30000,
  });

  const createConversation = useMutation({
    mutationFn: async (messages: ChatMessage[]) => {
      const title = generateTitle(messages);
      const { data, error } = await supabase
        .from("chat_conversations")
        .insert({ title, messages: JSON.parse(JSON.stringify(messages)) })
        .select()
        .single();
      if (error) throw error;
      return { ...data, messages } as ChatConversation;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["chat-conversations"] }),
  });

  const updateConversation = useMutation({
    mutationFn: async ({ id, messages, title }: { id: string; messages?: ChatMessage[]; title?: string }) => {
      const update: any = {};
      if (messages) {
        update.messages = JSON.parse(JSON.stringify(messages));
        if (!title) update.title = generateTitle(messages);
      }
      if (title) update.title = title;
      const { error } = await supabase.from("chat_conversations").update(update).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["chat-conversations"] }),
  });

  const deleteConversation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("chat_conversations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["chat-conversations"] }),
  });

  const togglePin = useMutation({
    mutationFn: async ({ id, is_pinned }: { id: string; is_pinned: boolean }) => {
      const { error } = await supabase.from("chat_conversations").update({ is_pinned }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["chat-conversations"] }),
  });

  return {
    conversations,
    isLoading,
    createConversation,
    updateConversation,
    deleteConversation,
    togglePin,
  };
}
