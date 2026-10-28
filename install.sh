#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-2.0-or-later
# Instala quadcast-s para el usuario actual: binario, servicio systemd y regla udev.
# Uso: ./install.sh            instala
#      ./install.sh --uninstall  desinstala
set -euo pipefail
cd "$(dirname "$0")"

BIN="$HOME/.local/bin/quadcast-s"
UNIT="$HOME/.config/systemd/user/quadcast-s.service"
RULE=/etc/udev/rules.d/70-quadcast-s.rules

if [ "${1:-}" = "--uninstall" ]; then
    systemctl --user disable --now quadcast-s.service 2>/dev/null || true
    rm -f "$UNIT" "$BIN"
    systemctl --user daemon-reload
    sudo rm -f "$RULE"
    sudo udevadm control --reload-rules
    echo "quadcast-s desinstalado."
    exit 0
fi

command -v cargo >/dev/null || { echo "Falta cargo (https://rustup.rs)." >&2; exit 1; }
if [ ! -f web/dist/index.html ] || [ web/src -nt web/dist/index.html ]; then
    command -v npm >/dev/null || { echo "Falta npm para compilar la web." >&2; exit 1; }
    npm --prefix web install
    npm --prefix web run build
fi
cargo build --release

mkdir -p "$(dirname "$BIN")" "$(dirname "$UNIT")"
systemctl --user stop quadcast-s.service 2>/dev/null || true
install -m 755 target/release/quadcast-s "$BIN"
install -m 644 contrib/quadcast-s.service "$UNIT"

sudo install -m 644 contrib/70-quadcast-s.rules "$RULE"
sudo udevadm control --reload-rules
sudo udevadm trigger --subsystem-match=usb --attr-match=idVendor=0951

systemctl --user daemon-reload
systemctl --user enable --now quadcast-s.service
echo "Listo. Abre http://127.0.0.1:7878"
