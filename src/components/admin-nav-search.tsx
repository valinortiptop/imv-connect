import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { NavGroup } from "@/components/nav-items";
import { flattenNav } from "@/components/nav-items";

/** Highlights the matched substring inside a label. */
export function Highlight({ text, query }: { text: string; query: string }): ReactNode {
  const q = query.trim();
  if (!q) return text;
  const nText = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const nQ = q.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const idx = nText.indexOf(nQ);
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded bg-primary/20 px-0.5 text-foreground">
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
}

export function useNavSearchShortcut(onOpen: () => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpen();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onOpen]);
}

export function AdminNavSearch({
  groups,
  open,
  onOpenChange,
}: {
  groups: NavGroup[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const items = flattenNav(groups);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const byGroup = groups
    .map((g) => ({ label: g.label, items: items.filter((i) => i.group === g.label) }))
    .filter((g) => g.items.length > 0);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Buscar página…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>Sin resultados.</CommandEmpty>
        {byGroup.map((g) => (
          <CommandGroup key={g.label} heading={g.label}>
            {g.items.map((item) => (
              <CommandItem
                key={item.key}
                value={`${item.label} ${g.label} ${item.url}`}
                onSelect={() => {
                  onOpenChange(false);
                  navigate({ to: item.url });
                }}
              >
                <img
                  src={item.icon}
                  alt=""
                  aria-hidden="true"
                  className="mr-2 h-4 w-4 shrink-0 object-contain mix-blend-multiply"
                />
                <span className="truncate">
                  <Highlight text={item.label} query={query} />
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
