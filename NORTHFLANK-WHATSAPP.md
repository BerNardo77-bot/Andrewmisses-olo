# README: Luffy7 WhatsApp (Andrewmisses) en Northflank

Repo: https://github.com/BerNardo77-bot/Andrewmisses-olo

Servicio: **AndrewWife** (`andrewwife`)

Proyecto: **Andrewgirlfriend**

Team: **Brbot77's Team**

Cuenta: hitmangold4@gmail.com

Número WhatsApp: **+52 757 100 5124** → `5217571005124`

Recursos actuales: **0.2 vCPU / 512 MB** · Volume `/data`

---

## Variables

- `WHATSAPP_NUMBER=5217571005124`
- `OWNER_NUMBER=5217571005124`
- `DATA_DIR=/data`
- `PORT=3000`
- `NODE_ENV=production`

---

## #ytvideo (build 120 HD-long AVC) — 2026-09-20

- H.264 ≤720p (evita AV1 que congelaba el contenedor).
- Remux `ffmpeg -c copy` + faststart cuando ya es H.264.
- Tope de duración: **20 minutos** (no subir sin pedirlo).
- Logs: `build 120 HD-long AVC`
- Si dice “comando ytvideo no existe”: `Error cargando play2.js` → Rebuild `main`.

Uso:

```
#ytvideo https://youtu.be/VIDEO_ID
```

## #ttsearch

Usar texto plano ASCII:

```
#ttsearch yauri records
```

No usar letras fancy (𝙔𝙖𝙪𝙧𝙞) ni ♫/✔: la API falla o no responde.

## Reinicio

Overview → **Rebuild** del último build de `main`, o Environment → **Update & restart**.

Tras Conectado: espera ~1 minuto, luego `#ping`.
