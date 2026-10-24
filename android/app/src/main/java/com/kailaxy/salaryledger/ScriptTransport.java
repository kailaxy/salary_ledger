package com.kailaxy.salaryledger;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import javax.net.ssl.HttpsURLConnection;
import org.json.JSONArray;
import org.json.JSONObject;

/** Owner-configured, pinned-destination HTTPS client. Uses platform TLS verification, with no cookie auth. */
final class ScriptTransport {
    static final Set<String> METHODS = new HashSet<>(Arrays.asList(
            "getLedgerSnapshot", "syncLedgerMutation", "syncLoanPayment", "syncOperation", "addTransaction", "saveCategory",
            "deleteCategory", "setBudget", "saveLoan", "deleteLoan", "addLoanPayment",
            "deleteRecord", "saveSettings", "generatePeriods"));
    private static final int MAX_RESPONSE = 8 * 1024 * 1024;
    private final String endpoint;
    ScriptTransport(String endpoint) { this.endpoint = DeploymentPolicy.normalize(endpoint); }
    static final class Failure extends Exception {
        Failure(String message) { super(message); }
    }
    JSONObject pair(String code, String pin, String name) throws Exception {
        JSONObject body = new JSONObject().put("version", 1).put("action", "pair")
                .put("code", code).put("pin", pin).put("name", name);
        JSONObject credentials = post(body).getJSONObject("result");
        if (!credentials.optString("deviceId").matches("[a-f0-9]{32}")
                || !credentials.optString("deviceToken").matches("[a-f0-9]{64}")
                || credentials.optString("ledgerId").isEmpty()) throw new Failure("INVALID_PAIR_REPLY");
        return credentials;
    }
    Object rpc(JSONObject credentials, String method, JSONArray args) throws Exception {
        if (!METHODS.contains(method)) throw new Failure("UNSUPPORTED_METHOD");
        JSONObject body = new JSONObject().put("version", 1).put("action", "rpc")
                .put("deviceId", credentials.getString("deviceId"))
                .put("deviceToken", credentials.getString("deviceToken"))
                .put("method", method).put("args", args);
        return post(body).get("result");
    }
    static boolean allowed(URL url) {
        return "https".equals(url.getProtocol()) && url.getUserInfo() == null
                && (url.getPort() == -1 || url.getPort() == 443)
                && ("script.google.com".equals(url.getHost()) || "script.googleusercontent.com".equals(url.getHost()));
    }
    private JSONObject post(JSONObject body) throws Exception {
        URL url = new URL(endpoint);
        if (!allowed(url) || !"script.google.com".equals(url.getHost())
                || !url.getPath().matches("/macros/s/[A-Za-z0-9_-]+/exec") || url.getQuery() != null) throw new Failure("INVALID_DEPLOYMENT_URL");
        byte[] payload = body.toString().getBytes(StandardCharsets.UTF_8);
        if (payload.length > 65536) throw new Failure("REQUEST_TOO_LARGE");
        for (int redirects = 0; redirects < 6; redirects++) {
            if (!allowed(url)) throw new Failure("DEPLOYMENT_ACCESS_ERROR");
            HttpsURLConnection connection = (HttpsURLConnection) url.openConnection();
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(35000);
            connection.setInstanceFollowRedirects(false);
            connection.setUseCaches(false);
            connection.setRequestProperty("Accept", "application/json");
            try {
                if (payload != null) {
                    connection.setRequestMethod("POST");
                    connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                    connection.setDoOutput(true);
                    connection.setFixedLengthStreamingMode(payload.length);
                    try (java.io.OutputStream output = connection.getOutputStream()) { output.write(payload); }
                }
                int status = connection.getResponseCode();
                if (status == 301 || status == 302 || status == 303) {
                    String location = connection.getHeaderField("Location");
                    if (location == null) throw new Failure("DEPLOYMENT_ACCESS_ERROR");
                    url = new URL(url, location);
                    // ContentService redirects to a temporary response URL. Never forward secrets there.
                    payload = null;
                    continue;
                }
                if (status != 200 || connection.getContentType() == null
                        || !connection.getContentType().toLowerCase(java.util.Locale.ROOT).contains("application/json"))
                    throw new Failure("DEPLOYMENT_ACCESS_ERROR: Update the Apps Script deployment and check Anyone access.");
                ByteArrayOutputStream output = new ByteArrayOutputStream();
                try (InputStream input = connection.getInputStream()) {
                    byte[] buffer = new byte[8192]; int read;
                    while ((read = input.read(buffer)) != -1) {
                        if (output.size() + read > MAX_RESPONSE) throw new Failure("RESPONSE_TOO_LARGE");
                        output.write(buffer, 0, read);
                    }
                }
                JSONObject response;
                try { response = new JSONObject(output.toString(StandardCharsets.UTF_8.name())); }
                catch (org.json.JSONException error) { throw new Failure("INVALID_SERVER_REPLY"); }
                if (!response.optBoolean("ok", false)) throw new Failure(response.optString("error", "SERVER_ERROR").substring(0, Math.min(300, response.optString("error", "SERVER_ERROR").length())));
                return response;
            } catch (java.io.IOException error) {
                // Do not return URLs, response bodies, tokens, or platform stack traces to JavaScript.
                throw new Failure("NETWORK_ERROR: Cannot reach the deployed script. Saved changes are preserved.");
            } finally { connection.disconnect(); }
        }
        throw new Failure("DEPLOYMENT_REDIRECT_ERROR");
    }
}
