ALTER TABLE public.slot_contents
  ADD CONSTRAINT slot_contents_order_id_fkey
  FOREIGN KEY (order_id) REFERENCES public.pedidos(id) ON DELETE SET NULL;

ALTER TABLE public.slot_contents
  ADD CONSTRAINT slot_contents_order_item_id_fkey
  FOREIGN KEY (order_item_id) REFERENCES public.pedido_items(id) ON DELETE SET NULL;

NOTIFY pgrst, 'reload schema';