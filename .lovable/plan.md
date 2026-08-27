# Rediseño del sidebar principal (admin)

Hoy el menú muestra ~85 enlaces en 9 grupos, todos abiertos por defecto, con iconos de 24px y sin búsqueda. Eso obliga a hacer scroll largo y esconde el contexto de "dónde estoy". El rediseño aplica las prácticas estándar para navegación grande: buscar antes que recorrer, acordeón de un solo grupo abierto, jerarquía de 2 niveles y accesos rápidos.

## Qué cambia

1. **Buscador de páginas (arriba del menú)**
   - Campo "Buscar página…" que filtra en vivo todos los enlaces (resalta las letras coincidentes, igual que en los dropdowns de la app).
   - Atajo de teclado Cmd/Ctrl + K abre una paleta de comandos con las mismas páginas; Enter navega.
   - Al buscar, los grupos se expanden solo para mostrar resultados.

2. **Acordeón con un grupo abierto a la vez**
   - Al entrar, solo se abre el grupo de la ruta actual (los demás colapsados); el estado se guarda en localStorage.
   - La cabecera del grupo muestra el número de páginas y se marca cuando contiene la página activa.

3. **Sub-secciones dentro de los grupos grandes**
   - "Almacén y Compras" (26 enlaces) se divide en: Inventario · Almacén (operación) · Compras · Devoluciones.
   - "Contabilidad" se divide en: Fiscal · Libros · Cumplimiento.
   - "Ventas" se divide en: Comercial · Reportes.
   - Grupos nuevos de primer nivel más claros: General, Ventas, Representantes, Inventario y Almacén, Compras, Operaciones, Cobranza, Contabilidad, Bancos, Configuración.

4. **Favoritos / accesos rápidos**
   - Sección "Favoritos" fija arriba: el usuario marca páginas con una estrella (se guarda por usuario en localStorage).
   - Debajo, "Recientes" con las últimas 4 páginas visitadas.

5. **Filas más limpias y compactas**
   - Iconos a 18px, filas de menor altura, texto truncado en una línea, indicador activo con barra a la izquierda + fondo suave (tokens semánticos, sin colores fijos).
   - Encabezados de grupo tipo etiqueta (uppercase pequeño) y separadores sutiles.

6. **Colapso a riel de iconos**
   - `collapsible="icon"`: el sidebar se reduce a un riel de iconos con tooltips en lugar de desaparecer; el trigger del header sigue visible.
   - En móvil se mantiene el drawer que se cierra al navegar.

7. **Permisos igual que hoy**
   - Se conserva el filtrado por `canAccessKey`, `adminOnly` y las páginas personales siempre visibles; los grupos vacíos no se muestran. Los `key` de cada enlace no cambian, así que la pestaña de "Visibilidad de pestañas" del admin sigue funcionando.

## Detalles técnicos

- Se extrae el árbol de navegación de `src/components/admin-sidebar.tsx` a `src/components/nav-items.ts` (tipos `NavItem`, `NavSubGroup`, `NavGroup`) para reutilizarlo en el sidebar y en la paleta de comandos.
- Nuevo `src/components/admin-nav-search.tsx` (Command de shadcn ya disponible) para Cmd+K.
- Sidebar reescrito con `Collapsible` de shadcn para grupos/subgrupos; estado persistido en `localStorage` (`imv.sidebar.groups`, `imv.sidebar.favs`, `imv.sidebar.recent`).
- Sin cambios en rutas, RPCs ni lógica de negocio; solo presentación y navegación.
