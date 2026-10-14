# Radar de influencers

Herramienta local de Libertario Coffee Roasters para encontrar micro-influencers de café, brunch y comida de barrio, estudiar una cuenta de la competencia y dejar listo el mensaje de invitación a un desayuno. El intercambio es contenido orgánico, no pauta.

La interfaz está en español. El código y este flujo de trabajo corren en el computador de la tienda. Más adelante se puede dejar el mismo proceso en un servidor o abrirlo con un túnel de Cloudflare.

Hay cuatro piezas, cada una en su módulo:

1. **Buscador** (`src/lib/instagram.ts`): abre Chromium con Playwright y un perfil persistente. La sesión de Instagram se inicia a mano en esa ventana. No guarda contraseñas ni usa la API privada.
2. **Analista** (`src/lib/scoring.ts`): puntúa cada perfil de 0 a 100 y deja el motivo en una línea.
3. **Competencia** (`src/lib/competitor.ts`): resume formatos, ritmo, tono, colaboradores y comentarios. Los precios salen de un archivo.
4. **Invitaciones** (`src/lib/drafts.ts`, `src/lib/policy.ts`): redacta el mensaje. No lo envía. El envío es otro paso, manual, con otra cuenta, y viene apagado.

## Qué necesitas

- macOS con Node.js 22 o más nuevo (`node -v`)
- Google Chrome
- Una cuenta de Instagram para investigar, y otra distinta si algún día quieres enviar mensajes

## Instalar

En la carpeta del proyecto:

```bash
make install
```

Eso instala las dependencias y el Chromium de Playwright. Si ya tienes Google Chrome, el radar lo usa solo. La ruta se puede forzar con `CHROME_PATH`.

## Correr

```bash
make run
```

Abre [http://127.0.0.1:3847](http://127.0.0.1:3847). Otro puerto: `PORT=4321 make run`.

La primera vez carga datos de ejemplo de Medellín y Santiago, con el modo demo encendido. Así se puede ver el panel sin entrar a Instagram. Los puntajes de esos perfiles salen del mismo analista que se usa en una búsqueda real.

## Entrar a Instagram la primera vez

1. En Ajustes, apaga **Modo demo**.
2. Pulsa **Abrir cuenta de investigación**.
3. En la ventana de Chrome que se abre, entra a Instagram tú mismo.
4. Cierra esa ventana cuando ya hayas entrado. La sesión queda en `data/ig-profile` en este computador.
5. Vuelve al Radar y pulsa **Buscar**.

La contraseña no se escribe en la base de datos ni en ningún archivo del proyecto. No compartas la carpeta `data/ig-profile`.

La búsqueda recorre los hashtags de la ciudad, las URLs de lugar que pegues en Ajustes y quién comenta en las cafeterías de esa lista. Va despacio, con pausas al azar, y se detiene al llegar al tope de la hora o del día. Si Instagram muestra una verificación o pide esperar, el radar se pausa y no reintenta solo. Resuelve esa pantalla en la ventana y vuelve a buscar cuando quieras.

Medellín ya trae Laureles, El Poblado, Provenza, Manila, Envigado, Ciudad del Río y Sabaneta, y hashtags como `#cafemedellin`, `#cafeespecial` y `#brunchmedellin`. Santiago trae Nueva Costanera, Vitacura, Providencia, Lastarria y Ñuñoa. Las dos listas se editan en Ajustes: sirve para la siguiente ciudad sin tocar código.

El control de seguidores es el rango que usa la búsqueda para decidir a quién mirar de cerca, y también filtra la lista y el CSV.

## Competencia y precios

En Competencia el valor inicial en Medellín es `@pergaminocafe`. Puedes cambiarlo. En modo demo el estudio es de ejemplo y lo dice en pantalla. Con el demo apagado, lee la cuenta pública con el mismo navegador de investigación.

Los precios no se buscan en internet. Edita `data/prices.json` o apunta en Ajustes a `data/prices.csv`. El CSV usa las columnas `item,libertario,competitor,notes`. Al guardar el archivo, la tabla se actualiza sola.

## Invitaciones

En un perfil, **Invitar** arma un mensaje en español para el desayuno de la tienda de su zona (Laureles o Ciudad del Río en Medellín; Nueva Costanera en Santiago). Las direcciones se corrigen en Ajustes.

En Invitaciones se revisa el texto, se aprueba o se omite. **Enviar** no hace nada mientras el envío esté apagado, que es el estado inicial.

Si más adelante quieres enviarlo:

1. Usa otra cuenta de Instagram, nunca la de investigación.
2. En Ajustes, abre **Abrir cuenta de envío** y entra en esa ventana.
3. Confirma que la carpeta de envío (`data/ig-outreach-profile`) no sea la misma de la investigación.
4. Apaga el modo demo y enciende **Permitir envío**.
5. Aprueba el borrador y confirma cada envío a mano.

Hay un tope de 15 mensajes al día y una espera al azar de 3 a 8 minutos entre uno y otro. Un fallo también cuenta para el tope. Los perfiles de ejemplo no se pueden escribir.

## Datos

Todo vive en `data/radar.sqlite`. Para respaldo, copia la carpeta `data/` con la app detenida. **Quitar ejemplos de esta ciudad** borra solo los perfiles marcados como ejemplo.

## Exponerlo después con Cloudflare

En el Mac, con el radar ya corriendo:

```bash
brew install cloudflared
cloudflared tunnel --url http://127.0.0.1:3847
```

Ese enlace queda público: quien lo tenga puede ver perfiles y disparar búsquedas. Para dejarlo fijo, conviene un túnel con nombre y Cloudflare Access delante. El túnel no reemplaza el inicio de sesión de Instagram: el navegador de la búsqueda tiene que poder abrirse en la máquina donde corre el radar.

## Pruebas

```bash
make test
```

Cubren el puntaje, las pausas, los topes, la detección de verificaciones y el texto de la invitación.
