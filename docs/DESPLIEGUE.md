# Guía de despliegue alternativo — Vercel y Cloudflare Pages

VIGÍA ML es una aplicación **100 % estática**: todo el cómputo (incluido el entrenamiento de los 3 modelos de TensorFlow.js) ocurre en el navegador del visitante. No hay backend, base de datos ni funciones serverless, así que puede alojarse gratis en cualquier hosting de sitios estáticos. Esta guía describe cómo migrar o replicar el despliegue actual de GitHub Pages en **Vercel** o **Cloudflare Pages**, manteniendo ambos activos si lo deseas (no son excluyentes: cada plataforma sirve el mismo `dist/` desde su propia URL).

> **Estado actual**: GitHub Pages publica automáticamente en cada push a `main` mediante `.github/workflows/deploy.yml` → https://alicelabs-llc.github.io/vigia-ml/

## Por qué la migración es trivial

- `vite.config.js` usa `base: "./"` (rutas **relativas**), así que el bundle funciona desde cualquier subdirectorio o dominio raíz sin reconstruir.
- `vercel.json` ya está incluido en la raíz del repo (framework, build, rewrites y caché inmutable de assets).
- No hay variables de entorno ni secretos: no hay nada que configurar tras la importación.
- El service worker (PWA) y el manifest usan rutas relativas y funcionan igual en las tres plataformas.

## Opción A · Vercel

### A1. Desde la web (recomendado, ~3 minutos)

1. Entra a [vercel.com/new](https://vercel.com/new) con tu cuenta (GitHub, Google o email).
2. Conecta tu cuenta de GitHub si es la primera vez y autoriza el acceso a tus repositorios.
3. Selecciona el repositorio **`alicelabs-llc/vigia-ml`** y pulsa **Import**.
4. Vercel detecta automáticamente el framework (**Vite**) y lee `vercel.json`:
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm install`
5. Pulsa **Deploy**. El primer build tarda ~1–2 minutos.
6. Resultado: `https://vigia-ml.vercel.app` (o similar) en producción.

A partir de ese momento, **cada push a `main` reconstruye y publica automáticamente** (igual que el workflow de Pages). Cada pull request genera además una **URL de preview** aislada — útil para revisar cambios antes de fusionarlos.

### A2. Desde la CLI (alternativa)

```bash
npm i -g vercel
cd vigia-ml
vercel login
vercel          # primera vez: responde las preguntas (framework Vite)
vercel --prod   # publica en producción
```

### A3. Dominio propio en Vercel

**Settings → Domains → Add**. Puedes usar un subdominio (p. ej. `vigia.tudominio.com`) creando un registro `CNAME` hacia `cname.vercel-dns.com` en tu proveedor DNS. Vercel emite certificado TLS automáticamente. Soporta también el dominio raíz con registros `A` (`76.76.21.21`).

## Opción B · Cloudflare Pages

### B1. Desde la web (recomendado, ~3 minutos)

1. Entra a [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → pestaña **Pages** → **Connect to Git**.
2. Autoriza GitHub y selecciona el repositorio **`vigia-ml`**.
3. En el paso de configuración del build:
   - Framework preset: **Vite** (o None — da igual, se especifica manualmente)
   - Build command: `npm run build`
   - Build output directory: `dist`
4. Pulsa **Save and Deploy**. Resultado: `https://vigia-ml.pages.dev`.
5. Pushes a `main` → despliegue de producción; pushes a otras ramas → preview con URL propia (`<hash>.vigia-ml.pages.dev`).

### B2. Desde la CLI con Wrangler (alternativa)

```bash
npm i -g wrangler
wrangler login
cd vigia-ml
npm run build
wrangler pages deploy dist --project-name=vigia-ml
```

### B3. Dominio propio en Cloudflare

Si el dominio ya está en Cloudflare DNS: **Pages → tu proyecto → Custom domains → Set up a custom domain** — se configura solo (CNAME hacia `<proyecto>.pages.dev`) con TLS automático. Si el dominio está en otro DNS, apunta un `CNAME` a `vigia-ml.pages.dev`.

### B4. Caché de assets

El archivo `public/_headers` del repo ya declara `Cache-Control: public, max-age=31536000, immutable` para `/assets/*` (los bundles con hash). Cloudflare Pages lo aplica automáticamente; en Vercel cumple la misma función `vercel.json`. El `service-worker.js` y `index.html` nunca se cachean de forma agresiva, así que las nuevas versiones llegan al usuario en la primera visita.

## Comparativa rápida

| | GitHub Pages (actual) | Vercel | Cloudflare Pages |
|---|---|---|---|
| Precio | Gratis | Gratis (Hobby) | Gratis (ancho de banda ilimitado) |
| Despliegue automático por push | Sí (workflow) | Sí | Sí |
| Previews por PR | No | Sí | Sí |
| Ancho de banda | Suave (100 GB/mes aprox.) | 100 GB/mes | Ilimitado |
| Latencia global (CDN) | Fastly | Vercel Edge | Red Cloudflare (330+ ciudades) |
| Dominio propio | Sí | Sí, TLS auto | Sí, TLS auto (ideal si ya usas Cloudflare DNS) |
| Límite de tamaño de archivo | 100 MB | 100 MB por archivo | 25 MB por archivo |

**Recomendación**: para este proyecto las tres funcionan de forma idéntica en la práctica (la app pesa ~2 MB). Vercel ofrece la experiencia de preview más pulida; Cloudflare es la opción más generosa en ancho de banda y la natural si tu dominio ya vive en Cloudflare. Puedes importar el repo en ambas y quedarte con la URL que prefieras como principal en el README.

## Y ¿Supabase?

Supabase **no aloja** la app (no es hosting de sitios estáticos), pero es el complemento natural cuando la consola deje de usar telemetría sintética: una tabla `samples` con **Row Level Security** serviría de backend de telemetría real (ingesta vía Edge Functions desde el puente OPC-UA, lectura vía REST/Realtime desde el navegador), y la misma UI de Fuente de datos consumiría ese endpoint sin cambios en los modelos. La sesión (login de operadores) también encaja ahí con Supabase Auth.

## Lista de verificación post-migración

- [ ] La página carga y el motor ML entrena sin congelar la UI (Web Worker + lotes).
- [ ] Los chips `LSTM · TF.JS` se encienden en N1/N2/N3 al terminar el entrenamiento.
- [ ] La PWA instala (`manifest` + service worker activos en DevTools → Application).
- [ ] La exportación CSV/JSON y el reporte PDF funcionan (descargas no bloqueadas).
- [ ] El copiloto responde offline (desconecta la red y pregunta algo).
