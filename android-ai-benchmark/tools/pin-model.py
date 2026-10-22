#!/usr/bin/env python3
"""Resolve official metadata to an immutable artifact pin. Never download weights."""
import argparse, hashlib, json, re, urllib.request
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
def get(url, maximum=4*1024*1024):
    with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent':'SalaryLedgerBenchmark/0.1'}), timeout=60) as r:
        if not r.url.startswith('https://huggingface.co/'): raise ValueError('Unexpected metadata host')
        b=r.read(maximum+1)
        if len(b)>maximum: raise ValueError('Metadata exceeds bound; refusing a weight download')
        return b

def resolve(seed, revision):
    repo=seed['repository']
    if repo!='Qwen/Qwen2.5-0.5B-Instruct-GGUF': raise ValueError('Unexpected model source')
    if revision!='main' and not re.fullmatch('[0-9a-f]{40}',revision): raise ValueError('Use main or a full immutable revision')
    base='https://huggingface.co/api/models/'+repo+'/revision/'
    first=json.loads(get(base+revision+'?blobs=true')); commit=first['sha']
    if not re.fullmatch('[0-9a-f]{40}',commit): raise ValueError('Invalid official revision')
    if revision!='main' and revision!=commit: raise ValueError('Official revision response does not match requested commit')
    data=json.loads(get(base+commit+'?blobs=true'))
    if data['sha']!=commit: raise ValueError('Revision changed')
    matches=[f for f in data['siblings'] if f['rfilename'].lower()==seed['filename'].lower()]
    if len(matches)!=1: raise ValueError('Expected a single official Q4_K_M file')
    f=matches[0]; lfs=f.get('lfs',{}); digest=lfs.get('sha256',lfs.get('oid',''))
    if not re.fullmatch('[0-9a-f]{64}',digest): raise ValueError('Official artifact lacks a SHA-256 LFS identity')
    size=lfs.get('size',f.get('size'))
    if not isinstance(size,int) or not 100_000_000<size<1_000_000_000: raise ValueError('Unexpected model size')
    pointer=get('https://huggingface.co/'+repo+'/raw/'+commit+'/'+f['rfilename'],4096).decode('ascii')
    if 'oid sha256:'+digest not in pointer or 'size '+str(size) not in pointer: raise ValueError('LFS pointer and API disagree')
    license_name=data.get('cardData',{}).get('license')
    if license_name!='apache-2.0': raise ValueError('Review the official license before pinning: '+str(license_name))
    result=dict(seed,revision=commit,sha256=digest,sizeBytes=size,filename=f['rfilename'],pinStatus='pinned from official immutable metadata and LFS pointer')
    result['downloadUrl']='https://huggingface.co/'+repo+'/resolve/'+commit+'/'+f['rfilename']
    return result
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--revision');p.add_argument('--output',type=Path,default=ROOT/'model-manifest.json');a=p.parse_args()
    seed=json.loads((ROOT/'model-manifest.json').read_text())
    result=resolve(seed,a.revision or seed.get('revision') or 'main')
    a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps(result,indent=2)+'\n')
    print('Pinned',result['revision'],result['sha256'],result['sizeBytes'],'bytes; no weights downloaded')
