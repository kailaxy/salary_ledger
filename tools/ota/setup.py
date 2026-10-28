#!/usr/bin/env python3
"""One-time owner setup for a separate OTA signing key; never commit the private PEM."""
import argparse
import base64
import os
import shutil
from pathlib import Path
import subprocess


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--configure-github',action='store_true')
    args=parser.parse_args()
    if not shutil.which('openssl'):parser.error('Install OpenSSL first.')
    if args.configure_github and not shutil.which('gh'):parser.error('Install/sign in to GitHub CLI, or run without --configure-github and configure the two values manually.')
    root=Path(__file__).resolve().parents[2]
    directory=root/'.ota-keys'
    directory.mkdir(mode=0o700,exist_ok=True)
    os.chmod(directory,0o700)
    private=directory/'frontend-private.pem'
    if not private.exists():
        # Restrict permissions from creation, not only after key generation.
        fd=os.open(private,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
        try:
            with os.fdopen(fd,'wb') as out:
                subprocess.run(['openssl','genpkey','-algorithm','RSA','-pkeyopt','rsa_keygen_bits:3072'],stdout=out,stderr=subprocess.DEVNULL,check=True)
        except BaseException:
            private.unlink(missing_ok=True)
            raise
    os.chmod(private,0o600)
    public=subprocess.run(['openssl','pkey','-in',str(private),'-pubout','-outform','DER'],stdout=subprocess.PIPE,check=True).stdout
    encoded=base64.b64encode(public).decode('ascii')
    (directory/'frontend-public.b64').write_text(encoded+'\n')
    print('Reusing/created OTA key in ignored .ota-keys/. Back up the private PEM securely; do not share or commit it.')
    if args.configure_github:
        with private.open('rb') as stream:
            subprocess.run(['gh','secret','set','LEDGER_OTA_PRIVATE_KEY','--repo','kailaxy/salary_ledger'],stdin=stream,check=True)
        subprocess.run(['gh','variable','set','LEDGER_OTA_PUBLIC_KEY','--repo','kailaxy/salary_ledger','--body',encoded],check=True)
        print('Configured OTA secret and public variable. Build/install the updater APK once, then publish the appropriate frontend channel.')
    else:
        print('Set GitHub secret LEDGER_OTA_PRIVATE_KEY from frontend-private.pem and repository variable LEDGER_OTA_PUBLIC_KEY from frontend-public.b64.')


if __name__=='__main__':
    main()
