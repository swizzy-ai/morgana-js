"""
Archive the working tree for off-machine storage.

Excluded, and why:

  node_modules/        322 MB of the 351 MB total, and `pnpm install` rebuilds it
                       from pnpm-lock.yaml exactly. Including it makes the
                       archive ~10x larger and it goes stale the moment a
                       dependency moves.
  dist/ .wrangler/     build output. `pnpm build` regenerates it.
  .data/ *.db          local SQLite state from `morgana dev`. Machine-local.
  verify-failure.png   a screenshot written by the browser check that no longer
                       ships in the CLI.

Kept, and why:

  .git/                7 MB, and the only copy of 21 commits. An archive of the
                       files alone would not be a repository.

Usage:  python tools/archive.py [outdir]
"""
import os
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

EXCLUDE_DIRS = {
    "node_modules",
    "dist",
    "build",
    ".wrangler",
    ".data",
    ".data-acl",
    ".data-chtest",
    ".turbo",
    "coverage",
}
EXCLUDE_FILES = {
    "verify-failure.png",
    ".DS_Store",
}
EXCLUDE_SUFFIX = {".log", ".db", ".db-shm", ".db-wal", ".tgz"}


def skip(path: Path) -> bool:
    if path.name in EXCLUDE_DIRS:
        return True
    if path.name in EXCLUDE_FILES:
        return True
    if path.suffix in EXCLUDE_SUFFIX:
        return True
    return False


def main() -> int:
    outdir = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT.parent
    outdir.mkdir(parents=True, exist_ok=True)
    target = outdir / "morgana-js.zip"
    if target.exists():
        target.unlink()

    kept = skipped = 0
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for dirpath, dirnames, filenames in os.walk(ROOT):
            here = Path(dirpath)
            # Pruning in place stops the walk descending into what we exclude,
            # which is the difference between a 4-second run and a 4-minute one.
            dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRS]
            for name in filenames:
                file = here / name
                if skip(file):
                    skipped += 1
                    continue
                rel = file.relative_to(ROOT).as_posix()
                zf.write(file, f"morgana-js/{rel}")
                kept += 1

    size = target.stat().st_size / 1024 / 1024
    print(f"{target}")
    print(f"  {kept} files, {skipped} skipped, {size:.1f} MB")
    print()
    print("Restore with:")
    print("  unzip morgana-js.zip && cd morgana-js")
    print("  pnpm install && pnpm -r run build")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())