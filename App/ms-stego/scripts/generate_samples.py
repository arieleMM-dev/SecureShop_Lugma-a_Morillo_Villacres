from pathlib import Path
import json,hashlib
import numpy as np
from PIL import Image
from app.detector import calculate
ROOT=Path(__file__).resolve().parents[1]
MESSAGE='Proyecto integrador: carga LSB real de prueba.'
def generate(out=None):
 out=out or ROOT.parent/'docs/pruebas/muestras';out.mkdir(parents=True,exist_ok=True)
 y,x=np.indices((256,256));cover=np.stack([((x+j*29+2*y)%128)*2 for j in range(3)],axis=2).astype(np.uint8)
 header=b'STEGOv1!'+len(MESSAGE.encode()).to_bytes(4,'big')+MESSAGE.encode()
 payload=header+np.random.default_rng(4201).bytes(cover.size//8-len(header))
 full=((cover.reshape(-1)&254)|np.unpackbits(np.frombuffer(payload,dtype=np.uint8))).reshape(cover.shape)
 low=cover.copy().reshape(-1);bits=np.unpackbits(np.frombuffer(header,dtype=np.uint8));low[:len(bits)]=(low[:len(bits)]&254)|bits;low=low.reshape(cover.shape)
 noise=np.random.default_rng(4202).integers(0,256,size=cover.shape,dtype=np.uint8)
 rows=[]
 for name,array,truth in [('original_control.png',cover,False),('oculta_lsb.png',full,True),('oculta_baja_carga.png',low,True),('ruido_sin_mensaje.png',noise,False),('pequena.png',cover[:8,:8],False)]:
  file=out/name;Image.fromarray(array).save(file)
  status,indicators=calculate(array)
  rows.append({'file':name,'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'contains_payload':truth,'status':status,'indicators':indicators})
 restored=np.packbits(np.asarray(Image.open(out/'oculta_lsb.png')).reshape(-1)&1).tobytes()
 assert restored[:8]==b'STEGOv1!' and restored[12:12+int.from_bytes(restored[8:12],'big')].decode()==MESSAGE
 metrics={'TP':0,'FP':0,'TN':0,'FN':0,'no_concluyentes':0}
 for row in rows:
  if row['status']=='no_concluyente':metrics['no_concluyentes']+=1;continue
  metrics[('T' if (row['status']=='sospechoso')==row['contains_payload'] else 'F')+('P' if row['status']=='sospechoso' else 'N')]+=1
 (out/'manifest.json').write_text(json.dumps({'seed':4201,'construction':'Controles sintéticos: valores pares, ruido benigno y reemplazo LSB. No son fotografías ni corpus representativo.','message':MESSAGE,'rows':rows,'metrics':metrics,'limitations':'Parámetros propuestos antes de probar. Ruido puede dar falso positivo y baja carga puede evadir el contraste.'},ensure_ascii=False,indent=2),encoding='utf-8')
 return rows
if __name__=='__main__':
 for row in generate():print(row['file'],row['status'])
