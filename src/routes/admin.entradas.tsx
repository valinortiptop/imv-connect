// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import StockEntriesPage from "@/components/stock-entries-page";

export const Route = createFileRoute("/admin/entradas")({
  component: StockEntriesPage,
});
