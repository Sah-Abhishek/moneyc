package com.sahabhishek.moneycontrol.data.api

import java.io.IOException
import java.io.InterruptedIOException
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerializationException
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.Call
import okhttp3.Callback
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response

/**
 * What every API call returns: the data (and the server's message for a
 * toast), or a failure written for the person — never an exception.
 */
sealed interface ApiResult<out T> {
  data class Ok<T>(val data: T, val message: String?) : ApiResult<T>

  data class Failure(
    /** HTTP status; 0 when the server couldn't be reached */
    val status: Int,
    /** the server's code (`invalid`, `conflict`, `signed_out`…) or `offline` / `timeout` / `unreadable` */
    val code: String,
    /** safe to show as is */
    val error: String,
    val fieldErrors: Map<String, String> = emptyMap(),
  ) : ApiResult<Nothing> {
    val isOffline get() = status == 0
  }
}

inline fun <T, R> ApiResult<T>.map(f: (T) -> R): ApiResult<R> = when (this) {
  is ApiResult.Ok -> ApiResult.Ok(f(data), message)
  is ApiResult.Failure -> this
}

/**
 * Talks to /api/v1 (see docs/api-v1.md). Adds the bearer token, unwraps the
 * { ok, data, message } / { ok: false, code, error, fieldErrors } envelope and
 * turns transport failures into readable ones. A 401 `signed_out` also calls
 * [onSignedOut] so the app can return to the sign-in screen.
 */
class ApiClient(
  baseUrl: String,
  private val token: suspend () -> String?,
  private val onSignedOut: suspend () -> Unit,
  private val http: OkHttpClient = defaultHttp(),
) {
  private val base: HttpUrl = baseUrl.toHttpUrl()
  private val inFlight = MutableStateFlow(0)

  /**
   * Writes in flight, app-wide (components/ui/writes.ts): drives the "Saving…"
   * indicator. Reads, and the wire's background sync (it shows its own state), don't count.
   */
  val writes: StateFlow<Int> = inFlight.asStateFlow()

  suspend fun <T> get(path: String, serializer: KSerializer<T>, query: Map<String, String?> = emptyMap()): ApiResult<T> =
    send("GET", path, null, serializer, query)

  suspend fun <T> post(path: String, body: JsonObject?, serializer: KSerializer<T>): ApiResult<T> = send("POST", path, body, serializer)

  suspend fun <T> put(path: String, body: JsonObject, serializer: KSerializer<T>): ApiResult<T> = send("PUT", path, body, serializer)

  suspend fun <T> delete(path: String, serializer: KSerializer<T>, body: JsonObject? = null): ApiResult<T> = send("DELETE", path, body, serializer)

  /** For calls whose data the app doesn't need — only success and the message. */
  suspend fun post(path: String, body: JsonObject? = null): ApiResult<Unit> = send("POST", path, body, Unit.serializer())

  /**
   * A file the server sends as is (the CSV export). Success is the body text;
   * failures still come back in the JSON envelope and are decoded as usual.
   */
  suspend fun download(path: String, query: Map<String, String?> = emptyMap()): ApiResult<String> {
    val url = base.newBuilder().addPathSegments(path.trimStart('/')).apply {
      query.forEach { (k, v) -> if (v != null) addQueryParameter(k, v) }
    }.build()
    val request = Request.Builder().url(url).apply { token()?.let { header("Authorization", "Bearer $it") } }.get().build()
    val response = try {
      http.newCall(request).await()
    } catch (e: IOException) {
      return ApiResult.Failure(0, "offline", "Couldn't reach Money Control — check your connection and try again.")
    }
    return response.use {
      if (it.isSuccessful && it.header("Content-Type")?.startsWith("text/") == true) {
        withContext(Dispatchers.IO) {
          try {
            ApiResult.Ok(it.body.string(), null)
          } catch (e: IOException) {
            ApiResult.Failure(0, "offline", "The connection dropped while the file was arriving. Try again.")
          }
        }
      } else {
        withContext(Dispatchers.IO) { decode(it, Unit.serializer()) }.let { r ->
          if (r is ApiResult.Failure) {
            if (r.code == "signed_out") onSignedOut()
            r
          } else ApiResult.Failure(it.code, "unreadable", unreadable(it.code))
        }
      }
    }
  }

  private suspend fun <T> send(method: String, path: String, body: JsonObject?, serializer: KSerializer<T>, query: Map<String, String?> = emptyMap()): ApiResult<T> {
    val counts = method != "GET" && path != "wire/sync"
    if (counts) inFlight.update { it + 1 }
    try {
      return exchange(method, path, body, serializer, query)
    } finally {
      if (counts) inFlight.update { it - 1 }
    }
  }

  private suspend fun <T> exchange(method: String, path: String, body: JsonObject?, serializer: KSerializer<T>, query: Map<String, String?>): ApiResult<T> {
    val url = base.newBuilder().addPathSegments(path.trimStart('/')).apply {
      query.forEach { (k, v) -> if (v != null) addQueryParameter(k, v) }
    }.build()
    val request = Request.Builder().url(url).apply {
      header("Accept", "application/json")
      token()?.let { header("Authorization", "Bearer $it") }
      val payload = body?.let { Json.encodeToString(JsonObject.serializer(), it).toRequestBody(JSON_TYPE) }
      method(method, payload ?: if (method == "POST" || method == "PUT") "{}".toRequestBody(JSON_TYPE) else null)
    }.build()

    val response = try {
      http.newCall(request).await()
    } catch (e: InterruptedIOException) {
      return ApiResult.Failure(0, "timeout", "The server is taking too long to answer. Check your connection and try again.")
    } catch (e: IOException) {
      return ApiResult.Failure(0, "offline", "Couldn't reach Money Control — check your connection and try again.")
    }

    val result = response.use { withContext(Dispatchers.IO) { decode(it, serializer) } }
    if (result is ApiResult.Failure && result.code == "signed_out") onSignedOut()
    return result
  }

  private fun <T> decode(response: Response, serializer: KSerializer<T>): ApiResult<T> {
    val text = try {
      response.body.string()
    } catch (e: IOException) {
      return ApiResult.Failure(0, "offline", "The connection dropped while the answer was arriving. Try again.")
    }
    val envelope = try {
      JSON.parseToJsonElement(text).jsonObject
    } catch (e: Exception) {
      return ApiResult.Failure(response.code, "unreadable", unreadable(response.code))
    }
    val ok = envelope["ok"]?.jsonPrimitive?.booleanOrNull == true
    if (!ok) {
      val fieldErrors = (envelope["fieldErrors"] as? JsonObject)?.mapValues { it.value.jsonPrimitive.contentOrNull.orEmpty() }.orEmpty()
      return ApiResult.Failure(
        status = response.code,
        code = envelope["code"]?.jsonPrimitive?.contentOrNull ?: "server",
        error = envelope["error"]?.jsonPrimitive?.contentOrNull ?: unreadable(response.code),
        fieldErrors = fieldErrors,
      )
    }
    val message = envelope["message"]?.jsonPrimitive?.contentOrNull
    return try {
      @Suppress("UNCHECKED_CAST")
      val data = if (serializer == Unit.serializer()) Unit as T else JSON.decodeFromJsonElement(serializer, envelope["data"] ?: JsonNull)
      ApiResult.Ok(data, message)
    } catch (e: SerializationException) {
      // The server answered in a shape this version of the app doesn't know: an app update is due.
      ApiResult.Failure(response.code, "unreadable", "This version of the app couldn't read the server's answer. Update the app and try again.")
    } catch (e: IllegalArgumentException) {
      ApiResult.Failure(response.code, "unreadable", "This version of the app couldn't read the server's answer. Update the app and try again.")
    }
  }

  private fun unreadable(status: Int) =
    if (status >= 500) "Money Control is having trouble right now. Try again in a moment."
    else "The server sent an answer the app couldn't read. Try again."

  companion object {
    val JSON = Json {
      ignoreUnknownKeys = true
      explicitNulls = false
      coerceInputValues = true
    }
    private val JSON_TYPE = "application/json; charset=utf-8".toMediaType()

    fun defaultHttp(): OkHttpClient = OkHttpClient.Builder()
      .connectTimeout(15, TimeUnit.SECONDS)
      .readTimeout(30, TimeUnit.SECONDS) // a mail sync can take a while
      .writeTimeout(15, TimeUnit.SECONDS)
      .retryOnConnectionFailure(true)
      .build()
  }
}

/** Suspends until the call completes; cancelling the coroutine cancels the request. */
private suspend fun Call.await(): Response = suspendCancellableCoroutine { cont ->
  cont.invokeOnCancellation { cancel() }
  enqueue(object : Callback {
    override fun onResponse(call: Call, response: Response) = cont.resumeWith(Result.success(response))
    override fun onFailure(call: Call, e: IOException) = cont.resumeWith(Result.failure(e))
  })
}

/** Builds a JSON body from pairs, dropping nulls: `body("payee" to "Swiggy", "tagId" to 3)`. */
fun body(vararg pairs: Pair<String, Any?>): JsonObject = JsonObject(
  pairs.filter { it.second != null }.associate { (k, v) ->
    k to when (v) {
      is JsonElement -> v
      is String -> kotlinx.serialization.json.JsonPrimitive(v)
      is Number -> kotlinx.serialization.json.JsonPrimitive(v)
      is Boolean -> kotlinx.serialization.json.JsonPrimitive(v)
      is List<*> -> kotlinx.serialization.json.JsonArray(v.map { kotlinx.serialization.json.JsonPrimitive(it.toString()) })
      else -> error("Unsupported JSON value for $k: ${v!!::class}")
    }
  },
)
