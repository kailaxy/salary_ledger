package com.kailaxy.salaryledger;

import org.junit.*;
import org.junit.rules.TemporaryFolder;
import static org.junit.Assert.*;
import java.io.File;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.*;
import java.util.*;

public final class FrontendUpdatesTest {
    private static KeyPair keys;
    private static final String BASE="https://github.com/kailaxy/salary_ledger/releases/download/";
    private static final byte[] HTML="<!doctype html><html>synthetic frontend</html>".getBytes(StandardCharsets.UTF_8);
    @Rule public TemporaryFolder temp=new TemporaryFolder();
    @BeforeClass public static void key()throws Exception{KeyPairGenerator g=KeyPairGenerator.getInstance("RSA");g.initialize(3072);keys=g.generateKeyPair();}
    private byte[] metadata(long revision,int api,String channel,byte[] html)throws Exception{
        byte[] hash=MessageDigest.getInstance("SHA-256").digest(html);StringBuilder hex=new StringBuilder();for(byte b:hash)hex.append(String.format("%02x",b&255));
        String payload="SALARY_LEDGER_FRONTEND_V1\n"+channel+"\n"+revision+"\n"+api+"\n"+hex+"\n"+html.length+"\n"+BASE+"frontend-"+channel+"/frontend-"+revision+".html\n";
        Signature signature=Signature.getInstance("SHA256withRSA");signature.initSign(keys.getPrivate());signature.update(payload.getBytes(StandardCharsets.US_ASCII));
        return(payload+Base64.getEncoder().encodeToString(signature.sign())+"\n").getBytes(StandardCharsets.US_ASCII);
    }
    private FrontendStore store(File folder,long floor)throws Exception{return new FrontendStore(folder,keys.getPublic(),BASE,"dev",floor,1);}
    private void stage(FrontendStore store,long version)throws Exception{assertTrue(store.stage(metadata(version,1,"dev",HTML),HTML));}
    @Test public void pinnedKeyEncodingAndMinimumStrength()throws Exception{
        String encoded=Base64.getEncoder().encodeToString(keys.getPublic().getEncoded());
        assertEquals(keys.getPublic(),FrontendManifest.key(encoded));
        KeyPairGenerator weak=KeyPairGenerator.getInstance("RSA");weak.initialize(2048);
        try{FrontendManifest.key(Base64.getEncoder().encodeToString(weak.generateKeyPair().getPublic().getEncoded()));fail();}catch(SecurityException expected){}
        try{FrontendManifest.key("malformed-key");fail();}catch(Exception expected){}
    }
    @Test public void signaturesBindingDigestAndFraming()throws Exception{
        byte[] raw=metadata(11,1,"dev",HTML);FrontendManifest m=FrontendManifest.verify(raw,keys.getPublic(),BASE,"dev");m.verifyHtml(HTML);
        assertEquals(11,m.revision);
        for(byte[] bad:new byte[][]{Arrays.copyOf(raw,raw.length-1),new String(raw,StandardCharsets.US_ASCII).replace("\n11\n","\n12\n").getBytes(StandardCharsets.US_ASCII),new byte[8193]}){
            try{FrontendManifest.verify(bad,keys.getPublic(),BASE,"dev");fail();}catch(Exception expected){}
        }
        try{FrontendManifest.verify(raw,keys.getPublic(),BASE,"stable");fail();}catch(Exception expected){}
        try{m.verifyHtml("tampered".getBytes(StandardCharsets.UTF_8));fail();}catch(SecurityException expected){}
        byte[] sameLength=HTML.clone();sameLength[2]^=1;
        try{m.verifyHtml(sameLength);fail();}catch(SecurityException expected){}
    }
    @Test public void acceptsOnlyBoundedGoogleIndependentHttpsUpdateHosts()throws Exception{
        for(String value:new String[]{"https://github.com/a", "https://release-assets.githubusercontent.com/a?temporary=1","https://objects.githubusercontent.com/a"})assertTrue(FrontendManifest.downloadHost(new URI(value)));
        for(String value:new String[]{"http://github.com/a","https://github.com.evil.test/a","https://user@github.com/a","https://github.com:8443/a","https://script.google.com/a","file:///tmp/update","https://github.com/a#x"})assertFalse(FrontendManifest.downloadHost(new URI(value)));
    }
    @Test public void trialNeedsAcknowledgementAndKeepsOfflineLastGood()throws Exception{
        File folder=temp.newFolder();FrontendStore s=store(folder,10);assertNull(s.launch().html);
        stage(s,11);FrontendStore.Selection trial=s.launch();assertTrue(trial.trial);assertArrayEquals(HTML,trial.html);
        s.ready(11);FrontendStore.Selection good=store(folder,10).launch();assertFalse(good.trial);assertEquals(11,good.revision);
        stage(s,12);assertEquals(12,s.launch().revision);
        FrontendStore.Selection rollback=store(folder,10).launch();assertFalse(rollback.trial);assertEquals(11,rollback.revision);
        s.ready(12);assertEquals(11,s.launch().revision); // late/incorrect ready cannot promote failed trial
        assertFalse(s.stage(metadata(12,1,"dev",HTML),HTML));
    }
    @Test public void corruptionAndPartialFilesNeverReplaceBundledOrGoodUi()throws Exception{
        File folder=temp.newFolder();FrontendStore s=store(folder,10);stage(s,11);s.launch();s.ready(11);
        stage(s,12);Files.write(new File(folder,"frontend-12.html").toPath(),new byte[]{1});
        assertEquals(11,s.launch().revision);
        Files.write(new File(folder,"frontend-11.manifest").toPath(),new byte[]{2});
        assertNull(s.launch().html);
    }
    @Test public void newApkFloorAndProtocolPreventDowngrade()throws Exception{
        File folder=temp.newFolder();FrontendStore s=store(folder,10);
        assertFalse(s.stage(metadata(10,1,"dev",HTML),HTML));
        assertFalse(s.stage(metadata(11,2,"dev",HTML),HTML));
        stage(s,12);s.launch();s.ready(12);
        assertNull(store(folder,20).launch().html);
    }
    @Test public void manualRecoveryPausesAndDoesNotTouchLedgerFiles()throws Exception{
        File ledger=temp.newFile("ledger-sentinel");Files.write(ledger.toPath(),new byte[]{7,8,9});
        File folder=temp.newFolder();FrontendStore s=store(folder,10);stage(s,11);s.launch();s.ready(11);
        s.restoreBundled();assertTrue(s.paused());assertNull(s.launch().html);
        assertFalse(s.stage(metadata(12,1,"dev",HTML),HTML));s.resume();
        assertFalse(s.stage(metadata(11,1,"dev",HTML),HTML));stage(s,12);
        assertArrayEquals(new byte[]{7,8,9},Files.readAllBytes(ledger.toPath()));
    }
    @Test public void timeoutRollbackUsesPreviousAndCacheStaysBounded()throws Exception{
        File folder=temp.newFolder();FrontendStore s=store(folder,10);
        for(int revision=11;revision<=15;revision++){stage(s,revision);s.launch();s.ready(revision);}
        stage(s,16);s.launch();assertEquals(15,s.rollback().revision);
        assertFalse(s.stage(metadata(16,1,"dev",HTML),HTML));
        long count=Arrays.stream(folder.listFiles()).filter(f->f.getName().matches("frontend-.*\\.(html|manifest)")).count();
        assertTrue(count<=6);
    }
    @Test public void aDifferentKeyCannotAuthorizeCachedUpdates()throws Exception{
        byte[] raw=metadata(11,1,"dev",HTML);KeyPairGenerator generator=KeyPairGenerator.getInstance("RSA");generator.initialize(3072);
        try{FrontendManifest.verify(raw,generator.generateKeyPair().getPublic(),BASE,"dev");fail();}catch(SignatureException|SecurityException expected){}
    }
}
