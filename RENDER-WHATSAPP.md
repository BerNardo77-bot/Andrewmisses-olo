# Luffy7 WhatsApp en Render (numero NUEVO, sin Termux)

Repo nube: https://github.com/BerNardo77-bot/Andrewmisses-olo
Codigo (Termux): https://github.com/BerNardo77-bot/Luffy7
Version: 1.1.19

Esto NO es Telegram. WhatsApp no usa BotFather.
Hace falta OTRO numero. El de Yampi en Termux se queda.

## Importante (gratis no sirve)

- Web Service **Free** se duerme y **no** admite Persistent Disk → no sirve para WhatsApp.
- Usa **Background Worker** de pago (Starter ~7 USD/mes) + Persistent Disk en `/data`.
- O Web Service de **pago** + disco. El bot puede exponer health en `PORT`.

## 1. Numero nuevo

1. Otro WhatsApp (otro chip / Business).
2. Pais + numero, SIN +. Mexico a menudo `521` + 10 digitos.

## 2. Render + GitHub

1. https://render.com con GitHub BerNardo77-bot.
2. Autoriza repo `Andrewmisses-olo` (no Luffy7, no bbboy).

## 3. Servicio

1. New + → Background Worker.
2. Repo `Andrewmisses-olo`, branch `main`.
3. Docker (Dockerfile del repo).
4. Instance Starter (512 MB) o mas.

## 4. Persistent Disk

1. Add disk, mount path `/data`, 1 GB al inicio.

## 5. Variables

```
WHATSAPP_NUMBER=...
OWNER_NUMBER=...
DATA_DIR=/data
PORT=10000
```

Si Render ya inyecto PORT, dejalo.

## 6. Deploy y vincular

1. Deploy → Logs.
2. Busca `CODIGO WHATSAPP (8 digitos)`.
3. WhatsApp → Dispositivos vinculados → Vincular con numero → pega codigo.
4. `#ping` `#menu` al numero nuevo.

Codigo caduca: Manual Deploy y codigo nuevo.

## Si falla

Sin codigo: falta WHATSAPP_NUMBER o formato (prueba 521 en MX).
Comandos 2 veces: mismo numero en Termux y nube.
No borres el disco salvo vincular de cero.
