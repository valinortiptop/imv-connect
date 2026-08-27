# Estado del pendiente de check-in de representantes

## Lo que sí quedó hecho (verificado en el proyecto ahora)

- La política de seguridad de `rep_visits` ya acepta al representante por `user_id` **o** por correo del inicio de sesión (función `current_rep_ids`), así que el error "new row violates row-level security policy" ya no se produce cuando el correo del vendedor coincide con su ficha.
- El check-in/check-out con temporizador, aviso de ubicación y botón de reintento está en el diálogo de visita.
- El agrupamiento por dispositivo está activo: se guarda un identificador estable del dispositivo y el panel de supervisor agrupa varias ventanas/pestañas en un solo punto, con etiquetas tipo "iOS · Safari".

La captura que compartes es del mismo video anterior (27/08), así que muy probablemente sea de antes del arreglo. Aun así, quedan dos huecos reales que pueden reproducir el problema en algunos vendedores.

## Huecos que faltan cerrar

1. **Vendedores sin ficha ligada a su cuenta.** Solo 4 de 11 representantes tienen su cuenta ligada (`user_id`), y varios (Claudia Franco, José López, Lluvia Márquez, Samuel Sosa, Victor Trejo, Yamin Nava, Nancy Perez) no tienen usuario creado o no tienen correo en su ficha. Nancy Perez no tiene correo, así que ni por correo se le puede identificar.
2. **El auto-enlace nunca se guarda.** Cuando un vendedor entra, el sistema intenta grabar su `user_id` en su ficha, pero los permisos de la tabla de representantes solo permiten escribir a administradores, así que el intento se descarta en silencio y todo sigue dependiendo del correo. Además, leer la ficha exige tener un rol asignado; un vendedor sin rol verá "Solo representantes pueden hacer check-in".

## Qué haré para cerrarlo

- Auto-enlace confiable: una función de base de datos segura que, al entrar el vendedor, ligue su ficha a su cuenta por correo (sin abrir permisos de escritura generales).
- Completar el correo faltante de Nancy Perez y asegurar rol de representante para los vendedores activos con cuenta.
- Reporte en la página de administración: lista de representantes sin cuenta ligada o sin rol, con aviso claro, para que sistemas cree/ligue las cuentas faltantes antes de que fallen en campo.
- Mensajes de error más claros en el check-in: distinguir "tu cuenta no está ligada a una ficha de vendedor" de "ubicación desactivada", con instrucciones para activar el GPS.

## Detalle técnico

- Nueva función `ensure_current_rep_link()` (`security definer`, `search_path=public`) que hace el `UPDATE representantes SET user_id = auth.uid()` cuando el correo del JWT coincide; se llama desde `getCurrentRep` en `src/lib/rep.functions.ts` en lugar del `update` directo bloqueado por RLS.
- Migración con los datos faltantes (correo de Nancy Perez) y `user_roles` de representante donde falte.
- Nueva vista/consulta de diagnóstico consumida por una tarjeta en `/admin/administracion` (solo admin).
- `CheckInDialog.tsx`: separar el estado de error de permisos de ubicación del error de identidad y mostrar la guía correspondiente.
