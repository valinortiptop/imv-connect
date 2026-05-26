import { useState } from "react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import type { ChatConversation } from "@/hooks/use-chat-history";
import {
  MessageSquare,
  Plus,
  Pin,
  PinOff,
  Trash2,
  Search,
  MoreHorizontal,
  ChevronLeft,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface ChatHistorySidebarProps {
  conversations: ChatConversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onTogglePin: (id: string, pinned: boolean) => void;
  isDark: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

function timeAgo(dateStr: string, lang: "es" | "en"): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (lang === "es") {
    if (diffMin < 1) return "ahora";
    if (diffMin < 60) return `${diffMin}m`;
    if (diffHr < 24) return `${diffHr}h`;
    if (diffDay < 7) return `${diffDay}d`;
    return date.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
  }
  if (diffMin < 1) return "now";
  if (diffMin < 60) return `${diffMin}m`;
  if (diffHr < 24) return `${diffHr}h`;
  if (diffDay < 7) return `${diffDay}d`;
  return date.toLocaleDateString("en-US", { day: "numeric", month: "short" });
}

function groupConversations(conversations: ChatConversation[], lang: "es" | "en") {
  const pinned: ChatConversation[] = [];
  const today: ChatConversation[] = [];
  const yesterday: ChatConversation[] = [];
  const thisWeek: ChatConversation[] = [];
  const older: ChatConversation[] = [];

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 86400000);
  const weekStart = new Date(todayStart.getTime() - 7 * 86400000);

  for (const c of conversations) {
    if (c.is_pinned) { pinned.push(c); continue; }
    const d = new Date(c.updated_at);
    if (d >= todayStart) today.push(c);
    else if (d >= yesterdayStart) yesterday.push(c);
    else if (d >= weekStart) thisWeek.push(c);
    else older.push(c);
  }

  const groups: { label: string; items: ChatConversation[] }[] = [];
  if (pinned.length) groups.push({ label: lang === "es" ? "Fijados" : "Pinned", items: pinned });
  if (today.length) groups.push({ label: lang === "es" ? "Hoy" : "Today", items: today });
  if (yesterday.length) groups.push({ label: lang === "es" ? "Ayer" : "Yesterday", items: yesterday });
  if (thisWeek.length) groups.push({ label: lang === "es" ? "Esta semana" : "This week", items: thisWeek });
  if (older.length) groups.push({ label: lang === "es" ? "Anteriores" : "Older", items: older });
  return groups;
}

export function ChatHistorySidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onTogglePin,
  isDark,
  collapsed,
  onToggleCollapse,
}: ChatHistorySidebarProps) {
  const { lang } = useLanguage();
  const [search, setSearch] = useState("");
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  const filtered = search
    ? conversations.filter((c) => c.title.toLowerCase().includes(search.toLowerCase()))
    : conversations;

  const groups = groupConversations(filtered, lang);

  if (collapsed) {
    return (
      <div
        className={cn(
          "w-12 hidden md:flex flex-col items-center py-3 gap-2 border-r flex-shrink-0 transition-all",
          isDark ? "bg-black/50 border-white/[0.06]" : "bg-slate-50 border-slate-200"
        )}
      >
        <button
          onClick={onToggleCollapse}
          className={cn(
            "p-2 rounded-lg transition-colors",
            isDark ? "hover:bg-white/[0.06] text-white/50" : "hover:bg-slate-200 text-slate-500"
          )}
          title={lang === "es" ? "Expandir historial" : "Expand history"}
        >
          <MessageSquare className="w-4 h-4" />
        </button>
        <button
          onClick={onNew}
          className={cn(
            "p-2 rounded-lg transition-colors",
            isDark ? "hover:bg-white/[0.06] text-white/50" : "hover:bg-slate-200 text-slate-500"
          )}
          title={lang === "es" ? "Nueva conversación" : "New conversation"}
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "w-64 hidden md:flex flex-col border-r flex-shrink-0 transition-all",
        isDark ? "bg-black/50 border-white/[0.06]" : "bg-slate-50 border-slate-200"
      )}
    >
      {/* Header */}
      <div className={cn("px-3 py-3 flex items-center justify-between border-b", isDark ? "border-white/[0.06]" : "border-slate-200")}>
        <span className={cn("text-sm font-semibold", isDark ? "text-white/70" : "text-slate-700")}>
          {lang === "es" ? "Historial" : "History"}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={onNew}
            className={cn(
              "p-1.5 rounded-md transition-colors",
              isDark ? "hover:bg-white/[0.06] text-white/50 hover:text-white/80" : "hover:bg-slate-200 text-slate-400 hover:text-slate-700"
            )}
            title={lang === "es" ? "Nueva conversación" : "New conversation"}
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={onToggleCollapse}
            className={cn(
              "p-1.5 rounded-md transition-colors",
              isDark ? "hover:bg-white/[0.06] text-white/50 hover:text-white/80" : "hover:bg-slate-200 text-slate-400 hover:text-slate-700"
            )}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-2">
        <div className={cn("flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs", isDark ? "bg-white/[0.04] text-white/40" : "bg-white text-slate-400 border border-slate-200")}>
          <Search className="w-3.5 h-3.5 flex-shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={lang === "es" ? "Buscar chats..." : "Search chats..."}
            className="bg-transparent border-none outline-none w-full text-xs placeholder:opacity-60"
            style={{ color: isDark ? "rgba(255,255,255,0.7)" : "#334155" }}
          />
        </div>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {groups.length === 0 && (
          <div className={cn("text-center text-xs py-8", isDark ? "text-white/20" : "text-slate-400")}>
            {lang === "es" ? "Sin conversaciones" : "No conversations"}
          </div>
        )}
        {groups.map((group) => (
          <div key={group.label} className="mb-2">
            <div className={cn("px-2 py-1.5 text-[10px] font-medium uppercase tracking-wider", isDark ? "text-white/25" : "text-slate-400")}>
              {group.label}
            </div>
            {group.items.map((conv) => (
              <div
                key={conv.id}
                className={cn(
                  "group relative flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-colors mb-0.5",
                  activeId === conv.id
                    ? isDark ? "bg-white/[0.08] text-white" : "bg-slate-200 text-slate-900"
                    : isDark ? "hover:bg-white/[0.04] text-white/60" : "hover:bg-slate-100 text-slate-600"
                )}
                onClick={() => onSelect(conv.id)}
              >
                <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 opacity-50" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs truncate">{conv.title}</div>
                  <div className={cn("text-[10px]", isDark ? "text-white/25" : "text-slate-400")}>
                    {conv.messages.length} msg · {timeAgo(conv.updated_at, lang)}
                  </div>
                </div>
                {conv.is_pinned && <Pin className="w-3 h-3 flex-shrink-0 opacity-40" />}

                {/* Context menu button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(menuOpen === conv.id ? null : conv.id);
                  }}
                  className={cn(
                    "p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity",
                    isDark ? "hover:bg-white/[0.08]" : "hover:bg-slate-200"
                  )}
                >
                  <MoreHorizontal className="w-3.5 h-3.5" />
                </button>

                {/* Dropdown */}
                <AnimatePresence>
                  {menuOpen === conv.id && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className={cn(
                        "absolute right-0 top-full z-50 mt-1 rounded-lg border shadow-lg py-1 min-w-[140px]",
                        isDark ? "bg-zinc-900 border-white/[0.08]" : "bg-white border-slate-200"
                      )}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => {
                          onTogglePin(conv.id, !conv.is_pinned);
                          setMenuOpen(null);
                        }}
                        className={cn(
                          "w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors",
                          isDark ? "hover:bg-white/[0.06] text-white/60" : "hover:bg-slate-100 text-slate-600"
                        )}
                      >
                        {conv.is_pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                        {conv.is_pinned
                          ? (lang === "es" ? "Desfijar" : "Unpin")
                          : (lang === "es" ? "Fijar" : "Pin")}
                      </button>
                      <button
                        onClick={() => {
                          onDelete(conv.id);
                          setMenuOpen(null);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        {lang === "es" ? "Eliminar" : "Delete"}
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
