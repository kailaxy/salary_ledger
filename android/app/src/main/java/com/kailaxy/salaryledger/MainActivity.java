package com.kailaxy.salaryledger;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.KeyguardManager;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.provider.Settings;
import android.text.InputType;
import android.view.View;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import org.json.JSONArray;
import org.json.JSONObject;

/** Packaged offline frontend with an origin-restricted native HTTPS transport. */
public final class MainActivity extends Activity {
    private static final String ORIGIN = "https://appassets.androidplatform.net";
    private static final String PAGE = ORIGIN + "/assets/Index.html";
    private static final int UNLOCK = 40;
    private final ThreadPoolExecutor network = new ThreadPoolExecutor(1, 1, 0L, TimeUnit.MILLISECONDS, new ArrayBlockingQueue<>(8));
    private WebView webView;
    private LinearLayout gate;
    private TextView gateText;
    private Button unlockButton;
    private EditText deploymentInput;
    private String deploymentUrl;
    private DeviceCredentials credentials;
    private ScriptTransport transport;
    private boolean authorized, unlocking, loaded, destroyed, bridgeSupported, pairingOffered;
    private AlertDialog pairingDialog;
    private final java.util.List<Runnable> deferredReplies = new java.util.ArrayList<>();

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        // Own the system-bar/cutout/keyboard spacing once, consistently before and after API 35.
        if (android.os.Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
        } else {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }
        credentials = new DeviceCredentials(this);
        try { deploymentUrl = credentials.deploymentUrl(); }
        catch (Exception error) { deploymentUrl = null; }
        if (deploymentUrl != null) transport = new ScriptTransport(deploymentUrl);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                    insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            android.view.WindowInsets consumed = insets.consumeSystemWindowInsets();
            return android.os.Build.VERSION.SDK_INT >= 28 ? consumed.consumeDisplayCutout() : consumed;
        });
        gate = new LinearLayout(this);
        gate.setOrientation(LinearLayout.VERTICAL);
        int padding = (int) (24 * getResources().getDisplayMetrics().density);
        gate.setPadding(padding, padding, padding, padding);
        gateText = new TextView(this);
        gateText.setText("Unlock your device to open Salary Ledger.");
        gate.addView(gateText);
        deploymentInput = new EditText(this);
        deploymentInput.setHint("https://script.google.com/macros/s/…/exec");
        deploymentInput.setContentDescription("Your Apps Script deployment URL");
        deploymentInput.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        deploymentInput.setSingleLine(true);
        gate.addView(deploymentInput);
        unlockButton = new Button(this);
        unlockButton.setText("Unlock ledger");
        unlockButton.setOnClickListener(v -> unlock());
        gate.addView(unlockButton);
        root.addView(gate);
        webView = new WebView(this);
        webView.setVisibility(View.GONE);
        root.addView(webView, new LinearLayout.LayoutParams(-1, 0, 1));
        setContentView(root);
        updateConnectionGate();
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setSafeBrowsingEnabled(true);
        android.webkit.CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false);
        WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        webView.setWebViewClient(new WebViewClientCompat() {
            @Override public void onPageFinished(WebView view, String url) {
                if (authorized && trustedPage(Uri.parse(url)) && !pairingOffered && credentials.ledgerIdentity() == null) {
                    pairingOffered = true;
                    // Use the existing origin-restricted pairing flow and its
                    // download callback once the packaged page is ready.
                    view.evaluateJavascript("document.getElementById('connectDeviceBtn').click();", null);
                }
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !trustedPage(request.getUrl());
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                if ("data".equals(request.getUrl().getScheme())) return null;
                if (trustedPage(request.getUrl())) {
                    WebResourceResponse response = loader.shouldInterceptRequest(request.getUrl());
                    if (response != null) {
                        java.util.Map<String, String> headers = new java.util.HashMap<>();
                        headers.put("Content-Security-Policy", "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'");
                        headers.put("Cache-Control", "no-store");
                        response.setResponseHeaders(headers);
                        return response;
                    }
                }
                return new WebResourceResponse("text/plain", "UTF-8", 403, "Blocked", Collections.emptyMap(),
                        new ByteArrayInputStream("Resource blocked".getBytes(StandardCharsets.UTF_8)));
            }
        });
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            bridgeSupported = true;
            WebViewCompat.addWebMessageListener(webView, "LedgerAndroid", Collections.singleton(ORIGIN),
                    (view, message, sourceOrigin, isMainFrame, reply) -> {
                        if (!authorized || !BridgePolicy.allowBridge(sourceOrigin.toString(), view.getUrl(), isMainFrame)) return;
                        String text;
                        try { text = message.getData(); } catch (IllegalStateException error) { return; }
                        if (text == null || text.length() > 65536) return;
                        handleMessage(text, reply);
                    });
        } else {
            gateText.setText("Update Android System WebView (or Chrome) to use the secure offline app.");
            unlockButton.setEnabled(false);
        }
    }
    private static boolean trustedPage(Uri uri) { return BridgePolicy.trustedPage(uri.toString()); }
    private void handleMessage(String text, JavaScriptReplyProxy reply) {
        String id;
        JSONObject request;
        try {
            request = new JSONObject(text); id = request.getString("id");
            if (!id.matches("[A-Za-z0-9_-]{1,80}") || request.optInt("version") != 1) return;
            if ("pair".equals(request.optString("action"))) { showPairing(id, reply); return; }
            if (!"rpc".equals(request.optString("action")) || !ScriptTransport.METHODS.contains(request.optString("method"))) {
                respond(reply, id, null, "UNSUPPORTED_METHOD"); return;
            }
            request.getJSONArray("args");
        } catch (org.json.JSONException error) { return; }
        final String requestId = id;
        try {
            network.execute(() -> {
                try {
                    JSONObject stored = credentials.read();
                    if (stored == null) throw new ScriptTransport.Failure("DEVICE_UNPAIRED");
                    if (deploymentUrl == null || !deploymentUrl.equals(stored.optString("deploymentUrl"))) throw new ScriptTransport.Failure("DEVICE_REVOKED");
                    Object result = transport.rpc(stored, request.getString("method"), request.getJSONArray("args"));
                    respond(reply, requestId, result, null);
                } catch (Exception error) { respond(reply, requestId, null, publicError(error)); }
            });
        } catch (java.util.concurrent.RejectedExecutionException error) { respond(reply, id, null, "BUSY"); }
    }
    private static String publicError(Exception error) {
        return error instanceof ScriptTransport.Failure ? error.getMessage() : "DEVICE_STORAGE_OR_REPLY_ERROR";
    }
    private void respond(JavaScriptReplyProxy reply, String id, Object result, String error) {
        runOnUiThread(() -> {
            if (destroyed) return;
            if (!authorized) { if (deferredReplies.size() < 16) deferredReplies.add(() -> respond(reply, id, result, error)); return; }
            try {
                JSONObject response = new JSONObject().put("id", id).put("ok", error == null);
                if (error == null) response.put("result", result == null ? JSONObject.NULL : result);
                else response.put("error", error);
                if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) reply.postMessage(response.toString());
            } catch (org.json.JSONException ignored) { /* No secrets or response data in logs. */ }
        });
    }
    private String pairingError(Exception error) {
        String code = publicError(error);
        if ("BAD_PIN".equals(code)) return "That ledger PIN does not match. Try again.";
        if ("LOCKED".equals(code)) return "Too many PIN attempts. Wait 10 minutes, then generate a new code.";
        if (code.startsWith("PAIR_EXPIRED") || code.equals("PAIR_INVALID")) return "Generate a fresh pairing code from the Sheet menu and try again.";
        if (code.equals("DEVICE_LIMIT")) return "The Sheet has reached its device limit. Revoke Android devices from the Sheet menu, then pair again.";
        if (code.equals("PAIR_WRONG_LEDGER")) return "This app already belongs to another ledger. Sync its pending changes before changing deployments.";
        if (code.startsWith("DEPLOYMENT")) return "Update and redeploy the Apps Script files with Anyone access, then try a fresh pairing code.";
        return "Could not connect. Check your connection and try a fresh pairing code. Saved records are unchanged.";
    }
    private void showPairing(String id, JavaScriptReplyProxy reply) {
        if (pairingDialog != null) { respond(reply, id, null, "PAIR_ALREADY_OPEN"); return; }
        LinearLayout form = new LinearLayout(this);
        form.setOrientation(LinearLayout.VERTICAL);
        form.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);
        int padding = (int) (24 * getResources().getDisplayMetrics().density);
        form.setPadding(padding, padding, padding, 0);
        TextView help = new TextView(this);
        help.setText("In your Google Sheet, choose Salary Ledger → Pair Android device. Enter the one-time code and your existing ledger PIN. These stay out of the web page.");
        form.addView(help);
        EditText endpoint = new EditText(this);
        endpoint.setHint("Your Apps Script /exec URL");
        endpoint.setContentDescription("Your Apps Script deployment URL");
        endpoint.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        endpoint.setSingleLine(true); endpoint.setText(deploymentUrl);
        // Before first pairing a mistyped URL can be corrected. Paired devices
        // stay pinned to their ledger; switching/clearing pending data is separate.
        endpoint.setEnabled(credentials.ledgerIdentity() == null);
        form.addView(endpoint);
        EditText code = new EditText(this);
        code.setHint("One-time pairing code");
        code.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
        code.setSingleLine(true); code.setSaveEnabled(false); form.addView(code);
        EditText pin = new EditText(this);
        pin.setHint("Ledger PIN");
        pin.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_VARIATION_PASSWORD);
        pin.setSingleLine(true); pin.setSaveEnabled(false); form.addView(pin);
        TextView errorText = new TextView(this); form.addView(errorText);
        pairingDialog = new AlertDialog.Builder(this).setTitle("Connect this device")
                .setView(form).setNegativeButton("Cancel", (dialog, which) -> respond(reply, id, null, "PAIR_CANCELLED"))
                .setPositiveButton("Connect", null).create();
        pairingDialog.setOnCancelListener(dialog -> respond(reply, id, null, "PAIR_CANCELLED"));
        pairingDialog.setOnDismissListener(dialog -> pairingDialog = null);
        pairingDialog.show();
        AlertDialog dialog = pairingDialog;
        dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            String enteredCode = code.getText().toString().replaceAll("\\s", "").toLowerCase(java.util.Locale.ROOT);
            String enteredPin = pin.getText().toString();
            final String enteredUrl;
            try { enteredUrl = DeploymentPolicy.normalize(endpoint.getText().toString()); }
            catch (IllegalArgumentException error) { errorText.setText("Enter your HTTPS script.google.com/macros/s/…/exec URL without extra parameters."); return; }
            if (!enteredCode.matches("[a-f0-9]{64}") || !enteredPin.matches("[0-9]{6,12}")) {
                errorText.setText("Enter the complete pairing code and a 6–12 digit PIN."); return;
            }
            dialog.setCancelable(false); dialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(false);
            dialog.getButton(AlertDialog.BUTTON_NEGATIVE).setEnabled(false); errorText.setText("Connecting…");
            try {
                network.execute(() -> {
                    try {
                        JSONObject issued = new ScriptTransport(enteredUrl).pair(enteredCode, enteredPin, android.os.Build.MODEL.substring(0, Math.min(60, android.os.Build.MODEL.length())));
                        String oldLedger = credentials.ledgerIdentity();
                        if (oldLedger != null && !oldLedger.equals(issued.getString("ledgerId")))
                            throw new ScriptTransport.Failure("PAIR_WRONG_LEDGER");
                        issued.put("deploymentUrl", enteredUrl);
                        credentials.save(issued);
                        runOnUiThread(() -> { code.setText(""); pin.setText(""); if (!destroyed) { deploymentUrl = enteredUrl; transport = new ScriptTransport(enteredUrl); dialog.dismiss(); } });
                        respond(reply, id, new JSONObject().put("paired", true), null);
                    } catch (Exception error) {
                        runOnUiThread(() -> {
                            if (destroyed) return;
                            dialog.setCancelable(true); dialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(true);
                            dialog.getButton(AlertDialog.BUTTON_NEGATIVE).setEnabled(true);
                            errorText.setText(pairingError(error));
                        });
                    }
                });
            } catch (java.util.concurrent.RejectedExecutionException error) {
                dialog.setCancelable(true); dialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(true);
                dialog.getButton(AlertDialog.BUTTON_NEGATIVE).setEnabled(true); errorText.setText("Sync is busy. Try again.");
            }
        });
    }
    private void updateConnectionGate() {
        boolean setup = deploymentUrl == null;
        deploymentInput.setVisibility(setup ? View.VISIBLE : View.GONE);
        gateText.setText(setup
                ? "Set up your ledger\n\nPaste the web app /exec URL from your own Google Sheet’s Apps Script deployment. Set your ledger PIN in that Sheet, then generate a one-time pairing code."
                : "Unlock your device to open Salary Ledger.");
        unlockButton.setText(setup ? "Continue" : "Unlock ledger");
        unlockButton.setOnClickListener(v -> {
            if (deploymentUrl == null) {
                try {
                    String selected = DeploymentPolicy.normalize(deploymentInput.getText().toString());
                    credentials.setDeploymentUrl(selected);
                    deploymentUrl = selected; transport = new ScriptTransport(selected);
                    updateConnectionGate(); unlock();
                } catch (Exception error) {
                    deploymentInput.setError("Enter your HTTPS script.google.com/macros/s/…/exec URL without extra parameters.");
                }
            } else unlock();
        });
    }
    private void unlock() {
        if (!bridgeSupported || unlocking || destroyed || deploymentUrl == null) return;
        KeyguardManager keyguard = (KeyguardManager) getSystemService(KEYGUARD_SERVICE);
        if (!keyguard.isDeviceSecure()) {
            gateText.setText("Set a device screen lock to protect your saved financial records, then return here.");
            unlockButton.setText("Set screen lock");
            unlockButton.setOnClickListener(v -> startActivity(new Intent(Settings.ACTION_SECURITY_SETTINGS))); return;
        }
        unlockButton.setText("Unlock ledger");
        unlockButton.setOnClickListener(v -> unlock());
        Intent intent = keyguard.createConfirmDeviceCredentialIntent("Salary Ledger", "Unlock your saved ledger");
        if (intent == null) return;
        unlocking = true; startActivityForResult(intent, UNLOCK);
    }
    @Override protected void onStart() { super.onStart(); if (!authorized && !unlocking) unlock(); }
    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == UNLOCK) {
            unlocking = false; authorized = resultCode == RESULT_OK;
            if (authorized) {
                gate.setVisibility(View.GONE); webView.setVisibility(View.VISIBLE); webView.onResume();
                if (!loaded) { loaded = true; webView.loadUrl(PAGE); }
                else webView.evaluateJavascript("window.dispatchEvent(new Event('ledgerresume'));", null);
                java.util.List<Runnable> replies = new java.util.ArrayList<>(deferredReplies);
                deferredReplies.clear(); for (Runnable reply : replies) reply.run();
            }
        }
    }
    @Override protected void onPause() {
        super.onPause(); authorized = false;
        if (webView != null) { webView.setVisibility(View.GONE); webView.onPause(); }
        if (gate != null) gate.setVisibility(View.VISIBLE);
    }
    @Override public void onBackPressed() {
        if (!authorized) { super.onBackPressed(); return; }
        webView.evaluateJavascript("(function(){var r=document.getElementById('entryReview'),s=document.getElementById('settingsModal'),e=document.getElementById('recordEditModal');if((r&&!r.hidden)||(s&&!s.hidden)||(e&&!e.hidden)){document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));return true;}var a=document.querySelector('.ledger-assistant.is-expanded');if(a){a.querySelector('[data-act=collapseassistant]').click();return true;}return false;})()", handled -> {
            if (!"true".equals(handled)) finish();
        });
    }
    @Override protected void onDestroy() {
        destroyed = true;
        if (pairingDialog != null) pairingDialog.dismiss();
        network.shutdownNow();
        webView.stopLoading(); webView.destroy();
        super.onDestroy();
    }
}
