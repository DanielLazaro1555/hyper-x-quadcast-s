#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-2.0-or-later
# Genera los paquetes .deb y .rpm en target/. Requiere:
#   cargo install cargo-deb cargo-generate-rpm
set -euo pipefail
cd "$(dirname "$0")/.."
npm --prefix web install
npm --prefix web run build
cargo build --release
cargo deb --no-build
cargo generate-rpm
ls target/debian/*.deb target/generate-rpm/*.rpm
