# 🗺 FPlace — Pinta el Mundo

Lienzo colaborativo en tiempo real. Sin reglas. El mundo como canvas.

---

## ⚡ Instalación rápida

```bash
npm install
node server.js
```
Abre http://localhost:3000

---

## 🌐 Deploy GRATIS en Railway (recomendado)

1. Ve a https://railway.app → New Project → Deploy from GitHub
2. Sube este proyecto a GitHub (o arrastra la carpeta en railway)
3. Railway detecta el package.json y hace deploy automático
4. Obtienes una URL pública tipo `fplace-production.up.railway.app`
5. ✅ Listo — online para todo el mundo

## 🌐 Deploy en Render

1. Ve a https://render.com → New Web Service
2. Conecta tu repo de GitHub
3. Build Command: `npm install`
4. Start Command: `node server.js`
5. Usa el plan **Free**

## 🌐 Deploy en Fly.io

```bash
npm install -g flyctl
fly auth login
fly launch
fly deploy
```

---

## 👑 Acceso Admin

En la pantalla de bienvenida, haz clic en "¿Eres admin?" e introduce la contraseña.

**Nombre:** `Admin`  
**Contraseña:** `fplace2025admin`

> ⚠️ Cambia la contraseña en `server.js` línea `ADMIN_PASS` antes de publicar.

### Poderes admin:
- 🎨 Pintura infinita (sin puntos ni cooldown)
- 🗑️ Limpiar el mundo entero
- 🔨 Banear usuarios por nombre

---

## 🎮 Sistema de Juego

### Puntos (🎯)
- 1 punto = 1 píxel 1×1
- Nivel 1 → 50 puntos máx
- Cada nivel → +5 puntos máx
- Se regeneran automáticamente cada 30s

### Niveles (∞ infinitos)
- Cada 100 píxeles pintados = 1 nivel
- Sin tope de nivel
- El cooldown baja conforme subes

### Guía de Imagen
- Sube una imagen como referencia visual sobre el mapa
- Mueve la guía con Shift+Click o con dos dedos en móvil
- Extrae la paleta de colores de la imagen automáticamente
- TÚ decides qué y dónde pintar — la imagen solo guía

### Logros
- 17 logros desbloqueables
- Notificaciones en tiempo real

---

## 🗃️ Archivos

```
fplace/
├── server.js         ← Servidor WebSocket + Express
├── package.json
├── world.json        ← Estado del mundo (auto-generado)
├── users.json        ← Usuarios (auto-generado)
└── public/
    └── index.html    ← Cliente web
```

---

## ⚙️ Configuración (server.js)

```js
const WORLD_W   = 1000;          // Ancho del mundo
const WORLD_H   = 500;           // Alto del mundo
const ADMIN_NAME = 'Admin';      // Tu nombre de admin
const ADMIN_PASS = 'tu-clave';   // CAMBIA ESTO
```
