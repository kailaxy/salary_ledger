#!/usr/bin/env python3
"""Build/verify signed local frontend artifacts. No private key material in stdout."""
import argparse
import base64
import hashlib
from pathlib import Path
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
BASE = 'https://github.com/kailaxy/salary_ledger/releases/download/'
MAX_HTML = 4 * 1024 * 1024


def packed(source):
    text = re.sub(r'^<link[^>]*https://fonts\.(googleapis|gstatic)\.com[^>]*>\r?\n', '', source, flags=re.M)
    text = re.sub(r'^<base[^>]*>\r?\n', '', text, flags=re.M)
    if 'frontendReady' not in text or 'LedgerNative.ready()' not in text:
        raise ValueError('Frontend lacks the native startup acknowledgement')
    data = text.encode('utf-8')
    if not 0 < len(data) <= MAX_HTML:
        raise ValueError('Invalid frontend size')
    return data


def verify(raw, public_der, channel, base=BASE):
    if len(raw) > 8192 or b'\r' in raw:
        raise ValueError('Invalid manifest framing')
    fields = raw.decode('ascii').split('\n')
    if (len(fields) != 9 or fields[-1] or fields[0] != 'SALARY_LEDGER_FRONTEND_V1' or fields[1] != channel
            or not re.fullmatch(r'[1-9][0-9]{0,14}', fields[2]) or not re.fullmatch(r'[1-9][0-9]{0,3}', fields[3])
            or not re.fullmatch('[a-f0-9]{64}', fields[4]) or not re.fullmatch('[1-9][0-9]{0,7}', fields[5])
            or int(fields[5]) > MAX_HTML or fields[6] != f'{base}frontend-{channel}/frontend-{fields[2]}.html'):
        raise ValueError('Invalid signed metadata')
    with tempfile.TemporaryDirectory() as temp:
        folder = Path(temp)
        (folder/'key.der').write_bytes(public_der)
        (folder/'sig').write_bytes(base64.b64decode(fields[7], validate=True))
        (folder/'payload').write_bytes(('\n'.join(fields[:7])+'\n').encode('ascii'))
        subprocess.run(['openssl','dgst','-sha256','-verify',str(folder/'key.der'),'-keyform','DER',
                        '-signature',str(folder/'sig'),str(folder/'payload')],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    return int(fields[2])


def build(source, revision, minimum_api, channel, private_key, public_der, output, previous=None):
    if channel not in ('dev','stable') or not 1 <= revision < 10**15 or not 1 <= minimum_api <= 9999:
        raise ValueError('Invalid release configuration')
    if previous and previous.is_file() and verify(previous.read_bytes(), public_der, channel) >= revision:
        return False
    html = packed(source)
    payload = ('\n'.join(['SALARY_LEDGER_FRONTEND_V1',channel,str(revision),str(minimum_api),
               hashlib.sha256(html).hexdigest(),str(len(html)),f'{BASE}frontend-{channel}/frontend-{revision}.html'])+'\n').encode('ascii')
    signature = subprocess.run(['openssl','dgst','-sha256','-sign',str(private_key)],input=payload,
                               stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,check=True).stdout
    manifest = payload + base64.b64encode(signature) + b'\n'
    verify(manifest,public_der,channel)
    output.mkdir(parents=True,exist_ok=False)
    (output/f'frontend-{revision}.html').write_bytes(html)
    (output/'manifest.txt').write_bytes(manifest)
    return True


def main():
    import os
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--revision',required=True,type=int)
    parser.add_argument('--minimum-api',default=1,type=int)
    parser.add_argument('--channel',required=True,choices=['dev','stable'])
    parser.add_argument('--key',required=True,type=Path)
    parser.add_argument('--output',required=True,type=Path)
    parser.add_argument('--previous',type=Path)
    args=parser.parse_args()
    public=base64.b64decode(os.environ['LEDGER_OTA_PUBLIC_KEY'].strip(),validate=True)
    changed=build((ROOT/'Index.html').read_text(),args.revision,args.minimum_api,args.channel,args.key,public,args.output,args.previous)
    print('Signed frontend artifacts created.' if changed else 'Same/newer signed revision already published; nothing overwritten.')


if __name__=='__main__':
    main()
