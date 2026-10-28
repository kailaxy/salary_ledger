package com.kailaxy.salaryledger;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.MessageDigest;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;

/** Signed, strictly framed metadata. The HTML digest, destination and compatibility are signed. */
final class FrontendManifest {
    static final int MAX_HTML = 4 * 1024 * 1024;
    final long revision;
    final int minimumApi, size;
    final String digest, url;
    private FrontendManifest(long revision, int minimumApi, int size, String digest, String url) {
        this.revision=revision; this.minimumApi=minimumApi; this.size=size; this.digest=digest; this.url=url;
    }
    static PublicKey key(String encoded) throws Exception {
        PublicKey key=KeyFactory.getInstance("RSA").generatePublic(new X509EncodedKeySpec(Base64.getDecoder().decode(encoded)));
        if (((java.security.interfaces.RSAPublicKey) key).getModulus().bitLength()<3072) throw new SecurityException("Weak update key");
        return key;
    }
    static String manifestUrl(String base, String channel) {
        if (!base.matches("https://github\\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/releases/download/")
                || !(channel.equals("dev")||channel.equals("stable"))) throw new SecurityException("Invalid update source");
        return base+"frontend-"+channel+"/manifest.txt";
    }
    static FrontendManifest verify(byte[] raw, PublicKey key, String base, String channel) throws Exception {
        if (raw.length>8192) throw new SecurityException("Large manifest");
        String text=new String(raw,StandardCharsets.US_ASCII);
        if (!java.util.Arrays.equals(raw,text.getBytes(StandardCharsets.US_ASCII)) || text.indexOf('\r')>=0) throw new SecurityException("Manifest encoding");
        String[] p=text.split("\n",-1);
        if (p.length!=9||!p[8].isEmpty()||!p[0].equals("SALARY_LEDGER_FRONTEND_V1")||!p[1].equals(channel)
                ||!p[2].matches("[1-9][0-9]{0,14}")||!p[3].matches("[1-9][0-9]{0,3}")
                ||!p[4].matches("[a-f0-9]{64}")||!p[5].matches("[1-9][0-9]{0,7}")) throw new SecurityException("Invalid manifest");
        long revision=Long.parseLong(p[2]); int api=Integer.parseInt(p[3]),size=Integer.parseInt(p[5]);
        String expected=manifestUrl(base,channel).replace("manifest.txt","frontend-"+revision+".html");
        if (size>MAX_HTML||!p[6].equals(expected)) throw new SecurityException("Invalid bundle");
        Signature verifier=Signature.getInstance("SHA256withRSA"); verifier.initVerify(key);
        verifier.update((String.join("\n",java.util.Arrays.copyOf(p,7))+"\n").getBytes(StandardCharsets.US_ASCII));
        if (!verifier.verify(Base64.getDecoder().decode(p[7]))) throw new SecurityException("Update signature mismatch");
        return new FrontendManifest(revision,api,size,p[4],p[6]);
    }
    void verifyHtml(byte[] html) throws Exception {
        if (html.length!=size) throw new SecurityException("Update size mismatch");
        byte[] hash=MessageDigest.getInstance("SHA-256").digest(html);
        StringBuilder hex=new StringBuilder();for(byte b:hash)hex.append(String.format(java.util.Locale.ROOT,"%02x",b&255));
        if (!hex.toString().equals(digest)) throw new SecurityException("Update digest mismatch");
    }
    static boolean downloadHost(URI uri) {
        return "https".equals(uri.getScheme())&&uri.getUserInfo()==null&&uri.getFragment()==null
                &&(uri.getPort()==-1||uri.getPort()==443)
                &&("github.com".equals(uri.getHost())||"release-assets.githubusercontent.com".equals(uri.getHost())
                ||"objects.githubusercontent.com".equals(uri.getHost()));
    }
}
