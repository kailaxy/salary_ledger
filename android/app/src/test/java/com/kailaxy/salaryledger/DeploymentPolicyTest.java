package com.kailaxy.salaryledger;

import org.junit.Test;
import static org.junit.Assert.*;

public final class DeploymentPolicyTest {
    private static final String FIRST = "https://script.google.com/macros/s/user_A-123/exec";
    private static final String SECOND = "https://script.google.com/macros/s/user_B-456/exec";

    @Test public void freshInstallHasNoDefaultLedger() {
        assertNull(DeploymentPolicy.select(null, null));
        assertNull(DeploymentPolicy.select("", ""));
    }
    @Test public void acceptsOnlyCanonicalOwnerDeploymentUrls() {
        assertEquals(FIRST, DeploymentPolicy.normalize("  " + FIRST + "  "));
        for (String bad : new String[]{null, "", "http://script.google.com/macros/s/id/exec",
                FIRST + "?pin=123456", FIRST + "#fragment", FIRST + "/", FIRST + "\nattack",
                "https://script.google.com:443/macros/s/id/exec", "https://user@script.google.com/macros/s/id/exec",
                "https://script.google.com.evil.test/macros/s/id/exec", "https://script.google.com/macros/s/id/dev",
                "https://script.googleusercontent.com/macros/s/id/exec", "https://example.com/exec"}) {
            try { DeploymentPolicy.normalize(bad); fail("Accepted invalid URL"); }
            catch (IllegalArgumentException expected) { }
        }
    }
    @Test public void existingPairingIsAuthoritativeAndConfiguredChoicePersists() {
        assertEquals(FIRST, DeploymentPolicy.select(FIRST, null));
        assertEquals(FIRST, DeploymentPolicy.select(null, FIRST));
        assertEquals(FIRST, DeploymentPolicy.select(SECOND, FIRST));
    }
}
