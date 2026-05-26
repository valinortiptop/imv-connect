// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import TareasPage from "@/components/tareas-page";
export const Route = createFileRoute("/admin/tareas")({ component: TareasPage });
