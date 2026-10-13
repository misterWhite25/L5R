"""Build a local installable system archive; never publishes or changes its version."""
from pathlib import Path
import hashlib,json,re,zipfile

root=Path(__file__).resolve().parents[1]
manifest=json.loads((root/'system.json').read_text())
directories=['assets','images','dist','module','templates','lang','docs','tests/integration','tests/fixtures','tests/helpers']
files=[root/name for name in ['system.json','template.json','LICENSE','README.md','CHANGELOG.MD','ACTIVE_EFFECTS.md'] if (root/name).is_file()]
for name in directories:
 if (root/name).is_dir():files.extend(p for p in (root/name).rglob('*') if p.is_file())
files=sorted(set(files))
included={p.relative_to(root).as_posix() for p in files}
for name in manifest['esmodules']+manifest['styles']+[language['path'] for language in manifest['languages']]:
 if name not in included:raise RuntimeError(f'Missing manifest entry: {name}')
for p in files:
 if p.suffix!='.js':continue
 code=re.sub(r'/\*.*?\*/','',p.read_text(),flags=re.S)
 code=re.sub(r'^\s*//.*$','',code,flags=re.M)
 for relative in re.findall(r'(?:from\s*|import\s*\(\s*)["\'](\.[^"\']+)["\']',code):
  target=(p.parent/relative).resolve().relative_to(root).as_posix()
  if target not in included:raise RuntimeError(f'Missing import: {p.relative_to(root)} -> {target}')
out=root/'test-results/package';out.mkdir(parents=True,exist_ok=True)
archive=out/f'{manifest["id"]}-{manifest["version"]}.zip'
with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED) as z:
 for p in files:z.write(p,p.relative_to(root).as_posix())
digest=hashlib.sha256(archive.read_bytes()).hexdigest()
(out/'archive.json').write_text(json.dumps({'path':str(archive),'sha256':digest,'files':len(files),'version':manifest['version']},indent=2))
print(json.dumps({'path':str(archive),'sha256':digest,'files':len(files)}))
