"""Exercise a running production instance; only removes the project it creates."""
import argparse
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


def call(path, method='GET', body=None):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(args.url + path, data=data, method=method,
                                 headers={'Content-Type': 'application/json'})
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
project = call('/api/projects', 'POST', {'title': 'Persistence smoke test'})
path = '/api/projects/' + project['id']
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
    if args.compose_restart:
        subprocess.run(['docker', 'compose', 'restart', 'notespace'], check=True)
        wait_ready()
    assert call(path) == saved, 'Persisted project changed across reopen/restart'
    with urllib.request.urlopen(args.url + '/projects/' + project['id'], timeout=10) as page:
        assert b'Notespace' in page.read(), 'Direct project URL does not serve app shell'
    print('PASS: production stylesheet, create, edit both surfaces, persist reference, reopen, direct project URL' + (', container restart' if args.compose_restart else ''))
finally:
    call(path, 'DELETE')
