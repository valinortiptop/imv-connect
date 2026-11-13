UPDATE public.onboarding_sesiones SET
  participantes = replace(participantes, 'Maresi', 'Marisol'),
  titulo = replace(titulo, 'Maresi', 'Marisol'),
  objetivo = replace(objetivo, 'Maresi', 'Marisol'),
  acuerdos = replace(acuerdos, 'Maresi', 'Marisol'),
  responsables = array_replace(responsables, 'maresi', 'marisol')
WHERE participantes ILIKE '%maresi%' OR titulo ILIKE '%maresi%' OR objetivo ILIKE '%maresi%' OR acuerdos ILIKE '%maresi%' OR 'maresi' = ANY(responsables);

UPDATE public.onboarding_items SET
  responsable_rol = CASE WHEN responsable_rol = 'maresi' THEN 'marisol' ELSE responsable_rol END,
  titulo = replace(titulo, 'Maresi', 'Marisol'),
  descripcion = replace(descripcion, 'Maresi', 'Marisol')
WHERE responsable_rol = 'maresi' OR titulo ILIKE '%maresi%' OR descripcion ILIKE '%maresi%';

UPDATE public.onboarding_tareas_dev SET
  titulo = replace(titulo, 'Maresi', 'Marisol'),
  descripcion = replace(descripcion, 'Maresi', 'Marisol'),
  responsable = CASE WHEN responsable = 'maresi' THEN 'marisol' ELSE replace(responsable, 'Maresi', 'Marisol') END
WHERE titulo ILIKE '%maresi%' OR descripcion ILIKE '%maresi%' OR responsable ILIKE '%maresi%';

UPDATE public.onboarding_asistentes SET rol = 'marisol' WHERE rol = 'maresi';
UPDATE public.onboarding_disponibilidad SET rol = 'marisol' WHERE rol = 'maresi';