// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import PriceListsPage from "@/components/pricelists-page";
export const Route = createFileRoute("/admin/listas-precios")({ component: PriceListsPage });
