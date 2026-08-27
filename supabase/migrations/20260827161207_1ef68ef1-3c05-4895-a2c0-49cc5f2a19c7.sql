DROP POLICY IF EXISTS "Admins manage all saved routes" ON public.rep_rutas_guardadas;
CREATE POLICY "Admins manage all saved routes"
ON public.rep_rutas_guardadas FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Reps see routes assigned to them" ON public.rep_rutas_guardadas;
CREATE POLICY "Reps see routes assigned to them"
ON public.rep_rutas_guardadas FOR SELECT TO authenticated
USING (representante_id IS NOT NULL AND representante_id = public.current_rep_id());

DROP POLICY IF EXISTS "Reps update routes assigned to them" ON public.rep_rutas_guardadas;
CREATE POLICY "Reps update routes assigned to them"
ON public.rep_rutas_guardadas FOR UPDATE TO authenticated
USING (representante_id IS NOT NULL AND representante_id = public.current_rep_id())
WITH CHECK (representante_id IS NOT NULL AND representante_id = public.current_rep_id());