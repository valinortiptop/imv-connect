// @ts-nocheck
import { MoreHorizontal, Eye, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface OrderRowActionsProps {
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function OrderRowActions({ onView, onEdit, onDelete }: OrderRowActionsProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild onClick={(e) => { e.stopPropagation(); console.log("[pedidos] ... trigger click"); }}>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onClick={() => { console.log("[pedidos] View click"); onView(); }}>
          <Eye className="h-4 w-4 mr-2" /> View
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => { console.log("[pedidos] Edit click"); onEdit(); }}>
          <Pencil className="h-4 w-4 mr-2" /> Edit
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => { console.log("[pedidos] Delete click"); onDelete(); }} className="text-destructive focus:text-destructive">
          <Trash2 className="h-4 w-4 mr-2" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
