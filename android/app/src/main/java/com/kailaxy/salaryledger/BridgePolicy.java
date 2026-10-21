package com.kailaxy.salaryledger;

import java.net.URI;
import java.net.URISyntaxException;

/** Pure, testable origin policy; no wildcards, user info, queries or alternate ports. */
final class BridgePolicy {
    private static boolean origin(URI uri) {
        return "https".equals(uri.getScheme()) && "appassets.androidplatform.net".equals(uri.getHost())
                && uri.getPort() == -1 && uri.getUserInfo() == null && uri.getRawQuery() == null;
    }
    static boolean trustedPage(String value) {
        if (value == null) return false;
        try { URI uri = new URI(value); return origin(uri) && "/assets/Index.html".equals(uri.getRawPath()); }
        catch (URISyntaxException error) { return false; }
    }
    static boolean allowBridge(String source, String current, boolean mainFrame) {
        if (!mainFrame || source == null || !trustedPage(current)) return false;
        try {
            URI uri = new URI(source);
            return origin(uri) && (uri.getRawPath() == null || uri.getRawPath().isEmpty() || "/".equals(uri.getRawPath())) && uri.getRawFragment() == null;
        } catch (URISyntaxException error) { return false; }
    }
}
