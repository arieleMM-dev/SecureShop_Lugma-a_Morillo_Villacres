import json
from pathlib import Path
import numpy as np
import pytest
from app.detector import calculate
from app.store import Store
from app.main import app
from scripts.generate_samples import generate,MESSAGE
from PIL import Image

def test_even_values_reject_equiprobability():
 status,result=calculate(np.tile(np.arange(0,256,2,dtype=np.uint8),100))
 assert status=='sin_indicios' and result['chi_square']==result['sample_count']

def test_balanced_pairs_are_suspicious():
 status,result=calculate(np.tile(np.arange(256,dtype=np.uint8),100))
 assert status=='sospechoso' and result['equiprobability_p_value']==1.0

def test_insufficient_data_is_inconclusive():
 assert calculate(np.zeros((8,8),dtype=np.uint8))[0]=='no_concluyente'

def test_real_lsb_payload_and_false_positive_control(tmp_path):
 rows=generate(tmp_path)
 assert rows[0]['status']=='sin_indicios' and rows[1]['status']=='sospechoso'
 bits=np.asarray(Image.open(tmp_path/'oculta_lsb.png')).reshape(-1)&1
 raw=np.packbits(bits).tobytes();assert raw[12:12+int.from_bytes(raw[8:12],'big')].decode()==MESSAGE
 assert rows[3]['contains_payload'] is False

def test_openapi_has_upload_and_security():
 schema=app.openapi();route=schema['paths']['/api/v1/steganography/analyze']['post']
 assert 'multipart/form-data' in route['requestBody']['content']
 assert route['security']==[{'BearerAuth':[]}]

def test_retention_only_deletes_server_named_files(tmp_path):
 from datetime import datetime,timezone
 store=Store(tmp_path)
 identifier='d644d8db-9986-45e9-a9c7-46b687ed2ab7';file=tmp_path/'quarantine'/(identifier+'.bin');file.write_bytes(b'example')
 record=dict(analysis_id=identifier,user_id=identifier,filename='image.png',sha256='a'*64,technique='test',indicators={},created_at=datetime.now(timezone.utc).isoformat(),status='sospechoso',action='cuarentena',limitations='test')
 store.insert(record,file.name,1)
 with store.connection() as db:db.execute("UPDATE analyses SET retained_until='2000-01-01T00:00:00+00:00'")
 assert store.purge()==1 and not file.exists() and store.get(identifier) is not None
