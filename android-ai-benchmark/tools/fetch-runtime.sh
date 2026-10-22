#!/usr/bin/env bash
set -euo pipefail
root_dir="$(cd "$(dirname "$0")/.." && pwd)"
runtime_dir="$root_dir/third_party/llama.cpp"
revision=74d4f5b041ad837153b0e90fc864b8290e01d8d5
if [[ ! -d "$runtime_dir/.git" ]]; then
  mkdir -p "$runtime_dir"
  git -C "$runtime_dir" init -q
  git -C "$runtime_dir" remote add origin https://github.com/ggml-org/llama.cpp.git
fi
if [[ "$(git -C "$runtime_dir" rev-parse HEAD 2>/dev/null || true)" != "$revision" ]]; then
  git -C "$runtime_dir" fetch --depth 1 origin "$revision"
  git -C "$runtime_dir" checkout --detach "$revision"
fi
[[ "$(git -C "$runtime_dir" rev-parse HEAD)" == "$revision" ]]
if [[ -n "$(git -C "$runtime_dir" status --porcelain --untracked-files=no)" ]]; then echo 'Runtime checkout has local changes; refusing unreproducible build.' >&2; exit 1; fi
