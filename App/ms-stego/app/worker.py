"""Solo procesa una ruta interna; no recibe credenciales ni JWT."""
import sys,os,json,math,struct,warnings
from pathlib import Path
from PIL import Image,UnidentifiedImageError
import numpy as np
from app.detector import calculate

def isolate(memory_mb,seconds,required):
    if sys.platform!='linux':
        if required:raise RuntimeError('Sandbox Linux requerido')
        return False
    import resource,ctypes
    resource.setrlimit(resource.RLIMIT_AS,(memory_mb*1024**2,memory_mb*1024**2))
    resource.setrlimit(resource.RLIMIT_CPU,(seconds,seconds+1))
    resource.setrlimit(resource.RLIMIT_CORE,(0,0))
    lib=ctypes.CDLL('libseccomp.so.2',use_errno=True)
    lib.seccomp_init.argtypes=[ctypes.c_uint32];lib.seccomp_init.restype=ctypes.c_void_p
    lib.seccomp_syscall_resolve_name.argtypes=[ctypes.c_char_p];lib.seccomp_syscall_resolve_name.restype=ctypes.c_int
    lib.seccomp_rule_add.argtypes=[ctypes.c_void_p,ctypes.c_uint32,ctypes.c_int,ctypes.c_uint];lib.seccomp_rule_add.restype=ctypes.c_int
    lib.seccomp_load.argtypes=[ctypes.c_void_p];lib.seccomp_load.restype=ctypes.c_int
    lib.seccomp_release.argtypes=[ctypes.c_void_p]
    ctx=lib.seccomp_init(0x7fff0000)
    if not ctx:raise RuntimeError('No se pudo crear seccomp')
    try:
        for name in ['socket','connect','bind','listen','accept','accept4','socketpair','sendto','sendmsg','recvfrom','recvmsg']:
            call=lib.seccomp_syscall_resolve_name(name.encode())
            if call>=0 and lib.seccomp_rule_add(ctx,0x00050001,call,0)!=0:raise RuntimeError('No se pudo restringir red')
        if lib.seccomp_load(ctx)!=0:raise RuntimeError('No se pudo activar seccomp')
    finally:lib.seccomp_release(ctx)
    return True

def process(file,settings):
    Image.MAX_IMAGE_PIXELS=settings['max_pixels'];warnings.simplefilter('error',Image.DecompressionBombWarning)
    with file.open('rb') as stream:header=stream.read(33)
    if len(header)<33 or header[:8]!=b'\x89PNG\r\n\x1a\n' or header[12:16]!=b'IHDR':return {'status':'error','http_status':400,'error':'PNG corrupto','indicators':{}}
    width,height=struct.unpack('>II',header[16:24])
    if width*height>settings['max_pixels'] or max(width,height)>settings['max_dimension']:return {'status':'error','http_status':413,'error':'Dimensiones excesivas','indicators':{}}
    if header[24]!=8 or header[25] not in (0,2,6):return {'status':'error','http_status':415,'error':'Solo PNG de 8 bits L/RGB/RGBA','indicators':{}}
    try:
        with Image.open(file,formats=['PNG']) as image:
            if getattr(image,'n_frames',1)!=1:return {'status':'error','http_status':415,'error':'PNG animado no admitido','indicators':{}}
            image.verify()
        with Image.open(file,formats=['PNG']) as image:
            image.load();pixels=np.asarray(image)
            if image.mode=='RGBA':pixels=pixels[:,:,:3]
            status,indicators=calculate(pixels)
        indicators.update(width=width,height=height,sandbox_linux=True)
        return {'status':status,'http_status':200,'indicators':indicators}
    except (UnidentifiedImageError,OSError,SyntaxError,ValueError,Image.DecompressionBombError,Image.DecompressionBombWarning):return {'status':'error','http_status':400,'error':'PNG corrupto o inseguro','indicators':{}}

def main():
    settings=json.loads(sys.argv[2]);sandbox=isolate(settings['memory_mb'],settings['cpu_seconds'],settings['require_sandbox'])
    result=process(Path(sys.argv[1]),settings);result['indicators']['sandbox_linux']=sandbox
    print(json.dumps(result,allow_nan=False))
if __name__=='__main__':
    try:main()
    except Exception:print(json.dumps({'status':'error','http_status':503,'error':'Procesamiento aislado no disponible','indicators':{}}))
