import { createFileRoute } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import KardexPage from "@/components/kardex-page";
import CardexPage from "@/components/almacen/CardexPage";

export const Route = createFileRoute("/admin/kardex")({
  head: () => ({
    meta: [
      { title: "Kardex · IMV" },
      { name: "description", content: "Movimientos de inventario por almacén y lote, o por posición física, con usuario y referencia." },
      { property: "og:title", content: "Kardex · IMV" },
      { property: "og:description", content: "Trazabilidad de movimientos de inventario." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: KardexUnificado,
});

function KardexUnificado() {
  return (
    <Tabs defaultValue="lote" className="space-y-4">
      <TabsList>
        <TabsTrigger value="lote">Por almacén y lote</TabsTrigger>
        <TabsTrigger value="posicion">Por posición</TabsTrigger>
      </TabsList>
      <TabsContent value="lote"><CardexPage /></TabsContent>
      <TabsContent value="posicion"><KardexPage /></TabsContent>
    </Tabs>
  );
}
