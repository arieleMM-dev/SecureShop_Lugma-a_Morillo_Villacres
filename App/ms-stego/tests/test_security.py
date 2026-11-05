import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
import httpx
import pytest
from fastapi import HTTPException
from app.main import Gate
from app.security import Security

SUBJECT='8cfc57d0-facc-4974-a11b-1d3b1f7b9853'

@pytest.mark.parametrize('failure', ['timeout', 'bad_json', 'string_boolean', 'wrong_subject', 'wrong_resource', 'service_unauthorized', 'denied'])
def test_authorization_fails_closed(failure):
    security=Security.__new__(Security)
    security.settings=SimpleNamespace(auth_service_token='not-a-real-secret')
    body=dict(subject_id=SUBJECT, action='steganography.analyze', resource_id=None, allowed=True, reason='active_role_grants_permission')
    code=200; expected=502
    if failure=='string_boolean':body['allowed']='true'
    if failure=='wrong_subject':body['subject_id']='another-subject'
    if failure=='wrong_resource':body['resource_id']='another-resource'
    if failure=='service_unauthorized':code=401;expected=401
    if failure=='denied':body.update(allowed=False,reason='active_role_does_not_grant_permission');expected=403
    response=httpx.Response(code, json=body) if failure!='bad_json' else httpx.Response(200,text='not-json')
    security.client=SimpleNamespace(post=AsyncMock(return_value=response))
    if failure=='timeout':security.client.post.side_effect=httpx.ConnectTimeout('timeout');expected=503
    with pytest.raises(HTTPException) as caught:
        asyncio.run(security.authorize('test-token',SUBJECT,'steganography.analyze'))
    assert caught.value.status_code==expected


def test_permission_denial_does_not_read_or_parse_upload():
    security=SimpleNamespace(identify=lambda _:('token',SUBJECT), authorize=AsyncMock(side_effect=HTTPException(403,'denied')))
    store=SimpleNamespace(audit=MagicMock())
    service=SimpleNamespace(state=SimpleNamespace(security=security,store=store))
    downstream=AsyncMock(); receive=AsyncMock();send=AsyncMock()
    scope={'type':'http','method':'POST','path':'/api/v1/steganography/analyze','headers':[]}
    asyncio.run(Gate(downstream,service)(scope,receive,send))
    receive.assert_not_called(); downstream.assert_not_called()
    assert send.call_args_list[0].args[0]['status']==403
    assert store.audit.call_args.args[4]==403


@pytest.mark.parametrize('identifier', [
    '8cfc57d0-facc-1974-a11b-1d3b1f7b9853',
    '8cfc57d0-facc-6974-a11b-1d3b1f7b9853',
])
def test_result_id_does_not_rewrite_uuid_version(identifier):
    security = SimpleNamespace(identify=lambda _: ('token', SUBJECT), authorize=AsyncMock())
    store = SimpleNamespace(get=MagicMock(), audit=MagicMock())
    service = SimpleNamespace(state=SimpleNamespace(security=security, store=store))
    downstream, receive, send = AsyncMock(), AsyncMock(), AsyncMock()
    scope = {
        'type': 'http',
        'method': 'GET',
        'path': '/api/v1/steganography/results/' + identifier,
        'headers': [],
    }
    asyncio.run(Gate(downstream, service)(scope, receive, send))
    assert send.call_args_list[0].args[0]['status'] == 400
    store.get.assert_not_called()
    security.authorize.assert_not_called()
