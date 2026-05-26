"use client";

import { useEffect, useRef, useCallback } from "react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  CircleUserRound,
  X,
  TrendingUp,
  Package,
  Users,
  DollarSign,
  Copy,
  Check,
  Volume2,
  VolumeX,
  Mic,
  MicOff,
  RotateCcw,
  Download,
  AlertTriangle,
  Truck,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { GandalfChart, type ChartData } from "@/components/gandalf/GandalfChart";
import { AILoader } from "@/components/ui/ai-loader";

import { LiquidMetalButton } from "@/components/ui/liquid-metal-button";
import { LiquidMetalBorder } from "@/components/ui/liquid-metal-border";
import { GridAnimation } from "@/components/ui/grid-animation";
import { useTheme } from "@/hooks/use-theme";

// --- Auto-resize textarea hook ---
function useAutoResizeTextarea({ minHeight, maxHeight }: { minHeight: number; maxHeight?: number }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(
    (reset?: boolean) => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      if (reset) {
        textarea.style.height = `${minHeight}px`;
        return;
      }
      textarea.style.height = `${minHeight}px`;
      const newHeight = Math.max(minHeight, Math.min(textarea.scrollHeight, maxHeight ?? Number.POSITIVE_INFINITY));
      textarea.style.height = `${newHeight}px`;
    },
    [minHeight, maxHeight]
  );

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) textarea.style.height = `${minHeight}px`;
  }, [minHeight]);

  useEffect(() => {
    const handleResize = () => adjustHeight();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [adjustHeight]);

  return { textareaRef, adjustHeight };
}

// --- Types ---
interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  isError?: boolean;
}

interface QuickAction {
  icon: React.ReactNode;
  label: string;
  description: string;
  query: string;
}

interface AnimatedAIChatProps {
  onSendMessage: (message: string, history: ChatMessage[], onChunk?: (text: string) => void) => Promise<string>;
  lang?: "es" | "en";
  /** Externally-managed messages (from DB conversation) */
  externalMessages?: ChatMessage[];
  /** Called whenever messages change (for DB persistence) */
  onMessagesChange?: (messages: ChatMessage[]) => void;
  /** Called when user starts a new chat */
  onNewChat?: () => void;
  /** Proactive insights from parent (persists across remounts) */
  insights?: ProactiveInsight[];
}

// --- Gandalf avatar ---
function GandalfAvatar({ size = "lg", isDark = true }: { size?: "sm" | "md" | "lg"; isDark?: boolean }) {
  const src = isDark ? "/gandalf-dark.png" : "/gandalf-light.png";

  if (size === "lg") {
    return (
      <img
        src={src}
        alt="Gandalf"
        className={cn(
          "w-24 h-24 sm:w-40 sm:h-40 md:w-64 md:h-64 object-contain flex-shrink-0",
          isDark
            ? "drop-shadow-[0_0_40px_rgba(255,255,255,0.15)]"
            : "drop-shadow-[0_0_30px_rgba(0,0,0,0.1)]"
        )}
        style={{ background: "transparent" }}
      />
    );
  }

  const dim = size === "md" ? "w-14 h-14" : "w-10 h-10";

  return (
    <img
      src={src}
      alt="Gandalf"
      className={cn("object-contain flex-shrink-0 rounded-full", dim)}
      style={{ background: isDark ? "transparent" : "rgba(0,0,0,0.05)" }}
    />
  );
}

// --- Typing dots ---
function TypingDots() {
  return (
    <div className="flex items-center ml-1">
      {[1, 2, 3].map((dot) => (
        <motion.div
          key={dot}
          className="w-1.5 h-1.5 rounded-full mx-0.5"
          style={{ backgroundColor: "#0e4b7a" }}
          initial={{ opacity: 0.3 }}
          animate={{ opacity: [0.3, 0.9, 0.3], scale: [0.85, 1.1, 0.85] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: dot * 0.15, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

// --- Copy button for messages ---
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <motion.button
      onClick={handleCopy}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      className="p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
      title="Copiar"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </motion.button>
  );
}

// --- Text-to-Speech: speak Gandalf's messages ---
function cleanTextForSpeech(text: string): string {
  return text
    // Remove chart blocks
    .replace(/:::chart\{[\s\S]*?\}:::/g, "")
    // Remove markdown bold/italic
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1")
    // Remove markdown headers
    .replace(/^#{1,6}\s+/gm, "")
    // Remove markdown links [text](url) → text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // Remove markdown images
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    // Remove inline code backticks
    .replace(/`([^`]+)`/g, "$1")
    // Remove code blocks
    .replace(/```[\s\S]*?```/g, "")
    // Remove table pipes and dashes
    .replace(/\|/g, ",")
    .replace(/^[-:]+$/gm, "")
    .replace(/^-{3,}$/gm, "")
    // Remove markdown list markers
    .replace(/^[\s]*[-*+]\s+/gm, "")
    .replace(/^[\s]*\d+\.\s+/gm, "")
    // Remove URLs
    .replace(/https?:\/\/[^\s]+/g, "")
    // Clean up extra whitespace/newlines
    .replace(/\n{3,}/g, "\n\n")
    .replace(/,{2,}/g, ",")
    .trim();
}

// --- ElevenLabs TTS ---
// Persistent audio element — created once, reused for all playback.
// Must be "unlocked" on a user gesture (tap) by calling .play() on it.
const sharedAudio = typeof document !== "undefined" ? new Audio() : null;
let audioUnlocked = false;

function unlockAudio() {
  if (audioUnlocked || !sharedAudio) return;
  // Play silence to unlock audio playback on mobile
  sharedAudio.src = "data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA/+M4wAAAAAAAAAAAAEluZm8AAAAPAAAAAwAAAbAAqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV////////////////////////////////////////////AAAAAExhdmM1OC4xMwAAAAAAAAAAAAAAACQAAAAAAAAAAaC3pJj2AAAAAAAAAAAAAAAAAAAAAP/jOMAAAYAJgAAAAACIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiP/jOMAAAAGACYAAAAAiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiI=";
  sharedAudio.play().then(() => {
    sharedAudio.pause();
    audioUnlocked = true;
  }).catch(() => {});
}

function stopSpeaking() {
  if (sharedAudio) {
    sharedAudio.pause();
    sharedAudio.currentTime = 0;
  }
}

async function elevenlabsSpeak(
  text: string,
  onStart?: () => void,
  onEnd?: () => void,
): Promise<void> {
  if (!sharedAudio) {
    onEnd?.();
    return;
  }

  // Stop any current playback
  sharedAudio.pause();
  sharedAudio.currentTime = 0;

  const clean = cleanTextForSpeech(text);
  if (!clean) {
    onEnd?.();
    return;
  }

  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    const response = await fetch(`${supabaseUrl}/functions/v1/tts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseKey}`,
        apikey: supabaseKey,
      },
      body: JSON.stringify({ text: clean }),
    });

    if (!response.ok) throw new Error(`TTS error: ${response.status}`);

    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);

    sharedAudio.src = audioUrl;
    sharedAudio.playbackRate = 1.0;
    sharedAudio.defaultPlaybackRate = 1.0;
    sharedAudio.onplay = () => onStart?.();
    sharedAudio.onended = () => {
      URL.revokeObjectURL(audioUrl);
      onEnd?.();
    };
    sharedAudio.onerror = () => {
      URL.revokeObjectURL(audioUrl);
      onEnd?.();
    };

    await sharedAudio.play();
  } catch (err) {
    console.error("ElevenLabs TTS failed:", err);
    onEnd?.();
  }
}


function SpeakButton({ text }: { text: string }) {
  const [speaking, setSpeaking] = useState(false);

  const handleSpeak = () => {
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
      return;
    }

    unlockAudio();
    elevenlabsSpeak(
      text,
      () => setSpeaking(true),
      () => setSpeaking(false),
    );
  };

  return (
    <motion.button
      onClick={handleSpeak}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      className="p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
      title={speaking ? "Detener" : "Escuchar"}
    >
      {speaking ? <VolumeX className="w-3.5 h-3.5 text-cyan-500" /> : <Volume2 className="w-3.5 h-3.5" />}
    </motion.button>
  );
}

// --- Speech-to-Text hook: mic input ---
function useSpeechRecognition(lang: string) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const recognitionRef = useRef<any>(null);

  const startListening = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = lang === "es" ? "es-MX" : "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onresult = (event: any) => {
      let finalTranscript = "";
      for (let i = 0; i < event.results.length; i++) {
        finalTranscript += event.results[i][0].transcript;
      }
      setTranscript(finalTranscript);
    };

    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
    setTranscript("");
  }, [lang]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  const isSupported = typeof window !== "undefined" && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  return { isListening, transcript, startListening, stopListening, isSupported };
}

// --- Parse message content for inline charts ---
function parseMessageWithCharts(content: string): Array<{ type: "text"; content: string } | { type: "chart"; data: ChartData }> {
  const parts: Array<{ type: "text"; content: string } | { type: "chart"; data: ChartData }> = [];
  const chartRegex = /:::chart(\{[\s\S]*?\}):::/g;
  let lastIndex = 0;
  let match;

  while ((match = chartRegex.exec(content)) !== null) {
    // Text before the chart
    if (match.index > lastIndex) {
      const textBefore = content.slice(lastIndex, match.index).trim();
      if (textBefore) parts.push({ type: "text", content: textBefore });
    }
    // Parse chart JSON
    try {
      const chartData = JSON.parse(match[1]) as ChartData;
      parts.push({ type: "chart", data: chartData });
    } catch {
      // If JSON parse fails, just show as text
      parts.push({ type: "text", content: match[0] });
    }
    lastIndex = match.index + match[0].length;
  }

  // Remaining text
  if (lastIndex < content.length) {
    const remaining = content.slice(lastIndex).trim();
    if (remaining) parts.push({ type: "text", content: remaining });
  }

  // If no charts found, return the full content as text
  if (parts.length === 0) parts.push({ type: "text", content });

  return parts;
}

// --- Smart quick actions hook ---
function useSmartQuickActions(lang: "es" | "en"): QuickAction[] {
  const [dynamicActions, setDynamicActions] = useState<QuickAction[]>([]);

  useEffect(() => {
    async function fetchSmartData() {
      try {
        const [
          { data: orders },
          { data: products },
          { data: stockEntries },
          { data: orderItems },
        ] = await Promise.all([
          supabase.from("orders").select("id, status, order_code, client_id").limit(100),
          supabase.from("products").select("id, clave, name, active, stock_adjustment"),
          supabase.from("stock_entries").select("product_id, quantity, entry_status"),
          supabase.from("order_items").select("order_id, product_id, quantity"),
        ]);

        const activeStatuses = new Set(["Nuevo", "Confirmado", "En preparacion", "En ruta"]);
        const enRutaCount = (orders || []).filter((o: any) => o.status === "En ruta").length;
        const pendingCount = (orders || []).filter((o: any) => activeStatuses.has(o.status)).length;

        const stockByProd: Record<string, number> = {};
        (stockEntries || []).forEach((se: any) => {
          if (se.entry_status === "Recibido") {
            stockByProd[se.product_id] = (stockByProd[se.product_id] || 0) + se.quantity;
          }
        });
        const committedByProd: Record<string, number> = {};
        (orderItems || []).forEach((oi: any) => {
          const order = (orders || []).find((o: any) => o.id === oi.order_id);
          if (order && activeStatuses.has(order.status)) {
            committedByProd[oi.product_id] = (committedByProd[oi.product_id] || 0) + oi.quantity;
          }
        });

        const activeProducts = (products || []).filter((p: any) => p.active);
        let lowStockCount = 0;
        activeProducts.forEach((p: any) => {
          const received = stockByProd[p.id] || 0;
          const adj = p.stock_adjustment || 0;
          const committed = committedByProd[p.id] || 0;
          if (received + adj - committed <= 5 && committed > 0) lowStockCount++;
        });

        const actions: QuickAction[] = lang === "es"
          ? [
              {
                icon: <Users className="w-4 h-4" />,
                label: "Clientes",
                description: "Ranking y compras",
                query: "¿Quiénes son mis mejores clientes este mes y cuánto han comprado?",
              },
              {
                icon: <TrendingUp className="w-4 h-4" />,
                label: "Ventas",
                description: `${pendingCount} activos`,
                query: "Dame un resumen completo de ventas del mes actual con totales por marca y comparación con el histórico.",
              },
              {
                icon: <Package className="w-4 h-4" />,
                label: "Inventario",
                description: lowStockCount > 0 ? `${lowStockCount} alertas` : "Estado general",
                query: lowStockCount > 0
                  ? "¿Qué productos tienen stock bajo? Dame las alertas de inventario y recomendaciones de compra."
                  : "¿Cómo está mi inventario? Dame un resumen por marca.",
              },
              {
                icon: <DollarSign className="w-4 h-4" />,
                label: "Márgenes",
                description: "Rentabilidad",
                query: "¿Qué productos tienen mejor y peor margen de ganancia? Incluye recomendaciones.",
              },
            ]
          : [
              {
                icon: <Users className="w-4 h-4" />,
                label: "Clients",
                description: "Ranking & purchases",
                query: "Who are my top clients this month and how much have they bought?",
              },
              {
                icon: <TrendingUp className="w-4 h-4" />,
                label: "Sales",
                description: `${pendingCount} active`,
                query: "Give me a complete sales summary for the current month with totals by brand.",
              },
              {
                icon: <Package className="w-4 h-4" />,
                label: "Inventory",
                description: lowStockCount > 0 ? `${lowStockCount} alerts` : "General status",
                query: "How's my inventory? Which products have low stock?",
              },
              {
                icon: <DollarSign className="w-4 h-4" />,
                label: "Margins",
                description: "Profitability",
                query: "Which products have the best and worst profit margins? Include recommendations.",
              },
            ];

        if (enRutaCount > 0) {
          actions.push(
            lang === "es"
              ? {
                  icon: <Truck className="w-4 h-4" />,
                  label: "En ruta",
                  description: `${enRutaCount} entregas`,
                  query: "¿Qué pedidos están actualmente en ruta? Dame detalles de cada entrega.",
                }
              : {
                  icon: <Truck className="w-4 h-4" />,
                  label: "In transit",
                  description: `${enRutaCount} deliveries`,
                  query: "Which orders are currently in transit? Give me details on each delivery.",
                }
          );
        }

        setDynamicActions(actions);
      } catch {
        setDynamicActions(
          lang === "es"
            ? [
                { icon: <Users className="w-4 h-4" />, label: "Clientes", description: "Ranking", query: "¿Quiénes son mis mejores clientes y cuánto han comprado?" },
                { icon: <TrendingUp className="w-4 h-4" />, label: "Ventas", description: "Resumen", query: "Dame un resumen completo de mis ventas" },
                { icon: <Package className="w-4 h-4" />, label: "Inventario", description: "Estado", query: "¿Cómo está mi inventario? ¿Qué productos tienen stock bajo?" },
                { icon: <DollarSign className="w-4 h-4" />, label: "Márgenes", description: "Rentabilidad", query: "¿Qué productos tienen mejor margen de ganancia?" },
              ]
            : [
                { icon: <Users className="w-4 h-4" />, label: "Clients", description: "Ranking", query: "Who are my top clients and how much have they bought?" },
                { icon: <TrendingUp className="w-4 h-4" />, label: "Sales", description: "Summary", query: "Give me a complete sales summary" },
                { icon: <Package className="w-4 h-4" />, label: "Inventory", description: "Status", query: "How's my inventory? Which products have low stock?" },
                { icon: <DollarSign className="w-4 h-4" />, label: "Margins", description: "Profit", query: "Which products have the best profit margin?" },
              ]
        );
      }
    }

    fetchSmartData();
  }, [lang]);

  return dynamicActions;
}

// --- Proactive insights ---
export interface ProactiveInsight {
  type: "warning" | "info" | "opportunity" | "urgent";
  icon: string;
  title: string;
  description: string;
  action?: string;
}

// Voice mode state — persists across remounts (chatKey changes)
let globalAutoSpeak = false;

// --- Main component ---
export function AnimatedAIChat({ onSendMessage, lang = "es", externalMessages, onMessagesChange, onNewChat, insights = [] }: AnimatedAIChatProps) {
  const [value, setValue] = useState("");
  const [messages, setMessagesInternal] = useState<ChatMessage[]>(externalMessages || []);
  const [isTyping, setIsTyping] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [lastFailedMessage, setLastFailedMessage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { textareaRef, adjustHeight } = useAutoResizeTextarea({ minHeight: 56, maxHeight: 200 });
  const quickActions = useSmartQuickActions(lang);
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const { isListening, transcript, startListening, stopListening, isSupported: micSupported } = useSpeechRecognition(lang);
  const [autoSpeak, setAutoSpeakState] = useState(globalAutoSpeak);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const autoSpeakRef = useRef(globalAutoSpeak);

  const setAutoSpeak = useCallback((val: boolean) => {
    globalAutoSpeak = val;
    autoSpeakRef.current = val;
    setAutoSpeakState(val);
  }, []);

  // Wrap setMessages to also notify parent
  const setMessages = useCallback((updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
    setMessagesInternal((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      onMessagesChange?.(next);
      return next;
    });
  }, [onMessagesChange]);

  // Sync when external messages change (switching conversations)
  useEffect(() => {
    if (externalMessages) {
      setMessagesInternal(externalMessages);
    }
  }, [externalMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText]);

  // Fill textarea with voice transcript
  useEffect(() => {
    if (transcript) {
      setValue(transcript);
      adjustHeight();
    }
  }, [transcript, adjustHeight]);

  // Auto-send when voice recognition ends with a transcript
  useEffect(() => {
    if (!isListening && transcript && autoSpeak) {
      handleSend(transcript);
    }
  }, [isListening]);

  // Toggle voice conversation mode
  const toggleVoiceMode = useCallback(() => {
    if (autoSpeak) {
      // Turning off — stop everything
      setAutoSpeak(false);
      setIsSpeaking(false);
      stopListening();
      stopSpeaking();
    } else {
      // Turning on — unlock audio for mobile, then start listening
      unlockAudio();
      setAutoSpeak(true);
      if (micSupported) {
        setTimeout(() => startListening(), 300);
      }
    }
  }, [autoSpeak, micSupported, startListening, stopListening]);

  const handleSend = async (text?: string) => {
    const msg = (text || value).trim();
    if (!msg || isTyping) return;

    setLastFailedMessage(null);
    const userMsg: ChatMessage = { role: "user", content: msg };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setValue("");
    adjustHeight(true);
    setIsTyping(true);
    setStreamingText("");

    try {
      const reply = await onSendMessage(msg, messages, (chunk) => {
        setStreamingText((prev) => prev + chunk);
      });
      setStreamingText("");
      setMessages([...newMessages, { role: "assistant", content: reply }]);

      // Auto-speak Gandalf's reply via ElevenLabs, then re-listen
      if (autoSpeakRef.current && reply) {
        elevenlabsSpeak(
          reply,
          () => setIsSpeaking(true),
          () => {
            setIsSpeaking(false);
            if (micSupported) {
              setTimeout(() => startListening(), 400);
            }
          },
        );
      }
    } catch (err: any) {
      setStreamingText("");
      const errorMsg = err.message || "Connection failed";
      setMessages([...newMessages, { role: "assistant", content: `Error: ${errorMsg}`, isError: true }]);
      setLastFailedMessage(msg);
    } finally {
      setIsTyping(false);
      textareaRef.current?.focus();
    }
  };

  const handleRetry = () => {
    if (!lastFailedMessage) return;
    setMessages((prev) => prev.slice(0, -2));
    setTimeout(() => handleSend(lastFailedMessage), 100);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearChat = () => {
    setMessagesInternal([]);
    setValue("");
    setStreamingText("");
    setLastFailedMessage(null);
    onNewChat?.();
  };

  const exportChat = () => {
    const text = messages
      .map((m) => `${m.role === "user" ? "Tú" : "Gandalf"}: ${m.content}`)
      .join("\n\n---\n\n");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gandalf-chat-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const hasMessages = messages.length > 0;

  return (
    <div className={cn(
      "flex flex-col h-full w-full items-center relative overflow-hidden",
      isDark ? "bg-black" : "bg-white"
    )}>
      {/* Voice mode orb overlay */}
      <AnimatePresence>
        {autoSpeak && (isListening || isSpeaking || isTyping) && (
          <motion.div
            className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-b from-[#1a3379] via-[#0f172a] to-black"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
          >
            <AILoader
              size={200}
              centerImage={isDark ? "/gandalf-dark.png" : "/gandalf-light.png"}
              centerImageAlt="Gandalf"
            />
            <motion.p
              className="mt-6 text-white/60 text-sm font-medium"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              {isListening
                ? (lang === "es" ? "Escuchando..." : "Listening...")
                : isTyping
                ? (lang === "es" ? "Pensando..." : "Thinking...")
                : isSpeaking
                ? (lang === "es" ? "Hablando..." : "Speaking...")
                : ""}
            </motion.p>
            <motion.button
              className="mt-8 px-6 py-2 rounded-full border border-white/20 text-white/50 text-xs hover:bg-white/10 hover:text-white/80 transition-colors"
              onClick={toggleVoiceMode}
              whileTap={{ scale: 0.95 }}
            >
              {lang === "es" ? "Detener" : "Stop"}
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Background — grid animation */}
      {!hasMessages && (
        <GridAnimation
          className="absolute inset-0 z-0 w-full h-full pointer-events-none"
          strokeColor={isDark ? "#ffffff" : "#0e4b7a"}
          strokeWidth={1.5}
          strokeLength={14}
          spacing={28}
        />
      )}

      <div className="w-full max-w-5xl mx-auto relative z-10 flex flex-col h-full px-4 lg:px-8 py-4">
        {/* Header with clear + export buttons */}
        {hasMessages && (
          <motion.div
            className="flex items-center justify-between mb-3"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div
              className="flex items-center gap-3 cursor-pointer group"
              onClick={clearChat}
              title={lang === "es" ? "Nueva conversación" : "New conversation"}
            >
              <GandalfAvatar size="md" isDark={isDark} />
              <div className="flex flex-col">
                <span className={cn("text-base font-semibold transition-colors", isDark ? "text-white/80 group-hover:text-white" : "text-slate-700 group-hover:text-slate-900")}>Gandalf</span>
                <span className={cn("text-xs", isDark ? "text-white/30" : "text-slate-400")}>
                  Sonnet 4 · {messages.filter((m) => m.role === "user").length} {lang === "es" ? "mensajes" : "messages"}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <motion.button
                onClick={exportChat}
                whileTap={{ scale: 0.95 }}
                className={cn("flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors", isDark ? "text-white/40 hover:text-white/80 hover:bg-white/[0.06]" : "text-slate-400 hover:text-slate-700 hover:bg-slate-100")}
                title={lang === "es" ? "Exportar conversación" : "Export conversation"}
              >
                <Download className="w-3.5 h-3.5" />
                {lang === "es" ? "Exportar" : "Export"}
              </motion.button>
              <motion.button
                onClick={clearChat}
                whileTap={{ scale: 0.95 }}
                className={cn("flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors", isDark ? "text-white/40 hover:text-white/80 hover:bg-white/[0.06]" : "text-slate-400 hover:text-slate-700 hover:bg-slate-100")}
              >
                <X className="w-3.5 h-3.5" />
                {lang === "es" ? "Terminar" : "End"}
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* Welcome screen OR messages */}
        <div className="flex-1 overflow-y-auto">
          {!hasMessages ? (
            <motion.div
              className="flex flex-col items-center space-y-4 md:space-y-6 py-4 md:py-8 px-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1.2, ease: "easeOut" }}
            >
              {/* Gandalf dark theme image with glow */}
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.3, duration: 1.4, ease: [0.25, 0.1, 0.25, 1] }}
                className="relative"
              >
                {isDark && <div className="absolute inset-0 rounded-full blur-[60px] scale-150 bg-cyan-500/10" />}
                <GandalfAvatar size="lg" isDark={isDark} />
              </motion.div>

              {/* Title + subtitle */}
              <div className="text-center space-y-1 md:space-y-3">
                <motion.h1
                  className={cn("text-2xl md:text-4xl font-bold tracking-tight", isDark ? "text-white" : "text-slate-800")}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.6, duration: 1.2, ease: "easeOut" }}
                >
                  {lang === "es" ? "¿Cómo puedo ayudarte hoy?" : "How can I help today?"}
                </motion.h1>
                <motion.p
                  className={cn("text-sm md:text-base hidden sm:block", isDark ? "text-white/50" : "text-slate-500")}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.9, duration: 1.2, ease: "easeOut" }}
                >
                  {lang === "es"
                    ? "Analizo ventas, inventario, márgenes y más con datos en tiempo real"
                    : "I analyze sales, inventory, margins and more with real-time data"}
                </motion.p>
                <motion.div
                  className={cn("flex items-center justify-center gap-2 text-xs md:text-sm", isDark ? "text-white/40" : "text-slate-400")}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1.1, duration: 1.2, ease: "easeOut" }}
                >
                  <span className="inline-block w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  <span>Powered by Claude Sonnet 4</span>
                </motion.div>
              </div>

              {/* Input box with glow border */}
              <motion.div
                className="w-full max-w-3xl"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.3, duration: 1.2, ease: "easeOut" }}
              >
                <div className={cn(
                  "rounded-2xl border transition-shadow duration-700",
                  isDark
                    ? "border-white/[0.12] shadow-[0_0_30px_rgba(100,200,255,0.08),0_0_60px_rgba(100,200,255,0.04)] hover:shadow-[0_0_40px_rgba(100,200,255,0.12),0_0_80px_rgba(100,200,255,0.06)]"
                    : "border-slate-200 shadow-lg hover:shadow-xl"
                )}>
                  <div className={cn("backdrop-blur-xl rounded-2xl", isDark ? "bg-black/80" : "bg-white/90")}>
                    <div className="p-4">
                      <textarea
                        ref={textareaRef}
                        value={value}
                        onChange={(e) => {
                          setValue(e.target.value);
                          adjustHeight();
                        }}
                        onKeyDown={handleKeyDown}
                        placeholder={lang === "es" ? "Pregúntale algo a Gandalf..." : "Ask Gandalf anything..."}
                        disabled={isTyping}
                        className={cn(
                          "w-full px-4 py-3 resize-none bg-transparent border-none text-sm",
                          isDark ? "text-white placeholder:text-white/25" : "text-slate-800 placeholder:text-slate-400",
                          "focus:outline-none min-h-[56px]"
                        )}
                        style={{ overflow: "hidden" }}
                      />
                    </div>
                    <div className="px-4 pb-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <LiquidMetalButton
                          label={lang === "es" ? "Enviar" : "Send"}
                          onClick={() => handleSend()}
                          light={!isDark}
                        />
                        {micSupported && (
                          <motion.button
                            onClick={isListening ? stopListening : startListening}
                            whileTap={{ scale: 0.9 }}
                            className={cn(
                              "p-2 rounded-full transition-colors",
                              isListening
                                ? "bg-red-500/20 text-red-400 animate-pulse"
                                : isDark ? "text-white/30 hover:text-white/60 hover:bg-white/[0.06]" : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                            )}
                            title={isListening ? (lang === "es" ? "Detener" : "Stop") : (lang === "es" ? "Hablar" : "Speak")}
                          >
                            {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                          </motion.button>
                        )}
                      </div>
                      <motion.button
                        onClick={() => toggleVoiceMode()}
                        whileTap={{ scale: 0.9 }}
                        className={cn(
                          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors",
                          autoSpeak
                            ? "bg-blue-600/20 text-blue-400"
                            : isDark ? "text-white/20 hover:text-white/40 hover:bg-white/[0.04]" : "text-slate-400 hover:text-slate-500 hover:bg-slate-50"
                        )}
                        title={lang === "es" ? "Modo conversación por voz" : "Voice conversation mode"}
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                        <span>{lang === "es" ? "Voz" : "Voice"}</span>
                      </motion.button>
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* Proactive insights — horizontal scrolling ticker */}
              {insights.length > 0 && (
                <motion.div
                  className="w-full max-w-3xl"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1.5, duration: 1.0, ease: "easeOut" }}
                >
                  <div className={cn(
                    "rounded-xl border px-4 py-3",
                    isDark
                      ? "bg-white/[0.03] border-white/[0.08]"
                      : "bg-slate-50 border-slate-200"
                  )}>
                    <div className={cn("text-[10px] font-medium uppercase tracking-wider mb-2", isDark ? "text-white/25" : "text-slate-400")}>
                      {lang === "es" ? "Alertas del negocio" : "Business alerts"}
                    </div>
                    <div className="flex flex-col gap-1 max-h-[80px] sm:max-h-none overflow-hidden">
                      {insights.slice(0, 4).map((insight, i) => (
                        <button
                          key={i}
                          onClick={() => insight.action && handleSend(insight.action)}
                          className={cn(
                            "flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-all -mx-1",
                            isDark
                              ? "hover:bg-white/[0.06]"
                              : "hover:bg-slate-100"
                          )}
                        >
                          <span className="text-sm flex-shrink-0">{insight.icon}</span>
                          <span className={cn("text-xs truncate", isDark ? "text-white/60" : "text-slate-600")}>{insight.title}</span>
                          <span className={cn("text-[10px] truncate ml-auto flex-shrink-0", isDark ? "text-white/25" : "text-slate-400")}>{insight.description}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Quick action buttons — single row, each with liquid metal border */}
              <motion.div
                className="grid grid-cols-2 md:flex md:items-center md:justify-center gap-2 md:gap-3 w-full max-w-3xl"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: insights.length > 0 ? 1.8 : 1.6, duration: 1.2, ease: "easeOut" }}
              >
                {quickActions.map((action, index) => (
                  <div key={index} className="flex-1">
                    <LiquidMetalBorder borderRadius={16} borderWidth={2} light={!isDark}>
                      <button
                        onClick={() => handleSend(action.query)}
                        className={cn(
                          "w-full flex items-center gap-2 md:gap-2.5 px-3 md:px-4 py-2.5 md:py-3 backdrop-blur-sm text-sm transition-all rounded-[14px]",
                          isDark
                            ? "bg-black/70 hover:bg-black/50"
                            : "bg-white hover:bg-slate-50"
                        )}
                      >
                        <span className={cn("shrink-0", isDark ? "text-cyan-400" : "text-cyan-600")}>{action.icon}</span>
                        <div className="flex flex-col items-start min-w-0">
                          <span className={cn("font-medium text-xs truncate w-full", isDark ? "text-white/80" : "text-slate-700")}>{action.label}</span>
                          <span className={cn("text-[10px] truncate w-full hidden sm:block", isDark ? "text-white/30" : "text-slate-400")}>{action.description}</span>
                        </div>
                      </button>
                    </LiquidMetalBorder>
                  </div>
                ))}
              </motion.div>
            </motion.div>
          ) : (
            /* Chat messages */
            <div className="space-y-4 pb-4">
              {messages.map((msg, i) => (
                <motion.div
                  key={i}
                  className={cn("flex gap-3", msg.role === "user" ? "justify-end" : "justify-start")}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  {msg.role === "assistant" && <GandalfAvatar size="sm" isDark={isDark} />}
                  <div className="flex flex-col gap-1 max-w-[85%] min-w-0 overflow-hidden">
                    <div
                      className={cn(
                        "px-4 md:px-5 py-3 md:py-4 rounded-2xl text-sm md:text-[15px] leading-relaxed overflow-x-auto",
                        msg.role === "user"
                          ? "text-white rounded-br-md whitespace-pre-wrap"
                          : msg.isError
                          ? cn("bg-red-500/10 border border-red-500/20 rounded-bl-md", isDark ? "text-white" : "text-slate-800")
                          : cn(
                              "rounded-bl-md gandalf-prose prose prose-base max-w-none prose-table:text-sm prose-th:px-3 prose-th:py-2 prose-td:px-3 prose-td:py-2 prose-th:text-left prose-table:border-collapse prose-th:border-b-2 prose-p:my-2 prose-ul:my-2 prose-li:my-1",
                              isDark
                                ? "bg-white/[0.04] border border-white/[0.06] text-white prose-invert prose-th:border-b-cyan-500/30 prose-td:border-b prose-td:border-b-white/[0.06] prose-th:bg-white/[0.03] prose-headings:text-white prose-strong:text-white prose-li:marker:text-cyan-400"
                                : "bg-white border border-slate-200 text-slate-800 shadow-sm prose-th:border-b-cyan-500/30 prose-td:border-b prose-td:border-b-slate-100 prose-th:bg-slate-50 prose-headings:text-slate-800 prose-strong:text-slate-800 prose-li:marker:text-cyan-500"
                            )
                      )}
                      style={msg.role === "user" ? { background: "linear-gradient(135deg, #0e4b7a, #1a6baa)" } : undefined}
                    >
                      {msg.isError ? (
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                          <span>{msg.content}</span>
                        </div>
                      ) : msg.role === "assistant" ? (
                        <>
                          {parseMessageWithCharts(msg.content).map((part, pi) =>
                            part.type === "chart" ? (
                              <GandalfChart key={pi} chart={part.data} />
                            ) : (
                              <ReactMarkdown key={pi} remarkPlugins={[remarkGfm]}>{part.content}</ReactMarkdown>
                            )
                          )}
                        </>
                      ) : (
                        msg.content
                      )}
                    </div>
                    {msg.role === "assistant" && (
                      <div className="flex items-center gap-1 ml-1">
                        <CopyButton text={msg.content} />
                        {!msg.isError && <SpeakButton text={msg.content} />}
                        {msg.isError && lastFailedMessage && i === messages.length - 1 && (
                          <motion.button
                            onClick={handleRetry}
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-colors"
                          >
                            <RotateCcw className="w-3 h-3" />
                            {lang === "es" ? "Reintentar" : "Retry"}
                          </motion.button>
                        )}
                      </div>
                    )}
                  </div>
                  {msg.role === "user" && (
                    <div className={cn("h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 mt-1", isDark ? "bg-white/[0.06]" : "bg-slate-100")}>
                      <CircleUserRound className={cn("h-4 w-4", isDark ? "text-white/40" : "text-slate-400")} />
                    </div>
                  )}
                </motion.div>
              ))}

              {isTyping && (
                <motion.div
                  className="flex gap-3 justify-start"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <GandalfAvatar size="sm" isDark={isDark} />
                  <div className={cn("max-w-[85%] px-5 py-4 rounded-2xl rounded-bl-md", isDark ? "bg-white/[0.04] border border-white/[0.06]" : "bg-white border border-slate-200 shadow-sm")}>
                    {streamingText ? (
                      <div
                        className={cn(
                          "gandalf-prose prose prose-base max-w-none prose-table:text-sm prose-th:px-3 prose-th:py-2 prose-td:px-3 prose-td:py-2 prose-th:text-left prose-table:border-collapse prose-th:border-b-2 prose-p:my-2 prose-ul:my-2 prose-li:my-1 text-[15px] leading-relaxed",
                          isDark
                            ? "text-white prose-invert prose-th:border-b-cyan-500/30 prose-td:border-b prose-td:border-b-white/[0.06] prose-th:bg-white/[0.03] prose-headings:text-white prose-strong:text-white prose-li:marker:text-cyan-400"
                            : "text-slate-800 prose-p:text-slate-800 prose-headings:text-slate-800 prose-strong:text-slate-800 prose-li:text-slate-800 prose-th:border-b-cyan-500/30 prose-td:border-b prose-td:border-b-slate-100 prose-th:bg-slate-50 prose-li:marker:text-cyan-500"
                        )}
                        style={{ color: isDark ? "#ffffff" : "#1e293b" }}
                      >
                        {parseMessageWithCharts(streamingText + "▊").map((part, pi) =>
                          part.type === "chart" ? (
                            <GandalfChart key={pi} chart={part.data} />
                          ) : (
                            <ReactMarkdown key={pi} remarkPlugins={[remarkGfm]}>{part.content}</ReactMarkdown>
                          )
                        )}
                      </div>
                    ) : (
                      <div className={cn("flex items-center gap-2 text-sm", isDark ? "text-white/40" : "text-slate-400")}>
                        <span>{lang === "es" ? "Pensando" : "Thinking"}</span>
                        <TypingDots />
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input area when chatting */}
        {hasMessages && (
          <motion.div
            className={cn("w-full rounded-2xl border shadow-2xl mt-3 backdrop-blur-xl", isDark ? "border-white/[0.08] bg-black/40" : "border-slate-200 bg-white/90")}
            initial={{ scale: 0.98, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
          >
            <div className="p-3">
              <textarea
                ref={textareaRef}
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  adjustHeight();
                }}
                onKeyDown={handleKeyDown}
                placeholder={lang === "es" ? "Pregúntale algo a Gandalf..." : "Ask Gandalf anything..."}
                disabled={isTyping}
                className={cn(
                  "w-full px-4 py-3 resize-none bg-transparent border-none text-sm",
                  isDark ? "text-white placeholder:text-white/25" : "text-slate-800 placeholder:text-slate-400",
                  "focus:outline-none min-h-[56px]"
                )}
                style={{ overflow: "hidden" }}
              />
            </div>
            <div className="px-4 pb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <motion.button
                  onClick={() => toggleVoiceMode()}
                  whileTap={{ scale: 0.9 }}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors",
                    autoSpeak
                      ? "bg-blue-600/20 text-blue-400"
                      : isDark ? "text-white/20 hover:text-white/40 hover:bg-white/[0.04]" : "text-slate-400 hover:text-slate-500 hover:bg-slate-50"
                  )}
                  title={lang === "es" ? "Modo conversación por voz" : "Voice conversation mode"}
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>{lang === "es" ? "Voz" : "Voice"}</span>
                </motion.button>
              </div>
              <div className="flex items-center gap-2">
                {micSupported && (
                  <motion.button
                    onClick={isListening ? stopListening : startListening}
                    whileTap={{ scale: 0.9 }}
                    className={cn(
                      "p-2 rounded-full transition-colors",
                      isListening
                        ? "bg-red-500/20 text-red-400 animate-pulse"
                        : isDark ? "text-white/30 hover:text-white/60 hover:bg-white/[0.06]" : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                    )}
                    title={isListening ? (lang === "es" ? "Detener" : "Stop") : (lang === "es" ? "Hablar" : "Speak")}
                  >
                    {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </motion.button>
                )}
                <LiquidMetalButton
                  label={lang === "es" ? "Enviar" : "Send"}
                  onClick={() => handleSend()}
                  light={!isDark}
                />
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
