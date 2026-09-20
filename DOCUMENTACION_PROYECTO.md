# Documentación del Proyecto — Museo Inmersivo 3D

**Nombre del proyecto:** Museo Inmersivo 3D (Museo Boliviano)
**Tipo:** Aplicación web inmersiva de realidad 3D con panel administrativo (CMS)
**Fecha de documentación:** 31 de julio de 2026

---

## 1. Objetivos del proyecto

El proyecto tiene como propósito **digitalizar y exponer el patrimonio cultural de Bolivia** mediante una experiencia museística tridimensional e interactiva, accesible desde cualquier navegador web moderno sin necesidad de instalar software adicional ni usar gafas de realidad virtual.

Los objetivos específicos son:

1. **Recrear un espacio museográfico en 3D** a partir de un escenario modelado en Blender y exportado como GLB, permitiendo al visitante recorrerlo libremente como si estuviera físicamente dentro del museo.
2. **Ofrecer navegación temática e interactiva** a través de cinco secciones culturales — *Independencia, Historia, Lugares, Comidas y Fiestas* — ubicadas en distintas paredes y zonas del recinto, con vuelos de cámara automatizados hacia cada sección.
3. **Vincular cada pieza de la colección con su contenido didáctico** (título y descripción) y, en el caso de los cuadros, con su imagen real, que se "cuelga" dinámicamente sobre los paneles 3D.
4. **Entregar una experiencia multimedia completa** que combine lo visual (3D, iluminación, sombras), lo sonoro (música ambiental en bucle sin cortes) y lo accesible (locución por voz del texto de cada pieza).
5. **Disponer de un panel administrativo (CMS)** que permita a curadores no técnicos gestionar el contenido —imágenes y textos de las piezas y usuarios del sistema— sin tocar el código de la aplicación, con persistencia en la nube.
6. **Garantizar la robustez y la aptitud para despliegue serverless** (Vercel), independiente del sistema de archivos, con recuperación ante fallos de red o de base de datos para que la escena 3D nunca se derribe.

---

## 2. Descripción de la solución multimedia

La solución es una **experiencia web inmersiva de una sola escena** que integra cinco tipos de medios coordinados:

### 2.1 Escena 3D interactiva
El recinto se carga desde un único modelo `museo-compresion.glb` (geometría comprimida con **Draco** y optimizada con **Meshoptimizer**) creado en Blender. Sobre ese escenario de fondo oscuro (`#050816`) con niebla volumétrica se montan:

- **Cuadros y paneles** (`cuadro_1`…`cuadro_21`, `pintura`, `presentacion_1`, `presentacion_2`): meshes planos a los que se les aplica **texturas dinámicas** (imágenes WebP) provenientes de Cloudinary, gestionadas desde el panel admin. El material compartido del GLB se clona por cuadro para aislar cada textura y evitar contagios entre paneles.
- **Esculturas** (*Monolito*, *Chachapuma* —hombre-puma prehispánico—, *Fuente*): piezas detectadas por nombre y encuadradas con heurísticas de cámara según su eje frontal.
- **Elementos estructurales** (paredes, pisos, pedestales, trípodes, focos): inertes al clic; la navegación a secciones se hace solo desde el menú.

### 2.2 Iluminación y ambientación
Una dirección de luz principal proyecta sombras, complementada por varias luces puntuales cálidas (ámbar) que recrean la atmósfera de un museo, una luz cenital y una **luz que sigue a la cámara**. Las sombras en tiempo real (`castShadow`/`receiveShadow`) y el `fog` aportan profundidad y dramatismo.

### 2.3 Navegación e interacción
- **OrbitControls** para orbitar, hacer zoom y mirar libremente, con límites (`maxPolarAngle = π/2`) que impiden asomarse por debajo del piso.
- **Menú flotante lateral** de secciones temáticas; al elegir una, la cámara vuela suavemente (animación *ease-in-out* cosenoidal de ~2 s) hacia el encuadre calculado: vista frontal de pared, vista cenital de pedestal, vista de esquina o encuadre en 3/4, según la sección.
- **Clic sobre una pieza** → la cámara vuela hacia ella y se abre una tarjeta con su título, descripción, nombre técnico y etiquetas de tipo.
- **Tecla `Esc`** cierra cualquier selección y devuelve la cámara a su posición inicial.

### 2.4 Audio ambiental
Música de fondo en **bucle infinito sin costuras** implementada con la **Web Audio API**:
- Se descodifica el `audioplayback.opus` a un `AudioBuffer` y se calculan los límites de contenido útil, descartando el silencio inicial/final mediante `loopStart`/`loopEnd` → bucle limpio sin "clic" de reinicio.
- `GainNode` con *fade in/out* de 0,6 s evita chasquidos al arrancar/detener.
- Se respeta la *autoplay policy* del navegador: el audio **solo arranca tras el gesto del usuario** al pulsar "Entrar al museo" en la pantalla de carga, momento en que se ejecuta `AudioContext.resume()` síncrono dentro de ese gesto.
- **Degradación elegante**: si la Web Audio API no puede decodificar el opus, cae a un `<audio loop>` clásico. La preferencia *play/pausa* se recuerda en `localStorage`.
- Un botón de altavoz con barras de ecualizador animadas indica el estado.

### 2.5 Locución por voz (accesibilidad)
Cada tarjeta de "Objeto detectado" incluye un botón que usa la **Web Speech API (`SpeechSynthesis`)** para leer en español (`es-ES`) el título y la descripción de la pieza. El botón alterna dinámicamente entre *Escuchar / Pausar / Reanudar*, y al cambiar de pieza se cancela cualquier locución en curso. Si el navegador no soporta la API, el botón aparece deshabilitado.

### 2.6 Pantalla de carga
Cubre la escena mientras se cargan el GLB, las texturas y el audio. Presenta un **sello animado** (anillos concéntricos en sentidos opuestos, núcleo pulsante con monograma "M"), título "Museo Boliviano", una **barra de progreso real** basada en el progreso de carga del GLB (`useProgress` de drei) con marca de agua (solo sube, nunca retrocede) y un indicador de etapas (Modelo → Texturas → Audio → Listo). Terminada la carga aparece el botón **"Entrar al museo"**, que es también el gesto que desbloquea el audio.

### 2.7 Panel administrativo (CMS)
- **Gestión de imágenes del museo** (`/admin/cuadros`): tabla con búsqueda, ordenamiento y paginación (TanStack Table) de las 24 piezas; cada pieza se gestiona mediante un modal con *dropzone* (drag & drop) para subir imágenes **WebP** (hasta 6 MB) y campos de título y descripción. El texto se ve al instante en la escena 3D.
- **Gestión de usuarios** (`/admin/usuarios`): alta, edición y baja de usuarios del panel, con roles `admin`/`editor` y contraseñas hasheadas.
- Acceso protegido por login con cookie de sesión `httpOnly`.

Todo respeta `prefers-reduced-motion` (las animaciones se anulan para usuarios que lo soliciten).

---

## 3. Arquitectura general del sistema

La arquitectura sigue el patrón **Next.js App Router** con una clara separación entre el **cliente (render 3D)** y el **servidor (datos, auth, almacenamiento)**.

```
                       ┌─────────────────────────────────────────────┐
                       │                 NAVEGADOR                     │
                       │  React 19 + Tailwind v4                      │
                       │  ┌─────────────────────────────────────┐    │
                       │  │  Experiencia 3D (Client Components)  │    │
                       │  │  React Three Fiber + Three.js + Drei │    │
                       │  │  Web Audio API  ·  Web Speech API     │    │
                       │  └─────────────────────────────────────┘    │
                       │  Panel Admin (client: tablas, dropzone)     │
                       └───────────────┬─────────────────────────────┘
                                       │  HTTP / Server Actions / Fetch
                                       ▼
            ┌──────────────────────────────────────────────────────────┐
            │                   SERVIDOR (Next.js 16)                   │
            │                                                          │
            │  Server Components (force-dynamic)  →  readCuadros()      │
            │  Server Actions ("use server")    →  mutaciones + revalid │
            │  proxy.ts  →  puerta de auth para /admin/*               │
            │  lib/supabase.ts (lazy)  lib/cloudinary.ts (lazy)         │
            │  lib/users.ts (scrypt)  lib/cuadros.ts                   │
            └───────────────┬───────────────────────┬──────────────────┘
                            │                       │
                            ▼                       ▼
                  ┌──────────────────┐    ┌──────────────────┐
                  │   Supabase (DB)  │    │    Cloudinary    │
                  │  PostgreSQL      │    │  imágenes WebP  │
                  │  tablas cuadros, │    │  (carpeta museo) │
                  │  users           │    │                  │
                  └──────────────────┘    └──────────────────┘
```

### 3.1 Capas

| Capa | Responsabilidad | Tecnología |
|------|------------------|------------|
| **Presentación 3D** | Render del museo, interacción, vuelos de cámara, audio y voz | React Three Fiber, Three.js, Drei, Web Audio/Web Speech API |
| **Presentación admin** | Tablas, formularios, dropzone, notificaciones | React, TanStack Table, react-icons, sonner |
| **Estilos** | Diseño visual, animaciones, accesibilidad de movimiento | Tailwind CSS v4 |
| **Enrutamiento / Render** | SSR/SSG, Server Components, Server Actions | Next.js 16 (App Router) |
| **Seguridad de rutas** | Validación de cookie de sesión en `/admin/*` | `proxy.ts` (middleware renombrado en Next 16) |
| **Acceso a datos** | Operaciones CRUDreibung sobre cuadros y usuarios | `lib/cuadros.ts`, `lib/users.ts` (Server Actions) |
| **Autenticación** | Verificación de credenciales y sesión | `lib/users.ts` (scrypt), cookies `httpOnly` |
| **Base de datos** | Persistencia de textos/imágenes referenciadas y usuarios | Supabase (PostgreSQL) |
| **Almacenamiento de imágenes** | Subida/eliminación de WebP de los cuadros | Cloudinary |
| **Modelo 3D / audio** | Recursos estáticos servidos por Next | `public/models/*.glb`, `public/music/*.opus` |

### 3.2 Flujo de datos de contenido (CMS → Escena)

1. El curador sube una imagen WebP y un texto desde `/admin/cuadros`.
2. Un **Server Action** valida tipo/tamaño, sube la imagen a **Cloudinary** (carpeta `museo`) y guarda en Supabase la fila del cuadro con `image_url`, `image_public_id`, `title` y `description`.
3. Se borra la imagen anterior de Cloudinary (por `public_id`) para no acumular huérfanos.
4. `revalidatePath` invalida las rutas `/`, `/museo` y `/admin/cuadros`.
5. Al recargar el museo, un **Server Component** (`app/page.tsx`) ejecuta `readCuadros()`, que consulta Supabase y **mergea** los 24 nombres canónicos con los registros existentes (completando vacíos los ausentes) → la escena siempre recibe 24 paneles.
6. En el cliente, `CuadroTexture` aplica cada textura al mesh del cuadro correspondiente del GLB por nombre.

### 3.3 Decisiones de robustez

- **Clientes lazy (Supabase y Cloudinary):** el cliente se crea recién en el primer uso real, no al importar el módulo. Así `next build` no se cae si faltan variables de entorno, y solo falla la ruta que las necesita.
- **`readCuadros()` degradado:** si Supabase no responde o la tabla aún no existe, el museo carga igual con los 24 paneles canónicos vacíos; la escena 3D nunca se derriba.
- **Error boundary por cuadro:** si la carga de una textura falla (p. ej. 404), solo esa pieza queda "sin textura"; el resto de la escena sigue.
- **Protección de auth:** `proxy.ts` exige cookie `museo_admin_session` con prefijo `user:` en todas las rutas `/admin/*`, salvo `/admin/login`.

---

## 4. Tecnologías utilizadas

### 4.1 Núcleo de la aplicación
- **Next.js 16.2.10** (App Router, Server Components, Server Actions). *Nota: esta versión incluye cambios disruptivos respecto a Next.js convencional —por ejemplo, `middleware.ts` pasó a llamarse `proxy.ts`—; el desarrollo se guió por la documentación ships en `node_modules/next/dist/docs/`.*
- **React 19.2.4** + **React DOM 19.2.4**
- **TypeScript 5**

### 4.2 Render 3D y multimedia
- **three 0.185** — motor 3D (escena, cámaras, luces, sombras, raycaster, materiales).
- **@react-three/fiber 9.6.1** — puente declarativo React ↔ Three.js.
- **@react-three/drei 10.7.7** — utilidades (`useGLTF`, `useProgress`, `useTexture`, `OrbitControls`, `Html`).
- **Compresión de modelo GLB:** Draco + Meshoptimizer (cargados vía `useGLTF(url, true, true)`).
- **Web Audio API** — música ambiental con bucle sin costuras, fades y *fallback* a `<audio>`.
- **Web Speech API (`SpeechSynthesis`)** — locución por voz de los textos de las piezas.

### 4.3 Datos y almacenamiento
- **Supabase** (`@supabase/supabase-js`) — base de datos PostgreSQL hospedada (tablas `cuadros` y `users`).
- **Cloudinary** (`cloudinary` v2) — hosting de imágenes WebP, con control de huérfanos por `public_id`.

### 4.4 UI y experiencia
- **Tailwind CSS v4** (vía `@tailwindcss/postcss`) — sistema de estilos utilitarios y animaciones.
- **@tanstack/react-table 8** — tabla de administración (orden, filtro, paginación).
- **react-icons 5** (Feather) — iconografía.
- **sonner 2** — notificaciones tipo *toast* del panel admin.

### 4.5 Seguridad e infraestructura
- **Autenticación con cookie `httpOnly`** + **hashing de contraseñas con `scrypt`** (criptografía nativa de Node, sin dependencias).
- **`proxy.ts`** — middleware de autenticación (Next 16).
- **Server Actions** con `bodySizeLimit: 8mb` para admitir la subida de imágenes.

### 4.6 Herramientas de desarrollo y modelado
- **Blender** — modelado/autoría del escenario museo exportado como GLB.
- **ESLint 9 (eslint-config-next)** — linting.
- **scripts/seed.mjs** — siembra idempotente del usuario admin inicial en Supabase.
- Despliegue orientado a **Vercel** (serverless, FS de solo lectura → de ahí el uso de Supabase + Cloudinary en lugar del sistema de archivos).

---

## 5. Demostración funcional del sistema

### 5.1 Experiencia del visitante (`/` y `/museo`)
1. **Pantalla de carga**: aparece el sello animado y la barra de progreso avanza (Modelo → Texturas → Audio → Listo) conforme se carga el GLB.
2. Se pulsa **"Entrar al museo"**: se desbloquea el audio, cesa la pantalla de carga, arranca la música ambiental (bucle continuo, sin saltos) y queda visible la sala 3D.
3. **Navegación libre**: con el ratón se orbita, con la rueda se hace zoom; la cámara nunca baja del horizonte.
4. **Menú de secciones**: al hacer clic en *Independencia, Historia, Lugares, Comidas* o *Fiestas*, la cámara vuela suavemente al encuadre correspondiente (pared frontal, vista cenital del pedestal, esquina entre dos paredes o plano en 3/4).
5. **Clic en una pieza** (cuadro, pintura, panel de presentación, monolito, chachapuma o fuente): la cámara se acerca y se abre la **tarjeta "Objeto detectado"** con título, descripción y etiquetas.
6. En la tarjeta se pulsa **"Escuchar"**: el navegador lee en voz alta el título y la descripción. Se puede *pausar* y *reanudar*.
7. Botón de **música** (arriba a la derecha): pausa/reproduce el ambiente; la preferencia se recuerda al recargar.
8. **`Esc`** cierra la tarjeta/navegación y devuelve la cámara al inicio.

### 5.2 Panel administrativo
- **Login** (`/admin/login`): formulario de usuario/contraseña; tras verificar credenciales con `scrypt`, se setea la cookie de sesión y se redirige a `/admin/cuadros`.
- **Imágenes del museo** (`/admin/cuadros`): tabla de 24 piezas con buscador, ordenamiento por columnas y paginación (6 por página). Cada fila muestra vista previa, estado (con/sin imagen) y si tiene descripción. El botón **"Gestionar"** abre un modal con *dropzone* (arrastrar o clic) para subir WebP, editar título y descripción, o quitar la imagen. Botón **"Ver"** abre la pieza en el museo.
- **Usuarios** (`/admin/usuarios`): listado y CRUD de usuarios del panel, con roles *admin/editor*, validación de usuarios duplicados y cambios de contraseña hasheada.
- **Cerrar sesión**: botón en el sidebar que elimina la cookie y redirige al login.
- Cualquier cambio en cuadros **revalida** la escena: el visitante que recargue verá la nueva imagen y los nuevos textos de inmediato.

---

## 6. Resultados obtenidos

1. **Museo 3D funcional y desplegable** que combina renderizado en tiempo real, navegación temática automatizada y contenido gestionable, todo desde un navegador, sin plugins ni gafas VR.
2. **Desacoplamiento contenido/presentación:** la colección (textos e imágenes) vive en Supabase/Cloudinary y se inyecta en la escena 3D por nombre de mesh; los curadores actualizan el museo sin tocar código 3D ni redesplegar.
3. **Experiencia multimedia robusta y accesible:**
   - Audio ambiental en bucle sin saltos, con *fade*, manejo correcto de la *autoplay policy* y degradación a `<audio>`.
   - Locución por voz (TTS) de cada pieza en español, con estados *Escuchar/Pausar/Reanudar*.
   - Pantalla de carga con progreso real y marca de agua (sin retrocesos visuales) y soporte de `prefers-reduced-motion`.
4. **Resiliencia demostrada:**
   - Inicialización *lazy* de Supabase/Cloudinary → el *build* no falla por variables de entorno faltantes.
   - `readCuadros()` never-die: si la DB falla, la escena carga con paneles canónicos vacíos.
   - *Error boundary* por cuadro → una textura 404 no tira la escena.
5. **Seguridad razonable:** contraseñas con `scrypt` + `timingSafeEqual`, cookie `httpOnly` `SameSite=Lax`, y puerta de auth en `proxy.ts` para todo `/admin/*`.
6. **Optimización:** modelo GLB comprimido (Draco/Meshoptimizer), `dpr` acotado (1–1.75) y cabeceras de caché `immutable` para el audio opus servido con el MIME correcto (`audio/ogg; codecs=opus`).
7. **Aptitud serverless/Vercel:** al externalizar datos y archivos a la nube, la app funciona íntegramente en un entorno de FS de solo lectura.

### Estado actual del contenido
De las 24 piezas canónicas solo unas pocas tienen imagen y las descripciones del repositorio son textos de prueba (p. ej. "holaaaaa", "jeje"). La infraestructura para cargar contenido real está completa y operativa; resta poblarla con material cultural curado.

---

## 7. Conclusiones y recomendaciones

### Conclusiones
- Es viable construir una experiencia museográfica inmersiva **100% web** combinando React Three Fiber, Three.js y APIs nativas del navegador (Web Audio, Web Speech), gestionada por un CMS propio sobre Next.js Server Components/Actions.
- La separación entre **geometría estática** (un único GLB con meshes nombrados) y **contenido dinámico** (texturas + textos desde Supabase/Cloudinary) resultó un patrón simple y eficaz: aporta flexibilidad de curaduría sin sacrificar la fidelidad visual del modelado en Blender.
- El manejo cuidadoso de la *autoplay policy* (desbloqueo del audio dentro del gesto del "Entrar") y de la costura del bucle de audio fueron claves para una experiencia pulida.
- La estrategia de robustez (lazy init, merges canónicos, error boundaries) hizo que la aplicación sea tolerante a fallos de servicios externos, condición indispensable para un despliegue en producción.

### Recompostaciones
1. **Cerrar la autenticación de las mutaciones:** `app/admin/cuadros/actions.ts` tiene una función `authorize()` vacía marcada como *TODO*. Aunque `proxy.ts` protege las rutas, conviene verificar la sesión dentro de cada Server Action antes de escribir en la DB/Cloudinary (defensa en profundidad).
2. **Poblar el contenido cultural:** cargar imágenes WebP reales y textos curados para las 24 piezas (especialmente las cinco secciones temáticas) a fin de cumplir el objetivo patrimonial del proyecto.
3. **Migraciones versionadas:** reemplazar la ejecución manual del SQL en el editor de Supabase por un sistema de migraciones versionado (p. ej. `supabase` CLI) para el esquema y la semilla.
4. **Accesibilidad ampliada:**
   - Navegación por teclado y *focus visible* en todos los elementos interactivos del museo, no solo en el menú.
   - Etiquetas ARIA y transcripción textual de la locución para la escena 3D.
   - Opción de elegir voz y velocidad en el TTS.
5. **Internacionalización:** preparar la interfaz y los contenidos para varios idiomas (actualmente fijo en `es-ES`), dado el potencial patrimonial del proyecto.
6. **Sonido mejorado:** evaluar locución grabada (clips de audio curados) en lugar de TTS para las piezas destacadas, manteniendo TTS como respaldo.
7. **Rendimiento en dispositivos de gama baja:** perfilar la escena (polígonos del GLB, número de luces, mapas de sombras) y ofrecer un modo de menor calidad/dpr para móviles; probar en pantallas táctiles.
8. **Telemetría/analítica:** registrar interacciones (sección visitada, pieza abierta, uso de TTS) para evaluar el comportamiento del visitante y guiar futuras curadurías.
9. **Refuerzo del GLTF:** documentar el pipeline Blender → exportación (convención de nombres de meshes: `cuadro_*`, `pared_*`, `monolito`, `chachapuma`, `fuente`, `pedestal_presentacion`) para que futuros modeladores respeten los nombres con los que enlaza la app.
