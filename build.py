"""Stitch src/ into one self-contained HTML file: dist/index.html."""
import pathlib
import sys

root = pathlib.Path(__file__).parent
src = root / "src"

shell = (src / "shell.html").read_text(encoding="utf-8")
css_path = src / "styles.css"
css = css_path.read_text(encoding="utf-8") if css_path.exists() else ""
parts = [p for p in ("engine.js", "store.js", "ui.js") if (src / p).exists()]
js = "\n\n".join((src / p).read_text(encoding="utf-8") for p in parts)

if "</script" in js.lower():
    sys.exit("build: a literal </script> in the JS would break the page")

out = shell.replace("/*@CSS@*/", css).replace("/*@JS@*/", js)
dest = root / "dist" / "index.html"
dest.parent.mkdir(exist_ok=True)
dest.write_text(out, encoding="utf-8")
print(f"built {dest.relative_to(root)}: {len(out):,} bytes from {', '.join(parts)}")
