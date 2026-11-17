# Bundeswehr Roleplay Website

## Starten
1. Node.js 18 oder neuer installieren.
2. Im Projektordner `npm install` ausführen.
3. `.env.example` nach `.env` kopieren und die Werte eintragen.
4. `npm start` ausführen und `http://localhost:3000` öffnen.

## Discord-Entbannungsportal einrichten
- Im Discord Developer Portal eine OAuth2-Anwendung erstellen.
- Als Redirect URL exakt den Wert aus `PUBLIC_URL` plus `/auth/discord/callback` eintragen, z. B. `http://localhost:3000/auth/discord/callback`. Bei Hosting muss dort die HTTPS-Domain stehen und exakt dieselbe URL im Discord Developer Portal eingetragen sein.
- `DISCORD_CLIENT_ID` und `DISCORD_CLIENT_SECRET` in `.env` eintragen.
- Einen Bot in den Server `1571596496460054661` einladen. Er benötigt die Berechtigung **Mitglieder bannen** (für die Abfrage des Bannstatus).
- `DISCORD_BOT_TOKEN` eintragen.
- Einen neuen privaten Webhook im gewünschten Antragskanal erstellen und als `DISCORD_WEBHOOK_URL` eintragen.
- `PUBLIC_URL` auf die echte Domain setzen (ohne abschließenden Slash). In Produktion HTTPS verwenden und `NODE_ENV=production` setzen. Der Node/Express-Server muss laufen; reines Static Hosting (z. B. GitHub Pages) reicht für OAuth und Bannprüfung nicht aus.
- `SESSION_SECRET` durch einen langen zufälligen Wert ersetzen.

Die Website prüft beim Antrag erneut den Discord-Bannstatus. Der Webhook bleibt ausschließlich serverseitig und wird nicht an den Browser ausgeliefert.

## Vor dem öffentlichen Start
- Impressum und Datenschutz sind Vorlagen mit Platzhaltern. Betreiberangaben, Kontakt, Hosting und tatsächliche Datenverarbeitung müssen ergänzt werden.
- Für produktiven Betrieb einen persistenten Session-Store statt des Express-Memory-Stores einsetzen.
- HTTPS, Rate-Limiting, Logging und ein Löschkonzept einrichten.
- Friedenszeit-Regel: ab 00:00 Uhr aktiv, danach stündlich abwechselnd; ab 12:00 Uhr beginnt das Muster wie in der Vorgabe erneut mit aktiv.
