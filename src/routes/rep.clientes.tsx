import { createFileRoute } from "@tanstack/react-router";
import ClientList from "@/components/rep/ClientList";
export const Route = createFileRoute("/rep/clientes")({ component: ClientList });
