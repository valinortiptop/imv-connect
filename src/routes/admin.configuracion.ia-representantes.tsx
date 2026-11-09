import { createFileRoute } from "@tanstack/react-router";
import RepAiAccessPage from "@/components/rep/RepAiAccessPage";

export const Route = createFileRoute("/admin/configuracion/ia-representantes")({
  head: () => ({
    meta: [
      { title: "IA para representantes · IMV" },
      { name: "description", content: "Elige qué representantes pueden activar el asistente IA." },
      { property: "og:title", content: "IA para representantes · IMV" },
      { property: "og:description", content: "Elige qué representantes pueden activar el asistente IA." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RepAiAccessPage,
});
