# Patient 360 — demo lista para Vercel

Código editable de la plataforma central y Patient 360 Profesional, con el recorrido actualizado Preparar → Atender → Cerrar. Versión exportada el 3 de octubre de 2026.

## Antes de elegir el plan

El proyecto es estático y no necesita servidor propio, dependencias, base de datos ni variables de entorno. Esto facilita su publicación, pero no determina si el uso puede ser gratuito.

Vercel Hobby está limitado al uso personal y no comercial. Si la demo forma parte de un servicio remunerado, una propuesta comercial o trabajo para un cliente, revisa las condiciones de Vercel y selecciona el plan aplicable. No se garantiza que esa actividad esté cubierta por Hobby.

Fuentes oficiales consultadas el 3 de octubre de 2026:
- https://vercel.com/docs/limits/fair-use-guidelines
- https://vercel.com/docs/builds/configure-a-build

## Publicar desde GitHub y Vercel

1. Extrae el ZIP. Abre la carpeta `Patient360_Demo_Vercel`.
2. Crea un repositorio en tu cuenta de GitHub, por ejemplo `patient360-demo`.
3. Sube el CONTENIDO de esta carpeta: `public`, `vercel.json` y este archivo. Conserva todos los archivos dentro de `public`; no subas el ZIP sin extraer.
4. En Vercel, crea un proyecto e importa ese repositorio. Autoriza el acceso al repositorio si se solicita.
5. Selecciona Framework Preset: `Other`.
6. Root Directory: la raíz del repositorio, donde está `vercel.json`. Si subiste una carpeta contenedora adicional, selecciona esa carpeta como raíz.
7. Build Command: vacío. Install Command: vacío. Output Directory: `public`. La configuración incluida ya define estos valores. No necesitas variables de entorno.
8. Pulsa Deploy. Cuando termine correctamente, copia la URL de producción que Vercel asigne al proyecto.
9. Abre esa URL para la plataforma central. Añade `/#profesional` a la raíz del dominio para entrar directamente al espacio profesional.
10. Prueba el enlace en una ventana privada antes de enviarlo. Si pide iniciar sesión en Vercel, revisa Deployment Protection y el acceso a la URL de producción conforme al plan elegido.

No necesitas comprar un dominio para probar la aplicación: puedes usar el dominio que asigne Vercel. Un dominio propio es opcional.

## Alternativa desde la terminal de VS Code

Con Node.js y npm instalados, abre la carpeta que contiene `vercel.json` y ejecuta:

```sh
npx vercel --prod
```

Inicia sesión, selecciona tu cuenta o equipo y crea un proyecto nuevo. Usa la carpeta actual, framework Other y salida public. Revisa la configuración detectada antes de aceptar. El comando publica el proyecto en la cuenta seleccionada; su facturación depende del plan de esa cuenta.

## Probar sin publicar

Abre `public/index.html` en un navegador moderno o sirve la carpeta `public` con un servidor estático local. También puedes usar Live Server de VS Code sobre ese archivo. Los módulos están escritos en HTML, CSS y JavaScript, sin compilación.

## Recorrido para mostrar al cliente

1. Abre el enlace del espacio profesional con `/#profesional`.
2. Pulsa Probar el recorrido o abre Valentina en Mi día.
3. Revisa Resumen e inicia la atención.
4. Escribe y guarda una evolución de prueba. Cambiar de pestaña conserva el borrador dentro de esa sesión.
5. Explora el odontograma. Selecciona una pieza y superficie, y guarda un hallazgo ficticio.
6. En Imágenes y documentos, adjunta un JPG, PNG, WebP o PDF de prueba.
7. Pulsa Cerrar atención, escribe el siguiente compromiso y entrega la visita.
8. Puedes continuar con Siguiente paciente o regresar a Central para revisar Salida administrativa con el perfil de administración.
9. En Pendientes puedes crear tareas, resolverlas y reservar tiempo. En Agenda puedes probar los conflictos de horario y liberar reservas.
10. En Equipo puedes escribir una nota, simular una respuesta y seguir una solicitud de apoyo.

El día inicial del módulo profesional es el 5 de octubre de 2026, una fecha de demostración. No es un calendario conectado al día real.

## Qué editar

- `public/index.html`: estructura principal, identidad y estilos base.
- `public/app.js`: datos ficticios y funciones principales de la central.
- `public/enhancements.js` y `.css`: agenda, reservas y atribución.
- `public/vip.js` y `.css`: experiencia VIP y acompañamiento.
- `public/workspaces.js` y `.css`: separación clínica y administrativa.
- `public/journey.js` y `.css`: recorrido, roles, plantillas y comunicaciones.
- `public/intuitive.js` y `.css`: flujo guiado de la central y simulación de chat.
- `public/dental.js` y `.css`: odontograma e imágenes.
- `public/professional.js` y `.css`: espacio del profesional y diseño adaptable.
- `public/professional-ux.js`: pasos guiados, evolución en pantalla y acciones siguientes.

Conserva el orden de los scripts de `index.html`: los módulos amplían funciones de los anteriores. Para actualizar una publicación conectada a GitHub, guarda tus cambios y súbelos a la rama configurada en Vercel.

## Límites de la demostración

- Los datos y archivos se conservan en memoria de la pestaña. Recargar o cerrar reinicia los cambios y elimina los adjuntos de la sesión.
- Central y Profesional comparten los cambios cuando navegas entre ambos en la misma pestaña. Otras pestañas, equipos y visitantes tienen sesiones independientes.
- WhatsApp, usuarios, notificaciones, permisos, aprobaciones y pagos son simulados. No hay cobros, mensajes reales ni notificaciones push al celular.
- No existe autenticación propia. Los perfiles son una demostración; no protegen información real. La restricción del sitio original no se transfiere a Vercel.
- Utiliza únicamente pacientes e imágenes ficticias.
- Las fuentes web usan Google Fonts. Si no cargan, se usa la fuente alternativa del sistema.

## Validación del paquete

Se exportó el código de la versión publicada con commit `f98ccde0ebb0d94d0ac553c0b2102e8dba7f3ab6`.
Se verificaron las referencias locales y la sintaxis JavaScript. El recorrido profesional se probó con simulación del DOM: evolución, borrador, odontograma, adjuntos, entrega a administración, tareas, reservas, solicitudes, chat y notificaciones.
No se ha desplegado este paquete en tu cuenta de Vercel ni se ha completado una revisión visual en navegador para esta exportación.
