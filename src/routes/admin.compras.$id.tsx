import { createFileRoute } from "@tanstack/react-router";
import { OC360Body } from "@/components/compras/OC360Drawer";

export const Route = createFileRoute("/admin/compras/$id")({
  head: () => ({ meta: [{ title: "Orden de compra · IMV" }, { name: "description", content: "Detalle 360 de la orden de compra." }] }),
  component: OCPage,
});

function OCPage() {
  const { id } = Route.useParams();
  return <section className="space-y-4"><OC360Body ocId={id} /></section>;
}
