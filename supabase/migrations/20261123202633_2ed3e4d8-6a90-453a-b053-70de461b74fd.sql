DROP POLICY IF EXISTS "Authenticated can read substitutes" ON public.product_substitutes;
CREATE POLICY "Staff can read substitutes"
ON public.product_substitutes FOR SELECT TO authenticated
USING (public.is_staff(auth.uid()));