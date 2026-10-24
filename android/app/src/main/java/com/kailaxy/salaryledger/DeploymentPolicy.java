package com.kailaxy.salaryledger;

/** Only an owner's canonical Apps Script deployment URL can become a destination. */
final class DeploymentPolicy {
    static String normalize(String value) {
        String url = value == null ? "" : value.trim();
        if (!url.matches("https://script\\.google\\.com/macros/s/[A-Za-z0-9_-]+/exec"))
            throw new IllegalArgumentException("INVALID_DEPLOYMENT_URL");
        return url;
    }
    static String select(String configured, String paired) {
        // Paired credentials are authoritative during migration; never redirect
        // their device token to a different configured URL.
        if (paired != null && !paired.isEmpty()) return normalize(paired);
        if (configured != null && !configured.isEmpty()) return normalize(configured);
        return null;
    }
}
