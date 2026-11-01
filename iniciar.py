"""Abre el visor de escenarios en este equipo, sin Internet ni bibliotecas adicionales.

Uso: python iniciar.py [--puerto 8765] [--sin-navegador]
Sirve siempre la carpeta de este archivo, aunque se invoque desde otra.
"""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import os
from pathlib import Path
import sys
import threading
from urllib.parse import urlsplit
import webbrowser

CARPETA = Path(__file__).resolve().parent
NECESARIOS = ('visor/index.html', 'visor/producto.json', 'visor/visor.mjs')
TIPOS = {'.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
         '.css': 'text/css; charset=utf-8', '.json': 'application/json',
         '.geojson': 'application/geo+json', '.csv': 'text/csv; charset=utf-8',
         '.md': 'text/markdown; charset=utf-8', '.py': 'text/plain; charset=utf-8'}


class Archivos(SimpleHTTPRequestHandler):
    # Tipos explícitos: algunos sistemas registran .mjs con un tipo que bloquea el visor.
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, **TIPOS}

    def _redirigir(self):
        if urlsplit(self.path).path in ('', '/', '/index.html'):
            self.send_response(302)
            self.send_header('Location', '/visor/')
            self.send_header('Content-Length', '0')
            self.end_headers()
            return True
        return False

    def do_GET(self):
        if not self._redirigir():
            super().do_GET()

    def do_HEAD(self):
        if not self._redirigir():
            super().do_HEAD()

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_request(self, code='-', size='-'):
        pass  # Las solicitudes correctas no se listan; los errores sí.


class Servidor(ThreadingHTTPServer):
    # En Windows, reutilizar la dirección permitiría compartir un puerto ocupado.
    allow_reuse_address = os.name != 'nt'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--puerto', type=int, help='Puerto local; por omisión, el primero libre desde 8765.')
    parser.add_argument('--sin-navegador', action='store_true', help='No abrir el navegador automáticamente.')
    args = parser.parse_args()
    if args.puerto is not None and not 1 <= args.puerto <= 65535:
        parser.error('El puerto debe estar entre 1 y 65535.')
    faltantes = [n for n in NECESARIOS if not (CARPETA / n).is_file()]
    if faltantes:
        parser.exit(1, f'Falta {", ".join(faltantes)} en {CARPETA}. Vuelva a extraer el ZIP '
                       'completo en una carpeta nueva.\n')
    puertos = [args.puerto] if args.puerto else range(8765, 8775)
    for puerto in puertos:
        try:
            servidor = Servidor(('127.0.0.1', puerto), partial(Archivos, directory=str(CARPETA)))
            break
        except OSError as error:
            ultimo = error
    else:
        parser.exit(1, f'No se pudo iniciar el visor ({ultimo}). Pruebe otro puerto, '
                       'por ejemplo: python iniciar.py --puerto 8800\n')
    url = f'http://127.0.0.1:{puerto}/visor/'
    print(f'Visor listo. Abra esta dirección en el navegador:\n\n    {url}\n', flush=True)
    print('Mantenga esta ventana abierta mientras usa el visor. Para cerrarlo: Ctrl+C.', flush=True)
    grafico = sys.platform in ('win32', 'darwin') or os.environ.get('DISPLAY') or os.environ.get('WAYLAND_DISPLAY')
    if not args.sin_navegador and grafico:
        threading.Thread(target=webbrowser.open, args=(url,), daemon=True).start()
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print('\nVisor cerrado.')
    finally:
        servidor.server_close()


if __name__ == '__main__':
    main()
