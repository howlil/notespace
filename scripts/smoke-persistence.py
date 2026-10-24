"""Exercise a running production instance; only removes the project it creates."""
import argparse
from datetime import date
import uuid
from html.parser import HTMLParser
import json
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:8080')
parser.add_argument('--compose-restart', action='store_true')
args = parser.parse_args()


class StylesheetParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.hrefs = []

    def handle_starttag(self, tag, attrs):
        if tag != 'link':
            return
        values = dict(attrs)
        if values.get('rel') == 'stylesheet' and values.get('href'):
            self.hrefs.append(values['href'])


def call(path, method='GET', body=None, headers=None):
    data = None if body is None else json.dumps(body).encode()
    request_headers = {'Content-Type': 'application/json'}
    if headers:
        request_headers.update(headers)
    req = urllib.request.Request(args.url + path, data=data, method=method,
                                 headers=request_headers)
    with urllib.request.urlopen(req, timeout=10) as response:
        raw = response.read()
        return json.loads(raw) if raw else None


def wait_ready():
    for _ in range(30):
        try:
            if call('/api/health')['status'] == 'ok':
                return
        except (urllib.error.URLError, ConnectionError):
            pass
        time.sleep(1)
    raise RuntimeError('Notespace did not become healthy')


def verify_stylesheet(shell):
    parser = StylesheetParser()
    parser.feed(shell.decode())
    assert parser.hrefs, 'Application shell has no stylesheet link'
    for href in parser.hrefs:
        url = urllib.parse.urljoin(args.url + '/', href)
        with urllib.request.urlopen(url, timeout=10) as response:
            content_type = response.headers.get_content_type()
            css = response.read()
        assert content_type == 'text/css', f'Stylesheet {href} returned {content_type}'
        assert css.strip(), f'Stylesheet {href} is empty'


wait_ready()
with urllib.request.urlopen(args.url, timeout=10) as page:
    shell = page.read()
assert b'Notespace' in shell, 'Application shell missing'
verify_stylesheet(shell)
project = call('/api/workspaces', 'POST', {'title': 'Persistence smoke test'})
path = '/api/workspaces/' + project['id']
try:
    update = {key: project[key] for key in ('title', 'document', 'canvas', 'references', 'splitRatio', 'version')}
    update['document']['data'] = {
        'type': 'doc',
        'content': [{
            'type': 'paragraph',
            'attrs': {'blockId': 'raft'},
            'content': [{'type': 'text', 'text': 'Raft and Paxos'}],
        }],
    }
    update['canvas']['data']['elements'] = [{'id': 'client', 'type': 'rectangle', 'x': 20, 'y': 30}]
    update['references'] = [{'id': 'raft-client', 'blockId': 'raft', 'elementId': 'client'}]
    update['splitRatio'] = .6
    saved = call(path, 'PATCH', update)

    # Workspace-first persistence proof uses the same real HTTP server and
    # SQLite volume as the Note/Canvas smoke. All fixtures are disposable.
    date_key = date.today().isoformat()
    task = call(path + '/tasks', 'POST', {
        'title': 'Workspace-first persistence task ' + project['id'],
        'plannedFor': date_key,
    })
    capture = call('/api/captures', 'POST', {
        'content': 'Unorganized persistence capture ' + project['id'],
    })
    session_id = 'smoke-' + uuid.uuid4().hex
    session = call('/api/activity/sessions/' + session_id, 'PUT', {
        'title': 'Workspace-first persistence activity',
        'activityType': 'read',
        'workspaceId': project['id'],
        'taskId': task['id'],
        'activityDate': date_key,
        'activeSeconds': 37,
        'finish': True,
    })
    assert session['workspaceId'] == project['id']
    assert session['taskId'] == task['id']
    assert session['endedAt'] is not None

    if args.compose_restart:
        subprocess.run(['docker', 'compose', 'restart', 'notespace'], check=True)
        wait_ready()
    assert call(path) == saved, 'Persisted project changed across reopen/restart'
    restored_task = call('/api/tasks/' + task['id'])
    assert restored_task['workspaceId'] == project['id'], 'Task ownership lost on restart'
    assert restored_task['plannedFor'] == date_key, 'Task scheduled date lost on restart'
    plan = call(path + '/plan')
    assert sum(item['id'] == task['id'] for item in plan['tasks']) == 1, 'Plan Task changed on restart'
    today = call('/api/tasks/today?date=' + date_key)
    assert sum(item['id'] == task['id'] for item in today['tasks']) == 1, 'Today projection lost Task'
    restored_capture = call('/api/captures/' + capture['id'])
    assert restored_capture['status'] == 'pending' and restored_capture['content'] == capture['content'], 'Capture Queue data lost'
    assert sum(item['id'] == capture['id'] for item in call('/api/captures')) == 1, 'Queue lists duplicate/missing Capture'
    activity = call('/api/activity/sessions?limit=100')
    assert any(item['id'] == session_id and item['workspaceId'] == project['id']
               and item['taskId'] == task['id'] and item['endedAt'] is not None
               for item in activity), 'Activity history lost on restart'
    with urllib.request.urlopen(args.url + '/projects/' + project['id'], timeout=10) as page:
        assert b'Notespace' in page.read(), 'Direct project URL does not serve app shell'
    print('PASS: production stylesheet, Note/Canvas, Task/Today, Capture Queue, Activity history, reopen, direct URL' + (', container restart' if args.compose_restart else ''))
finally:
    # Clean up only the records created here; never reset another user's data.
    if 'session_id' in locals():
        try:
            call('/api/activity/sessions/' + session_id, 'DELETE')
        except urllib.error.HTTPError as error:
            if error.code != 404:
                raise
    if 'capture' in locals():
        try:
            current_capture = call('/api/captures/' + capture['id'])
            if current_capture['status'] == 'pending':
                call('/api/captures/' + capture['id'], 'DELETE',
                     headers={'If-Match': f'"{current_capture["version"]}"'})
        except urllib.error.HTTPError as error:
            if error.code != 404:
                raise
    try:
        current = call(path)
    except urllib.error.HTTPError as error:
        if error.code != 404:
            raise
        current = None
    if current is not None:
        call(path, 'DELETE', headers={'If-Match': f'"{current["version"]}"'})
