// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import OrderDocumentsPage from "@/components/orderdocuments-page";
export const Route = createFileRoute("/admin/documentos")({ component: OrderDocumentsPage });
