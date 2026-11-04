import asyncio,json,os,sys,math

async def analyze(file,settings):
    options={'max_pixels':settings.max_pixels,'max_dimension':settings.max_dimension,'memory_mb':settings.worker_memory_mb,'cpu_seconds':max(1,math.ceil(settings.worker_timeout/2)),'require_sandbox':settings.require_sandbox}
    # No heredar credenciales de AUTH ni configuración de SQLite.
    env={key:os.environ[key] for key in ['PATH','SYSTEMROOT','WINDIR','LD_LIBRARY_PATH'] if key in os.environ}
    env.update(OPENBLAS_NUM_THREADS='1',OMP_NUM_THREADS='1',PYTHONDONTWRITEBYTECODE='1',PYTHONUNBUFFERED='1')
    child=await asyncio.create_subprocess_exec(sys.executable,'-m','app.worker',str(file),json.dumps(options),stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.DEVNULL,env=env)
    try:
        output,_=await asyncio.wait_for(child.communicate(),timeout=settings.worker_timeout)
        if child.returncode!=0 or len(output)>16384:raise ValueError()
        data=json.loads(output)
        if data['status'] not in ['sin_indicios','sospechoso','no_concluyente','error'] or data['http_status'] not in [200,400,413,415,503] or not isinstance(data['indicators'],dict):raise ValueError()
        return data
    except asyncio.TimeoutError:
        child.kill();await child.communicate()
        return {'status':'error','http_status':503,'error':'Tiempo de procesamiento agotado','indicators':{}}
    except asyncio.CancelledError:
        child.kill();await child.communicate();raise
    except (ValueError,KeyError,TypeError):return {'status':'error','http_status':503,'error':'Proceso aislado fallido','indicators':{}}
