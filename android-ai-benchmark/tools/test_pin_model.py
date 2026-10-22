import importlib.util, json, unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('pin',Path(__file__).with_name('pin-model.py')); pin=importlib.util.module_from_spec(spec);spec.loader.exec_module(pin)
class PinTests(unittest.TestCase):
 def setUp(self):
  self.seed=json.loads((Path(__file__).parents[1]/'model-manifest.json').read_text());self.original=pin.get
  self.digest='a'*64;self.revision='b'*40
  self.metadata={'sha':self.revision,'cardData':{'license':'apache-2.0'},'siblings':[{'rfilename':self.seed['filename'],'lfs':{'sha256':self.digest,'size':491000000}}]}
  pin.get=lambda url,*args:('version https://git-lfs.github.com/spec/v1\noid sha256:'+self.digest+'\nsize 491000000\n').encode() if '/raw/' in url else json.dumps(self.metadata).encode()
 def tearDown(self):pin.get=self.original
 def test_immutable_revision_and_pointer_agree(self):
  r=pin.resolve(self.seed,'main');self.assertEqual(r['sha256'],self.digest);self.assertEqual(r['revision'],self.revision);self.assertIn(self.revision,r['downloadUrl'])
 def test_wrong_pointer_and_license_fail_closed(self):
  self.metadata['cardData']['license']='unknown'
  with self.assertRaises(ValueError):pin.resolve(self.seed,'main')
  self.metadata['cardData']['license']='apache-2.0';self.metadata['siblings'][0]['lfs']['sha256']='c'*64
  with self.assertRaises(ValueError):pin.resolve(self.seed,'main')
 def test_unknown_revision_or_source_rejected(self):
  with self.assertRaises(ValueError):pin.resolve(self.seed,'latest')
  with self.assertRaises(ValueError):pin.resolve(dict(self.seed,repository='other/model'),'main')

 def test_explicit_revision_must_match_response(self):
  with self.assertRaises(ValueError):pin.resolve(self.seed,'c'*40)
  self.assertEqual(pin.resolve(self.seed,self.revision)['revision'],self.revision)
