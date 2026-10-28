import base64
import hashlib
import importlib.util
from pathlib import Path
import subprocess
import shutil
import tempfile
import unittest

spec=importlib.util.spec_from_file_location('ota_bundle',Path(__file__).with_name('bundle.py'))
bundle=importlib.util.module_from_spec(spec);spec.loader.exec_module(bundle)


class BundleTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory();cls.folder=Path(cls.temp.name)
        cls.key=cls.folder/'private.pem'
        subprocess.run(['openssl','genpkey','-algorithm','RSA','-pkeyopt','rsa_keygen_bits:3072','-out',str(cls.key)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        cls.public=subprocess.run(['openssl','pkey','-in',str(cls.key),'-pubout','-outform','DER'],check=True,stdout=subprocess.PIPE).stdout
        cls.source=(bundle.ROOT/'Index.html').read_text()
    @classmethod
    def tearDownClass(cls):cls.temp.cleanup()
    def output(self):return self.folder/next(tempfile._get_candidate_names())
    def test_sign_verify_and_native_packaging(self):
        out=self.output();self.assertTrue(bundle.build(self.source,101,1,'dev',self.key,self.public,out))
        raw=(out/'manifest.txt').read_bytes();self.assertEqual(bundle.verify(raw,self.public,'dev'),101)
        html=(out/'frontend-101.html').read_bytes();self.assertNotIn(b'<base ',html)
        self.assertNotIn(b'https://fonts.googleapis.com',html)
        fields=raw.decode().splitlines();self.assertEqual(fields[4],hashlib.sha256(html).hexdigest())
        self.assertEqual(int(fields[5]),len(html))
    def test_tamper_channel_and_rollback_refused(self):
        out=self.output();bundle.build(self.source,102,1,'stable',self.key,self.public,out)
        raw=(out/'manifest.txt').read_bytes()
        with self.assertRaises(ValueError):bundle.verify(raw,self.public,'dev')
        with self.assertRaises(subprocess.CalledProcessError):bundle.verify(raw.replace(raw.splitlines()[4],b'0'*64),self.public,'stable')
        new=self.output();self.assertFalse(bundle.build(self.source,101,1,'stable',self.key,self.public,new,out/'manifest.txt'));self.assertFalse(new.exists())
    def test_wrong_key_cannot_publish(self):
        out=self.output()
        with self.assertRaises(subprocess.CalledProcessError):bundle.build(self.source,104,1,'dev',self.key,b'not a public key',out)
        self.assertFalse(out.exists())
    @unittest.skipUnless(shutil.which('javac') and shutil.which('java'),'JDK required for native interop')
    def test_android_manifest_verifier_accepts_python_signed_bundle(self):
        out=self.output();bundle.build(self.source,108,1,'dev',self.key,self.public,out)
        (out/'public.der').write_bytes(self.public)
        harness=out/'OtaInterop.java'
        harness.write_text('package com.kailaxy.salaryledger;\nimport java.nio.file.*; import java.security.*; import java.security.spec.*;\npublic class OtaInterop { public static void main(String[] args)throws Exception {\nPublicKey key=KeyFactory.getInstance("RSA").generatePublic(new X509EncodedKeySpec(Files.readAllBytes(Path.of(args[0]))));\nFrontendManifest m=FrontendManifest.verify(Files.readAllBytes(Path.of(args[1])),key,"https://github.com/kailaxy/salary_ledger/releases/download/","dev");\nm.verifyHtml(Files.readAllBytes(Path.of(args[2])));System.out.print(m.revision);\n}}')
        source=bundle.ROOT/'android/app/src/main/java/com/kailaxy/salaryledger/FrontendManifest.java'
        subprocess.run(['javac','-d',str(out),str(source),str(harness)],check=True,stdout=subprocess.DEVNULL)
        result=subprocess.run(['java','-cp',str(out),'com.kailaxy.salaryledger.OtaInterop',str(out/'public.der'),str(out/'manifest.txt'),str(out/'frontend-108.html')],check=True,stdout=subprocess.PIPE)
        self.assertEqual(result.stdout,b'108')
    def test_missing_ready_invalid_configuration_and_overwrite(self):
        with self.assertRaises(ValueError):bundle.packed('<html>no readiness</html>')
        with self.assertRaises(ValueError):bundle.build(self.source,0,1,'dev',self.key,self.public,self.output())
        out=self.output();bundle.build(self.source,105,1,'dev',self.key,self.public,out)
        before=(out/'manifest.txt').read_bytes()
        with self.assertRaises(FileExistsError):bundle.build(self.source,105,1,'dev',self.key,self.public,out)
        self.assertEqual((out/'manifest.txt').read_bytes(),before)


if __name__=='__main__':unittest.main()
