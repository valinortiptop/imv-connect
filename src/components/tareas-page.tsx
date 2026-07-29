// @ts-nocheck
import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  Plus, GripVertical, Calendar, User, MessageSquare, Send,
  Trash2, MoreHorizontal, X,
} from "lucide-react";
import { format } from "date-fns";
import {
  DndContext, closestCorners, PointerSensor, useSensor, useSensors,
  DragOverlay, DragStartEvent, DragEndEvent, DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy, useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { notifyEventFn } from "@/lib/notifications.functions";

/* ── Types ── */
interface Board { id: string; name: string; role: string | null; }
interface Column { id: string; board_id: string; title: string; sort_order: number; color: string | null; }
interface Card {
  id: string; column_id: string; title: string; description: string | null;
  assigned_to: string | null; assigned_name: string | null;
  priority: "alta" | "media" | "baja"; due_date: string | null;
  sort_order: number; created_by: string | null;
  created_at: string; updated_at: string;
}
interface Comment {
  id: string; card_id: string; user_id: string | null; user_name: string | null;
  text: string; created_at: string;
}

const PRIORITY_COLORS: Record<string, string> = {
  alta: "bg-red-500",
  media: "bg-yellow-500",
  baja: "bg-green-500",
};
const PRIORITY_LABELS: Record<string, { es: string; en: string }> = {
  alta: { es: "Alta", en: "High" },
  media: { es: "Media", en: "Medium" },
  baja: { es: "Baja", en: "Low" },
};

/* ── Sortable Card ── */
function SortableCard({ card, onClick }: { card: Card; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { type: "card", card },
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-white dark:bg-zinc-800 rounded-lg border border-border p-3 mb-2 cursor-pointer hover:shadow-md transition-shadow group"
      onClick={onClick}
    >
      <div className="flex items-start gap-2">
        <button
          {...attributes}
          {...listeners}
          className="mt-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <div className={cn("w-2 h-2 rounded-full shrink-0", PRIORITY_COLORS[card.priority])} />
            <span className="text-sm font-medium truncate">{card.title}</span>
          </div>
          {card.description && (
            <p className="text-xs text-muted-foreground line-clamp-2 ml-4">{card.description}</p>
          )}
          <div className="flex items-center gap-2 mt-2 ml-4 flex-wrap">
            {card.assigned_name && (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                <User className="h-3 w-3" />{card.assigned_name}
              </span>
            )}
            {card.due_date && (
              <span className={cn(
                "inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-full",
                new Date(card.due_date) < new Date() ? "text-red-600 bg-red-50 dark:bg-red-900/30" : "text-muted-foreground bg-muted"
              )}>
                <Calendar className="h-3 w-3" />{format(new Date(card.due_date), "dd/MM")}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Droppable Column ── */
function DroppableColumn({
  column, cards, onAddCard, onCardClick,
}: {
  column: Column; cards: Card[]; onAddCard: (columnId: string) => void; onCardClick: (card: Card) => void;
}) {
  const cardIds = useMemo(() => cards.map((c) => c.id), [cards]);

  return (
    <div className="flex-shrink-0 w-72 sm:w-80 flex flex-col max-h-full">
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-sm">{column.title}</h3>
          <Badge variant="secondary" className="text-[11px] px-1.5 h-5">{cards.length}</Badge>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onAddCard(column.id)}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto rounded-lg bg-muted/30 dark:bg-zinc-900/40 p-2 min-h-[120px]">
        <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <SortableCard key={card.id} card={card} onClick={() => onCardClick(card)} />
          ))}
        </SortableContext>
        {cards.length === 0 && (
          <div className="text-xs text-muted-foreground text-center py-8 italic">
            Sin tareas
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Main Component ── */
export default function Tareas() {
  const { user } = useAuth();
  const { lang } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const [activeCard, setActiveCard] = useState<Card | null>(null);
  const [detailCard, setDetailCard] = useState<Card | null>(null);
  const [showNewCard, setShowNewCard] = useState<string | null>(null); // column_id
  const [newCardTitle, setNewCardTitle] = useState("");
  const [newComment, setNewComment] = useState("");
  const [filterUser, setFilterUser] = useState<string>("all");

  // ── Queries ──
  const { data: boards = [], isLoading: boardsLoading } = useQuery({
    queryKey: ["kanban-boards"],
    queryFn: async () => {
      const { data, error } = await supabase.from("kanban_boards").select("*").order("created_at") as any;
      if (error) throw error;
      return (data ?? []) as Board[];
    },
  });

  const currentBoard = boards.find((b) => b.id === activeBoardId) ?? boards[0];
  const boardId = currentBoard?.id;

  // auto-select first board
  if (boards.length > 0 && !activeBoardId) {
    setActiveBoardId(boards[0].id);
  }

  const { data: columns = [] } = useQuery({
    queryKey: ["kanban-columns", boardId],
    queryFn: async () => {
      if (!boardId) return [];
      const { data, error } = await supabase
        .from("kanban_columns").select("*").eq("board_id", boardId).order("sort_order") as any;
      if (error) throw error;
      return (data ?? []) as Column[];
    },
    enabled: !!boardId,
  });

  const { data: allCards = [] } = useQuery({
    queryKey: ["kanban-cards", boardId],
    queryFn: async () => {
      if (!boardId) return [];
      const columnIds = columns.map((c) => c.id);
      if (columnIds.length === 0) return [];
      const { data, error } = await supabase
        .from("kanban_cards").select("*").in("column_id", columnIds).order("sort_order") as any;
      if (error) throw error;
      return (data ?? []) as Card[];
    },
    enabled: !!boardId && columns.length > 0,
  });

  const { data: comments = [], refetch: refetchComments } = useQuery({
    queryKey: ["kanban-comments", detailCard?.id],
    queryFn: async () => {
      if (!detailCard) return [];
      const { data, error } = await supabase
        .from("kanban_comments").select("*").eq("card_id", detailCard.id).order("created_at", { ascending: true }) as any;
      if (error) throw error;
      return (data ?? []) as Comment[];
    },
    enabled: !!detailCard,
  });

  // ── Team members (unique assigned names from all cards) ──
  const teamMembers = useMemo(() => {
    const names = new Set<string>();
    allCards.forEach((c) => { if (c.assigned_name) names.add(c.assigned_name); });
    return [...names].sort();
  }, [allCards]);

  // ── Filtered cards ──
  const filteredCards = useMemo(() => {
    if (filterUser === "all") return allCards;
    if (filterUser === "mine") return allCards.filter((c) => c.assigned_to === user?.id);
    return allCards.filter((c) => c.assigned_name === filterUser);
  }, [allCards, filterUser, user]);

  const cardsByColumn = useMemo(() => {
    const map = new Map<string, Card[]>();
    columns.forEach((col) => map.set(col.id, []));
    filteredCards.forEach((card) => {
      const arr = map.get(card.column_id);
      if (arr) arr.push(card);
    });
    return map;
  }, [filteredCards, columns]);

  // ── Mutations ──
  const createCard = useMutation({
    mutationFn: async ({ columnId, title }: { columnId: string; title: string }) => {
      const maxSort = allCards.filter((c) => c.column_id === columnId).reduce((m, c) => Math.max(m, c.sort_order), -1);
      const userEmail = user?.email ?? "Unknown";
      const { error } = await supabase.from("kanban_cards").insert({
        column_id: columnId, title, sort_order: maxSort + 1,
        created_by: user?.id, assigned_to: user?.id, assigned_name: userEmail,
        priority: "media",
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kanban-cards", boardId] });
      setShowNewCard(null);
      setNewCardTitle("");
    },
    onError: (e: any) => toast({ title: "Error", description: e.message }),
  });

  const updateCard = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Card> }) => {
      const { error } = await supabase.from("kanban_cards").update(updates as any).eq("id", id);
      if (error) throw error;
      if (updates.assigned_to && updates.assigned_to !== user?.id) {
        const card = allCards.find((c) => c.id === id);
        void notifyEventFn({
          data: {
            event: "tarea_asignada",
            userIds: [updates.assigned_to],
            vars: {
              titulo: updates.title ?? card?.title ?? "Tarea",
              tablero: "Tareas",
              vence: (updates as any).due_date ?? (card as any)?.due_date ?? "sin fecha",
              asignado_por: user?.email ?? "",
            },
          },
        }).catch(() => {});
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["kanban-cards", boardId] }),
    onError: (e: any) => toast({ title: "Error", description: e.message }),
  });

  const deleteCard = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("kanban_cards").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kanban-cards", boardId] });
      setDetailCard(null);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message }),
  });

  const addComment = useMutation({
    mutationFn: async ({ cardId, text }: { cardId: string; text: string }) => {
      const { error } = await supabase.from("kanban_comments").insert({
        card_id: cardId, user_id: user?.id, user_name: user?.email ?? "Unknown", text,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      refetchComments();
      setNewComment("");
    },
    onError: (e: any) => toast({ title: "Error", description: e.message }),
  });

  // ── DnD handlers ──
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const card = allCards.find((c) => c.id === event.active.id);
    if (card) setActiveCard(card);
  }, [allCards]);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    setActiveCard(null);
    const { active, over } = event;
    if (!over) return;

    const draggedCard = allCards.find((c) => c.id === active.id);
    if (!draggedCard) return;

    // Determine target column and position
    let targetColumnId: string;
    let targetIndex: number;

    const overCard = allCards.find((c) => c.id === over.id);
    if (overCard) {
      targetColumnId = overCard.column_id;
      const colCards = (cardsByColumn.get(targetColumnId) ?? []).filter((c) => c.id !== draggedCard.id);
      const overIndex = colCards.findIndex((c) => c.id === over.id);
      targetIndex = overIndex >= 0 ? overIndex : colCards.length;
    } else {
      // Dropped on a column area
      const col = columns.find((c) => c.id === over.id);
      if (col) {
        targetColumnId = col.id;
        targetIndex = (cardsByColumn.get(col.id) ?? []).length;
      } else {
        return;
      }
    }

    // Update in DB
    const colCards = (cardsByColumn.get(targetColumnId) ?? []).filter((c) => c.id !== draggedCard.id);
    colCards.splice(targetIndex, 0, draggedCard);

    // Batch update sort orders
    const updates = colCards.map((c, i) => ({
      id: c.id,
      column_id: targetColumnId,
      sort_order: i,
    }));

    for (const u of updates) {
      await supabase.from("kanban_cards").update({
        column_id: u.column_id, sort_order: u.sort_order, updated_at: new Date().toISOString(),
      } as any).eq("id", u.id);
    }

    queryClient.invalidateQueries({ queryKey: ["kanban-cards", boardId] });
  }, [allCards, columns, cardsByColumn, boardId, queryClient]);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    // Allow cross-column dragging by detecting column containers
  }, []);

  // ── Card detail handlers ──
  const handleDetailUpdate = (field: string, value: any) => {
    if (!detailCard) return;
    const updates = { [field]: value, updated_at: new Date().toISOString() };
    updateCard.mutate({ id: detailCard.id, updates });
    setDetailCard({ ...detailCard, [field]: value } as Card);
  };

  // ── Render ──
  if (boardsLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="flex gap-4">
          <Skeleton className="h-96 w-80" />
          <Skeleton className="h-96 w-80" />
          <Skeleton className="h-96 w-80" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b bg-background shrink-0 flex-wrap gap-2">
        <div className="flex items-center gap-2 overflow-x-auto">
          {boards.map((b) => (
            <Button
              key={b.id}
              variant={b.id === boardId ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveBoardId(b.id)}
              className="whitespace-nowrap"
            >
              {b.name}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Select value={filterUser} onValueChange={setFilterUser}>
            <SelectTrigger className="w-[160px] h-8 text-xs">
              <SelectValue placeholder={lang === "es" ? "Filtrar" : "Filter"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{lang === "es" ? "Todos" : "Everyone"}</SelectItem>
              <SelectItem value="mine">{lang === "es" ? "Mis tareas" : "My tasks"}</SelectItem>
              {teamMembers.map((name) => (
                <SelectItem key={name} value={name}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-4 sm:p-6">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragOver={handleDragOver}
        >
          <div className="flex gap-4 h-full">
            {columns.map((col) => (
              <DroppableColumn
                key={col.id}
                column={col}
                cards={cardsByColumn.get(col.id) ?? []}
                onAddCard={(colId) => {
                  setShowNewCard(colId);
                  setNewCardTitle("");
                }}
                onCardClick={(card) => setDetailCard(card)}
              />
            ))}
          </div>

          <DragOverlay>
            {activeCard && (
              <div className="bg-white dark:bg-zinc-800 rounded-lg border border-primary shadow-xl p-3 w-72 sm:w-80 rotate-2 opacity-90">
                <div className="flex items-center gap-2">
                  <div className={cn("w-2 h-2 rounded-full shrink-0", PRIORITY_COLORS[activeCard.priority])} />
                  <span className="text-sm font-medium truncate">{activeCard.title}</span>
                </div>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </div>

      {/* New card dialog */}
      <Dialog open={!!showNewCard} onOpenChange={(o) => !o && setShowNewCard(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{lang === "es" ? "Nueva tarea" : "New task"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <Input
              autoFocus
              placeholder={lang === "es" ? "Título de la tarea..." : "Task title..."}
              value={newCardTitle}
              onChange={(e) => setNewCardTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newCardTitle.trim() && showNewCard) {
                  createCard.mutate({ columnId: showNewCard, title: newCardTitle.trim() });
                }
              }}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowNewCard(null)}>
                {lang === "es" ? "Cancelar" : "Cancel"}
              </Button>
              <Button
                size="sm"
                disabled={!newCardTitle.trim()}
                onClick={() => showNewCard && createCard.mutate({ columnId: showNewCard, title: newCardTitle.trim() })}
              >
                {lang === "es" ? "Crear" : "Create"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Card detail sheet */}
      <Sheet open={!!detailCard} onOpenChange={(o) => !o && setDetailCard(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {detailCard && (
            <div className="space-y-6 pt-4">
              <SheetHeader>
                <SheetTitle className="sr-only">{detailCard.title}</SheetTitle>
              </SheetHeader>
              {/* Title */}
              <Input
                className="text-lg font-semibold border-none px-0 focus-visible:ring-0 shadow-none"
                value={detailCard.title}
                onChange={(e) => setDetailCard({ ...detailCard, title: e.target.value })}
                onBlur={() => handleDetailUpdate("title", detailCard.title)}
              />

              {/* Fields */}
              <div className="grid grid-cols-2 gap-4">
                {/* Priority */}
                <div>
                  <label className="text-xs text-muted-foreground font-medium mb-1 block">
                    {lang === "es" ? "Prioridad" : "Priority"}
                  </label>
                  <Select
                    value={detailCard.priority}
                    onValueChange={(v) => handleDetailUpdate("priority", v)}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(PRIORITY_LABELS).map(([key, label]) => (
                        <SelectItem key={key} value={key}>
                          <div className="flex items-center gap-2">
                            <div className={cn("w-2 h-2 rounded-full", PRIORITY_COLORS[key])} />
                            {label[lang]}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Assigned to */}
                <div>
                  <label className="text-xs text-muted-foreground font-medium mb-1 block">
                    {lang === "es" ? "Asignado" : "Assigned"}
                  </label>
                  <Input
                    className="h-9"
                    placeholder={lang === "es" ? "Nombre..." : "Name..."}
                    value={detailCard.assigned_name ?? ""}
                    onChange={(e) => setDetailCard({ ...detailCard, assigned_name: e.target.value })}
                    onBlur={() => handleDetailUpdate("assigned_name", detailCard.assigned_name)}
                  />
                </div>

                {/* Due date */}
                <div>
                  <label className="text-xs text-muted-foreground font-medium mb-1 block">
                    {lang === "es" ? "Fecha límite" : "Due date"}
                  </label>
                  <Input
                    type="date"
                    className="h-9"
                    value={detailCard.due_date ?? ""}
                    onChange={(e) => handleDetailUpdate("due_date", e.target.value || null)}
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="text-xs text-muted-foreground font-medium mb-1 block">
                  {lang === "es" ? "Notas" : "Notes"}
                </label>
                <Textarea
                  className="min-h-[100px] resize-none"
                  placeholder={lang === "es" ? "Agrega notas..." : "Add notes..."}
                  value={detailCard.description ?? ""}
                  onChange={(e) => setDetailCard({ ...detailCard, description: e.target.value })}
                  onBlur={() => handleDetailUpdate("description", detailCard.description)}
                />
              </div>

              {/* Activity / Comments */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-semibold">
                    {lang === "es" ? "Actividad" : "Activity"}
                  </span>
                </div>

                <div className="space-y-3 mb-4 max-h-60 overflow-y-auto">
                  {comments.map((c) => (
                    <div key={c.id} className="flex gap-2">
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0 mt-0.5">
                        {(c.user_name ?? "?")[0].toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="text-xs font-semibold">{c.user_name}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {format(new Date(c.created_at), "dd/MM HH:mm")}
                          </span>
                        </div>
                        <p className="text-sm text-foreground mt-0.5">{c.text}</p>
                      </div>
                    </div>
                  ))}
                  {comments.length === 0 && (
                    <p className="text-xs text-muted-foreground italic">
                      {lang === "es" ? "Sin actividad" : "No activity"}
                    </p>
                  )}
                </div>

                <div className="flex gap-2">
                  <Input
                    placeholder={lang === "es" ? "Escribe un comentario..." : "Write a comment..."}
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newComment.trim()) {
                        addComment.mutate({ cardId: detailCard.id, text: newComment.trim() });
                      }
                    }}
                  />
                  <Button
                    size="icon"
                    disabled={!newComment.trim()}
                    onClick={() => newComment.trim() && addComment.mutate({ cardId: detailCard.id, text: newComment.trim() })}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Delete */}
              <div className="pt-4 border-t">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => deleteCard.mutate(detailCard.id)}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  {lang === "es" ? "Eliminar tarea" : "Delete task"}
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
