package com.kailaxy.salaryledger;

import android.app.Activity;
import android.os.Bundle;
import android.net.Uri;
import android.view.View;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceError;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Hosted compatibility shell. No native JavaScript bridge or offline claims. */
public final class MainActivity extends Activity {
    private WebView webView;
    private LinearLayout errorPanel;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        // Keep content inside system bars, including Android 15 edge-to-edge defaults.
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets;
        });
        errorPanel = new LinearLayout(this);
        errorPanel.setOrientation(LinearLayout.VERTICAL);
        int padding = (int) (20 * getResources().getDisplayMetrics().density);
        errorPanel.setPadding(padding, padding, padding, padding);
        TextView message = new TextView(this);
        message.setText(BuildConfig.LEDGER_WEB_APP_URL.isEmpty()
            ? "Configure LEDGER_WEB_APP_URL in GitHub Actions and rebuild the APK."
            : "Unable to open Salary Ledger. This initial wrapper requires internet. Check your connection and retry.");
        errorPanel.addView(message);
        Button retry = new Button(this);
        retry.setText("Retry");
        retry.setEnabled(!BuildConfig.LEDGER_WEB_APP_URL.isEmpty());
        retry.setOnClickListener(v -> openLedger());
        errorPanel.addView(retry);
        root.addView(errorPanel);
        webView = new WebView(this);
        root.addView(webView, new LinearLayout.LayoutParams(-1, 0, 1));
        setContentView(root);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSafeBrowsingEnabled(true);
        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !allowed(request.getUrl());
            }
            @Override public void onPageFinished(WebView view, String url) {
                // Do not hide an error displayed by onReceivedError.
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showError();
            }
        });
        openLedger();
    }

    private static boolean allowed(Uri uri) {
        if (!"https".equals(uri.getScheme()) || uri.getUserInfo() != null || uri.getPort() != -1) return false;
        String host = uri.getHost();
        return "script.google.com".equals(host) || "script.googleusercontent.com".equals(host)
            || (host != null && host.endsWith("-script.googleusercontent.com"));
    }
    private void showError() {
        errorPanel.setVisibility(View.VISIBLE);
        webView.setVisibility(View.GONE);
    }
    private void openLedger() {
        if (BuildConfig.LEDGER_WEB_APP_URL.isEmpty()) { showError(); return; }
        errorPanel.setVisibility(View.GONE);
        webView.setVisibility(View.VISIBLE);
        webView.loadUrl(BuildConfig.LEDGER_WEB_APP_URL);
    }
    @Override public void onBackPressed() {
        if (webView.canGoBack()) webView.goBack(); else super.onBackPressed();
    }
    @Override protected void onDestroy() {
        webView.stopLoading();
        webView.destroy();
        super.onDestroy();
    }
}
