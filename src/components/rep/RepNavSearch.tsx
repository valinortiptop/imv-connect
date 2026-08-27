import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Highlight } from "@/components/admin-nav-search";
import { flattenRepNav, type RepNavGroup } from "./rep-nav-items";

export function RepNavSearch({
  groups,
  open,
  onOpenChange,
}: {
  groups: RepNavGroup[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const items = flattenRepNav(groups);

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
                value={`${item.label} ${g.label} ${item.to}`}
                onSelect={() => {
                  onOpenChange(false);
                  navigate({ to: item.to });
                }}
              >
                <item.icon className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
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
