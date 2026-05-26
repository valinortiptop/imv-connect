// @ts-nocheck
import { useState, useCallback, useRef, useEffect } from "react";
import { useLanguage } from "@/hooks/use-language";
import { useTheme } from "@/hooks/use-theme";
import { supabase } from "@/integrations/supabase/client";
import { AnimatedAIChat, type ProactiveInsight } from "@/components/ui/animated-ai-chat";
import { ChatHistorySidebar } from "@/components/gandalf/ChatHistorySidebar";
import { useChatHistory, type ChatMessage } from "@/hooks/use-chat-history";
import { cn } from "@/lib/utils";

function useProactiveInsights() {
  const [insights, setInsights] = useState<ProactiveInsight[]>([]);

  useEffect(() => {
    async function fetchInsights() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

        const response = await fetch(`${supabaseUrl}/functions/v1/ai-chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token || supabaseKey}`,
            apikey: supabaseKey,
          },
          body: JSON.stringify({ mode: "insights" }),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.insights) setInsights(data.insights);
        }
      } catch {}
    }
    fetchInsights();
  }, []);

  return insights;
}

const ACTIVE_CHAT_KEY = "gandalf-active-conversation";
const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

function loadActiveId(): string | null {
  try {
    const stored = localStorage.getItem(ACTIVE_CHAT_KEY);
    if (!stored) return null;
    const { id, timestamp } = JSON.parse(stored);
    // Reset if idle for over 5 minutes
    if (Date.now() - timestamp > IDLE_TIMEOUT_MS) {
      localStorage.removeItem(ACTIVE_CHAT_KEY);
      return null;
    }
    return id;
  } catch { return null; }
}

function saveActiveId(id: string | null) {
  if (id) {
    localStorage.setItem(ACTIVE_CHAT_KEY, JSON.stringify({ id, timestamp: Date.now() }));
  } else {
    localStorage.removeItem(ACTIVE_CHAT_KEY);
  }
}

export default function AIChat() {
  const { lang } = useLanguage();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const {
    conversations,
    createConversation,
    updateConversation,
    deleteConversation,
    togglePin,
  } = useChatHistory();
  const insights = useProactiveInsights();

  const [activeConversationId, setActiveConversationId] = useState<string | null>(() => loadActiveId());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [chatKey, setChatKey] = useState(0);
  const pendingSaveRef = useRef<ReturnType<typeof setTimeout>>();
  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeConversationId;

  const activeConversation = conversations.find((c) => c.id === activeConversationId);
  const activeMessages = activeConversation?.messages || [];

  // Persist active conversation ID to localStorage
  useEffect(() => {
    saveActiveId(activeConversationId);
  }, [activeConversationId]);

  // Update timestamp on any user activity to keep the session alive
  useEffect(() => {
    const updateTimestamp = () => {
      if (activeConversationId) saveActiveId(activeConversationId);
    };
    window.addEventListener("mousemove", updateTimestamp, { passive: true });
    window.addEventListener("keydown", updateTimestamp, { passive: true });
    return () => {
      window.removeEventListener("mousemove", updateTimestamp);
      window.removeEventListener("keydown", updateTimestamp);
    };
  }, [activeConversationId]);

  const handleMessagesChange = useCallback(
    (messages: ChatMessage[]) => {
      if (pendingSaveRef.current) clearTimeout(pendingSaveRef.current);

      pendingSaveRef.current = setTimeout(() => {
        if (messages.length === 0) return;

        const currentId = activeIdRef.current;
        if (currentId) {
          updateConversation.mutate({ id: currentId, messages });
        } else {
          createConversation.mutateAsync(messages).then((conv) => {
            activeIdRef.current = conv.id;
            setActiveConversationId(conv.id);
          });
        }
      }, 1000);
    },
    [updateConversation, createConversation]
  );

  const handleNewChat = useCallback(() => {
    setActiveConversationId(null);
    activeIdRef.current = null;
    setChatKey((k) => k + 1);
  }, []);

  const handleSelectConversation = useCallback((id: string) => {
    setActiveConversationId(id);
    activeIdRef.current = id;
    setChatKey((k) => k + 1);
  }, []);

  const handleDeleteConversation = useCallback(
    (id: string) => {
      deleteConversation.mutate(id);
      if (activeIdRef.current === id) {
        handleNewChat();
      }
    },
    [deleteConversation, handleNewChat]
  );

  const handleTogglePin = useCallback(
    (id: string, pinned: boolean) => {
      togglePin.mutate({ id, is_pinned: pinned });
    },
    [togglePin]
  );

  const handleSendMessage = async (
    message: string,
    history: ChatMessage[],
    onChunk?: (text: string) => void
  ): Promise<string> => {
    // Page-aware context: what page was the user on before coming to Gandalf
    const lastPage = localStorage.getItem("gandalf-last-page") || "/";

    if (onChunk) {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

        const response = await fetch(`${supabaseUrl}/functions/v1/ai-chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token || supabaseKey}`,
            apikey: supabaseKey,
          },
          body: JSON.stringify({ message, history, stream: true, currentPage: lastPage }),
        });

        if (!response.ok) throw new Error(`API error: ${response.status}`);

        const contentType = response.headers.get("content-type") || "";

        if (contentType.includes("text/event-stream") && response.body) {
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let fullText = "";
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const data = line.slice(6).trim();
                if (data === "[DONE]") break;
                try {
                  const parsed = JSON.parse(data);
                  if (parsed.text) {
                    fullText += parsed.text;
                    onChunk(parsed.text);
                  }
                } catch {}
              }
            }
          }

          return fullText || (lang === "es" ? "Sin respuesta" : "No response");
        }

        const data = await response.json();
        return data.reply || (lang === "es" ? "Sin respuesta" : "No response");
      } catch (err) {
        console.warn("Streaming failed, falling back:", err);
      }
    }

    const { data, error } = await supabase.functions.invoke("ai-chat", {
      body: { message, history, currentPage: lastPage },
    });
    if (error) throw error;
    return data.reply || (lang === "es" ? "Sin respuesta" : "No response");
  };

  return (
    <div className={cn("flex h-[calc(100vh-3rem-4rem)] md:h-[calc(100vh-3rem)] overflow-hidden", isDark ? "bg-black" : "bg-white")}>
      <ChatHistorySidebar
        conversations={conversations}
        activeId={activeConversationId}
        onSelect={handleSelectConversation}
        onNew={handleNewChat}
        onDelete={handleDeleteConversation}
        onTogglePin={handleTogglePin}
        isDark={isDark}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />
      <div className="flex-1 min-w-0">
        <AnimatedAIChat
          key={chatKey}
          onSendMessage={handleSendMessage}
          lang={lang}
          externalMessages={activeMessages}
          onMessagesChange={handleMessagesChange}
          onNewChat={handleNewChat}
          insights={insights}
        />
      </div>
    </div>
  );
}
