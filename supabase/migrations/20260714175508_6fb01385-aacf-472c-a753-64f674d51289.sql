
-- Reset warehouse layout to real IMV floorplan
TRUNCATE public.slot_movements, public.slot_contents, public.warehouse_slots RESTART IDENTITY CASCADE;

-- Racks A, B, C: 6 niveles x 5 posiciones
INSERT INTO public.warehouse_slots (code, block, row_letter, position, zone, access_type)
SELECT
  rack || '-N' || lvl || '-P' || pos,
  rack,
  'N' || lvl,
  pos,
  'storage',
  CASE WHEN lvl >= 4 THEN 'apilador' ELSE 'patines' END
FROM (VALUES ('A'),('B'),('C')) r(rack)
CROSS JOIN generate_series(1,6) lvl
CROSS JOIN generate_series(1,5) pos;

-- Racks D, E, F: 6 niveles x 4 posiciones
INSERT INTO public.warehouse_slots (code, block, row_letter, position, zone, access_type)
SELECT
  rack || '-N' || lvl || '-P' || pos,
  rack,
  'N' || lvl,
  pos,
  'storage',
  CASE WHEN lvl >= 4 THEN 'apilador' ELSE 'patines' END
FROM (VALUES ('D'),('E'),('F')) r(rack)
CROSS JOIN generate_series(1,6) lvl
CROSS JOIN generate_series(1,4) pos;

-- G1 (controlados): 5 niveles x 4 posiciones
INSERT INTO public.warehouse_slots (code, block, row_letter, position, zone, access_type)
SELECT
  'G1-N' || lvl || '-P' || pos,
  'G1',
  'N' || lvl,
  pos,
  'g1',
  'manual'
FROM generate_series(1,5) lvl
CROSS JOIN generate_series(1,4) pos;

-- Zonas especiales (single-slot bulk areas)
INSERT INTO public.warehouse_slots (code, block, row_letter, position, zone, access_type) VALUES
  ('CUARENTENA-1',       'ESPECIAL','', 1, 'cuarentena',        'manual'),
  ('CUARENTENA-2',       'ESPECIAL','', 2, 'cuarentena',        'manual'),
  ('MERMA',              'ESPECIAL','', 1, 'merma',             'damaged'),
  ('CADUCOS',            'ESPECIAL','', 1, 'caduco',            'damaged'),
  ('DEV-CLIENTES',       'ESPECIAL','', 1, 'dev-clientes',      'manual'),
  ('DEV-PROVEEDORES',    'ESPECIAL','', 1, 'dev-proveedores',   'manual'),
  ('CONFINAMIENTO',      'ESPECIAL','', 1, 'confinamiento',     'manual'),
  ('PT-LIMITADO',        'ESPECIAL','', 1, 'pt-limitado',       'manual'),
  ('CONGELADOR',         'ESPECIAL','', 1, 'congelador',        'manual'),
  ('PEDIDOS-REPROG',     'ESPECIAL','', 1, 'pedidos-reprog',    'manual'),
  ('CAMARA-FRIA',        'ESPECIAL','', 1, 'camara-fria',       'manual'),
  ('INSECTICIDAS',       'ESPECIAL','', 1, 'insecticidas',      'manual'),
  ('ALM-TEMPORAL-1',     'ESPECIAL','', 1, 'alm-temporal',      'manual'),
  ('ALM-TEMPORAL-2',     'ESPECIAL','', 2, 'alm-temporal',      'manual'),
  ('MATERIAL-EMBALAJE',  'ESPECIAL','', 1, 'material-embalaje', 'manual'),
  ('SURTIDO',            'FLUJO',   '', 1, 'surtido',           'manual'),
  ('PEDIDOS-SURTIDOS',   'FLUJO',   '', 1, 'pedidos-surtidos',  'manual'),
  ('ENTREGA-PEDIDOS',    'FLUJO',   '', 1, 'embarque',          'manual'),
  ('RECEPCION-PROVEEDORES','FLUJO', '', 1, 'recibo',            'manual'),
  ('MIGRACION',          'TEMP',    '', 1, 'migracion',         'manual');
