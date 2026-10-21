package com.kailaxy.salaryledger;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONObject;

/** Only native code accesses these credentials. No raw token or PIN in web storage. */
final class DeviceCredentials {
    private static final String ALIAS = "salary-ledger-device-v1";
    private final SharedPreferences preferences;
    DeviceCredentials(Context context) {
        preferences = context.getSharedPreferences("native-device", Context.MODE_PRIVATE);
    }
    private SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (store.containsAlias(ALIAS)) return (SecretKey) store.getKey(ALIAS, null);
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        return generator.generateKey();
    }
    JSONObject read() throws Exception {
        String saved = preferences.getString("sealed", null);
        if (saved == null) return null;
        JSONObject envelope = new JSONObject(saved);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(envelope.getString("iv"), Base64.NO_WRAP)));
        return new JSONObject(new String(cipher.doFinal(Base64.decode(envelope.getString("data"), Base64.NO_WRAP)), StandardCharsets.UTF_8));
    }
    String ledgerIdentity() { return preferences.getString("ledgerIdentity", null); }
    private JSONObject seal(JSONObject credentials) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key());
        JSONObject envelope = new JSONObject();
        envelope.put("iv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP));
        envelope.put("data", Base64.encodeToString(cipher.doFinal(credentials.toString().getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP));
        return envelope;
    }
    void save(JSONObject credentials) throws Exception {
        JSONObject envelope;
        try { envelope = seal(credentials); }
        catch (Exception error) {
            // Called only after explicit owner pairing; replace an unusable credential key,
            // preserving all IndexedDB records and the outbox.
            KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null); store.deleteEntry(ALIAS);
            envelope = seal(credentials);
        }
        if (!preferences.edit().putString("sealed", envelope.toString())
                .putString("ledgerIdentity", credentials.getString("ledgerId")).commit()) throw new Exception("DEVICE_STORAGE_ERROR");
    }
}
