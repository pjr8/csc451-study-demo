#!/usr/bin/env python3
"""Publish only public static files; preserve private data and other Caddy routes."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tarfile

BASE = Path('/srv/tempered/testprep')
ARCHIVE = BASE / 'public-demo.tar.gz'
commit = sys.argv[1]
if not re.fullmatch(r'[0-9a-f]{40}', commit):
    raise SystemExit('Expected a full Git commit SHA')

def run(*args, capture=False):
    return subprocess.run(args, check=True, text=True, capture_output=capture).stdout if capture else subprocess.run(args, check=True)

os.umask(0o077)
stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
release = BASE / ('public-release-' + commit[:12])
release.mkdir(mode=0o755, exist_ok=False)
with tarfile.open(ARCHIVE) as archive:
    for item in archive.getmembers():
        parts = Path(item.name).parts
        if not parts or parts[0] != 'dist' or '..' in parts or item.name.startswith('/') or not (item.isfile() or item.isdir()):
            raise SystemExit('Unexpected archive member')
    archive.extractall(release)
public = release / 'dist'
if not (public / 'index.html').is_file():
    raise SystemExit('Missing static entry point')
for item in release.rglob('*'):
    item.chmod(0o755 if item.is_dir() else 0o644)

original = run('docker', 'exec', 'testprep-caddy-1', 'cat', '/etc/caddy/Caddyfile', capture=True)
match = re.search(r'^testprep\.pauljrobinsonjr\.com\s*\{', original, re.M)
if not match:
    raise SystemExit('Could not locate the existing testprep route')
start = match.start()
cursor = original.index('{', start)
depth = 0
end = None
for index in range(cursor, len(original)):
    if original[index] == '{': depth += 1
    elif original[index] == '}':
        depth -= 1
        if depth == 0:
            end = index + 1
            break
if end is None:
    raise SystemExit('Unbalanced Caddy route')
old_route = original[start:end]
foundry = '''    handle /foundry-pack.zip {
        root * /srv/foundry-pack
        header Cache-Control "no-cache"
        file_server
    }
''' if '/foundry-pack.zip' in old_route else ''
new_route = '''testprep.pauljrobinsonjr.com {
    import audit_access_log
    import audit_common_headers
    import audit_error_headers
    header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
''' + foundry + '''    handle /api/* {
        respond 404
    }
    handle {
        encode zstd gzip
        root * /srv/testprep-public
        header Cache-Control "no-store"
        file_server
    }
}'''
candidate = original[:start] + new_route + original[end:]
unrelated_hash = hashlib.sha256((original[:start] + original[end:]).encode()).hexdigest()
backup = BASE / ('rollback-public-' + stamp)
backup.mkdir(mode=0o700)
(backup / 'Caddyfile').write_text(original)
(backup / 'compose.yaml').write_bytes((BASE / 'compose.yaml').read_bytes())

resolved = json.loads(run('docker', 'compose', '-f', str(BASE / 'compose.yaml'), 'config', '--format', 'json', capture=True))
service = resolved['services']['caddy']
service.pop('depends_on', None)
config_file = BASE / 'secrets' / ('Caddyfile-public-' + commit[:12])
config_file.write_text(candidate)
for mount in service.get('volumes', []):
    if mount['target'] == '/etc/caddy/Caddyfile': mount['source'] = str(config_file)
service.setdefault('volumes', []).append({'type': 'bind', 'source': str(public), 'target': '/srv/testprep-public', 'read_only': True})
configuration = {key: resolved[key] for key in ('name', 'networks', 'volumes') if key in resolved}
configuration['services'] = {'caddy': service}
compose = BASE / 'compose.public.json'
compose.write_text(json.dumps(configuration, indent=2) + '\n')
image = service['image']
# The Caddy process drops DAC override; its private config must be owned by root.
run('docker', 'run', '--rm', '--network', 'none', '--user', '0', '-v', str(BASE / 'secrets') + ':/private', '--entrypoint', '/bin/sh', image,
    '-c', 'chown 0:0 "$1" && chmod 600 "$1"', 'sh', '/private/' + config_file.name)
run('docker', 'compose', '-f', str(compose), 'config', '-q')
run('docker', 'run', '--rm', '--network', 'none', '-v', str(config_file) + ':/etc/caddy/Caddyfile:ro',
    '-v', str(public) + ':/srv/testprep-public:ro', image, 'caddy', 'validate', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile')
run('docker', 'compose', '-f', str(compose), 'up', '-d', '--no-deps', 'caddy')
run('docker', 'stop', 'testprep-app-1')
info = {'commit': commit, 'public_directory': str(public), 'rollback': str(backup), 'unrelated_caddy_config_sha256': unrelated_hash}
(BASE / 'public-release.json').write_text(json.dumps(info, indent=2) + '\n')
print(json.dumps(info))
