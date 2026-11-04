from pathlib import Path
import importlib.metadata as m
root=Path('.')
p=root/'app/main.py';s=p.read_text(encoding='utf-8').replace('            async with form:\n','            try:\n').replace('                content=await file.read(settings.max_file_bytes+1)\n','                content=await file.read(settings.max_file_bytes+1)\n            finally:\n                await form.close()\n');p.write_text(s,encoding='utf-8')
exclude={'pytest','iniconfig','pluggy','pygments','colorama','packaging','pip','setuptools'}
versions=sorted(f"{d.metadata['Name']}=={d.version}" for d in m.distributions() if d.metadata['Name'].lower() not in exclude)
(root/'requirements.txt').write_text('\n'.join(versions)+'\n',encoding='utf-8')
(root/'requirements-dev.txt').write_text('-r requirements.txt\npytest==9.2.0\n',encoding='utf-8')
