package com.kailaxy.salaryledger;

import org.junit.Test;
import static org.junit.Assert.*;
import java.net.URL;

public final class BridgePolicyTest {
    private static final String PAGE = "https://appassets.androidplatform.net/assets/Index.html";
    @Test public void onlyPackagedPageCanNavigate() {
        assertTrue(BridgePolicy.trustedPage(PAGE));
        for (String bad : new String[]{"http://appassets.androidplatform.net/assets/Index.html", PAGE + "?redirect=evil",
                "https://appassets.androidplatform.net.evil.test/assets/Index.html", "https://evil@appassets.androidplatform.net/assets/Index.html",
                "https://appassets.androidplatform.net:8443/assets/Index.html", "https://appassets.androidplatform.net/assets/../Index.html",
                "https://appassets.androidplatform.net/assets/other.html", "file:///android_asset/Index.html", "javascript:alert(1)"})
            assertFalse(bad, BridgePolicy.trustedPage(bad));
    }
    @Test public void bridgeRejectsIframesAndForeignOrigins() {
        assertTrue(BridgePolicy.allowBridge("https://appassets.androidplatform.net", PAGE, true));
        assertTrue(BridgePolicy.allowBridge("https://appassets.androidplatform.net/", PAGE, true));
        assertFalse(BridgePolicy.allowBridge("https://appassets.androidplatform.net", PAGE, false));
        assertFalse(BridgePolicy.allowBridge("https://evil.test", PAGE, true));
        assertFalse(BridgePolicy.allowBridge("https://appassets.androidplatform.net", "https://evil.test", true));
        assertFalse(BridgePolicy.allowBridge("https://appassets.androidplatform.net:443", PAGE, true));
    }
    @Test public void transportNeverFollowsUnapprovedDestinations() throws Exception {
        assertTrue(ScriptTransport.allowed(new URL("https://script.google.com/macros/s/id/exec")));
        assertTrue(ScriptTransport.allowed(new URL("https://script.googleusercontent.com/macros/echo?temporary=response")));
        for (String bad : new String[]{"http://script.google.com/", "https://script.google.com.evil.test/",
                "https://accounts.google.com/", "https://user@script.google.com/", "https://script.google.com:8443/", "https://example.com/"})
            assertFalse(bad, ScriptTransport.allowed(new URL(bad)));
    }
}
