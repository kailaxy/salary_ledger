#!/usr/bin/env python3
"""Verify arm64 ELF and APK 16 KB layout without executing an Android binary."""
import argparse,struct,zipfile

def verify(path):
 libs=[]
 with zipfile.ZipFile(path) as z,open(path,'rb') as raw:
  manifest=z.read('AndroidManifest.xml')
  for permission in ['android.permission.INTERNET','android.permission.READ_EXTERNAL_STORAGE','android.permission.MANAGE_EXTERNAL_STORAGE']:
   if permission.encode() in manifest or permission.encode('utf-16le') in manifest:raise ValueError('Forbidden permission in isolated benchmark: '+permission)
  for name in z.namelist():
   if name.endswith('.gguf'):raise ValueError('Weights must not be bundled')
   if not name.endswith('.so'):continue
   if not name.startswith('lib/arm64-v8a/'):raise ValueError('Unexpected native ABI')
   i=z.getinfo(name);raw.seek(i.header_offset);header=raw.read(30);n,e=struct.unpack_from('<HH',header,26);offset=i.header_offset+30+n+e
   if i.compress_type!=zipfile.ZIP_STORED or offset%16384:raise ValueError('Native APK entry is not uncompressed and 16 KB aligned: '+name)
   b=z.read(name)
   if b[:6]!=b'\x7fELF\x02\x01' or struct.unpack_from('<H',b,18)[0]!=183:raise ValueError('Not little-endian ELF64 AArch64')
   phoff=struct.unpack_from('<Q',b,32)[0];entry,count=struct.unpack_from('<HH',b,54)
   for k in range(count):
    p=phoff+k*entry
    if struct.unpack_from('<I',b,p)[0]==1 and struct.unpack_from('<Q',b,p+48)[0]<16384:raise ValueError('ELF LOAD alignment below 16 KB')
   libs.append(name)
  if not any(n.endswith('/libledgerbench.so') for n in libs):raise ValueError('Missing JNI provider')
 print('Verified ELF64 arm64, all ELF LOAD segments >=16 KB, uncompressed APK offsets aligned to 16 KB, and no weights:',', '.join(libs))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('apk');verify(p.parse_args().apk)
