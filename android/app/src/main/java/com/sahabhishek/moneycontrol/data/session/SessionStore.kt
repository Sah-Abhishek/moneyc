package com.sahabhishek.moneycontrol.data.session

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.util.Log
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import java.security.GeneralSecurityException
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.sessionStore: DataStore<Preferences> by preferencesDataStore("session")

/**
 * Keeps the API session token, encrypted with an AES-GCM key that lives in the
 * Android Keystore (it never leaves the device's secure hardware). If the key
 * is gone — app data restored elsewhere, keystore reset — the token can't be
 * read, is dropped, and the person simply signs in again.
 */
class SessionStore(private val context: Context) {
  private val key = stringPreferencesKey("token")

  /** The current token, or null when signed out. */
  val token: Flow<String?> = context.sessionStore.data.map { prefs -> prefs[key]?.let(::decrypt) }

  suspend fun current(): String? = token.first()

  suspend fun save(token: String) {
    context.sessionStore.edit { it[key] = encrypt(token) }
  }

  suspend fun clear() {
    context.sessionStore.edit { it.remove(key) }
  }

  private fun secretKey(): SecretKey {
    val store = KeyStore.getInstance(KEYSTORE).apply { load(null) }
    (store.getEntry(ALIAS, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }
    return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE).apply {
      init(
        KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
          .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
          .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
          .setKeySize(256)
          .build(),
      )
    }.generateKey()
  }

  private fun encrypt(plain: String): String {
    val cipher = Cipher.getInstance(TRANSFORMATION).apply { init(Cipher.ENCRYPT_MODE, secretKey()) }
    val sealed = cipher.iv + cipher.doFinal(plain.toByteArray(Charsets.UTF_8))
    return Base64.encodeToString(sealed, Base64.NO_WRAP)
  }

  private fun decrypt(stored: String): String? = try {
    val bytes = Base64.decode(stored, Base64.NO_WRAP)
    val cipher = Cipher.getInstance(TRANSFORMATION).apply {
      init(Cipher.DECRYPT_MODE, secretKey(), GCMParameterSpec(128, bytes, 0, IV_BYTES))
    }
    String(cipher.doFinal(bytes, IV_BYTES, bytes.size - IV_BYTES), Charsets.UTF_8)
  } catch (e: GeneralSecurityException) {
    Log.w(TAG, "Stored session can't be decrypted; signing out", e)
    null
  } catch (e: IllegalArgumentException) {
    Log.w(TAG, "Stored session is malformed; signing out", e)
    null
  }

  private companion object {
    const val TAG = "SessionStore"
    const val KEYSTORE = "AndroidKeyStore"
    const val ALIAS = "money_control_session"
    const val TRANSFORMATION = "AES/GCM/NoPadding"
    const val IV_BYTES = 12
  }
}
