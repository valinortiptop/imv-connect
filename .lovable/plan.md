## Plan: Generar y agregar favicon IMV

1. Generar un favicon cuadrado (512x512) con la identidad visual de IMV — iniciales "IMV" sobre fondo de marca, estilo limpio y reconocible a tamaño pequeño. Guardarlo en `public/favicon.png`.
2. Agregar el `<link rel="icon">` apuntando a `/favicon.png` en `src/routes/__root.tsx` dentro del `head().links` para que se sirva en todas las páginas.
3. Verificar que el 404 de `/favicon.ico` desaparece en la consola tras el deploy.