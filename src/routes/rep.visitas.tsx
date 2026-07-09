import { createFileRoute } from "@tanstack/react-router";
import VisitsList from "@/components/rep/VisitsList";
export const Route = createFileRoute("/rep/visitas")({ component: VisitsList });
